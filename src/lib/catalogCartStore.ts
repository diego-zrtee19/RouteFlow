import type { CartLine } from "@/domain/catalogCart";
import { validateCartLines } from "@/domain/catalogCart";
export function readCatalogCart(username: string): CartLine[] {
  try { const lines = JSON.parse(localStorage.getItem(`routeflow.cart.${username}`) ?? "[]"); return lines.length ? validateCartLines(lines) : []; } catch { return []; }
}
export function saveCatalogCart(username: string, lines: CartLine[]): boolean {
  try { localStorage.setItem(`routeflow.cart.${username}`, JSON.stringify(lines)); return true; } catch { return false; }
}
export function rememberCatalogPurchase(orderId: string, username: string, lines: CartLine[]) {
  try { sessionStorage.setItem(`routeflow.catalogPurchase.${orderId}`, JSON.stringify({ username, lines })); } catch { /* Receipt access does not depend on cart storage. */ }
}
export function clearPaidCatalogCart(orderId: string) {
  try {
    const key = `routeflow.catalogPurchase.${orderId}`;
    const pending = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!pending || typeof pending.username !== "string") return;
    // Preserve a cart edited in another tab while Stripe was open.
    if (JSON.stringify(readCatalogCart(pending.username)) === JSON.stringify(validateCartLines(pending.lines))) saveCatalogCart(pending.username, []);
    sessionStorage.removeItem(key);
  } catch { /* A storage restriction must not hide a paid receipt. */ }
}
