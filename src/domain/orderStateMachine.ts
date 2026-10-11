import type { OrderStatus } from "./types";

/**
 * CENTRAL ORDER STATE MACHINE.
 *
 * Before this existed, every route handler invented its own transitions
 * (`markOrderPaid`, `cancelOrder`, `confirmDeliveryByBuyer`, ...), which meant
 * an order could reach `COMPLETED` without ever passing through `SHIPPED`, and
 * two handlers could disagree about what a given status implies.
 *
 * Rules:
 *   - a transition must appear in the table below, or it is rejected
 *   - a transition to the current status is a no-op (idempotent), not an error,
 *     because Stripe redelivers webhooks
 *   - terminal states have no outgoing edges except REFUNDED/DISPUTED
 */

/** Allowed transitions keyed by current status. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  CREATED: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "CANCELLED"],

  // A failed *payment* is a PaymentStatus, not an OrderStatus: the buyer can
  // retry the same session, so the order stays in PAYMENT_PENDING.
  // A paid order can be dispatched immediately, or parked in READY_TO_SHIP
  // first. Rejecting PAID -> SHIPPED would mean a seller holding stock cannot
  // ship until some separate "ready" action is taken, which the dispatch route
  // never performs.
  PAID: ["READY_TO_SHIP", "SHIPPED", "REFUNDED", "DISPUTED", "CANCELLED"],
  READY_TO_SHIP: ["SHIPPED", "REFUNDED", "DISPUTED", "CANCELLED"],
  SHIPPED: ["IN_TRANSIT", "DELIVERED", "DISPUTED", "REFUNDED"],
  IN_TRANSIT: ["DELIVERED", "DISPUTED", "REFUNDED"],
  DELIVERED: ["BUYER_CONFIRMED", "DISPUTED", "REFUNDED"],
  BUYER_CONFIRMED: ["COMPLETED", "DISPUTED"],
  COMPLETED: ["DISPUTED", "REFUNDED"],

  // Terminal: the deal is closed and the money is gone one way or another.
  CANCELLED: [],
  REFUNDED: [],
  DISPUTED: ["REFUNDED"],

  // FAILED is a valid payment outcome, not a terminal order state.
  FAILED: ["PAYMENT_PENDING", "CANCELLED"],
} as unknown as Record<OrderStatus, readonly OrderStatus[]>;

export class InvalidOrderTransitionError extends Error {
  readonly code = "INVALID_ORDER_TRANSITION";
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Illegal order transition ${from} -> ${to}`);
    this.name = "InvalidOrderTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** True when `to` is a legal next state for `from`. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true; // idempotent re-application
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Returns `to` when the transition is legal.
 * Throws `InvalidOrderTransitionError` when it is not.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!canTransition(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
  return to;
}

/** States from which no further transition is possible. */
export function isTerminal(status: OrderStatus): boolean {
  return (TRANSITIONS[status] ?? []).length === 0;
}

/** Used by seller dashboards to build the "needs fulfilment" work queue. */
export function isFulfillable(status: OrderStatus): boolean {
  return status === "PAID" || status === "READY_TO_SHIP";
}

/** Every status, for validation and tests. */
export const ALL_ORDER_STATUSES = Object.keys(TRANSITIONS) as OrderStatus[];
