import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buyerGuidance } from "@/domain/buyerGuidance";
import {
  catalogStartingPrice,
  cartIssues,
  filterCatalog,
  inventoryCartIssues,
} from "@/domain/catalogExperience";
import type { CatalogProduct } from "@/domain/catalogCart";
import { disputeGuidance } from "@/domain/disputeGuidance";
import {
  checkoutDraftInitial,
  parseCheckoutDraft,
  parseProductDraft,
  productDraftInitial,
} from "@/domain/formDrafts";
import { clearSessionDraft, readSessionDraft, saveSessionDraft } from "@/lib/sessionDraft";

const product: CatalogProduct = {
  id: "shirt",
  title: "Camisa",
  description: "Azul",
  price: 80,
  currency: "MXN",
  images: [],
  inStock: true,
  variants: [],
};
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("prioritizes available real products without deleting tests or changing the source catalog", () => {
  const products = [
    { ...product, id: "sold", inStock: false },
    { ...product, id: "test", title: "PRUEBA Camisa" },
    product,
  ];
  expect(filterCatalog(products, "", true, false).map((p) => p.id)).toEqual(["shirt"]);
  expect(filterCatalog(products, "", false, true).map((p) => p.id)).toEqual([
    "test",
    "shirt",
    "sold",
  ]);
  expect(products[0].id).toBe("sold");
});
it("searches descriptions and does not hide a legitimate title containing test inside a word", () => {
  expect(
    filterCatalog([{ ...product, title: "Contest camiseta" }], "azul", true, false),
  ).toHaveLength(1);
});
it("advertises an available variant price rather than an unavailable cheaper option or base price", () => {
  expect(
    catalogStartingPrice({
      ...product,
      variants: [
        { id: "m", label: "M", price: 150, inStock: true },
        { id: "s", label: "S", price: 90, inStock: false },
      ],
    }),
  ).toBe(150);
});
it("pinpoints removed and unavailable variants while leaving valid cart lines alone", () => {
  const variants = [
    { id: "m", label: "M", price: 80, inStock: false },
    { id: "l", label: "L", price: 80, inStock: true },
  ];
  const issues = cartIssues(
    [{ ...product, variants }],
    [
      { productId: "shirt", variantId: "missing", quantity: 1 },
      { productId: "shirt", variantId: "m", quantity: 1 },
      { productId: "shirt", variantId: "l", quantity: 1 },
    ],
  );
  expect(issues.map((issue) => issue.variantId)).toEqual(["missing", "m"]);
});
it("requires a choice when a cart product has variants", () => {
  expect(
    cartIssues(
      [{ ...product, variants: [{ id: "m", label: "M", price: 80, inStock: true }] }],
      [{ productId: "shirt", quantity: 1 }],
    )[0].message,
  ).toMatch(/Elige/);
});
it("diagnoses exact server-side stock conflicts without exposing stock quantities", () => {
  const issues = inventoryCartIssues(
    [
      {
        id: "shirt",
        title: "Camisa",
        stock: 10,
        product_variants: [{ id: "m", label: "M", stock: 1, is_active: true }],
      },
    ],
    [{ productId: "shirt", variantId: "m", quantity: 2 }],
  );
  expect(issues).toEqual([
    { productId: "shirt", variantId: "m", message: expect.stringContaining("Camisa · M") },
  ]);
  expect(JSON.stringify(issues)).not.toMatch(/stock|maxQuantity/);
});
it("rejects removed products and inactive variants", () => {
  expect(inventoryCartIssues([], [{ productId: "shirt", quantity: 1 }])).toHaveLength(1);
  expect(
    inventoryCartIssues(
      [
        {
          id: "shirt",
          title: "Camisa",
          stock: 10,
          product_variants: [{ id: "m", label: "M", stock: 10, is_active: false }],
        },
      ],
      [{ productId: "shirt", variantId: "m", quantity: 1 }],
    ),
  ).toHaveLength(1);
});
it("restores only the current draft scope and clears it after success", () => {
  saveSessionDraft("seller:a", productDraftInitial, 100);
  expect(readSessionDraft("seller:b", parseProductDraft, 101)).toBeNull();
  expect(readSessionDraft("seller:a", parseProductDraft, 101)).toEqual(productDraftInitial);
  clearSessionDraft("seller:a");
  expect(readSessionDraft("seller:a", parseProductDraft, 101)).toBeNull();
});
it.each([100 + 4 * 60 * 60 * 1000 + 1, 99])(
  "rejects expired or future-dated drafts at %s",
  (now) => {
    saveSessionDraft("draft", checkoutDraftInitial, 100);
    expect(readSessionDraft("draft", parseCheckoutDraft, now)).toBeNull();
  },
);
it("survives malformed data and browser storage restrictions", () => {
  sessionStorage.setItem("draft", "{");
  expect(readSessionDraft("draft", parseCheckoutDraft)).toBeNull();
  vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
    throw Error("QuotaExceededError");
  });
  expect(saveSessionDraft("draft", checkoutDraftInitial)).toBe(false);
});
it("drops unexpected credentials from recovered drafts and rejects oversized input", () => {
  expect(
    parseCheckoutDraft({
      ...checkoutDraftInitial,
      buyerToken: "secret",
      address: { ...checkoutDraftInitial.address, pin: "123456" },
    }),
  ).toEqual(checkoutDraftInitial);
  expect(
    parseProductDraft({
      ...productDraftInitial,
      dimensions: { ...productDraftInitial.dimensions, privateKey: "secret" },
    }),
  ).toEqual(productDraftInitial);
  expect(
    parseCheckoutDraft({
      ...checkoutDraftInitial,
      buyer: { ...checkoutDraftInitial.buyer, buyerName: "a".repeat(151) },
    }),
  ).toBeNull();
});
it("does not equate creation of a shipping label with carrier receipt", () => {
  const result = buyerGuidance({
    status: "PAID",
    deliveryMethod: "shipping",
    shipment: { trackingNumber: "test" } as NonNullable<
      Parameters<typeof buyerGuidance>[0]["shipment"]
    >,
  });
  expect(result.next).toMatch(/cuándo la paquetería reciba/);
});
it("asks coordinated buyers to keep their PIN until receiving all items", () => {
  expect(buyerGuidance({ status: "PAID", deliveryMethod: "meetup", shipment: null }).next).toMatch(
    /solo después de recibir/,
  );
});
it("distinguishes a carrier delivery record from the buyer confirmation", () => {
  expect(
    buyerGuidance({ status: "DELIVERED", deliveryMethod: "shipping", shipment: null }).next,
  ).toMatch(/antes de confirmar/);
});
it("keeps overdue cases open and does not promise an automatic refund", () => {
  const result = disputeGuidance("OPEN", null, "2026-10-01", "buyer", Date.parse("2026-10-12"));
  expect(result.overdue).toBe(true);
  expect(result.open).toBe(true);
  expect(result.timing).toMatch(/no implica un reembolso automático/);
});
it("moves the next action to review after the seller answers", () => {
  const result = disputeGuidance(
    "UNDER_REVIEW",
    "Envié evidencia",
    "2026-10-01",
    "buyer",
    Date.parse("2026-10-12"),
  );
  expect(result.awaitingSeller).toBe(false);
  expect(result.overdue).toBe(false);
  expect(result.owner).toMatch(/RouteFlow/);
  expect(result.timing).toMatch(/no hay una fecha/);
});
it("does not solicit another seller response on a closed case", () => {
  expect(disputeGuidance("RESOLVED", null, "invalid", "seller").open).toBe(false);
});
