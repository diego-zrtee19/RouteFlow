import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeOrder, TEST_SELLER_A } from "./fixtures";
import type { ShipmentResult } from "@/providers/shipping/types";
import type { Shipment } from "@/domain/types";
const m = vi.hoisted(() => ({
  claim: null as Record<string, unknown> | null,
  shipment: null as Shipment | null,
  create: vi.fn(),
  upload: vi.fn(),
  save: vi.fn(),
  transition: vi.fn(),
  event: vi.fn(),
  scans: vi.fn(),
  track: vi.fn(),
  update: vi.fn(),
  resultFailure: false,
}));
vi.mock("@/providers/shipping", () => ({
  ShippingRegistry: {
    getProvider: () => ({
      name: "FedEx",
      isConfigured: () => true,
      createShipment: m.create,
      getTracking: m.track,
    }),
  },
}));
vi.mock("@/repositories/orderRepository", () => ({ transitionOrder: m.transition }));
vi.mock("@/services/orderService", () => ({ recordEvent: m.event }));
vi.mock("@/repositories/shipmentRepository", () => ({
  findShipmentByOrder: async () => m.shipment,
  createShipment: m.save,
  recordShipmentEvents: m.scans,
  listShipmentEvents: async () => [],
  updateShipmentStatus: m.update,
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: () => ({
    rpc: async (_name: string, args: Record<string, unknown>) => {
      if (!m.claim)
        m.claim = {
          owner_token: args.p_owner,
          provider: args.p_provider,
          service_code: args.p_service,
          status: "CLAIMED",
        };
      return { data: { ...m.claim }, error: null };
    },
    from: (table: string) => {
      let patch: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: () => q,
        update: (p: Record<string, unknown>) => {
          patch = p;
          return q;
        },
        single: async () => ({
          data: {
            shipping_profile: {
              origin: {
                fullName: "Test",
                phone: "555",
                street: "Test",
                city: "GDL",
                state: "JAL",
                postalCode: "44100",
                country: "MX",
              },
              weightKg: 1,
            },
            shipping_service: null,
          },
          error: null,
        }),
        then: (resolve: (value: { error: object | null }) => unknown) => {
          if (table === "shipment_dispatch_attempts" && !m.resultFailure)
            Object.assign(m.claim!, patch);
          return Promise.resolve({
            error: m.resultFailure ? { message: "DB unavailable" } : null,
          }).then(resolve);
        },
      };
      return q;
    },
    storage: { from: () => ({ upload: m.upload }) },
  }),
}));
import { dispatchOrder, refreshTracking } from "@/services/shipmentService";
const order = () =>
  makeOrder({ status: "PAID", paymentStatus: "SUCCEEDED", deliveryMethod: "shipping" });
const options = { provider: "FEDEX" as const, serviceCode: "TEST_SERVICE" };
const result: ShipmentResult = {
  success: true,
  provider: "FEDEX",
  providerShipmentId: "test-label",
  trackingNumber: "test-tracking",
  trackingUrl: "https://example.invalid",
  status: "LABEL_CREATED",
  estimatedDelivery: null,
  labelBase64: Buffer.from("TEST PDF").toString("base64"),
};
beforeEach(() => {
  vi.clearAllMocks();
  m.claim = null;
  m.shipment = null;
  m.resultFailure = false;
  m.create.mockResolvedValue(result);
  m.upload.mockResolvedValue({ error: null });
  m.save.mockImplementation(
    async (input) => (m.shipment ??= { id: "shipment", ...input, createdAt: "", updatedAt: "" }),
  );
  m.transition.mockResolvedValue(order());
  m.scans.mockResolvedValue(1);
});
describe("Durable shipment dispatch", () => {
  it("two simultaneous requests make only one carrier purchase", async () => {
    let release!: (value: ShipmentResult) => void;
    m.create.mockImplementation(
      () =>
        new Promise<ShipmentResult>((resolve) => {
          release = resolve;
        }),
    );
    const first = dispatchOrder(order(), TEST_SELLER_A, options);
    await vi.waitFor(() => expect(m.create).toHaveBeenCalledTimes(1));
    await expect(dispatchOrder(order(), TEST_SELLER_A, options)).rejects.toMatchObject({
      status: 409,
    });
    release(result);
    await first;
    expect(m.create).toHaveBeenCalledTimes(1);
  });
  it("storage failure can resume from the same saved carrier response", async () => {
    m.upload.mockResolvedValueOnce({ error: { message: "Storage failed" } });
    await expect(dispatchOrder(order(), TEST_SELLER_A, options)).rejects.toThrow("guardar");
    await dispatchOrder(order(), TEST_SELLER_A, options);
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.upload).toHaveBeenCalledTimes(2);
  });
  it("an ambiguous carrier timeout never automatically creates a second label", async () => {
    m.create.mockRejectedValueOnce(new Error("Timeout after carrier accepted request"));
    await expect(dispatchOrder(order(), TEST_SELLER_A, options)).rejects.toMatchObject({
      status: 409,
    });
    await expect(dispatchOrder(order(), TEST_SELLER_A, options)).rejects.toMatchObject({
      status: 409,
    });
    expect(m.create).toHaveBeenCalledTimes(1);
  });
  it("failure to save the carrier result also blocks duplicate purchases", async () => {
    m.resultFailure = true;
    await expect(dispatchOrder(order(), TEST_SELLER_A, options)).rejects.toMatchObject({
      status: 409,
    });
    m.resultFailure = false;
    await expect(dispatchOrder(order(), TEST_SELLER_A, options)).rejects.toMatchObject({
      status: 409,
    });
    expect(m.create).toHaveBeenCalledTimes(1);
  });
  it("repairs a shipment saved before the order status update failed", async () => {
    m.transition.mockRejectedValueOnce(new Error("DB interrupted"));
    await expect(dispatchOrder(order(), TEST_SELLER_A, options)).rejects.toThrow("interrupted");
    await dispatchOrder(order(), TEST_SELLER_A, options);
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.transition).toHaveBeenCalledTimes(2);
  });
});
describe("Tracking recovery", () => {
  beforeEach(() => {
    m.shipment = {
      id: "shipment",
      orderId: order().id,
      provider: "FEDEX",
      status: "IN_TRANSIT",
      trackingNumber: "test-tracking",
    } as Shipment;
    m.track.mockResolvedValue({ status: "DELIVERED", carrier: "FedEx", events: [] });
    m.update.mockResolvedValue({ ...m.shipment, status: "DELIVERED" });
  });
  it("delivered carrier scan advances the order and returns the saved state", async () => {
    expect((await refreshTracking(makeOrder({ status: "IN_TRANSIT" }))).status).toBe("DELIVERED");
    expect(m.transition).toHaveBeenCalledWith(
      expect.objectContaining({ status: "IN_TRANSIT" }),
      "DELIVERED",
    );
  });
  it("does not claim success when persistence fails", async () => {
    m.update.mockRejectedValueOnce(new Error("DB write failed"));
    await expect(refreshTracking(makeOrder({ status: "IN_TRANSIT" }))).rejects.toThrow(
      "DB write failed",
    );
    expect(m.transition).not.toHaveBeenCalled();
  });
  it("carrier delivery never overwrites a dispute", async () => {
    await refreshTracking(makeOrder({ status: "DISPUTED" }));
    expect(m.transition).not.toHaveBeenCalled();
  });
});
