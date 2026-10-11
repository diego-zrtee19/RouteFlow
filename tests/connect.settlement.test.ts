import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  intent: vi.fn(),
  account: vi.fn(),
  transfer: vi.fn(),
  list: vi.fn(),
  retrieve: vi.fn(),
  reversal: vi.fn(),
  testMode: vi.fn(),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: mocks.single }) }) }),
      update: mocks.update,
    }),
  }),
}));
vi.mock("@/lib/stripe", () => ({
  isStripeTestMode: mocks.testMode,
  getStripe: () => ({
    paymentIntents: { retrieve: mocks.intent },
    v2: { core: { accounts: { retrieve: mocks.account } } },
    transfers: {
      create: mocks.transfer,
      list: mocks.list,
      retrieve: mocks.retrieve,
      createReversal: mocks.reversal,
    },
  }),
}));
import { settleCompletedOrder, prepareRefund } from "@/services/connectService";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.testMode.mockReturnValue(true);
  mocks.rpc.mockResolvedValue({
    data: { account_id: "acct_test", amount: 95, currency: "MXN" },
    error: null,
  });
  mocks.single.mockResolvedValue({
    data: { payment_intent_id: "pi_test" },
    error: null,
  });
  mocks.intent.mockResolvedValue({
    status: "succeeded",
    latest_charge: "ch_test",
  });
  mocks.account.mockResolvedValue({
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { status: "active" },
            payouts: { status: "active" },
          },
        },
      },
    },
    requirements: { entries: [] },
  });
  mocks.transfer.mockResolvedValue({ id: "tr_test" });
  mocks.list.mockResolvedValue({ data: [], has_more: false });
  mocks.retrieve.mockResolvedValue({ id: "tr_test", reversed: false });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
});
describe("Connect settlement", () => {
  it("reconciles a lost transfer binding before allowing a refund", async () => {
    mocks.rpc.mockResolvedValue({
      data: { transfer_id: null, settlement_status: "FAILED" },
      error: null,
    });
    mocks.list.mockResolvedValue({
      data: [{ id: "tr_lost", metadata: { order_id: "order-test" } }],
      has_more: false,
    });
    await prepareRefund("order-test");
    expect(mocks.reversal).toHaveBeenCalledWith(
      "tr_lost",
      {},
      { idempotencyKey: "rf_reverse_order-test" },
    );
  });
  it("recovers an already reversed transfer without reversing twice", async () => {
    mocks.rpc.mockResolvedValue({
      data: { transfer_id: "tr_test", settlement_status: "TRANSFERRED" },
      error: null,
    });
    mocks.retrieve.mockResolvedValue({ id: "tr_test", reversed: true });
    await prepareRefund("order-test");
    expect(mocks.reversal).not.toHaveBeenCalled();
  });
  it("recovers an existing transfer even after Stripe's idempotency window", async () => {
    mocks.list.mockResolvedValue({
      data: [
        {
          id: "tr_previous",
          metadata: { order_id: "order-test" },
          destination: "acct_test",
          amount: 9500,
          currency: "mxn",
          reversed: false,
        },
      ],
      has_more: false,
    });
    await expect(settleCompletedOrder("order-test")).resolves.toEqual({
      transferId: "tr_previous",
    });
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it("does not create another transfer when historical evidence disagrees", async () => {
    mocks.list.mockResolvedValue({
      data: [
        {
          id: "tr_previous",
          metadata: { order_id: "another" },
          destination: "acct_test",
          amount: 9500,
          currency: "mxn",
        },
      ],
      has_more: false,
    });
    await expect(settleCompletedOrder("order-test")).rejects.toThrow();
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it("uses source charge, net amount and stable idempotency key", async () => {
    await expect(settleCompletedOrder("order-test")).resolves.toEqual({
      transferId: "tr_test",
    });
    expect(mocks.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        source_transaction: "ch_test",
        destination: "acct_test",
        amount: 9500,
        currency: "mxn",
      }),
      { idempotencyKey: "rf_settle_order-test" },
    );
  });
  it("never transfers an order not claimed by the database", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await settleCompletedOrder("order-test");
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it("blocks transfers when the charge is not successful", async () => {
    mocks.intent.mockResolvedValue({
      status: "processing",
      latest_charge: "ch_test",
    });
    await expect(settleCompletedOrder("order-test")).rejects.toThrow();
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it("blocks transfers when payout capability was revoked", async () => {
    mocks.account.mockResolvedValue({
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { status: "active" },
              payouts: { status: "inactive" },
            },
          },
        },
      },
    });
    await expect(settleCompletedOrder("order-test")).rejects.toThrow();
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it("leaves live transfers disabled by default", async () => {
    mocks.testMode.mockReturnValue(false);
    vi.stubEnv("ROUTEFLOW_LIVE_SETTLEMENTS", "false");
    await settleCompletedOrder("order-test");
    expect(mocks.rpc).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("reverses transfer idempotently before refund", async () => {
    mocks.rpc.mockResolvedValue({
      data: { transfer_id: "tr_test", settlement_status: "TRANSFERRED" },
      error: null,
    });
    await prepareRefund("order-test");
    expect(mocks.reversal).toHaveBeenCalledWith(
      "tr_test",
      {},
      { idempotencyKey: "rf_reverse_order-test" },
    );
  });
  it("does not refund while a settlement holds the database lock", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: new Error("Settlement in progress"),
    });
    await expect(prepareRefund("order-test")).rejects.toThrow(
      "Settlement in progress",
    );
    expect(mocks.reversal).not.toHaveBeenCalled();
  });
});
