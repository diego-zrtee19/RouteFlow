import { describe, expect, it } from "vitest";
import {
  toBuyerOrderView,
  toPublicPurchaseLinkView,
  toSellerOrderView,
} from "@/domain/dto";
import type { PurchaseLink, Shipment } from "@/domain/types";
import { TEST_PRODUCT, TEST_SELLER_A, makeOrder } from "./fixtures";

/**
 * PII BOUNDARIES
 *
 * The audit verified empirically that buyer email, phone and street address
 * were present in `.next/static/chunks/app/dashboard/**` because client
 * components imported the data store. DTOs make that structurally impossible:
 * a field absent from the returned object cannot be serialised into a response.
 *
 * These tests walk the serialised output, which is exactly what ends up in the
 * HTTP response and therefore in the browser.
 */

const link: PurchaseLink = {
  id: "link-1",
  sellerId: TEST_SELLER_A.id,
  productId: TEST_PRODUCT.id,
  publicId: "ABC123",
  status: "active",
  viewCount: 7,
  expiresAt: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const shipment: Shipment = {
  id: "shipment-1",
  orderId: "order-1",
  provider: "DHL",
  providerShipmentId: "carrier-secret-id",
  trackingNumber: "DHL-9999",
  serviceCode: "EXPRESS",
  carrierName: "DHL Express",
  status: "IN_TRANSIT",
  trackingUrl: "https://carrier.example/track",
  labelUrl: "https://carrier.example/label.pdf",
  estimatedDelivery: "2024-04-01T00:00:00.000Z",
  createdAt: "2024-03-19T00:00:00.000Z",
  updatedAt: "2024-03-20T00:00:00.000Z",
};

function serialise(value: unknown): string {
  return JSON.stringify(value);
}

describe("public purchase link DTO", () => {
  const view = toPublicPurchaseLinkView(link, TEST_PRODUCT, TEST_SELLER_A);
  const json = serialise(view);

  it("exposes only what a buyer page renders", () => {
    expect(view.publicId).toBe("ABC123");
    expect(view.product.price).toBe(650);
    expect(view.seller.storeUsername).toBe("seller_a");
  });

  it("contains NO buyer information whatsoever", () => {
    expect(json).not.toContain("buyer");
    expect(json).not.toContain("buyer-a@example.com");
    expect(json).not.toContain("5551111111");
  });

  it("does NOT leak the seller's private contact details", () => {
    // contactEmail / contactPhone are not part of the public seller view.
    expect(json).not.toContain("a@example.com");
    expect(json).not.toContain("5550000001");
    expect(Object.keys(view.seller)).toEqual([
      "storeUsername",
      "storeName",
      "logoUrl",
      "description",
      // KYC state is public (the storefront renders a verified badge), but the
      // document behind the check must never reach the buyer payload.
      "kycVerified",
    ]);
  });

  it("exposes only the KYC state, never the KYC document", () => {
    // Built here rather than reusing the shared fixture, whose document URL is
    // null — asserting on `null` would pass even if the DTO leaked the field.
    const sellerWithDocument = {
      ...TEST_SELLER_A,
      kycStatus: "verified" as const,
      kycDocumentUrl: "sellers/abc/kyc/id-verification.pdf",
      contactEmail: "leak@example.com",
      contactPhone: "5550000001",
    };

    const serialised = JSON.stringify(
      toPublicPurchaseLinkView(link, TEST_PRODUCT, sellerWithDocument)
    );

    expect(view.seller.kycVerified).toBe(true);

    // The state is public…
    expect(serialised).toContain('"kycVerified":true');
    // …but neither the document nor the private contact details may appear.
    expect(serialised).not.toContain("id-verification.pdf");
    expect(serialised).not.toContain("kycDocumentUrl");
    expect(serialised).not.toContain("leak@example.com");
    expect(serialised).not.toContain("5550000001");
  });

  it("exposes stock as a boolean, not a count", () => {
    // A raw stock level tells competitors how much a seller has left.
    expect(view.product.inStock).toBe(true);
    expect(json).not.toContain('"stock"');
  });

  it("does not leak the seller or link internal uuid", () => {
    expect(json).not.toContain("link-1");
  });
});

describe("buyer order DTO", () => {
  const view = toBuyerOrderView(makeOrder(), shipment, [], null);
  const json = serialise(view);

  it("shows the buyer their own order", () => {
    expect(view.orderNumber).toBe("RF-TEST01");
    expect(view.status).toBe("PAID");
    expect(view.shipment?.trackingNumber).toBe("DHL-9999");
  });

  it("withholds the buyer's own email and phone", () => {
    expect(json).not.toContain("buyer-a@example.com");
    expect(json).not.toContain("5551111111");
  });

  it("includes the authenticated buyer's delivery address in the receipt", () => {
    expect(view.destinationCity).toBe("CDMX");
    expect(view.deliveryAddress.street).toBe("Buyer Street");
    expect(view.deliveryAddress.postalCode).toBe("06700");
    expect(view.deliveryAddress).not.toHaveProperty("phone");
  });

  it("never leaks the token hash or any Stripe identifier", () => {
    expect(json).not.toContain("buyerTokenHash");
    expect(json).not.toContain("pi_");
    expect(json).not.toContain("checkoutSessionId");
    expect(json).not.toContain("paymentIntentId");
  });

  it("returns the order id, which is safe ONLY because the route is token-gated", () => {
    // This changed deliberately. `toBuyerOrderView` used to withhold `id`
    // entirely, which left the success page's "View order" button pointing at
    // `/order/undefined` — a broken link on every purchase.
    //
    // Returning it does not weaken the boundary, it relocates it:
    //   - an attacker with only a guessed id receives NOTHING, because
    //     `/api/orders/[id]` returns 404 without a valid buyer token, and the
    //     DTO is only ever built after that gate;
    //   - the buyer already holds the id — Stripe redirected them to
    //     `?order_id=<id>`, so the server told them it already;
    //   - the id alone authorises nothing on any endpoint.
    //
    // The property that actually matters is therefore "no data without a
    // credential", which `tests/authz.buyer.test.ts` covers at the lookup layer.
    expect(view.id).toBe("order-1");
  });

  it("still withholds every other internal identifier", () => {
    // Everything that is NOT needed for the buyer to navigate their own order.
    expect(json).not.toContain("seller-a");
    expect(json).not.toContain("buyerTokenHash");
    expect(json).not.toContain("buyer-a@example.com");
  });

  it("withholds internal carrier identifiers", () => {
    expect(json).not.toContain("carrier-secret-id");
    expect(json).not.toContain("EXPRESS");
  });

  it("advertises the actions the buyer may take", () => {
    expect(view.canDispute).toBe(true);
    expect(typeof view.canConfirm).toBe("boolean");
  });
});

describe("seller order DTO", () => {
  const view = toSellerOrderView(makeOrder(), shipment);
  const json = serialise(view);

  it("includes contact details the seller needs in order to ship", () => {
    expect(view.buyerEmail).toBe("buyer-a@example.com");
    expect(view.buyerPhone).toBe("5551111111");
    expect(view.shippingAddress.street).toBe("Buyer Street");
  });

  it("still never leaks the buyer token hash or Stripe internals", () => {
    // Contact details are legitimate for the order's own seller; credentials
    // are never legitimate, for anyone.
    expect(json).not.toContain("buyerTokenHash");
    expect(json).not.toContain("pi_");
  });

  it("keeps the label URL, which the seller needs", () => {
    expect(view.shipment?.labelUrl).toBe("https://carrier.example/label.pdf");
  });
});
