import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  seller: vi.fn(),
  token: vi.fn(),
  session: vi.fn(),
  identity: vi.fn(),
  sellerOrder: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
vi.mock("@/services/orderService", () => ({
  findOrderForBuyer: mocks.token,
  findOrderByStripeSessionForBuyer: mocks.session,
  findOrderForSeller: mocks.sellerOrder,
}));
vi.mock("@/lib/buyerIdentity", () => ({
  findOrderForBuyerIdentity: mocks.identity,
  sameOriginBuyerAction: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        limit: async () => ({ data: [], error: null }),
      };
      return chain;
    },
    rpc: mocks.rpc,
  }),
}));
import { GET, POST } from "@/app/api/orders/[id]/arrangement/route";
const url = "https://routeflow.example/api/orders/order-1/arrangement";
const params = { params: Promise.resolve({ id: "order-1" }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.identity.mockResolvedValue(null);
  mocks.session.mockResolvedValue(null);
  mocks.token.mockResolvedValue(null);
  mocks.rpc.mockResolvedValue({ data: { status: "CONFIRMED" }, error: null });
});
it("allows the Stripe-bound buyer to read an agreement without signing up", async () => {
  mocks.session.mockResolvedValue({ id: "order-1", sellerId: "seller-1" });
  const response = await GET(
    new NextRequest(url, { headers: { "x-checkout-session-id": "cs_test_bound" } }),
    params,
  );
  expect(response.status).toBe(200);
  expect(mocks.session).toHaveBeenCalledWith("order-1", "cs_test_bound");
  expect(mocks.identity).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("rejects a Stripe session that does not authorize this order", async () => {
  const response = await GET(
    new NextRequest(url, { headers: { "x-checkout-session-id": "cs_wrong_order" } }),
    params,
  );
  expect(response.status).toBe(404);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires an actual buyer credential when only the order number is known", async () => {
  expect((await GET(new NextRequest(url), params)).status).toBe(404);
});
it("allows the bound buyer to confirm the seller proposal from the same origin", async () => {
  mocks.session.mockResolvedValue({ id: "order-1", sellerId: "seller-1" });
  const response = await POST(
    new NextRequest(url, {
      method: "POST",
      headers: {
        origin: "https://routeflow.example",
        "x-checkout-session-id": "cs_test_bound",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "confirm", version: 1 }),
    }),
    params,
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "change_delivery_arrangement",
    expect.objectContaining({ p_actor: "buyer", p_order_id: "order-1", p_version: 1 }),
  );
});
it("blocks foreign-origin writes before checking seller or buyer credentials", async () => {
  const response = await POST(
    new NextRequest(url, {
      method: "POST",
      headers: { origin: "https://foreign.example", "x-routeflow-audience": "seller" },
      body: JSON.stringify({ action: "confirm", version: 1 }),
    }),
    params,
  );
  expect(response.status).toBe(404);
  expect(mocks.seller).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not fall back to another identity after an invalid token is supplied", async () => {
  mocks.session.mockResolvedValue({ id: "order-1" });
  const response = await GET(
    new NextRequest(url, {
      headers: { "x-buyer-token": "wrong", "x-checkout-session-id": "cs_test_bound" },
    }),
    params,
  );
  expect(response.status).toBe(404);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.identity).not.toHaveBeenCalled();
});
