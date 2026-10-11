import type { Order, Seller, Shipment } from "@/domain/types";
import { verifyBuyerToken } from "@/lib/buyerToken";

/**
 * TRACKING AUTHORIZATION.
 *
 * This module is intentionally PURE — no database, no network — so the
 * authorization decision can be unit tested without standing infrastructure.
 * The route wires the result to Supabase and the carrier.
 *
 * The audit found `POST /api/orders/[id]/tracking` had no ownership check at
 * all: any request bearing a valid order id could read another buyer's shipment
 * and force a carrier API call against it.
 *
 * Two distinct operations share the path, and they must NOT share a policy:
 *
 *   - READ  (GET)  a buyer may read their own tracking, and a seller may read
 *                  any of their own orders' tracking.
 *   - REFRESH (POST) hits the carrier and mutates stored state. A buyer must not
 *                  be able to trigger it: it is the seller's job, it costs an
 *                  API call, and it can move the order's status.
 */

export type TrackingAccess =
  | { ok: true; actor: "buyer" | "seller"; seller: Seller | null }
  | { ok: false; status: 401 | 403 | 404; code: string; reason: string };

/** What the caller presented. All fields optional because all may be absent. */
export interface TrackingCaller {
  /** Opaque buyer token from the `x-buyer-token` header or the body. */
  buyerToken?: string | null;
  /** The authenticated seller, when the session resolves to one. */
  seller?: Seller | null;
  /** True when the request carries a valid Clerk session. */
  authenticated?: boolean;
}

/**
 * Resolves who may READ tracking for `order`.
 *
 * Deliberately returns 404 (not 403) when the caller presents a buyer token
 * that does not match: the order may or may not exist, and revealing the
 * difference would let an attacker enumerate order ids.
 */
export function authorizeTrackingRead(order: Order, caller: TrackingCaller): TrackingAccess {
  // 1. Seller: must own the order.
  if (caller.seller) {
    if (caller.seller.id !== order.sellerId) {
      return {
        ok: false,
        status: 404,
        code: "ORDER_NOT_FOUND",
        reason: "Order does not belong to the authenticated seller",
      };
    }
    return { ok: true, actor: "seller", seller: caller.seller };
  }

  // 2. Buyer: must present the matching token.
  if (caller.buyerToken) {
    if (verifyBuyerToken(caller.buyerToken, order.buyerTokenHash)) {
      return { ok: true, actor: "buyer", seller: null };
    }
    // Wrong token is indistinguishable from an unknown order.
    return {
      ok: false,
      status: 404,
      code: "ORDER_NOT_FOUND",
      reason: "Buyer token does not match this order",
    };
  }

  // 3. Nothing usable was presented.
  //    A signed-in user with no seller and no token is unauthenticated *for
  //    this resource*, so 401 rather than 403.
  return {
    ok: false,
    status: 401,
    code: "UNAUTHENTICATED",
    reason: "A buyer token or a seller session is required",
  };
}

/**
 * Resolves who may REFRESH tracking (call the carrier and persist the result).
 *
 * Seller-only by design. A buyer token is deliberately insufficient: refreshing
 * is a privileged, mutating, billable operation.
 */
export function authorizeTrackingRefresh(
  order: Order,
  caller: TrackingCaller
): TrackingAccess {
  if (!caller.authenticated || !caller.seller) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHENTICATED",
      reason: "Only the order's seller can refresh tracking",
    };
  }

  if (caller.seller.id !== order.sellerId) {
    // 404: do not confirm the order exists for a different seller.
    return {
      ok: false,
      status: 404,
      code: "ORDER_NOT_FOUND",
      reason: "Order does not belong to the authenticated seller",
    };
  }

  return { ok: true, actor: "seller", seller: caller.seller };
}

/** True when the shipment may be returned to this actor. */
export function canSeeShipment(
  access: TrackingAccess,
  shipment: Shipment | null
): shipment is Shipment {
  return access.ok && shipment !== null;
}