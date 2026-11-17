import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeOrder, TEST_PRODUCT } from "./fixtures";
const m = vi.hoisted(() => ({
  load: vi.fn(),
  reserve: vi.fn(),
  bind: vi.fn(),
  stripe: vi.fn(),
  resolve: vi.fn(),
  payment: vi.fn(),
  event: vi.fn(),
  quote: vi.fn(),
}));
vi.mock("@/services/checkoutAttemptService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/checkoutAttemptService")>()),
  loadCheckoutAttempt: m.load,
  reserveCheckoutAttempt: m.reserve,
  bindStripeRequest: m.bind,
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  isStripeTestMode: () => true,
  getStripe: () => ({ checkout: { sessions: { create: m.stripe } } }),
}));
vi.mock("@/repositories/purchaseLinkRepository", () => ({ resolvePublicPurchaseLink: m.resolve }));
vi.mock("@/repositories/paymentRepository", () => ({ upsertPayment: m.payment }));
vi.mock("@/services/shippingQuoteService", () => ({ validateShippingQuote: m.quote }));
vi.mock("@/services/orderService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/orderService")>()),
  recordEvent: m.event,
}));
import { createCheckoutSession, validateCheckoutInput } from "@/services/checkoutService";
import { createCatalogCheckout } from "@/services/catalogCheckoutService";
const input = {
  publicId: "ABC123",
  buyerName: "TEST",
  buyerEmail: "fixture@example.invalid",
  buyerPhone: "555",
  deliveryMethod: "meetup",
  address: { street: "TEST", city: "TEST", postalCode: "44100", country: "MX" },
};
describe("retry after losing Stripe response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resolve.mockResolvedValue({ product: { ...TEST_PRODUCT, deliveryOptions: ["meetup"] } });
    m.payment.mockResolvedValue({});
    m.event.mockResolvedValue({});
    m.quote.mockResolvedValue({});
    m.stripe.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.com/test" });
    m.bind.mockImplementation(async (_attempt, params) => params);
  });
  it("recovers the same quick order and Stripe request without reserving again", async () => {
    const order = makeOrder({
      status: "PAYMENT_PENDING",
      paymentStatus: "PENDING",
      createdAt: new Date().toISOString(),
    });
    const attempt = {
      keyHash: "a".repeat(64),
      requestHash: "b".repeat(64),
      kind: "quick",
      buyerToken: "secret",
      order: null,
    };
    m.load.mockResolvedValueOnce(attempt).mockResolvedValueOnce({ ...attempt, order });
    m.reserve.mockResolvedValue(order);
    let stored: unknown;
    m.bind.mockImplementation(async (_a, p) => stored ?? (stored = p));
    m.stripe.mockRejectedValueOnce(Error("network response lost"));
    await expect(
      createCheckoutSession(validateCheckoutInput(input), "http://localhost:3001", "a".repeat(64)),
    ).rejects.toThrow("network");
    const retry = await createCheckoutSession(
      validateCheckoutInput(input),
      "http://localhost:3001",
      "a".repeat(64),
    );
    expect(retry.order.id).toBe(order.id);
    expect(retry.buyerToken).toBe("secret");
    expect(m.reserve).toHaveBeenCalledOnce();
    expect(m.resolve).toHaveBeenCalledOnce();
    expect(m.stripe.mock.calls[0]).toEqual(m.stripe.mock.calls[1]);
    expect(m.stripe.mock.calls[1][1]).toEqual({ idempotencyKey: `rf_checkout_${order.id}` });
  });
  it("catalog retry does not recheck stock or reserve an expired quote", async () => {
    const order = makeOrder({
      status: "PAYMENT_PENDING",
      paymentStatus: "PENDING",
      createdAt: new Date().toISOString(),
    });
    m.load.mockResolvedValue({ order, buyerToken: "secret" });
    const result = await createCatalogCheckout(
      {
        ...input,
        username: "fixture",
        items: [{ productId: "00000000-0000-4000-8000-000000000001", quantity: 1 }],
      },
      "http://localhost:3001",
      "b".repeat(64),
    );
    expect(result.orderId).toBe(order.id);
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.stripe).toHaveBeenCalledOnce();
  });
  it("already-paid intent returns a receipt with no second Stripe call", async () => {
    m.load.mockResolvedValue({ order: makeOrder(), buyerToken: "secret" });
    const result = await createCheckoutSession(
      validateCheckoutInput(input),
      "http://localhost:3001",
      "a".repeat(64),
    );
    expect(result.url).toContain("/order/");
    expect(m.stripe).not.toHaveBeenCalled();
    expect(m.reserve).not.toHaveBeenCalled();
  });
});
