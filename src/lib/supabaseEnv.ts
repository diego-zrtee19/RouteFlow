/**
 * Shared Supabase environment validation.
 *
 * Both the browser client (`supabaseClient.ts`) and the service-role client
 * (`supabaseAdmin.ts`) need the same answers to two questions before they talk
 * to the network, and getting either wrong is expensive to debug:
 *
 *   1. Are the variables present and syntactically plausible?
 *   2. Does the project URL point at a real Supabase project?
 *
 * A Supabase project URL is always `https://<ref>.supabase.co`, where `<ref>`
 * is exactly 20 lowercase alphanumeric characters. A ref containing uppercase
 * letters cannot resolve, so we reject it locally with an actionable message
 * instead of surfacing a bare DNS `ENOTFOUND` from a 30s fetch timeout.
 */

export const SUPABASE_ENV_VARS = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

/** Result of validating one required variable. */
export interface SupabaseEnvCheck {
  ok: boolean;
  /** Raw value with the secret half redacted, safe to log or return over HTTP. */
  preview: string | null;
  error: string | null;
}

const PROJECT_URL_PATTERN = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/;

/** Redacts an API key so it can be logged without leaking the secret. */
export function redactKey(value: string | undefined | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return "***";
  return `${value.slice(0, 8)}...${value.slice(-4)} (len ${value.length})`;
}

/** Extracts the 20-character project ref from a Supabase project URL. */
export function getSupabaseProjectRef(url: string | undefined | null): string | null {
  if (!url) return null;
  const match = PROJECT_URL_PATTERN.exec(url.trim());
  return match ? match[1] : null;
}

/**
 * Validates NEXT_PUBLIC_SUPABASE_URL.
 *
 * Distinguishes "not set" from "set to something that can never resolve", which
 * are very different bugs: the first is a missing variable, the second is a
 * typo or a project that was deleted/paused.
 */
export function checkSupabaseUrl(url: string | undefined | null): SupabaseEnvCheck {
  if (!url) {
    return {
      ok: false,
      preview: null,
      error: `${SUPABASE_ENV_VARS.url} is not set`,
    };
  }

  const trimmed = url.trim();
  const ref = getSupabaseProjectRef(trimmed);

  if (!ref) {
    // Surface the specific reason, otherwise people paste a URL and wait on a
    // DNS timeout that looks like a network outage.
    let reason = "is not a valid Supabase project URL (expected https://<20-char-ref>.supabase.co)";
    if (/^https?:\/\//i.test(trimmed) && /\.supabase\.co\/?$/i.test(trimmed)) {
      const rawRef = trimmed.replace(/^https?:\/\//i, "").replace(/\.supabase\.co\/?$/i, "");
      reason =
        rawRef.length !== 20
          ? `project ref "${rawRef}" must be exactly 20 characters (found ${rawRef.length})`
          : `project ref "${rawRef}" must be lowercase [a-z0-9]; Supabase never issues uppercase refs`;
    } else if (/^https?:\/\//i.test(trimmed)) {
      reason = "must be a https://*.supabase.co project URL";
    }

    return { ok: false, preview: trimmed, error: `${SUPABASE_ENV_VARS.url} ${reason}` };
  }

  return { ok: true, preview: trimmed, error: null };
}

/** Validates a key variable: present and long enough to be a real key. */
export function checkSupabaseKey(
  value: string | undefined | null,
  varName: string,
): SupabaseEnvCheck {
  if (!value || !value.trim()) {
    return { ok: false, preview: null, error: `${varName} is not set` };
  }

  const trimmed = value.trim();
  // Legacy anon/legacy service keys are JWTs; the current publishable/secret
  // keys use the sb_publishable_/sb_secret_ prefixes. Both are long.
  if (trimmed.length < 20) {
    return {
      ok: false,
      preview: redactKey(trimmed),
      error: `${varName} looks truncated (${trimmed.length} chars); copy the full key from the Supabase dashboard`,
    };
  }

  return { ok: true, preview: redactKey(trimmed), error: null };
}

/** True when the browser/anon client can be constructed. */
export function isSupabasePublicConfigured(): boolean {
  return (
    checkSupabaseUrl(process.env[SUPABASE_ENV_VARS.url]).ok &&
    checkSupabaseKey(process.env[SUPABASE_ENV_VARS.anonKey], SUPABASE_ENV_VARS.anonKey).ok
  );
}

/** True when privileged server-side operations can be performed. */
export function isSupabaseAdminConfigured(): boolean {
  return (
    checkSupabaseUrl(process.env[SUPABASE_ENV_VARS.url]).ok &&
    checkSupabaseKey(
      process.env[SUPABASE_ENV_VARS.serviceRoleKey],
      SUPABASE_ENV_VARS.serviceRoleKey
    ).ok
  );
}