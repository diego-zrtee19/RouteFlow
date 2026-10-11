import { describe, expect, it } from "vitest";
import {
  generateBuyerToken,
  generateOrderNumber,
  generatePublicId,
  hashBuyerToken,
  verifyBuyerToken,
} from "@/lib/buyerToken";
import { BUYER_A_TOKEN, BUYER_B_TOKEN, makeOrder, makeSellerBOrder } from "./fixtures";

/**
 * BUYER AUTHORIZATION
 *
 * The audit found `POST /api/orders/[id]/confirm` accepted the order id as
 * proof of ownership, with a comment describing that as a feature. It is an
 * IDOR: the id is the capability, and ids leak through logs, referrers and
 * support screenshots.
 *
 * The replacement is an independent 256-bit token whose SHA-256 hash is stored.
 * These tests prove the id alone is never sufficient.
 */

describe("buyer token generation", () => {
  it("produces a high-entropy, URL-safe token", () => {
    const token = generateBuyerToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats across many calls", () => {
    const tokens = new Set(Array.from({ length: 2000 }, () => generateBuyerToken()));
    expect(tokens.size).toBe(2000);
  });

  it("hashes deterministically, so lookup by hash works", () => {
    const token = generateBuyerToken();
    expect(hashBuyerToken(token)).toBe(hashBuyerToken(token));
    expect(hashBuyerToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never stores the plaintext in the hash", () => {
    const token = generateBuyerToken();
    expect(hashBuyerToken(token)).not.toContain(token);
  });
});

describe("buyer token verification", () => {
  it("accepts the correct token", () => {
    const { token, hash } = (() => {
      const t = generateBuyerToken();
      return { token: t, hash: hashBuyerToken(t) };
    })();
    expect(verifyBuyerToken(token, hash)).toBe(true);
  });

  it("REJECTS a different buyer's token (Buyer A vs Order B)", () => {
    const orderB = makeSellerBOrder();
    // Buyer A presents their own valid token against buyer B's order.
    expect(verifyBuyerToken(BUYER_A_TOKEN, orderB.buyerTokenHash)).toBe(false);
  });

  it("REJECTS a missing token", () => {
    const order = makeOrder();
    expect(verifyBuyerToken(undefined, order.buyerTokenHash)).toBe(false);
    expect(verifyBuyerToken(null, order.buyerTokenHash)).toBe(false);
    expect(verifyBuyerToken("", order.buyerTokenHash)).toBe(false);
  });

  it("REJECTS when the stored hash is empty", () => {
    // An order row with no token hash must never be unlocked by an empty token.
    expect(verifyBuyerToken("anything", "")).toBe(false);
  });

  it("REJECTS a near-miss token without throwing", () => {
    const order = makeOrder();
    const tampered = BUYER_A_TOKEN.slice(0, -1) + "x";
    expect(verifyBuyerToken(tampered, order.buyerTokenHash)).toBe(false);
  });

  it("distinguishes two buyers' tokens on the same order shape", () => {
    const orderA = makeOrder();
    const orderB = makeSellerBOrder();
    expect(orderA.buyerTokenHash).not.toBe(orderB.buyerTokenHash);
    expect(verifyBuyerToken(BUYER_A_TOKEN, orderA.buyerTokenHash)).toBe(true);
    expect(verifyBuyerToken(BUYER_B_TOKEN, orderA.buyerTokenHash)).toBe(false);
  });
});

describe("order id is not a capability", () => {
  it("an attacker with the id but no token has nothing", () => {
    const order = makeOrder();
    // Knowing the id grants no access on its own.
    expect(order.id).toBe("order-1");
    expect(verifyBuyerToken(undefined, order.buyerTokenHash)).toBe(false);
    expect(verifyBuyerToken(order.id, order.buyerTokenHash)).toBe(false);
  });

  it("the order number is not the token", () => {
    const order = makeOrder();
    expect(verifyBuyerToken(order.orderNumber, order.buyerTokenHash)).toBe(false);
  });
});

describe("identifier generation", () => {
  it("order numbers are prefixed and avoid ambiguous glyphs", () => {
    const numbers = Array.from({ length: 500 }, () => generateOrderNumber());
    for (const n of numbers) {
      expect(n).toMatch(/^RF-[A-Z0-9]{6}$/);
      // 0/O and 1/I are excluded so numbers can be read aloud.
      expect(n).not.toMatch(/[O0I1]/);
    }
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("public ids match the DB CHECK constraint", () => {
    // supabase_schema_v3.sql: public_id ~ '^[A-Z0-9]{6,16}$'
    const ids = Array.from({ length: 500 }, () => generatePublicId());
    for (const id of ids) {
      expect(id).toMatch(/^[A-Z0-9]{8}$/);
    }
    expect(new Set(ids).size).toBeGreaterThan(490);
  });
});