import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), single: vi.fn(), eq: vi.fn(), db: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.db }));
import { requireSeller } from "@/lib/authz";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "seller-clerk-id" });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.single });
  mocks.db.mockReturnValue({ from: () => ({ select: () => ({ eq: mocks.eq }) }) });
});
describe("seller session survives database failures", () => {
  it.each(["fetch failed", "JWT issued at future", "permission denied"])(
    "does not misreport %s as a signed-out user",
    async (message) => {
      mocks.single.mockResolvedValue({ data: null, error: { message } });
      expect(await requireSeller()).toEqual({ ok: false, status: 500, code: "INTERNAL_ERROR" });
      expect(mocks.eq).toHaveBeenCalledWith("user_id", "seller-clerk-id");
    },
  );
  it("still refuses an unauthenticated caller before any database access", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect(await requireSeller()).toEqual({ ok: false, status: 401, code: "UNAUTHENTICATED" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("distinguishes a missing seller from an unavailable database", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    expect(await requireSeller()).toEqual({ ok: false, status: 403, code: "SELLER_NOT_FOUND" });
  });
});
