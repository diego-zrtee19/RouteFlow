import { ShippingProvider, RateInput, CreateShipmentInput, ShipmentResult, TrackingResult } from "./types";
import { ShippingRate, ShipmentStatus } from "@/domain/types";

/**
 * MOCK SHIPPING PROVIDER â€” deterministic, for tests and local development.
 *
 * The audit found `INTEGRATIONS.md` claimed "providers gracefully fall back to
 * deterministic mock simulations", but no such class existed and the registry
 * only mapped DHL/FEDEX/UBER, so requesting MOCK threw. This implements it
 * rather than correcting the documentation, because deterministic shipments are
 * genuinely needed for integration tests.
 *
 * SAFETY: it is NEVER registered by default. `ShippingRegistry.registerMock()`
 * must be called explicitly, and the route layer rejects `provider: "MOCK"`
 * unless MOCK_ALLOWLIST is configured. A production deployment that never opts
 * in cannot reach this class, so it cannot silently produce fake labels.
 *
 * Values are derived from the input hash, so the same input always yields the
 * same tracking number: repeatable assertions instead of flaky ones.
 */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export class MockShippingProvider implements ShippingProvider {
  readonly name = "Mock Carrier";
  readonly type = "MOCK" as const;

  /**
   * Always true: this provider needs no credentials, which is the point.
   * Its availability is governed by registration, not by configuration.
   */
  isConfigured(): boolean {
    return true;
  }

  isTestMode(): boolean {
    return true;
  }

  async getRates(input: RateInput): Promise<ShippingRate[]> {
    const seed = hash(`${input.origin.postalCode}${input.destination.postalCode}`);
    return [
      {
        provider: "MOCK",
        carrierName: this.name,
        serviceName: "Deterministic Standard",
        serviceCode: "MOCK_STANDARD",
        rate: 50 + (seed % 40),
        currency: "MXN",
        estimatedDays: "2-4 business days",
      },
    ];
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    // Derive the tracking number from the order so a retry produces the same
    // value; an unstable one would create phantom shipments in tests.
    const seed = hash(`${input.orderId}:${input.serviceCode}`);
    const trackingNumber = `MOCK${String(seed % 100000000).padStart(8, "0")}`;

    const estimated = new Date(Date.now() + 3 * 24 * 3600 * 1000);

    return {
      success: true,
      provider: "MOCK",
      providerShipmentId: `mock_shp_${seed}`,
      trackingNumber,
      trackingUrl: `https://example.invalid/track/${trackingNumber}`,
      status: "LABEL_CREATED" as ShipmentStatus,
      estimatedDelivery: estimated.toISOString(),
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingResult> {
    // The status advances with the tracking number's hash so successive polls
    // are reproducible rather than random.
    const stage = hash(trackingNumber) % 3;
    const statuses: ShipmentStatus[] = ["LABEL_CREATED", "IN_TRANSIT", "DELIVERED"];
    const status = statuses[stage];

    const now = Date.now();
    const events = [
      {
        id: "mock_ev_1",
        status: "LABEL_CREATED" as ShipmentStatus,
        description: "Label created (mock)",
        timestamp: new Date(now - 48 * 3600 * 1000).toISOString(),
      },
      {
        id: "mock_ev_2",
        status: "IN_TRANSIT" as ShipmentStatus,
        description: "In transit (mock)",
        timestamp: new Date(now - 24 * 3600 * 1000).toISOString(),
      },
    ];
    if (status === "DELIVERED") {
      events.push({
        id: "mock_ev_3",
        status: "DELIVERED" as ShipmentStatus,
        description: "Delivered (mock)",
        timestamp: new Date(now - 3600 * 1000).toISOString(),
      });
    }

    return {
      trackingNumber,
      provider: "MOCK",
      status,
      carrier: this.name,
      service: "Deterministic Standard",
      estimatedDelivery: new Date(now + 24 * 3600 * 1000).toISOString(),
      events,
    };
  }

  async cancelShipment(_shipmentId: string): Promise<{ success: boolean; message?: string }> {
    return { success: true, message: "Mock shipment cancelled" };
  }
}