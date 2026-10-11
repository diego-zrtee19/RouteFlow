import { describe, expect, it } from "vitest";
import { assertSellerOwns, type AuthzResult } from "@/lib/authz";
import {
  isTransientSupabaseError,
  retryOnTransientSupabaseError,
} from "@/lib/supabaseRetry";
import type { Seller } from "@/domain/types";
import { TEST_SELLER_A, TEST_SELLER_B, makeOrder, makeSellerBOrder } from "./fixtures";

/**
 * SELLER AUTHORIZATION
 *
 * The audit's most serious finding was `resolveSellerFromSession()` ending with
 * `|| dataStore.sellers[0]`: any authenticated user was mapped onto the demo
 * seller, and `isSellerOrder()` then returned true for that seller's orders.
 *
 * These tests pin the replacement behaviour: ownership is an explicit,
 * non-defaulting comparison.
 */

describe("seller ownership", () => {
  it("allows a seller to act on their own resource", () => {
    const result: AuthzResult<Seller> = assertSellerOwns(
      TEST_SELLER_A,
      TEST_SELLER_A.id
    );
    expect(result.ok).toBe(true);
  });

  it("REJECTS seller A acting on seller B's order (the IDOR)", () => {
    const sellerBOrder = makeSellerBOrder();
    const result = assertSellerOwns(TEST_SELLER_A, sellerBOrder.sellerId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("NOT_RESOURCE_OWNER");
    }
  });

  it("rejects a resource with no seller id", () => {
    // A null sellerId must never be treated as "owned by everyone".
    const result = assertSellerOwns(TEST_SELLER_A, null);
    expect(result.ok).toBe(false);
  });

  it("rejects a resource with an undefined seller id", () => {
    const result = assertSellerOwns(TEST_SELLER_A, undefined);
    expect(result.ok).toBe(false);
  });

  it("does not treat seller A and seller B as interchangeable", () => {
    // Guards against an id comparison that ignores direction, e.g. a future
    // refactor to `.some()` over all sellers instead of a strict match.
    expect(TEST_SELLER_A.id).not.toBe(TEST_SELLER_B.id);
    expect(assertSellerOwns(TEST_SELLER_B, TEST_SELLER_A.id).ok).toBe(false);
  });
});

describe("transient Supabase failures do not become 500s", () => {
  it("classifies the reported 'JWT issued at future' as transient", () => {
    // The exact production error that stranded the user: PostgREST validating
    // the key's `iat` against an edge node whose clock had drifted ahead.
    expect(
      isTransientSupabaseError(new Error("Could not resolve seller: JWT issued at future"))
    ).toBe(true);
  });

  it("classifies other transport and token failures as transient", () => {
    for (const message of [
      "invalid JWT",
      "JWT expired",
      "fetch failed",
      "ECONNRESET",
      "ENOTFOUND",
      "The socket closed unexpectedly",
    ]) {
      expect(isTransientSupabaseError(new Error(message))).toBe(true);
    }
  });

  it("does NOT retry a genuine logic error", () => {
    // Retrying a unique-violation or a validation failure would just delay a
    // real error by a few hundred milliseconds and change nothing.
    for (const message of [
      "duplicate key value violates unique constraint",
      "permission denied for table sellers",
      "Could not publish the product",
    ]) {
      expect(isTransientSupabaseError(new Error(message))).toBe(false);
    }
  });

  it("recovers when the retry succeeds, so drift never reaches the user", async () => {
    let calls = 0;
    const result = await retryOnTransientSupabaseError(async () => {
      calls++;
      if (calls < 3) throw new Error("JWT issued at future");
      return "seller-found";
    });

    expect(result).toBe("seller-found");
    expect(calls).toBe(3);
  });

  it("gives up after the configured attempts", async () => {
    let calls = 0;
    await expect(
      retryOnTransientSupabaseError(
        async () => {
          calls++;
          throw new Error("fetch failed");
        },
        { attempts: 3, baseDelayMs: 1 }
      )
    ).rejects.toThrow("fetch failed");
    expect(calls).toBe(3);
  });

  it("does not retry a permanent error at all", async () => {
    let calls = 0;
    await expect(
      retryOnTransientSupabaseError(
        async () => {
          calls++;
          throw new Error("duplicate key value violates unique constraint");
        },
        { attempts: 5, baseDelayMs: 1 }
      )
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("returns the value on the first attempt when nothing goes wrong", async () => {
    let calls = 0;
    const result = await retryOnTransientSupabaseError(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });
});

describe("no implicit seller fallback", () => {
  it("an order's seller is the only seller that may touch it", () => {
    const order = makeOrder();

    // The order belongs to seller A.
    expect(order.sellerId).toBe(TEST_SELLER_A.id);

    // Every other known seller must be refused.
    const otherSellerIds = [TEST_SELLER_B.id, "seller-c", "", "undefined"];
    for (const id of otherSellerIds) {
      expect(assertSellerOwns(TEST_SELLER_B, order.sellerId).ok).toBe(false);
      expect(assertSellerOwns({ ...TEST_SELLER_B, id }, order.sellerId).ok).toBe(false);
    }
  });
});