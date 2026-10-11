import { describe, expect, it } from "vitest";
import {
  authorizeTrackingRead,
  authorizeTrackingRefresh,
  type TrackingCaller,
} from "@/lib/trackingAuthz";
import { hashBuyerToken } from "@/lib/buyerToken";
import type { Order } from "@/domain/types";
import { TEST_SELLER_A, TEST_SELLER_B, makeOrder, makeSellerBOrder } from "./fixtures";

/**
 * TRACKING IDOR
 *
 * The audit found `POST /api/orders/[id]/tracking` had no authorization at all:
 * any request with a valid order id could read another buyer's shipment and
 * force a carrier API call against it.
 *
 * These tests pin the policy, including the deliberate asymmetry between
 * reading (buyer OR seller) and refreshing (seller only).
 */

const orderA = makeOrder(); // seller A's order, buyer A
const orderB = makeSellerBOrder(); // seller B's order, buyer B

const buyerA: TrackingCaller = { buyerToken: "buyer-a-token" };
const buyerB: TrackingCaller = { buyerToken: "buyer-b-token" };
const sellerA: TrackingCaller = { seller: TEST_SELLER_A, authenticated: true };
const sellerB: TrackingCaller = { seller: TEST_SELLER_B, authenticated: true };
const anonymous: TrackingCaller = {};

describe("tracking READ authorization", () => {
  it("lets the buyer read their own tracking", () => {
    const access = authorizeTrackingRead(orderA, buyerA);
    expect(access.ok).toBe(true);
    if (access.ok) expect(access.actor).toBe("buyer");
  });

  it("lets the seller read tracking for their own order", () => {
    const access = authorizeTrackingRead(orderA, sellerA);
    expect(access.ok).toBe(true);
    if (access.ok) expect(access.actor).toBe("seller");
  });

  it("REJECTS Buyer A reading Buyer B's tracking (IDOR)", () => {
    const access = authorizeTrackingRead(orderB, buyerA);
    expect(access.ok).toBe(false);
    // 404, not 403: a wrong token must not confirm the order exists.
    if (!access.ok) {
      expect(access.status).toBe(404);
      expect(access.code).toBe("ORDER_NOT_FOUND");
    }
  });

  it("REJECTS Seller A reading Seller B's tracking (IDOR)", () => {
    const access = authorizeTrackingRead(orderB, sellerA);
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.status).toBe(404);
  });

  it("REJECTS an unauthenticated caller with 401", () => {
    const access = authorizeTrackingRead(orderA, anonymous);
    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.status).toBe(401);
      expect(access.code).toBe("UNAUTHENTICATED");
    }
  });

  it("REJECTS an authenticated user who is neither seller nor buyer", () => {
    // Signed in with Clerk, but owns nothing and presented no token.
    const access = authorizeTrackingRead(orderA, { authenticated: true });
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.status).toBe(401);
  });

  it("REJECTS a forged or empty token", () => {
    for (const token of ["", "   ", "wrong-token", orderA.id, orderA.orderNumber]) {
      const access = authorizeTrackingRead(orderA, { buyerToken: token });
      expect(access.ok).toBe(false);
    }
  });

  it("never returns 403 for a token mismatch, so ids cannot be enumerated", () => {
    // Distinguishing "forbidden" from "not found" would leak existence.
    for (const target of [orderA, orderB]) {
      const access = authorizeTrackingRead(target, buyerB);
      if (!access.ok) expect(access.status).not.toBe(403);
    }
  });
});

describe("tracking REFRESH authorization (seller-only)", () => {
  it("lets the owning seller refresh", () => {
    const access = authorizeTrackingRefresh(orderA, sellerA);
    expect(access.ok).toBe(true);
  });

  it("REJECTS the buyer even with a VALID token", () => {
    // Refresh is mutating and billable; the buyer must not trigger it.
    const access = authorizeTrackingRefresh(orderA, buyerA);
    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.status).toBe(401);
      expect(access.code).toBe("UNAUTHENTICATED");
    }
  });

  it("REJECTS an unauthenticated caller", () => {
    expect(authorizeTrackingRefresh(orderA, anonymous).ok).toBe(false);
  });

  it("REJECTS Seller A refreshing Seller B's order", () => {
    const access = authorizeTrackingRefresh(orderB, sellerA);
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.status).toBe(404);
  });

  it("rejects a seller session flagged as unauthenticated", () => {
    // Defensive: a seller object without a session must not be trusted.
    const access = authorizeTrackingRefresh(orderA, { seller: TEST_SELLER_A, authenticated: false });
    expect(access.ok).toBe(false);
  });
});

describe("token integrity", () => {
  it("only accepts a token whose hash matches the stored order", () => {
    const order: Order = makeOrder({
      buyerTokenHash: hashBuyerToken("the-real-token"),
    });
    expect(authorizeTrackingRead(order, { buyerToken: "the-real-token" }).ok).toBe(true);
    expect(authorizeTrackingRead(order, { buyerToken: "the-real-toke" }).ok).toBe(false);
  });
});