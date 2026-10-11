import { NextResponse } from "next/server";
import {
  SUPABASE_ENV_VARS,
  checkSupabaseKey,
  checkSupabaseUrl,
  getSupabaseProjectRef,
} from "@/lib/supabaseEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/supabase
 *
 * Diagnostics for the Supabase connection only. It never writes, and it never
 * touches Stripe, FedEx or DHL, so it is safe to poll from an uptime monitor.
 *
 * Three checks, cheapest first:
 *   1. environment  - are the variables present and syntactically plausible?
 *   2. network      - does the project host resolve and answer on PostgREST?
 *   3. query        - can we actually read a table, and is RLS behaving?
 *
 * A bare "connected" from a TCP handshake is not enough: a project whose schema
 * was never applied answers 200 on /rest/v1/ but fails every real query, which
 * is the failure mode this endpoint exists to catch.
 */

type Status = "connected" | "not_configured" | "error" | "schema_missing";

type Reason =
  | "ok"
  | "missing_url"
  | "missing_anon_key"
  | "missing_service_role_key"
  | "invalid_url"
  | "dns_failure"
  | "network_failure"
  | "unauthorized"
  | "project_paused"
  | "table_missing"
  | "rls_blocked"
  | "timeout"
  | "unknown";

interface ProbeResult {
  ok: boolean;
  status: Status;
  latencyMs: number | null;
  httpStatus: number | null;
  error: string | null;
  /** Machine-readable reason so monitoring can alert without string matching. */
  reason: Reason;
  detail?: unknown;
}

interface EnvEntry {
  ok: boolean;
  value: string | null;
  error: string | null;
}

interface HealthBody {
  status: Status;
  reason: Reason;
  projectRef: string | null;
  environment: string | null;
  env: { url: EnvEntry; anonKey: EnvEntry; serviceRoleKey: EnvEntry };
  checks: Record<string, unknown>;
  error: string | null;
  totalLatencyMs: number | null;
}

export async function GET() {
  const startedAt = Date.now();

  const urlCheck = checkSupabaseUrl(process.env[SUPABASE_ENV_VARS.url]);
  const anonCheck = checkSupabaseKey(
    process.env[SUPABASE_ENV_VARS.anonKey],
    SUPABASE_ENV_VARS.anonKey
  );
  const serviceCheck = checkSupabaseKey(
    process.env[SUPABASE_ENV_VARS.serviceRoleKey],
    SUPABASE_ENV_VARS.serviceRoleKey
  );

  const body: HealthBody = {
    status: "error",
    reason: "unknown",
    projectRef: getSupabaseProjectRef(process.env[SUPABASE_ENV_VARS.url]),
    environment: process.env.NODE_ENV ?? null,
    env: {
      url: { ok: urlCheck.ok, value: urlCheck.preview, error: urlCheck.error },
      anonKey: { ok: anonCheck.ok, value: anonCheck.preview, error: anonCheck.error },
      serviceRoleKey: {
        ok: serviceCheck.ok,
        value: serviceCheck.preview,
        error: serviceCheck.error,
      },
    },
    checks: {},
    error: null,
    totalLatencyMs: null,
  };

  // ---- 1. Environment -----------------------------------------------------
  // Validated locally so a typo surfaces instantly instead of as a DNS timeout.
  if (!urlCheck.ok) {
    // `preview` is null only when the variable is absent entirely.
    const reason = urlCheck.preview ? "invalid_url" : "missing_url";
    return respond(body, "not_configured", urlCheck.error, reason, 503, startedAt);
  }
  if (!anonCheck.ok) {
    return respond(body, "not_configured", anonCheck.error, "missing_anon_key", 503, startedAt);
  }

  // On success `preview` holds the trimmed raw value.
  const projectUrl = (urlCheck.preview as string).replace(/\/+$/, "");

  const serviceKey = process.env[SUPABASE_ENV_VARS.serviceRoleKey];
  if (!serviceKey) {
    return respond(
      body,
      "not_configured",
      `${SUPABASE_ENV_VARS.serviceRoleKey} is required to verify the connection`,
      "missing_service_role_key",
      503,
      startedAt
    );
  }

  // ---- 2. Network reachability -------------------------------------------
  // Uses the service role: Supabase now requires a secret key for the
  // PostgREST root, so the anon key answers 401 even on a healthy project.
  const network = await probeRestRoot(projectUrl, serviceKey);
  body.checks.network = network;
  if (!network.ok) {
    return respond(body, "error", network.error, network.reason, 503, startedAt);
  }

  // ---- 3. Real query -----------------------------------------------------
  // The service role also bypasses RLS, so a table read actually returns rows
  // instead of being blocked by the deny-all policies that protect orders.
  const query = await probeTable(projectUrl, serviceKey);
  body.checks.query = query;
  if (!query.ok) {
    return respond(body, query.status, query.error, query.reason, 503, startedAt);
  }

  return NextResponse.json(
    {
      ...body,
      status: "connected" as Status,
      reason: "ok" as Reason,
      error: null,
      totalLatencyMs: Date.now() - startedAt,
    },
    { status: 200 }
  );
}

/**
 * Queries a table that must exist once supabase_schema_v2.sql is applied.
 *
 * Uses the SERVICE ROLE key on purpose. The anon key returns 401 on the
 * PostgREST root of a healthy project, so an anon-key probe produces a false
 * negative; the service role bypasses RLS, making this a genuine schema check
 * rather than a permissions probe.
 */
async function probeTable(projectUrl: string, key: string): Promise<ProbeResult> {
  // Probes a table that must exist once the schema is applied. The service role
  // bypasses RLS, so this is a real schema check rather than a permissions probe.
  const url = `${projectUrl}/rest/v1/sellers?select=id&limit=1`;
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      // Both headers are required with the new-style keys: `apikey` identifies
      // the project, `Authorization` carries the key itself. Supabase answers
      // 401 when only one is sent.
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return networkFailure(error, startedAt);
  }

  const latencyMs = Date.now() - startedAt;
  const httpStatus = response.status;

  if (response.ok) {
    const rows = (await response.json().catch(() => null)) as unknown[] | null;
    return {
      ok: true,
      status: "connected",
      latencyMs,
      httpStatus,
      error: null,
      reason: "ok",
      detail: { table: "sellers", rowsReturned: Array.isArray(rows) ? rows.length : 0 },
    };
  }

  const text = await response.text().catch(() => "");

  // PostgREST reports an unknown relation as PGRST205 (or 42P01 from Postgres).
  if (httpStatus === 404 || text.includes("PGRST205") || text.includes("42P01")) {
    return {
      ok: false,
      status: "schema_missing",
      latencyMs,
      httpStatus,
      error:
        "La tabla `sellers` no existe. Ejecuta supabase_schema_v2.sql en el SQL Editor del proyecto.",
      reason: "table_missing",
      detail: text.slice(0, 300),
    };
  }

  if (httpStatus === 401) {
    return {
      ok: false,
      status: "error",
      latencyMs,
      httpStatus,
      error:
        "La service role key fue rechazada (401). Copia la clave service_role actual desde Project Settings > API.",
      reason: "unauthorized",
      detail: text.slice(0, 300),
    };
  }

  // A reachable host that denies the read is an RLS problem, not a bad key, so
  // it gets its own reason to avoid sending someone chasing the wrong variable.
  if (httpStatus === 403) {
    return {
      ok: false,
      status: "error",
      latencyMs,
      httpStatus,
      error:
        "RLS blocked the read. Check the policies in supabase_schema_v2.sql, and that the key being used really is the service role key.",
      reason: "rls_blocked",
      detail: text.slice(0, 300),
    };
  }

  return {
    ok: false,
    status: "error",
    latencyMs,
    httpStatus,
    error: `HTTP ${httpStatus} querying \`sellers\``,
    reason: "unknown",
    detail: text.slice(0, 300),
  };
}

/** Checks that the project host resolves and PostgREST responds. */
async function probeRestRoot(projectUrl: string, key: string): Promise<ProbeResult> {
  const startedAt = Date.now();

  let response: Response;
  try {
    // The PostgREST root now requires a secret key too, and both headers must be
    // present; sending only `apikey` yields 401 on a perfectly healthy project.
    response = await fetch(`${projectUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return networkFailure(error, startedAt);
  }

  const latencyMs = Date.now() - startedAt;
  const httpStatus = response.status;
  const text = response.ok ? "" : await response.text().catch(() => "");

  // Paused / suspended projects answer with a 5xx body mentioning the state
  // instead of refusing the connection, so it must be detected explicitly.
  const paused =
    httpStatus === 546 || /paused|suspended|deactivated|project is not active/i.test(text);

  return {
    ok: response.ok,
    status: response.ok ? "connected" : "error",
    latencyMs,
    httpStatus,
    error: response.ok
      ? null
      : paused
        ? `El proyecto Supabase esta pausado (HTTP ${httpStatus}). Reactivalo en Supabase Dashboard > Settings.`
        : `HTTP ${httpStatus} al contactar PostgREST: ${text.slice(0, 200)}`,
    reason: response.ok
      ? "ok"
      : paused
        ? "project_paused"
        : httpStatus === 401
          ? "unauthorized"
          : "unknown",
    detail: text ? text.slice(0, 300) : undefined,
  };
}

/**
 * Maps a fetch throw into a DNS / network / timeout classification.
 * Node only exposes the underlying socket code via `cause`, which is the sole
 * way to tell a wrong hostname from a genuinely unreachable network.
 */
function networkFailure(error: unknown, startedAt: number): ProbeResult {
  const latencyMs = Date.now() - startedAt;
  const message = error instanceof Error ? error.message : String(error);
  const causeCode =
    (error as { cause?: { code?: string } })?.cause?.code ??
    (error as { code?: string })?.code ??
    "";

  if (causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN") {
    return {
      ok: false,
      status: "error",
      latencyMs,
      httpStatus: null,
      error:
        "Could not resolve the Supabase project domain (DNS ENOTFOUND). The Project URL points to a non-existent or misspelled project.",
      reason: "dns_failure",
      detail: causeCode,
    };
  }

  if (
    causeCode === "ETIMEDOUT" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    /timeout|timed out/i.test(message)
  ) {
    return {
      ok: false,
      status: "error",
      latencyMs,
      httpStatus: null,
      error: "Timed out after 10s contacting Supabase.",
      reason: "timeout",
      detail: causeCode || message,
    };
  }

  return {
    ok: false,
    status: "error",
    latencyMs,
    httpStatus: null,
    error: `Network failure reaching Supabase: ${message}`,
    reason: "network_failure",
    detail: causeCode || message,
  };
}

/** Builds the JSON response and stamps the total elapsed time. */
function respond(
  body: HealthBody,
  status: Status,
  error: string | null,
  reason: Reason,
  httpStatus: number,
  startedAt: number
) {
  return NextResponse.json(
    { ...body, status, reason, error, totalLatencyMs: Date.now() - startedAt },
    { status: httpStatus }
  );
}