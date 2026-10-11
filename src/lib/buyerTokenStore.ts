/**
 * BUYER TOKEN — client-side custody.
 *
 * The plaintext buyer token is issued exactly once, by `POST /api/checkout/session`.
 * Only its SHA-256 hash is stored server-side, so this is the only moment the
 * buyer can ever be handed it — and therefore the only moment they can reach
 * `/order/[id]`.
 *
 * WHY sessionStorage AND NOT THE URL
 *
 * The obvious design is to append `&token=...` to the Stripe `success_url`. That
 * puts a bearer secret into browser history, into the `Referer` header of every
 * third-party request the success page makes, and into any proxy log along the
 * way. The token grants read access to the order AND the ability to confirm
 * delivery or open a dispute, so leaking it is a real loss, not a cosmetic one.
 *
 * Instead the token is parked in sessionStorage before the redirect to Stripe
 * and picked up by the success page on return. sessionStorage is scoped to this
 * origin and survives the round trip through Stripe, so the flow works, while
 * the secret never appears in a URL or a request header we do not control.
 *
 * The trade-off is deliberate and worth stating: the token does not survive the
 * tab closing, and it is not available if the buyer finishes on a different
 * device. The `session_id` credential remains as a fallback for exactly that
 * case, which is why `/api/orders/[id]` accepts either.
 *
 * This module is browser-only; it is imported by client components exclusively.
 */

const STORAGE_PREFIX = "routeflow.buyerToken.";

/** Parks the token for an order. Never throws: losing the token must not fail a purchase. */
export function storeBuyerToken(orderId: string, token: string): void {
  if (!orderId || !token) return;

  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${orderId}`, token);
  } catch {
    // Private browsing or a full quota: the purchase still completes, and the
    // success page falls back to the Stripe session credential.
  }
}

/** Returns the parked token for an order, or null. */
export function readBuyerToken(orderId: string): string | null {
  if (!orderId) return null;

  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${orderId}`) ?? window.localStorage.getItem(`${STORAGE_PREFIX}${orderId}`);
  } catch {
    return null;
  }
}

/** Forgets the token for an order. Called once it has been used. */
export function clearBuyerToken(orderId: string): void {
  if (!orderId) return;

  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${orderId}`);
    window.localStorage.removeItem(`${STORAGE_PREFIX}${orderId}`);
  } catch {
    // Nothing to do; the token simply expires with the tab.
  }
}

export function storeBuyerSession(orderId: string, sessionId: string): void {
  try { window.sessionStorage.setItem(`routeflow.buyerSession.${orderId}`, sessionId); } catch { /* optional */ }
}

export function readBuyerSession(orderId: string): string | null {
  try { return window.sessionStorage.getItem(`routeflow.buyerSession.${orderId}`) ?? window.localStorage.getItem(`routeflow.buyerSession.${orderId}`); } catch { return null; }
}

/** Explicit buyer opt-in, never automatic on a shared device. */
export function rememberBuyerAccess(orderId: string, token: string | null, session: string | null): boolean {
  try {
    if (!token && !session) return false;
    if (token) window.localStorage.setItem(`${STORAGE_PREFIX}${orderId}`, token);
    if (session) window.localStorage.setItem(`routeflow.buyerSession.${orderId}`, session);
    return true;
  } catch { return false; }
}
