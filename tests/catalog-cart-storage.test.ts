import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearPaidCatalogCart,
  readCatalogCart,
  rememberCatalogPurchase,
  saveCatalogCart,
} from "@/lib/catalogCartStore";
const lines = [{ productId: "12345678-1234-1234-1234-123456789012", quantity: 1 }];
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
});
afterEach(() => vi.unstubAllGlobals());
it("clears only the purchased seller cart after confirmed payment", () => {
  saveCatalogCart("seller", lines);
  saveCatalogCart("other", lines);
  rememberCatalogPurchase("paid-order", "seller", lines);
  clearPaidCatalogCart("paid-order");
  expect(readCatalogCart("seller")).toEqual([]);
  expect(readCatalogCart("other")).toEqual(lines);
});
it("preserves a cart modified in another tab during checkout", () => {
  saveCatalogCart("seller", lines);
  rememberCatalogPurchase("paid-order", "seller", lines);
  saveCatalogCart("seller", [{ ...lines[0], quantity: 2 }]);
  clearPaidCatalogCart("paid-order");
  expect(readCatalogCart("seller")[0].quantity).toBe(2);
});
it("keeps a pending cart and rejects damaged stored selections", () => {
  saveCatalogCart("seller", lines);
  rememberCatalogPurchase("pending-order", "seller", lines);
  clearPaidCatalogCart("different-order");
  expect(readCatalogCart("seller")).toEqual(lines);
  localStorage.setItem("routeflow.cart.seller", '{"price":0}');
  expect(readCatalogCart("seller")).toEqual([]);
});
it("rejects objects shaped like arrays rather than restoring a forged cart", () => {
  localStorage.setItem("routeflow.cart.seller", JSON.stringify({ 0: lines[0], length: 1 }));
  expect(readCatalogCart("seller")).toEqual([]);
});
it("reports storage restrictions without replacing the saved cart", () => {
  saveCatalogCart("seller", lines);
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  expect(saveCatalogCart("seller", [{ ...lines[0], quantity: 2 }])).toBe(false);
  expect(readCatalogCart("seller")).toEqual(lines);
});
