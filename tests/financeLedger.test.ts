import { expect, it, vi, beforeEach } from "vitest";
import { parseFinanceEntry, csvCell, ledgerCsv } from "@/domain/financeLedger";
const mocks = vi.hoisted(() => ({ seller: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));
import { GET, POST } from "@/app/api/dashboard/finances/route";
beforeEach(() => {
  vi.resetAllMocks();
});
const entry = {
  clientId: "11111111-1111-4111-8111-111111111111",
  orderId: null,
  kind: "expense",
  method: "expense",
  amount: 30.25,
  currency: "MXN",
  description: "Empaque",
};
it("validates exact cents, positive amounts and receipt ownership identifiers", () => {
  expect(parseFinanceEntry(entry)).not.toBeNull();
  for (const amount of [NaN, Infinity, -1, 0, 1.001])
    expect(parseFinanceEntry({ ...entry, amount })).toBeNull();
  expect(parseFinanceEntry({ ...entry, kind: "receipt", method: "cash" })).toBeNull();
  expect(parseFinanceEntry({ ...entry, kind: "expense", method: "cash" })).toBeNull();
});
it("neutralizes spreadsheet formulas and preserves quoted multiline fields", () => {
  expect(csvCell(' =HYPERLINK("bad")')).toContain("' =HYPERLINK");
  expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  expect(ledgerCsv([])).toContain("Descripción");
});
it("denies anonymous access and cross-origin writes before database operations", async () => {
  mocks.seller.mockResolvedValue({ ok: false, status: 401, code: "UNAUTHENTICATED" });
  expect((await GET(new Request("https://routeflow.test/api/dashboard/finances"))).status).toBe(
    401,
  );
  expect(
    (await POST(new Request("https://routeflow.test/api/dashboard/finances", { method: "POST" })))
      .status,
  ).toBe(401);
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner", userId: "clerk-owner" } });
  expect(
    (
      await POST(
        new Request("https://routeflow.test/api/dashboard/finances", {
          method: "POST",
          headers: { origin: "https://bad.test" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("uses the authenticated seller and stable request key without provider mutations", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner", userId: "clerk-owner" } });
  mocks.rpc.mockResolvedValue({ data: "entry-id", error: null });
  const response = await POST(
    new Request("https://routeflow.test/api/dashboard/finances", {
      method: "POST",
      headers: { origin: "https://routeflow.test", "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, sellerId: "other" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "record_seller_finance_entry",
    expect.objectContaining({
      p_seller: "owner",
      p_actor: "clerk-owner",
      p_client: entry.clientId,
    }),
  );
});
