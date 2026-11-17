import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AppError } from "@/lib/errors";

type Scope = "checkout" | "catalog_checkout" | "quote" | "catalog_quote" | "verify";
const LIMITS: Record<Scope, [number, number]> = {
  checkout: [10, 600],
  catalog_checkout: [10, 600],
  quote: [30, 60],
  catalog_quote: [30, 60],
  verify: [30, 60],
};

/** Vercel overwrites its own forwarding header. Other deployments deliberately
 * share a fallback bucket until a trusted reverse proxy is configured. Never
 * trust a buyer-supplied X-Forwarded-For to bypass quotas. */
export async function guardPublicRequest(req: Request, scope: Scope): Promise<void> {
  const source =
    process.env.VERCEL === "1"
      ? req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unidentified"
      : "shared-local-origin";
  const identity = createHash("sha256").update(source).digest("hex");
  const [limit, window] = LIMITS[scope];
  const { data, error } = await getSupabaseAdmin().rpc("consume_public_request_limit", {
    p_scope: scope,
    p_identity: identity,
    p_limit: limit,
    p_window_seconds: window,
  });
  if (error || typeof data?.allowed !== "boolean")
    throw new AppError(
      "NOT_CONFIGURED",
      "No podemos iniciar esta operación. Intenta más tarde.",
      503,
    );
  if (!data.allowed) throw new PublicRateLimitError(Number(data.retry_after) || window);
}
class PublicRateLimitError extends AppError {
  constructor(readonly retryAfter: number) {
    super("RATE_LIMITED", "Demasiados intentos. Espera un momento antes de reintentar.", 429);
  }
}

/** Bound the actual body stream; Content-Length alone is not trustworthy. */
export async function readPublicJson(
  req: Request,
  maxBytes = 32_768,
): Promise<Record<string, unknown>> {
  if (!req.body) throw new AppError("VALIDATION_ERROR", "Faltan los datos de la solicitud", 400);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new AppError("VALIDATION_ERROR", "La solicitud es demasiado grande", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("JSON object required");
    return value as Record<string, unknown>;
  } catch {
    throw new AppError("VALIDATION_ERROR", "La solicitud no contiene datos válidos", 400);
  }
}

export function publicRequestError(error: unknown) {
  if (!(error instanceof AppError)) return null;
  return NextResponse.json(
    { error: error.message, message: error.message, code: error.code },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        ...(error instanceof PublicRateLimitError
          ? { "Retry-After": String(error.retryAfter) }
          : {}),
      },
    },
  );
}
