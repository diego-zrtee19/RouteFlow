import { beforeEach, expect, it, vi } from "vitest";
import { inventoryTemplate } from "@/domain/inventoryImport";
const mocks = vi.hoisted(() => ({ seller: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));
import { GET, POST } from "@/app/api/dashboard/inventory/import/route";
const url = "https://routeflow.test/api/dashboard/inventory/import";
beforeEach(() => vi.resetAllMocks());
it("denies unauthenticated inventory exports and imports", async () => {
  mocks.seller.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", status: 401 });
  expect((await GET(new Request(url + "?format=csv"))).status).toBe(401);
  expect((await POST(new Request(url, { method: "POST" }))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects cross-origin writes", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner", userId: "actor" } });
  expect(
    (await POST(new Request(url, { method: "POST", headers: { origin: "https://other.test" } })))
      .status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("revalidates CSV and uses only the seller from the session", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner", userId: "actor" } });
  mocks.rpc.mockResolvedValue({ data: { count: 1 }, error: null });
  const response = await POST(
    new Request(url, {
      method: "POST",
      headers: { origin: "https://routeflow.test", "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerId: "attacker",
        actor: "attacker",
        csv: inventoryTemplate,
        clientId: "00000000-0000-0000-0000-000000000001",
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "import_seller_inventory",
    expect.objectContaining({
      p_seller: "owner",
      p_actor: "actor",
      p_rows: [expect.objectContaining({ sku: "GORRA-001" })],
    }),
  );
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("never calls the import function for invalid rows", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner", userId: "actor" } });
  const response = await POST(
    new Request(url, {
      method: "POST",
      headers: { origin: "https://routeflow.test" },
      body: JSON.stringify({
        csv: inventoryTemplate.replace("250.00", "-10"),
        clientId: "00000000-0000-0000-0000-000000000001",
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
