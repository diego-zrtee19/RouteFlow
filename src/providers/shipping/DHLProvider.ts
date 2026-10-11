import { ShippingProvider, RateInput, CreateShipmentInput, ShipmentResult, TrackingResult } from "./types";
import { ShippingRate, ShipmentStatus } from "@/domain/types";

/**
 * DHL Express Shipping Provider
 * Documentation Reference: DHL Express MyDHL API v3.0 REST (https://developer.dhl.com/)
 * 
 * Required Environment Variables for Live API:
 * - DHL_API_KEY
 * - DHL_API_SECRET
 * - DHL_ACCOUNT_NUMBER
 * - DHL_BASE_URL (defaults to https://express.api.dhl.com/mydhlapi/test for sandbox)
 */
export class DHLShippingProvider implements ShippingProvider {
  readonly name = "DHL Express";
  readonly type = "DHL" as const;

  private apiKey = process.env.DHL_API_KEY;
  private apiSecret = process.env.DHL_API_SECRET;
  private accountNumber = process.env.DHL_ACCOUNT_NUMBER;
  private baseUrl = process.env.DHL_BASE_URL || "https://express.api.dhl.com/mydhlapi/test";

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret && this.accountNumber);
  }

  isTestMode(): boolean {
    return this.baseUrl.includes("/test");
  }

  private getAuthHeader(): string {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error("DHL credentials not configured");
    }
    return Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64");
  }

  private mapDHLStatusToRouteFlow(dhlStatus: string): ShipmentStatus {
    const statusMap: Record<string, ShipmentStatus> = {
      "pending": "LABEL_CREATED",
      "labelCreated": "LABEL_CREATED",
      "pickedUp": "PICKED_UP",
      "inTransit": "IN_TRANSIT",
      "outForDelivery": "OUT_FOR_DELIVERY",
      "delivered": "DELIVERED",
      "failed": "FAILED",
      "cancelled": "CANCELLED",
    };
    return statusMap[dhlStatus] || "LABEL_CREATED";
  }

  async getRates(input: RateInput): Promise<ShippingRate[]> {
    if (!this.isConfigured()) {
      // Return empty array when not configured - caller should show NOT_CONFIGURED status
      return [];
    }

    try {
      const authHeader = this.getAuthHeader();
      const requestBody = {
        originPostalCode: input.origin.postalCode,
        originCountryCode: input.origin.country,
        originCityName: input.origin.city,
        destinationPostalCode: input.destination.postalCode,
        destinationCountryCode: input.destination.country,
        destinationCityName: input.destination.city,
        weight: input.weightKg || 1,
        length: 10,
        width: 10,
        height: 10,
        plannedShippingDate: new Date().toISOString().slice(0, 10),
        isCustomsDeclarable: false,
        unitOfMeasurement: "metric",
        accountNumber: this.accountNumber,
      };

      const res = await fetch(`${this.baseUrl}/rates`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("DHL API Rates error:", res.status, errorText);
        throw new Error(`DHL API Rates error: ${res.statusText}`);
      }

      const data = await res.json();
      return (data.products || []).map((p: Record<string, unknown>) => ({
        provider: "DHL" as const,
        carrierName: "DHL Express",
        serviceName: p.productName as string || "DHL Express",
        serviceCode: p.productCode as string,
        rate: (p.totalPrice as Array<{ price?: number }>)?.[0]?.price || 0,
        currency: (p.totalPrice as Array<{ currencyType?: string }>)?.[0]?.currencyType || "MXN",
        estimatedDays: ((p.deliveryCapabilities as Record<string, string>)?.deliveryTime) || "1-2 business days",
      }));
    } catch (err) {
      console.error("DHL API rates request failed:", err);
      throw new Error("DHL service temporarily unavailable");
    }
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    if (!this.isConfigured()) {
      throw new Error("DHL credentials not configured");
    }

    try {
      const authHeader = this.getAuthHeader();
      const requestBody = {
        plannedShippingDateAndTime: new Date().toISOString(),
        pickup: {
          isRequested: false,
        },
        productCode: input.serviceCode,
        accounts: [
          {
            typeCode: "shipper",
            number: this.accountNumber,
          },
        ],
        customerDetails: {
          shipperDetails: {
            postalAddress: {
              countryCode: input.sender.country,
              postalCode: input.sender.postalCode,
              cityName: input.sender.city,
              addressLine1: input.sender.street,
              provinceCode: input.sender.state,
              countryName: input.sender.country,
            },
            contactInformation: {
              phone: input.sender.phone,
              email: input.sender.email,
              companyName: input.sender.name,
              fullName: input.sender.name,
            },
          },
          receiverDetails: {
            postalAddress: {
              countryCode: input.recipient.country,
              postalCode: input.recipient.postalCode,
              cityName: input.recipient.city,
              addressLine1: input.recipient.street,
              provinceCode: input.recipient.state,
              countryName: input.recipient.country,
            },
            contactInformation: {
              phone: input.recipient.phone,
              email: input.recipient.email,
              companyName: input.recipient.name,
              fullName: input.recipient.name,
            },
          },
        },
        content: {
          packages: [
            {
              weight: input.packageDetails?.weightKg || 1,
              dimensions: {
                length: 10,
                width: 10,
                height: 10,
              },
            },
          ],
          isCustomsDeclarable: false,
          description: input.packageDetails?.description || "Package",
          unitOfMeasurement: "metric",
        },
        outputImageProperties: {
          imageOptions: [
            {
              typeCode: "label",
              isRequested: true,
            },
          ],
        },
      };

      const res = await fetch(`${this.baseUrl}/shipments`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("DHL API Shipment error:", res.status, errorText);
        throw new Error(`DHL API Shipment error: ${res.statusText}`);
      }

      const data = await res.json();
      
      const trackingNumber = data.shipmentTrackingNumber || data.trackingNumber || "";
      const labelData = data.documents?.[0]?.content || data.labelUrl || "";
      const labelUrl = labelData.startsWith("http") ? labelData : undefined;

      return {
        success: true,
        provider: "DHL",
        providerShipmentId: data.shipmentId || trackingNumber,
        trackingNumber,
        trackingUrl: `https://www.dhl.com/mx-es/home/tracking/tracking-express.html?submit=1&tracking-id=${trackingNumber}`,
        labelUrl,
        status: this.mapDHLStatusToRouteFlow(data.status || "labelCreated"),
        estimatedDelivery: data.estimatedDeliveryDate || new Date(Date.now() + 48 * 3600 * 1000).toISOString().split("T")[0],
      };
    } catch (err) {
      console.error("DHL API shipment creation failed:", err);
      throw new Error("DHL service temporarily unavailable");
    }
  }

  async getTracking(trackingNumber: string): Promise<TrackingResult> {
    if (!this.isConfigured()) {
      throw new Error("DHL credentials not configured");
    }

    try {
      const authHeader = this.getAuthHeader();
      const res = await fetch(`${this.baseUrl}/shipments/${trackingNumber}/tracking`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("DHL API Tracking error:", res.status, errorText);
        throw new Error(`DHL API Tracking error: ${res.statusText}`);
      }

      const data = await res.json();
      const shipments = data.shipments || [];
      const shipment = shipments[0] || {};

      const events = (shipment.events || []).map((e: Record<string, unknown>) => {
        const locationObj = e.location as Record<string, unknown> | undefined;
        const addressObj = locationObj?.address as Record<string, unknown> | undefined;
        const serviceAreaObj = e.serviceArea as Record<string, unknown> | undefined;
        
        return {
          status: this.mapDHLStatusToRouteFlow(e.statusCode as string || "pending"),
          description: e.description as string || "Unknown event",
          location: addressObj?.locality as string || serviceAreaObj?.description as string,
          timestamp: e.timestamp as string || new Date().toISOString(),
        };
      });

      return {
        trackingNumber,
        provider: "DHL",
        status: this.mapDHLStatusToRouteFlow(shipment.status?.statusCode as string || "pending"),
        carrier: "DHL Express",
        service: shipment.service?.description as string || "Express",
        estimatedDelivery: shipment.estimatedTimeOfDelivery as string,
        events,
      };
    } catch (err) {
      console.error("DHL API tracking request failed:", err);
      throw new Error("DHL service temporarily unavailable");
    }
  }

  async cancelShipment(shipmentId: string): Promise<{ success: boolean; message?: string }> {
    if (!this.isConfigured()) {
      throw new Error("DHL credentials not configured");
    }

    try {
      const authHeader = this.getAuthHeader();
      const res = await fetch(`${this.baseUrl}/shipments/${shipmentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("DHL API Cancel error:", res.status, errorText);
        return { success: false, message: `DHL API Cancel error: ${res.statusText}` };
      }

      return { success: true, message: `DHL Shipment ${shipmentId} cancelled successfully.` };
    } catch (err) {
      console.error("DHL API shipment cancellation failed:", err);
      return { success: false, message: "DHL service temporarily unavailable" };
    }
  }
}
