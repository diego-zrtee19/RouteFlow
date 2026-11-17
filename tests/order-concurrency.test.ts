import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeOrder } from "./fixtures";
const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => db }));
import { transitionOrder } from "@/services/orderService";
import { transitionOrder as repositoryTransition } from "@/repositories/orderRepository";
function storedOrder(status: string, payment = "SUCCEEDED") {
  const row: Record<string, unknown> = {
    id: "order-1",
    seller_id: "seller-a",
    status,
    payment_status: payment,
    order_items: [],
  };
  db.from.mockImplementation(() => {
    const where: Record<string, unknown> = {};
    let patch = {};
    const query = {
      update: (value: object) => {
        patch = value;
        return query;
      },
      eq: (key: string, value: unknown) => {
        where[key] = value;
        return query;
      },
      select: () => query,
      maybeSingle: async () => {
        if (!Object.entries(where).every(([k, v]) => row[k] === v))
          return { data: null, error: null };
        Object.assign(row, patch);
        return { data: { ...row }, error: null };
      },
    };
    return query;
  });
  return row;
}
beforeEach(() => vi.clearAllMocks());
describe("Order compare-and-set", () => {
  it.each([transitionOrder, repositoryTransition])(
    "rejects stale delivery state when a dispute already exists",
    async (transition) => {
      const row = storedOrder("DISPUTED");
      await expect(
        transition(
          makeOrder({ status: "DELIVERED", paymentStatus: "SUCCEEDED" }),
          "BUYER_CONFIRMED",
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(row.status).toBe("DISPUTED");
    },
  );
  it("refuses a concurrent refund even when the order status has not changed yet", async () => {
    const row = storedOrder("DELIVERED", "REFUNDED");
    await expect(
      transitionOrder(
        makeOrder({ status: "DELIVERED", paymentStatus: "SUCCEEDED" }),
        "BUYER_CONFIRMED",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(row.status).toBe("DELIVERED");
  });
  it("accepts a current delivery but a subsequent dispute blocks completion", async () => {
    const row = storedOrder("DELIVERED");
    const confirmed = await transitionOrder(
      makeOrder({ status: "DELIVERED", paymentStatus: "SUCCEEDED" }),
      "BUYER_CONFIRMED",
    );
    expect(row.status).toBe("BUYER_CONFIRMED");
    row.status = "DISPUTED";
    await expect(transitionOrder(confirmed, "COMPLETED")).rejects.toMatchObject({ status: 409 });
    expect(row.status).toBe("DISPUTED");
  });
});

describe("Buyer confirmation availability", () => {
  it.each([
    ["IN_TRANSIT", "SUCCEEDED", false],
    ["DELIVERED", "SUCCEEDED", true],
    ["BUYER_CONFIRMED", "SUCCEEDED", true],
    ["DELIVERED", "REFUNDED", false],
    ["DISPUTED", "SUCCEEDED", false],
  ] as const)(
    "%s with %s payment exposes canConfirm=%s",
    async (status, paymentStatus, expected) => {
      const { toBuyerOrderView } = await import("@/domain/dto");
      expect(
        toBuyerOrderView(makeOrder({ status, paymentStatus }), null, [], null).canConfirm,
      ).toBe(expected);
    },
  );
});
