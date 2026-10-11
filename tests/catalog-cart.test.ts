import { describe, expect, it } from "vitest";
import { validateCartLines, validateVariants } from "@/domain/catalogCart";
const productId = "12345678-1234-1234-1234-123456789012";
const variantId = "12345678-1234-1234-1234-123456789013";
describe("catalog selections", () => {
  it("keeps only identifiers and quantities, never client prices or seller IDs", () => {
    expect(validateCartLines([{ productId, variantId, quantity: 2, price: 0.01, sellerId: "attacker" }])).toEqual([{ productId, variantId, quantity: 2 }]);
  });
  it("rejects negative, fractional, excessive and invalid quantities", () => {
    for (const quantity of [-1, 0, 1.5, 21, "2", NaN]) expect(() => validateCartLines([{ productId, quantity }])).toThrow();
  });
  it("rejects duplicates so inventory cannot be tested independently then overdrawn", () => {
    expect(() => validateCartLines([{ productId, quantity: 15 }, { productId, quantity: 15 }])).toThrow();
  });
  it("allows different variants of one product", () => {
    expect(validateCartLines([{ productId, quantity: 1, variantId }, { productId, quantity: 1, variantId: productId }])).toHaveLength(2);
  });
  it("rejects empty carts and non-UUID variants", () => {
    expect(() => validateCartLines([])).toThrow();
    expect(() => validateCartLines([{ productId, quantity: 1, variantId: "forged" }])).toThrow();
  });
  it("validates independent variant inventory and optional pricing", () => {
    expect(validateVariants([{ label: " Azul / M ", stock: 3, price: "" }])).toEqual([{ label: "Azul / M", stock: 3, price: null }]);
    expect(() => validateVariants([{ label: "Azul", stock: -1 }])).toThrow();
    expect(() => validateVariants([{ label: "Azul", stock: 1 }, { label: "azul", stock: 1 }])).toThrow();
    expect(() => validateVariants([{ label: "Azul", stock: 1, price: 0 }])).toThrow();
  });
});
