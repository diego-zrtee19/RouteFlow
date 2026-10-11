import { ShippingProvider, RateInput, CreateShipmentInput, ShipmentResult, TrackingResult } from "./types";
import { ShippingRate, ShipmentStatus } from "@/domain/types";
import { fedexAuthService } from "@/lib/fedexAuth";

function normalizeCountry(country: string): string {
  const value = country.trim().toUpperCase();
  if (value === "MEXICO" || value === "MÉXICO") return "MX";
  if (value === "UNITED STATES") return "US";
  return value;
}

/**
 * Shapes of the FedEx REST responses this provider actually reads.
 *
 * FedEx returns very large, optional envelopes. These types describe only the
 * fields the code touches, so an unexpected extra key is ignored rather than
 * typed as `any`, and a field that stops existing becomes a compile error
 * instead of a silent `undefined` at runtime.
 */
interface FedExChargeDetail {
  totalNetCharge?: number;
  currency?: string;
}

interface FedExRateQuote {
  serviceName?: string;
  serviceType?: string;
  transitTime?: string;
  ratedShipmentDetails?: FedExChargeDetail[];
}

interface FedExPackageDocument {
  type?: string;
  url?: string;
  encodedLabel?: string;
}

interface FedExScanEvent {
  eventType?: string;
  eventDescription?: string;
  date?: string;
  scanLocation?: { city?: string; stateOrProvinceCode?: string };
}

/**
 * FedEx Shipping Provider
 * Documentation Reference: FedEx Developer Portal REST APIs (https://developer.fedex.com/)
 * 
 * Required Environment Variables for Live API:
 * - FEDEX_CLIENT_ID (or FEDEX_API_KEY)
 * - FEDEX_CLIENT_SECRET (or FEDEX_SECRET_KEY)
 * - FEDEX_ACCOUNT_NUMBER
 * - FEDEX_BASE_URL (defaults to https://apis-sandbox.fedex.com for test)
 */
export class FedExShippingProvider implements ShippingProvider {
  readonly name = "FedEx";
  readonly type = "FEDEX" as const;

  private accountNumber = process.env.FEDEX_ACCOUNT_NUMBER;
  private baseUrl = process.env.FEDEX_BASE_URL || "https://apis-sandbox.fedex.com";

  isConfigured(): boolean {
    return Boolean(fedexAuthService.isConfigured() && this.accountNumber);
  }

  isTestMode(): boolean {
    return this.baseUrl.includes("sandbox");
  }

  private mapFedExStatusToRouteFlow(fedExStatus: string): ShipmentStatus {
    const statusMap: Record<string, ShipmentStatus> = {
      "PENDING": "LABEL_CREATED",
      "CREATED": "LABEL_CREATED",
      "SHIPPED": "PICKED_UP",
      "IN_TRANSIT": "IN_TRANSIT",
      "OUT_FOR_DELIVERY": "OUT_FOR_DELIVERY",
      "DELIVERED": "DELIVERED",
      "FAILED": "FAILED",
      "CANCELLED": "CANCELLED",
      "EXCEPTION": "FAILED",
    };
    return statusMap[fedExStatus] || "LABEL_CREATED";
  }

  async getRates(input: RateInput): Promise<ShippingRate[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const accessToken = await fedexAuthService.getAccessToken();

      const requestBody = {
        accountNumber: {
          value: this.accountNumber,
        },
        requestedShipment: {
          shipper: {
            address: {
              postalCode: input.origin.postalCode,
              countryCode: input.origin.country,
            },
          },
          recipient: {
            address: {
              postalCode: input.destination.postalCode,
              countryCode: input.destination.country,
            },
          },
          pickupType: "DROPOFF_AT_FEDEX_LOCATION",
          rateRequestType: ["ACCOUNT", "LIST"],
          requestedPackageLineItems: [
            {
              ...(input.dimensions ? { dimensions: { ...input.dimensions, units: "CM" } } : {}),
              weight: {
                units: "KG",
                value: input.weightKg || 1.0,
              },
            },
          ],
        },
      };

      const response = await fetch(`${this.baseUrl}/rate/v1/rates/quotes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FedEx Rates API error:", response.status, errorText);
        throw new Error(`FedEx Rates API error: ${response.statusText}`);
      }

      const data = await response.json();
      const rateQuotes: FedExRateQuote[] = data.output?.rateReplyDetails || [];

      return rateQuotes.map((quote) => ({
        provider: "FEDEX" as const,
        carrierName: "FedEx",
        serviceName: quote.serviceName || quote.serviceType || "FedEx",
        serviceCode: quote.serviceType || "FEDEX_STANDARD",
        rate: quote.ratedShipmentDetails?.[0]?.totalNetCharge || 0,
        currency: quote.ratedShipmentDetails?.[0]?.currency || "MXN",
        estimatedDays: quote.transitTime || "2-3 business days",
      }));
    } catch (error) {
      console.error("FedEx rates request failed:", error);
      throw new Error("FedEx service temporarily unavailable");
    }
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    if (!this.isConfigured()) {
      throw new Error("FedEx credentials not configured");
    }

    try {
      const accessToken = await fedexAuthService.getAccessToken();

      const requestBody = {
        labelResponseOptions: "LABEL",
        requestedShipment: {
          shipper: {
            contact: {
              personName: input.sender.name,
              phoneNumber: input.sender.phone,
              emailAddress: input.sender.email,
            },
            address: {
              streetLines: [input.sender.street],
              city: input.sender.city,
              stateOrProvinceCode: input.sender.state,
              postalCode: input.sender.postalCode,
              countryCode: normalizeCountry(input.sender.country),
            },
          },
          recipients: [
            {
              contact: {
                personName: input.recipient.name,
                phoneNumber: input.recipient.phone,
                emailAddress: input.recipient.email,
              },
              address: {
                streetLines: [input.recipient.street],
                city: input.recipient.city,
                stateOrProvinceCode: input.recipient.state,
                postalCode: input.recipient.postalCode,
                countryCode: normalizeCountry(input.recipient.country),
              },
            },
          ],
          pickupType: "DROPOFF_AT_FEDEX_LOCATION",
          serviceType: input.serviceCode === "FEDEX_EXPRESS" ? "STANDARD_OVERNIGHT" : input.serviceCode,
          packagingType: "YOUR_PACKAGING",
          shippingChargesPayment: {
            paymentType: "SENDER",
            payor: { responsibleParty: { accountNumber: { value: this.accountNumber } } },
          },
          labelSpecification: { imageType: "PDF", labelStockType: "PAPER_4X6" },
          requestedPackageLineItems: [
            {
              ...(input.packageDetails?.dimensions ? { dimensions: { ...input.packageDetails.dimensions, units: "CM" } } : {}),
              weight: {
                units: normalizeCountry(input.sender.country) === "US" ? "LB" : "KG",
                value: Number(((input.packageDetails?.weightKg || 1) * (normalizeCountry(input.sender.country) === "US" ? 2.2046226218 : 1)).toFixed(3)),
              },
            },
          ],
        },
        accountNumber: {
          value: this.accountNumber,
        },
      };

      const response = await fetch(`${this.baseUrl}/ship/v1/shipments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FedEx Ship API error:", response.status, errorText);
        throw new Error(`FedEx Ship API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      const transaction = data.output?.transactionShipments?.[0];
      const trackingNumber = transaction?.pieceResponses?.[0]?.trackingNumber || transaction?.masterTrackingNumber || transaction?.trackingNumber || "";
      const packageDocuments: FedExPackageDocument[] = [
        ...(transaction?.packageDocuments || []),
        ...(transaction?.pieceResponses?.[0]?.packageDocuments || []),
      ];
      const labelDoc = packageDocuments.find((doc) => doc.type === "LABEL" || doc.encodedLabel);
      const labelUrl = labelDoc?.url || undefined;
      if (!trackingNumber || (!labelUrl && !labelDoc?.encodedLabel)) {
        throw new Error("FedEx did not return a tracking number and printable label");
      }

      return {
        success: true,
        provider: "FEDEX",
        providerShipmentId: data.output?.transactionShipments?.[0]?.masterTrackingNumber || trackingNumber,
        trackingNumber,
        trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
        labelUrl,
        labelBase64: labelDoc?.encodedLabel,
        status: this.mapFedExStatusToRouteFlow("CREATED"),
        estimatedDelivery: data.output?.transactionShipments?.[0]?.serviceCommitMessage?.commitDate || null,
      };
    } catch (error) {
      console.error("FedEx shipment creation failed:", error);
      throw new Error("FedEx service temporarily unavailable");
    }
  }

  async getTracking(trackingNumber: string): Promise<TrackingResult> {
    if (!this.isConfigured()) {
      throw new Error("FedEx credentials not configured");
    }

    try {
      const accessToken = await fedexAuthService.getAccessToken();

      const requestBody = {
        includeDetailedScans: true,
        trackingInfo: [
          {
            trackingNumberInfo: {
              trackingNumber: trackingNumber,
            },
          },
        ],
      };

      const response = await fetch(`${this.baseUrl}/track/v1/trackingnumbers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FedEx Tracking API error:", response.status, errorText);
        throw new Error(`FedEx Tracking API error: ${response.statusText}`);
      }

      const data = await response.json();
      const trackResults = data.output?.completeTrackResults?.[0]?.trackResults?.[0] || {};

      const scanEvents: FedExScanEvent[] = trackResults.scanEvents || [];
      const events = scanEvents.map((event, index) => ({
        id: `ev_${Date.now()}_${index}`,
        status: this.mapFedExStatusToRouteFlow(event.eventType || "PENDING"),
        description: event.eventDescription || "Unknown event",
        location: event.scanLocation?.city || event.scanLocation?.stateOrProvinceCode,
        timestamp: event.date || new Date().toISOString(),
      }));

      return {
        trackingNumber,
        provider: "FEDEX",
        status: this.mapFedExStatusToRouteFlow(trackResults.latestStatusDetail?.code || "PENDING"),
        carrier: "FedEx",
        service: trackResults.service?.type || "FedEx",
        estimatedDelivery: trackResults.estimatedDeliveryTimeWindow?.[0]?.end,
        events,
      };
    } catch (error) {
      console.error("FedEx tracking request failed:", error);
      throw new Error("FedEx service temporarily unavailable");
    }
  }

  async cancelShipment(shipmentId: string): Promise<{ success: boolean; message?: string }> {
    if (!this.isConfigured()) {
      throw new Error("FedEx credentials not configured");
    }

    try {
      const accessToken = await fedexAuthService.getAccessToken();

      const response = await fetch(`${this.baseUrl}/ship/v1/shipments/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountNumber: {
            value: this.accountNumber,
          },
          trackingNumber: shipmentId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FedEx Cancel API error:", response.status, errorText);
        return { success: false, message: `FedEx Cancel API error: ${response.statusText}` };
      }

      return { success: true, message: `FedEx Shipment ${shipmentId} cancelled successfully.` };
    } catch (error) {
      console.error("FedEx shipment cancellation failed:", error);
      return { success: false, message: "FedEx service temporarily unavailable" };
    }
  }
}
