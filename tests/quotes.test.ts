import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ seller: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.db }));
import { GET, POST } from "@/app/api/dashboard/quotes/sales/route";
beforeEach(() => vi.resetAllMocks());
it("requires a seller before exposing quotes or creating purchase links", async () => {
  mocks.seller.mockResolvedValue({ ok: false, status: 401, code: "UNAUTHENTICATED" });
  expect((await GET(new Request("https://routeflow.test/api/dashboard/quotes/sales"))).status).toBe(
    401,
  );
  expect(
    (
      await POST(
        new Request("https://routeflow.test/api/dashboard/quotes/sales", { method: "POST" }),
      )
    ).status,
  ).toBe(401);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("rejects cross-origin quote creation before reading the database", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner" } });
  expect(
    (
      await POST(
        new Request("https://routeflow.test/api/dashboard/quotes/sales", {
          method: "POST",
          headers: { origin: "https://other.test" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.db).not.toHaveBeenCalled();
});
