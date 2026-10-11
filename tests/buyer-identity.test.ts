import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ user: vi.fn(), db: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.db }));
import { verifiedBuyerEmails, exactEmailPattern, buyerEmailFilter, findOrderForBuyerIdentity, sameOriginBuyerAction } from "@/lib/buyerIdentity";
import { GET } from "@/app/api/buyer/purchases/route";
const identity = (email: string, status = "verified") => ({ emailAddresses: [{ emailAddress: email, verification: { status } }] });
beforeEach(() => vi.resetAllMocks());
describe("buyer purchases ownership", () => {
  it("does not trust unverified addresses or user metadata", () => {
    expect(verifiedBuyerEmails(identity("buyer@example.com", "unverified"))).toEqual([]);
    expect(verifiedBuyerEmails(null)).toEqual([]);
    expect(verifiedBuyerEmails(identity(" Buyer@Example.com "))).toEqual(["buyer@example.com"]);
  });
  it("rejects anonymous purchases lookup before querying orders", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET(new NextRequest("http://localhost/api/buyer/purchases?email=victim@example.com"))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("unverified sessions cannot recover an order", async () => {
    mocks.user.mockResolvedValue(identity("victim@example.com", "unverified"));
    expect(await findOrderForBuyerIdentity("known-order-id")).toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("scopes a known order to the server-verified email and returns null for another buyer", async () => {
    mocks.user.mockResolvedValue(identity("buyer@example.com"));
    const query = { select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.ilike.mockReturnValue(query);
    mocks.db.mockReturnValue({ from: () => query });
    expect(await findOrderForBuyerIdentity("victim-order")).toBeNull();
    expect(query.eq).toHaveBeenCalledWith("id", "victim-order");
    expect(query.ilike).toHaveBeenCalledWith("buyer_email", "buyer@example.com");
  });
  it("email metacharacters cannot broaden matching or inject filter conditions", () => {
    expect(exactEmailPattern("a_%@example.com")).toBe("a\\_\\%@example.com");
    expect(buyerEmailFilter(['a\"@example.com', "a_b@example.com"])).toBe('buyer_email.ilike."a\\"@example.com",buyer_email.ilike."a\\\\_b@example.com"');
  });
  it("cookie-based buyer mutations require a same-origin request", () => {
    expect(sameOriginBuyerAction(new Request("https://routeflow.example/api", { headers: { origin: "https://evil.example" } }))).toBe(false);
    expect(sameOriginBuyerAction(new Request("https://routeflow.example/api"))).toBe(false);
    expect(sameOriginBuyerAction(new Request("https://routeflow.example/api", { headers: { origin: "https://routeflow.example" } }))).toBe(true);
  });
  it("list ignores client-supplied email, paginates and exposes no buyer secrets", async () => {
    mocks.user.mockResolvedValue(identity("buyer@example.com"));
    const query = { select: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: [], error: null }) };
    query.select.mockReturnValue(query); query.or.mockReturnValue(query); query.order.mockReturnValue(query);
    mocks.db.mockReturnValue({ from: () => query });
    const response = await GET(new NextRequest("http://localhost/api/buyer/purchases?email=victim@example.com&page=2"));
    expect(response.status).toBe(200);
    expect(query.or).toHaveBeenCalledWith('buyer_email.ilike."buyer@example.com"');
    expect(query.range).toHaveBeenCalledWith(40, 60);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ purchases: [], hasMore: false });
  });
});
