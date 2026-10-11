/**
 * TRANSIENT SUPABASE FAILURES — classification and retry.
 *
 * Why this exists
 * ---------------
 * A production incident surfaced as:
 *
 *     Could not resolve seller: JWT issued at future
 *                       at findSellerByUserId (src/lib/authz.ts)
 *
 * PostgREST validates the `iat` claim of the API key against its OWN clock. When
 * the edge node answering the request drifts a few seconds ahead of the node
 * that issued the key, the key is rejected even though it is perfectly valid.
 * It is transient and self-healing: repeating the same query moments later
 * succeeds.
 *
 * The bug was not the drift, it was the RESPONSE to it. `findSellerByUserId`
 * threw, nothing caught it, the route returned 500, and the dashboard's
 * onboarding branch (which triggers on 403) never ran — leaving the user in a
 * permanent loading state with no store.
 *
 * So: classify the failure, retry the transient ones, and let only genuinely
 * permanent failures surface. Combined with the typed failures in
 * `lib/authz.ts`, a few seconds of edge drift can no longer turn into a dead
 * dashboard.
 */

/**
 * True when the failure is a clock/transport/token problem that is very likely
 * to succeed on an immediate retry.
 *
 * Deliberately conservative: a false positive costs one extra round trip, while
 * a false negative costs the user their session. Only unambiguous signals count.
 */
export function isTransientSupabaseError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code ?? "";

  // PostgREST's JWT validation, including the clock-skew case.
  if (/JWT issued at future/i.test(message)) return true;
  if (/invalid JWT|JWT expired|JWT signature|token is expired/i.test(message)) return true;

  // Transport level: DNS, socket resets, gateway hiccups.
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return true;
  }
  // Undici surfaces a dropped keep-alive connection as "socket hang up" or
  // "socket closed", which is the same class of blip and just as transient.
  if (/socket hang up|socket closed|other side closed|terminated/i.test(message)) {
    return true;
  }
  if (/aborted|timeout|timed out|network/i.test(message)) return true;

  // Postgres/PostgREST classes that indicate a transient backend condition.
  if (["40001", "40P01", "53300", "57P01", "08006", "08001"].includes(code)) return true;

  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `operation`, retrying only transient failures.
 *
 * Defaults are deliberately small and few: three attempts with a short, growing
 * backoff. The goal is to ride out a second or two of edge drift, not to turn a
 * database outage into a request that hangs for half a minute.
 */
export async function retryOnTransientSupabaseError<T>(
  operation: () => Promise<T>,
  { attempts = 3, baseDelayMs = 120 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientSupabaseError(error)) throw error;
      if (attempt === attempts) break;

      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
}