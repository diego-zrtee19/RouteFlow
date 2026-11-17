import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeOrder } from "./fixtures";
const state = vi.hoisted(() => ({ find: vi.fn(), rpc: vi.fn(), from: vi.fn(), event: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: () => ({ rpc: state.rpc, from: state.from }),
}));
vi.mock("@/repositories/orderRepository", () => ({
  findOrderByIdForWebhook: state.find,
  cancelOrder: vi.fn(),
}));
vi.mock("@/services/orderService", () => ({ recordEvent: state.event }));
import { reconcileCheckoutSession } from "@/services/checkoutService";
import { upsertPayment } from "@/repositories/paymentRepository";
const session = {
  id: "cs_test_fixture",
  payment_intent: "pi_fixture",
  metadata: { order_id: "order-1" },
  payment_status: "paid",
  amount_total: 65000,
  currency: "mxn",
  status: "complete",
} as never;
beforeEach(() => vi.clearAllMocks());
describe("Checkout reconciliation financial safety", () => {
  it.each(["REFUNDED", "DISPUTED", "COMPLETED", "CANCELLED"] as const)(
    "preserves %s without rewriting payment records",
    async (status) => {
      state.find.mockResolvedValue(
        makeOrder({ status, paymentStatus: status === "REFUNDED" ? "REFUNDED" : "SUCCEEDED" }),
      );
      expect((await reconcileCheckoutSession(session)).reason).toBe("order_closed");
      expect(state.rpc).not.toHaveBeenCalled();
      expect(state.from).not.toHaveBeenCalled();
    },
  );
  it("does not mutate payments before validating an incorrect amount", async () => {
    state.find.mockResolvedValue(makeOrder({ amount: 900 }));
    expect((await reconcileCheckoutSession(session)).reason).toBe("amount_mismatch");
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.from).not.toHaveBeenCalled();
  });
  it("handles a refund arriving between lookup and atomic completion", async () => {
    state.find
      .mockResolvedValueOnce(makeOrder({ status: "PAYMENT_PENDING", paymentStatus: "PENDING" }))
      .mockResolvedValueOnce(makeOrder({ status: "REFUNDED", paymentStatus: "REFUNDED" }));
    state.rpc.mockResolvedValue({
      data: { success: false, error: "INVALID_ORDER_STATE" },
      error: null,
    });
    const result = await reconcileCheckoutSession(session);
    expect(result.order?.paymentStatus).toBe("REFUNDED");
    expect(result.changed).toBe(false);
    expect(state.from).not.toHaveBeenCalled();
  });
  it.each(["SUCCEEDED", "REFUNDED"])(
    "late checkout binding cannot downgrade an existing %s payment",
    async (status) => {
      const stored = {
        id: "payment",
        order_id: "order-1",
        status,
        amount: 650,
        currency: "MXN",
        checkout_session_id: "cs_test_fixture",
        payment_intent_id: "pi_fixture",
      };
      const where: Record<string, unknown> = {};
      const query = {
        upsert: vi.fn(async (insert, options) => {
          // Emulate the database conflict, not the implementation's expected result.
          if (!options.ignoreDuplicates) Object.assign(stored, insert);
          return { error: null };
        }),
        select: () => query,
        eq: (key: string, value: unknown) => {
          where[key] = value;
          return query;
        },
        single: async () => ({
          data: Object.entries(where).every(([k, v]) => stored[k as keyof typeof stored] === v)
            ? stored
            : null,
          error: null,
        }),
      };
      state.from.mockReturnValue(query);
      const payment = await upsertPayment({
        orderId: "order-1",
        checkoutSessionId: "cs_test_fixture",
        paymentIntentId: "pi_fixture",
        amount: 650,
        currency: "MXN",
        status: "PENDING",
      });
      expect(payment.status).toBe(status);
      expect(stored.status).toBe(status);
      await expect(
        upsertPayment({
          orderId: "foreign-order",
          checkoutSessionId: "cs_test_fixture",
          paymentIntentId: "pi_fixture",
          amount: 650,
          currency: "MXN",
          status: "PENDING",
        }),
      ).rejects.toThrow("does not match");
    },
  );
});
