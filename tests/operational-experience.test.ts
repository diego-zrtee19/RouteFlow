import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  logisticsGuidance,
  medianMinutes,
  validateProductDetails,
} from "@/domain/operationalExperience";
import {
  clearBuyerToken,
  readBuyerSession,
  readBuyerToken,
  rememberBuyerAccess,
  storeBuyerToken,
} from "@/lib/buyerTokenStore";
const details = {
  title: "Camisa",
  description: "Azul",
  price: 100,
  images: ["https://example.com/photo.png"],
  variants: [],
};
function storage() {
  const d = new Map<string, string>();
  return {
    getItem: (k: string) => d.get(k) ?? null,
    setItem: (k: string, v: string) => d.set(k, v),
    removeItem: (k: string) => d.delete(k),
  };
}
beforeEach(() => {
  vi.stubGlobal("window", { sessionStorage: storage(), localStorage: storage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("validates images and metadata without allowing inventory fields to be overwritten", () => {
  expect(validateProductDetails({ ...details, stock: 999 })).toEqual(details);
  expect(() => validateProductDetails({ ...details, images: ["javascript:alert(1)"] })).toThrow();
});
it("rejects invalid prices and repeated variant IDs", () => {
  expect(() => validateProductDetails({ ...details, price: NaN })).toThrow();
  const v = {
    id: "12345678-1234-1234-1234-123456789012",
    label: "M",
    price: null,
    expectedLabel: "M",
    expectedPrice: null,
  };
  expect(() => validateProductDetails({ ...details, variants: [v, v] })).toThrow();
});
it("measures a median and excludes missing or negative timestamps", () => {
  expect(
    medianMinutes([
      { start: "2026-10-12T00:00Z", end: "2026-10-12T00:10Z" },
      { start: "2026-10-12T00:00Z", end: "2026-10-12T00:30Z" },
      { start: "2026-10-12T00:00Z", end: null },
    ]),
  ).toBe(20);
  expect(medianMinutes([])).toBeNull();
});
it("explains carrier failure and delivery without automatically confirming reception", () => {
  expect(logisticsGuidance("FAILED")).toMatch(/No confirmes/);
  expect(logisticsGuidance("DELIVERED")).toMatch(/no confirma por ti/);
});
it("expires remembered access after thirty days without pretending to revoke server credentials", () => {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  expect(rememberBuyerAccess("order", "token", "session")).toBe(true);
  expect(readBuyerToken("order")).toBe("token");
  vi.mocked(Date.now).mockReturnValue(now + 31 * 86400000);
  expect(readBuyerToken("order")).toBeNull();
  expect(readBuyerSession("order")).toBeNull();
});
it("forgets both token and Stripe session on the current device", () => {
  storeBuyerToken("order", "token");
  rememberBuyerAccess("order", "token", "session");
  clearBuyerToken("order");
  expect(readBuyerToken("order")).toBeNull();
  expect(readBuyerSession("order")).toBeNull();
});
it("does not revive legacy unbounded credentials or corrupt storage", () => {
  window.localStorage.setItem("routeflow.buyerToken.order", "legacy");
  expect(readBuyerToken("order")).toBeNull();
});
