import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => db }));
import { updateShipmentStatus } from "@/repositories/shipmentRepository";
function database(status: string) {
  const row: Record<string, unknown> = {
    id: "shipment",
    order_id: "order",
    provider: "FEDEX",
    status,
  };
  db.from.mockImplementation(() => {
    let patch: Record<string, unknown> | null = null;
    const equals: Record<string, unknown> = {};
    const differs: Record<string, unknown> = {};
    const q = {
      update: (p: Record<string, unknown>) => {
        patch = p;
        return q;
      },
      select: () => q,
      eq: (k: string, v: unknown) => {
        equals[k] = v;
        return q;
      },
      neq: (k: string, v: unknown) => {
        differs[k] = v;
        return q;
      },
      maybeSingle: async () => {
        if (
          !Object.entries(equals).every(([k, v]) => row[k] === v) ||
          !Object.entries(differs).every(([k, v]) => row[k] !== v)
        )
          return { data: null, error: null };
        if (patch) Object.assign(row, patch);
        return { data: { ...row }, error: null };
      },
    };
    return q;
  });
  return row;
}
describe("Shipment stale carrier writes", () => {
  it("a late in-transit result cannot undo delivery saved by another request", async () => {
    const row = database("IN_TRANSIT");
    expect((await updateShipmentStatus("shipment", "DELIVERED"))?.status).toBe("DELIVERED");
    expect((await updateShipmentStatus("shipment", "IN_TRANSIT"))?.status).toBe("DELIVERED");
    expect(row.status).toBe("DELIVERED");
  });
  it("a deleted shipment does not pretend persistence succeeded", async () => {
    database("IN_TRANSIT");
    expect(await updateShipmentStatus("missing-shipment", "DELIVERED")).toBeNull();
  });
});
