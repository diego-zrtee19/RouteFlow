import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), db: vi.fn() }));
vi.mock("@/repositories/purchaseLinkRepository", () => ({
  resolvePublicPurchaseLink: mocks.resolve,
  recordPurchaseLinkView: vi.fn(),
}));
vi.mock("@/services/orderService", () => ({ recordEvent: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: mocks.db }));
import { GET } from "@/app/api/public/links/[publicId]/route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
const request = new Request("http://localhost/api/public/links/example");

it("keeps absent, inactive and expired links indistinguishable", async () => {
  mocks.resolve.mockResolvedValue(null);
  const response = await GET(request, { params: Promise.resolve({ publicId: "example" }) });
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "link_not_found" });
  expect(mocks.db).not.toHaveBeenCalled();
});

it("reports a temporary outage without leaking internal database details", async () => {
  mocks.resolve.mockRejectedValue(new Error("private connection details"));
  const response = await GET(request, { params: Promise.resolve({ publicId: "example" }) });
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
});

it("does not query storage for an empty identifier", async () => {
  const response = await GET(request, { params: Promise.resolve({ publicId: "" }) });
  expect(response.status).toBe(404);
  expect(mocks.resolve).not.toHaveBeenCalled();
});
