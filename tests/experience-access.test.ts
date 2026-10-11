import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ seller: vi.fn(), buyer: vi.fn(), session: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
vi.mock("@/services/orderService", () => ({ findOrderForBuyer: mocks.buyer, findOrderByStripeSessionForBuyer: mocks.session }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.db }));
import { GET as notifications } from "@/app/api/orders/[id]/notifications/route";
import { POST as imageUpload } from "@/app/api/dashboard/images/route";
const params = { params: Promise.resolve({ id: "owned-order" }) };
beforeEach(() => vi.resetAllMocks());
describe("New experience endpoints preserve ownership", () => {
  it("requires buyer access before reading the notification inbox", async () => {
    expect((await notifications(new NextRequest("http://localhost/api/orders/owned-order/notifications"), params)).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("does not expose notices for a wrong token", async () => {
    mocks.buyer.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/orders/owned-order/notifications", { headers: { "x-buyer-token": "wrong" } });
    expect((await notifications(req, params)).status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("requires a Stripe session bound to the requested order", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await notifications(new NextRequest("http://localhost/api/orders/owned-order/notifications?session_id=other-session"), params)).status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("exposes only buyer notices and never the email recipient", async () => {
    mocks.buyer.mockResolvedValue({ id: "owned-order" });
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [{ id: "notice", subject: "Paid", body: "Order", kind: "PAID", status: "PREVIEW", created_at: "2026-10-10", recipient: "private@example.com" }], error: null });
    mocks.db.mockReturnValue({ from: () => query });
    const res = await notifications(new NextRequest("http://localhost/api/orders/owned-order/notifications", { headers: { "x-buyer-token": "valid" } }), params);
    expect(res.status).toBe(200); expect(query.eq).toHaveBeenCalledWith("audience", "buyer"); expect(query.eq).toHaveBeenCalledWith("order_id", "owned-order");
    expect(JSON.stringify(await res.json())).not.toContain("private@example.com");
  });
  it("does not grant anonymous callers photo storage access", async () => {
    mocks.seller.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", status: 401 });
    expect((await imageUpload(new NextRequest("http://localhost/api/dashboard/images", { method: "POST" }))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects SVG or disguised executable uploads before reaching storage", async () => {
    mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner" } });
    const form = new FormData(); form.append("file", new File(["<svg><script/></svg>"], "image.png", { type: "image/png" }));
    const res = await imageUpload(new NextRequest("http://localhost/api/dashboard/images", { method: "POST", body: form }));
    expect(res.status).toBe(400); expect(mocks.db).not.toHaveBeenCalled();
  });
});
