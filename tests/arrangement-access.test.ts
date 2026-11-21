import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  seller: vi.fn(),
  sellerOrder: vi.fn(),
  buyerOrder: vi.fn(),
  identity: vi.fn(),
  db: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
vi.mock("@/services/orderService", () => ({
  findOrderForBuyer: mocks.buyerOrder,
  findOrderForSeller: mocks.sellerOrder,
}));
vi.mock("@/lib/buyerIdentity", () => ({
  findOrderForBuyerIdentity: mocks.identity,
  sameOriginBuyerAction: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
}));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.db }));
import { POST, GET } from "@/app/api/orders/[id]/arrangement/route";
const params = { params: Promise.resolve({ id: "order" }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { version: 2, status: "CONFIRMED" }, error: null });
});
function req(headers: Record<string, string>, body = { action: "confirm", version: 1 }) {
  return new NextRequest("http://localhost/api/orders/order/arrangement", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost", ...headers },
    body: JSON.stringify(body),
  });
}
it("denies an anonymous order number lookup without touching arrangement storage", async () => {
  expect(
    (await GET(new NextRequest("http://localhost/api/orders/order/arrangement"), params)).status,
  ).toBe(404);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("does not let a seller coordinate a different seller order", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "other" } });
  mocks.sellerOrder.mockResolvedValue(null);
  expect((await POST(req({ "x-routeflow-audience": "seller" }), params)).status).toBe(404);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("derives the seller identity from the owned order and ignores body identity", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner" } });
  mocks.sellerOrder.mockResolvedValue({ id: "order", sellerId: "owner" });
  expect((await POST(req({ "x-routeflow-audience": "seller" }), params)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "change_delivery_arrangement",
    expect.objectContaining({ p_actor: "seller", p_seller_id: "owner", p_version: 1 }),
  );
});
it("rejects cross-origin cookie buyer writes before consulting identity", async () => {
  expect(
    (await POST(req({ origin: "https://other.example", "x-routeflow-audience": "buyer" }), params))
      .status,
  ).toBe(404);
  expect(mocks.identity).not.toHaveBeenCalled();
});
it("uses a verified token as buyer without granting seller permissions", async () => {
  mocks.buyerOrder.mockResolvedValue({ id: "order", sellerId: "owner" });
  expect((await POST(req({ "x-buyer-token": "valid" }), params)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "change_delivery_arrangement",
    expect.objectContaining({ p_actor: "buyer" }),
  );
});
it("returns a conflict when the agreement changed while the form was open", async () => {
  mocks.buyerOrder.mockResolvedValue({ id: "order", sellerId: "owner" });
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "version conflict" } });
  expect((await POST(req({ "x-buyer-token": "valid" }), params)).status).toBe(409);
});
