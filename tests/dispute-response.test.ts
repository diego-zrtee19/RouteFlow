import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  seller: vi.fn(),
  db: vi.fn(),
  buyer: vi.fn(),
  update: vi.fn(),
  single: vi.fn(),
  dispute: { id: "case", order_id: "order", status: "OPEN", orders: { seller_id: "owner" } },
}));
vi.mock("@/lib/authz", () => ({
  requireSeller: mocks.seller,
  requireAdmin: async () => ({ ok: false }),
}));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.db }));
vi.mock("@/repositories/orderRepository", () => ({ findOrderForBuyer: mocks.buyer }));
vi.mock("@/lib/buyerIdentity", () => ({
  findOrderForBuyerIdentity: async () => null,
  sameOriginBuyerAction: () => false,
}));
vi.mock("@/services/disputeService", () => ({ resolveDispute: vi.fn() }));
import { POST } from "@/app/api/disputes/[id]/route";
const params = { params: Promise.resolve({ id: "case" }) };
let query: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.resetAllMocks();
  query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(),
    single: mocks.single,
    update: mocks.update,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  mocks.update.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: mocks.dispute, error: null });
  mocks.single.mockResolvedValue({ data: { id: "case" }, error: null });
  mocks.db.mockReturnValue({ from: () => query });
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner" } });
});
function request(response: string, token?: string) {
  return new NextRequest("http://localhost/api/disputes/case", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "x-buyer-token": token } : {}) },
    body: JSON.stringify({ response }),
  });
}
it("saves the owning seller answer and advances an open case to review", async () => {
  const result = await POST(request("  Revisaré la entrega y adjuntaré evidencia.  "), params);
  expect(result.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({
    seller_response: "Revisaré la entrega y adjuntaré evidencia.",
    status: "UNDER_REVIEW",
  });
  expect(query.eq).toHaveBeenCalledWith("id", "case");
  expect(query.in).toHaveBeenCalledWith("status", ["OPEN", "UNDER_REVIEW"]);
});
it("does not permit another seller to answer", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "different" } });
  expect((await POST(request("Respuesta"), params)).status).toBe(404);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("does not allow the buyer to impersonate the seller response", async () => {
  mocks.buyer.mockResolvedValue({ id: "order" });
  expect((await POST(request("Respuesta", "valid-test"), params)).status).toBe(403);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("preserves a closed case when closure races with the answer", async () => {
  mocks.single.mockResolvedValue({ data: null, error: { message: "No matching open case" } });
  expect((await POST(request("Respuesta"), params)).status).toBe(409);
});
