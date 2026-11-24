import { beforeEach, expect, it, vi } from "vitest";
import { parseCustomerFollowup } from "@/domain/customerFollowup";
const mocks = vi.hoisted(() => ({ seller: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));
import { GET, POST } from "@/app/api/dashboard/customers/route";
beforeEach(() => {
  vi.resetAllMocks();
});
it("normalizes customer email and rejects oversized notes and invalid dates", () => {
  expect(
    parseCustomerFollowup({
      email: " Buyer@Example.test ",
      note: "Prefiere azul",
      revision: 0,
      followupAt: null,
    })?.email,
  ).toBe("buyer@example.test");
  expect(
    parseCustomerFollowup({
      email: "a@b.test",
      note: "x".repeat(4001),
      revision: 0,
      followupAt: null,
    }),
  ).toBeNull();
  expect(
    parseCustomerFollowup({ email: "a@b.test", note: "", revision: 0, followupAt: "invalid" }),
  ).toBeNull();
});
it("denies unauthenticated customer history and notes before reading data", async () => {
  mocks.seller.mockResolvedValue({ ok: false, status: 401, code: "UNAUTHENTICATED" });
  expect((await GET(new Request("https://routeflow.test/api/dashboard/customers"))).status).toBe(
    401,
  );
  expect(
    (await POST(new Request("https://routeflow.test/api/dashboard/customers", { method: "POST" })))
      .status,
  ).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("uses seller identity from the session rather than caller parameters", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner" } });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  const response = await GET(
    new Request(
      "https://routeflow.test/api/dashboard/customers?email=buyer@example.test&seller_id=someone-else",
    ),
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("seller_customer_orders", {
    p_seller: "owner",
    p_email: "buyer@example.test",
  });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("blocks cross-origin writes and returns conflict for stale edits", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner" } });
  expect(
    (
      await POST(
        new Request("https://routeflow.test/api/dashboard/customers", {
          method: "POST",
          headers: { origin: "https://other.test" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  const response = await POST(
    new Request("https://routeflow.test/api/dashboard/customers", {
      method: "POST",
      headers: { origin: "https://routeflow.test", "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "buyer@example.test",
        note: "",
        followupAt: null,
        revision: 1,
      }),
    }),
  );
  expect(response.status).toBe(409);
});
