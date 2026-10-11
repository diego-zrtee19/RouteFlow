import { describe, expect, it } from "vitest";
import {
  CheckoutError,
  computePlatformFee,
  orderMatchesSessionAmount,
  toStripeAmount,
  validateCheckoutInput,
  PLATFORM_FEE_RATE,
} from "@/services/checkoutService";
import type { Order } from "@/domain/types";
import { makeOrder } from "./fixtures";

/**
 * CHECKOUT — MIGRATED FLOW (PHASE 9)
 *
 * The checkout path used to live entirely in an in-memory `dataStore` seeded
 * from `mockData.ts`, so a purchase survived neither a restart nor a redeploy,
 * and the price was resolved from process memory rather than from the database.
 * It now reads the link and product from Supabase and writes real `orders` /
 * `order_items` / `payments` rows.
 *
 * What is unit-testable without a database is everything that decides WHETHER a
 * purchase may proceed and WHAT Stripe is told to charge. Those are the security
 * boundaries, so they are what these tests pin down. The persistence itself is
 * covered end-to-end by `scripts/verify-orders-live.ts` against a real project.
 *
 * No test here mocks the network or the database: the assertions run against the
 * real validation and money logic, which is where the bugs were.
 */

const VALID_INPUT = {
  publicId: "abc123",
  buyerName: "Ana Lopez",
  buyerEmail: "ana@example.com",
  buyerPhone: "5551111111",
  deliveryMethod: "shipping",
  address: {
    street: "Av. Reforma 1",
    city: "Guadalajara",
    state: "JAL",
    postalCode: "44100",
    country: "Mexico",
  },
};

describe("validateCheckoutInput — the buyer request is the ONLY untrusted input", () => {
  it("accepts a complete request and uppercases the public id", () => {
    const parsed = validateCheckoutInput(VALID_INPUT);
    expect(parsed.publicId).toBe("ABC123");
    expect(parsed.buyerEmail).toBe("ana@example.com");
    expect(parsed.address.city).toBe("Guadalajara");
  });

  // Each must fail closed. If any returned a parsed input, the caller would go
  // on to resolve a link and charge a real card.
  const rejections: Array<[string, Record<string, unknown>, string]> = [
    ["missing publicId", { ...VALID_INPUT, publicId: "" }, "missing_public_id"],
    ["missing buyerName", { ...VALID_INPUT, buyerName: "   " }, "missing_buyer_name"],
    ["malformed email", { ...VALID_INPUT, buyerEmail: "not-an-email" }, "invalid_buyer_email"],
    ["missing buyerPhone", { ...VALID_INPUT, buyerPhone: "" }, "missing_buyer_phone"],
    [
      "unknown delivery method",
      { ...VALID_INPUT, deliveryMethod: "teleport" },
      "invalid_delivery_method",
    ],
    [
      "missing street",
      { ...VALID_INPUT, address: { ...VALID_INPUT.address, street: "" } },
      "missing_shipping_address",
    ],
    [
      "missing city",
      { ...VALID_INPUT, address: { ...VALID_INPUT.address, city: "" } },
      "missing_shipping_address",
    ],
    [
      "missing postalCode",
      { ...VALID_INPUT, address: { ...VALID_INPUT.address, postalCode: "" } },
      "missing_shipping_address",
    ],
  ];

  for (const [name, payload, expectedCode] of rejections) {
    it(`REJECTS ${name}`, () => {
      expect(() => validateCheckoutInput(payload)).toThrow(CheckoutError);
      try {
        validateCheckoutInput(payload);
      } catch (error) {
        expect((error as CheckoutError).code).toBe(expectedCode);
        // A validation failure is a client error, never a 500.
        expect((error as CheckoutError).status).toBe(400);
      }
    });
  }

  it("has no field through which a client could smuggle money", () => {
    // price, amount, fee and total are all absent by construction: they are
    // resolved from the stored product inside createOrderFromPurchaseLink.
    const parsed = validateCheckoutInput({
      ...VALID_INPUT,
      amount: 0.01,
      price: 0.01,
      platformFee: 0,
      total: 1,
    });

    expect(Object.keys(parsed).sort()).toEqual([
      "address",
      "buyerEmail",
      "buyerName",
      "buyerPhone",
      "deliveryMethod",
      "publicId",
    ]);
    expect(JSON.stringify(parsed)).not.toContain("platformFee");
  });
});

describe("money is computed server-side only", () => {
  it("derives the platform fee from the server-side amount", () => {
    expect(PLATFORM_FEE_RATE).toBe(0.05);
    expect(computePlatformFee(1000)).toBe(50);
    expect(computePlatformFee(123.456)).toBe(6.17);
  });

  it("converts to Stripe's integer minor units without float drift", () => {
    expect(toStripeAmount(1000)).toBe(100000);
    expect(toStripeAmount(19.99)).toBe(1999);
    // A float error here charges the buyer a different amount.
    expect(toStripeAmount(19.99 * 3)).toBe(5997);
  });
});

describe("orderMatchesSessionAmount — defence in depth before marking paid", () => {
  const order: Order = makeOrder();
  const exact = {
    amount_total: toStripeAmount(order.amount),
    currency: order.currency.toLowerCase(),
  };

  it("accepts an exact match", () => {
    expect(orderMatchesSessionAmount(order, exact as never)).toBe(true);
  });

  it("accepts when Stripe reports no total (nothing to contradict)", () => {
    expect(
      orderMatchesSessionAmount(order, { amount_total: null, currency: "mxn" } as never)
    ).toBe(true);
  });

  it("REJECTS a tampered amount", () => {
    expect(orderMatchesSessionAmount(order, { ...exact, amount_total: 1 } as never)).toBe(false);
  });

  it("REJECTS a currency swap", () => {
    expect(orderMatchesSessionAmount(order, { ...exact, currency: "usd" } as never)).toBe(false);
  });
});
