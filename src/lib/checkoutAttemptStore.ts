/** A retry uses the same high-entropy credential, including after a reload.
 * Store only a digest of the form data, never buyer details in this record. */
const memory = new Map<string, { fingerprint: string; key: string }>();
export function storedCheckoutAttemptKey(scope: string): string | null {
  const slot = `routeflow:checkout-attempt:${scope}`;
  try {
    const record = JSON.parse(sessionStorage.getItem(slot) || "null") ?? memory.get(slot);
    return /^[a-f0-9]{64}$/.test(record?.key ?? "") ? record.key : null;
  } catch {
    return memory.get(slot)?.key ?? null;
  }
}
export async function checkoutAttemptKey(scope: string, payload: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const fingerprint = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoded)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const slot = `routeflow:checkout-attempt:${scope}`;
  let previous = memory.get(slot);
  try {
    previous = JSON.parse(sessionStorage.getItem(slot) || "null") ?? previous;
  } catch {
    /* Private browsing can disable storage. */
  }
  if (previous?.fingerprint === fingerprint && /^[a-f0-9]{64}$/.test(previous.key))
    return previous.key;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const record = { fingerprint, key };
  memory.set(slot, record);
  try {
    sessionStorage.setItem(slot, JSON.stringify(record));
  } catch {
    /* In-memory retries remain available. */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("routeflow:checkout-attempt"));
  return key;
}

export function clearCheckoutAttempt(scope: string) {
  const slot = `routeflow:checkout-attempt:${scope}`;
  memory.delete(slot);
  try {
    sessionStorage.removeItem(slot);
  } catch {
    /* Storage can be disabled. */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("routeflow:checkout-attempt"));
}
