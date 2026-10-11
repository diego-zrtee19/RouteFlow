import { ShippingProviderType, ShippingRate, ShipmentStatus } from "@/domain/types";

export interface RateInput {
  origin: { postalCode: string; country: string; city?: string };
  destination: { postalCode: string; country: string; city?: string };
  weightKg?: number;
  declaredValue?: number;
  dimensions?: { length: number; width: number; height: number };
}

export interface CreateShipmentInput {
  orderId: string;
  orderNumber: string;
  serviceCode: string;
  sender: {
    name: string;
    phone: string;
    email?: string;
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  recipient: {
    name: string;
    phone: string;
    email?: string;
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  packageDetails?: {
    weightKg: number;
    description: string;
    dimensions?: { length: number; width: number; height: number };
  };
}

export interface ShipmentResult {
  success: boolean;
  provider: ShippingProviderType;
  providerShipmentId: string;
  trackingNumber: string;
  trackingUrl: string;
  labelUrl?: string;
  labelBase64?: string;
  status: ShipmentStatus;
  estimatedDelivery: string | null;
  error?: string;
}

export interface TrackingResult {
  trackingNumber: string;
  provider: ShippingProviderType;
  status: ShipmentStatus;
  carrier: string;
  service: string;
  estimatedDelivery?: string;
  events: Array<{
    id?: string;
    status: ShipmentStatus;
    description: string;
    dimensions?: { length: number; width: number; height: number };
    location?: string;
    timestamp: string;
  }>;
}

export interface ShippingProvider {
  readonly name: string;
  readonly type: ShippingProviderType;
  isConfigured(): boolean;
  getRates(input: RateInput): Promise<ShippingRate[]>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>;
  getTracking(trackingNumber: string): Promise<TrackingResult>;
  cancelShipment(shipmentId: string): Promise<{ success: boolean; message?: string }>;
}
