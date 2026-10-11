import { afterEach, describe, expect, it, vi } from "vitest";
import { FedExShippingProvider } from "@/providers/shipping/FedExProvider";
import type { CreateShipmentInput } from "@/providers/shipping/types";

vi.mock("@/lib/fedexAuth", () => ({ fedexAuthService: {
  isConfigured: () => true, getAccessToken: async () => "sandbox-token",
} }));

const input = (country: string): CreateShipmentInput => ({
  orderId: "test-order", orderNumber: "RF-TEST", serviceCode: "STANDARD_OVERNIGHT",
  sender: { name: "Test", phone: "9015550100", street: "Test Street", city: "Memphis", state: "TN", postalCode: "38125", country },
  recipient: { name: "Buyer", phone: "9015550100", street: "Test Street", city: "Memphis", state: "TN", postalCode: "38125", country },
  packageDetails: { weightKg: 1, description: "Product" },
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("FedEx labels", () => {
  it.each([["US", "LB", 2.205], ["Mexico", "KG", 1]])("uses carrier-compatible units for %s and preserves the returned PDF", async (country, units, value) => {
    vi.stubEnv("FEDEX_ACCOUNT_NUMBER", "test-account");
    const encodedLabel = Buffer.from("%PDF-test-label").toString("base64");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: { transactionShipments: [{
      masterTrackingNumber: "123456789012",
      pieceResponses: [{ trackingNumber: "123456789012", packageDocuments: [{ type: "LABEL", encodedLabel }] }],
    }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new FedExShippingProvider().createShipment(input(country));
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.requestedShipment.requestedPackageLineItems[0].weight).toEqual({ units, value });
    expect(request.requestedShipment.labelSpecification.imageType).toBe("PDF");
    expect(result.trackingNumber).toBe("123456789012");
    expect(result.labelBase64).toBe(encodedLabel);
    expect(result.estimatedDelivery).toBeNull();
  });

  it("rejects a carrier response without a printable label", async () => {
    vi.stubEnv("FEDEX_ACCOUNT_NUMBER", "test-account");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: { transactionShipments: [{ masterTrackingNumber: "123456789012" }] } }), { status: 200 })));
    await expect(new FedExShippingProvider().createShipment(input("US"))).rejects.toThrow("FedEx service temporarily unavailable");
  });
});
