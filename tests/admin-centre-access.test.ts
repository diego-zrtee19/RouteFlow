import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireAdmin: mocks.access }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.db }));
import Orders from "@/app/admin/orders/page";
import Sellers from "@/app/admin/sellers/page";
beforeEach(() => vi.resetAllMocks());
describe("control centre ownership boundary", () => {
  it.each([401, 403])("does not query administrative data for access status %s", async (status) => {
    mocks.access.mockResolvedValue({
      ok: false,
      status,
      code: status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN_ADMIN",
    });
    expect(await Orders()).toBeNull();
    expect(await Sellers()).toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
