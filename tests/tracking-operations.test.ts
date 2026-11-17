import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeOrder } from "./fixtures";
const m = vi.hoisted(() => ({
  claim: vi.fn(),
  find: vi.fn(),
  refresh: vi.fn(),
  patch: vi.fn(),
  eq: vi.fn(),
  releaseError: null as unknown,
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: () => ({
    rpc: m.claim,
    from: () => ({
      update: (p: unknown) => {
        m.patch(p);
        const q = {
          eq: (...args: unknown[]) => {
            m.eq(...args);
            return q;
          },
          then: (resolve: (v: unknown) => void) => resolve({ error: m.releaseError }),
        };
        return q;
      },
    }),
  }),
}));
vi.mock("@/repositories/orderRepository", () => ({ findOrderByIdForWebhook: m.find }));
vi.mock("@/services/shipmentService", () => ({ refreshTracking: m.refresh }));
import { refreshDueTracking } from "@/services/trackingOperations";
describe("background tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.releaseError = null;
    m.claim.mockResolvedValue({ data: [{ id: "shipment", order_id: "order" }], error: null });
    m.find.mockResolvedValue(makeOrder({ status: "SHIPPED" }));
    m.refresh.mockResolvedValue({});
  });
  it("polls due shipments and releases only its lease for a five minute interval", async () => {
    expect(await refreshDueTracking()).toEqual({ refreshed: 1, errors: [] });
    expect(m.refresh).toHaveBeenCalledOnce();
    const patch = m.patch.mock.calls[0][0];
    expect(Date.parse(patch.next_tracking_poll_at) - Date.now()).toBeGreaterThan(299000);
    expect(m.eq).toHaveBeenCalledWith("tracking_poll_owner", expect.any(String));
  });
  it("backs off after carrier failure and still releases its lease", async () => {
    m.refresh.mockRejectedValueOnce(Error("carrier unavailable"));
    const result = await refreshDueTracking();
    expect(result.errors).toEqual(["tracking:order:refresh_failed"]);
    expect(m.patch.mock.calls[0][0].tracking_poll_error).toBe("refresh_failed");
    expect(Date.parse(m.patch.mock.calls[0][0].next_tracking_poll_at) - Date.now()).toBeGreaterThan(
      599000,
    );
  });
  it("a concurrent dispute is not advanced", async () => {
    m.find.mockResolvedValueOnce(makeOrder({ status: "DISPUTED" }));
    await refreshDueTracking();
    expect(m.refresh).not.toHaveBeenCalled();
  });
  it("reports persistence failures", async () => {
    m.releaseError = Error("DB down");
    expect((await refreshDueTracking()).errors).toContain("tracking:order:lease_release_failed");
  });
  it("does not call a provider if claiming failed", async () => {
    m.claim.mockResolvedValueOnce({ error: Error("DB down") });
    await expect(refreshDueTracking()).rejects.toThrow();
    expect(m.refresh).not.toHaveBeenCalled();
  });
});
