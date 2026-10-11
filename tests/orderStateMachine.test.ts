import { describe, expect, it } from "vitest";
import {
  ALL_ORDER_STATUSES,
  InvalidOrderTransitionError,
  assertTransition,
  canTransition,
  isFulfillable,
  isTerminal,
} from "@/domain/orderStateMachine";
import type { OrderStatus } from "@/domain/types";

/**
 * ORDER STATE MACHINE
 *
 * Before this module existed, each route handler mutated `order.status`
 * directly (`markOrderPaid`, `cancelOrder`, `confirmDeliveryByBuyer`), so an
 * order could reach COMPLETED without ever being SHIPPED and nothing rejected
 * an impossible jump.
 */

describe("legal transitions", () => {
  it("follows the happy path end to end", () => {
    const path: OrderStatus[] = [
      "CREATED",
      "PAYMENT_PENDING",
      "PAID",
      "READY_TO_SHIP",
      "SHIPPED",
      "IN_TRANSIT",
      "DELIVERED",
      "BUYER_CONFIRMED",
      "COMPLETED",
    ];

    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("allows alternative terminal paths", () => {
    expect(canTransition("PAID", "CANCELLED")).toBe(true);
    expect(canTransition("PAID", "REFUNDED")).toBe(true);
    expect(canTransition("PAID", "SHIPPED")).toBe(true);
    expect(canTransition("DELIVERED", "DISPUTED")).toBe(true);
    expect(canTransition("DISPUTED", "REFUNDED")).toBe(true);
  });

  it("allows dispatching a paid order without a separate READY_TO_SHIP step", () => {
    // The dispatch route goes PAID -> SHIPPED directly; requiring an
    // intermediate action would make shipping impossible.
    expect(canTransition("PAID", "SHIPPED")).toBe(true);
    expect(canTransition("READY_TO_SHIP", "SHIPPED")).toBe(true);
  });
});

describe("illegal transitions", () => {
  it("REJECTS completing an order that was never shipped", () => {
    // The defect the audit described: status could be written directly.
    expect(canTransition("PAID", "COMPLETED")).toBe(false);
    expect(() => assertTransition("PAID", "COMPLETED")).toThrow(
      InvalidOrderTransitionError
    );
  });

  it("REJECTS confirming delivery before delivery", () => {
    expect(canTransition("SHIPPED", "BUYER_CONFIRMED")).toBe(false);
    expect(canTransition("PAID", "BUYER_CONFIRMED")).toBe(false);
  });

  it("REJECTS shipping an unpaid order", () => {
    expect(canTransition("CREATED", "SHIPPED")).toBe(false);
    expect(canTransition("PAYMENT_PENDING", "SHIPPED")).toBe(false);
  });

  it("REJECTS paying an order that is already terminal", () => {
    expect(canTransition("CANCELLED", "PAID")).toBe(false);
    expect(canTransition("REFUNDED", "PAID")).toBe(false);
  });

  it("REJECTS resurrecting a cancelled order", () => {
    expect(canTransition("CANCELLED", "COMPLETED")).toBe(false);
    expect(canTransition("CANCELLED", "IN_TRANSIT")).toBe(false);
  });

  it("REJECTS every jump out of a terminal state", () => {
    for (const terminal of ["CANCELLED", "REFUNDED"] as OrderStatus[]) {
      for (const target of ALL_ORDER_STATUSES) {
        // Re-applying the same status is an idempotent no-op, which is allowed
        // so a redelivered webhook does not error. Every *other* target must fail.
        if (target === terminal) continue;
        expect(canTransition(terminal, target)).toBe(false);
      }
    }
  });
});

describe("idempotency", () => {
  it("treats re-applying the current status as legal", () => {
    // Stripe redelivers webhooks; a repeat must not be an error.
    for (const status of ALL_ORDER_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
      expect(assertTransition(status, status)).toBe(status);
    }
  });
});

describe("error shape", () => {
  it("carries a machine-readable code and both statuses", () => {
    try {
      assertTransition("PAID", "COMPLETED");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidOrderTransitionError);
      const err = error as InvalidOrderTransitionError;
      expect(err.code).toBe("INVALID_ORDER_TRANSITION");
      expect(err.from).toBe("PAID");
      expect(err.to).toBe("COMPLETED");
    }
  });
});

describe("classification helpers", () => {
  it("identifies fulfilable states for seller queues", () => {
    expect(isFulfillable("PAID")).toBe(true);
    expect(isFulfillable("READY_TO_SHIP")).toBe(true);
    expect(isFulfillable("SHIPPED")).toBe(false);
    expect(isFulfillable("COMPLETED")).toBe(false);
  });

  it("identifies terminal states", () => {
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("REFUNDED")).toBe(true);
    expect(isTerminal("PAID")).toBe(false);
    expect(isTerminal("DISPUTED")).toBe(false);
  });

  it("exposes every status exactly once", () => {
    expect(new Set(ALL_ORDER_STATUSES).size).toBe(ALL_ORDER_STATUSES.length);
  });
});