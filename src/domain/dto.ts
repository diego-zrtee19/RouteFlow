import type {
  Dispute,
  Order,
  OrderItem,
  Product,
  PurchaseLink,
  Seller,
  Shipment,
  ShipmentEvent,
  ShipmentStatus,
  DisputeStatus,
  DisputeReason,
  OrderStatus,
  PaymentStatus,
} from "./types";

/**
 * VIEW MODELS (DTOs) — the ONLY shapes the browser is allowed to receive.
 *
 * The audit found buyer email, phone and street address being shipped into
 * client bundles because UI components imported the data store directly. A DTO
 * per audience fixes that structurally rather than by discipline: if a field is
 * not in the interface, it cannot be serialised into the response.
 *
 * Rules for adding a DTO:
 *   - never include a field the screen does not render
 *   - never include a secret, a Stripe id, or a token
 *   - anything identifying a buyer beyond their name is seller/admin only
 */

// --------------------------------------------------------------------------
// Public (unauthenticated buyer) — no PII at all
// --------------------------------------------------------------------------

export interface PublicSellerView {
  storeUsername: string;
  storeName: string;
  logoUrl: string | null;
  description: string | null;
  /**
   * Whether the seller completed KYC.
   *
   * Public by design: the storefront already renders a verified badge next to
   * the store name, so buyers need to see it. It exposes only the state of the
   * check, never the document behind it.
   */
  kycVerified: boolean;
}

export interface PublicProductView {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  inStock: boolean;
  deliveryOptions: Product["deliveryOptions"];
}

export interface PublicPurchaseLinkView {
  publicId: string;
  product: PublicProductView;
  seller: PublicSellerView;
}

/** What `/p/[publicId]` and `/api/public/links/[publicId]` return. */
export function toPublicPurchaseLinkView(
  link: PurchaseLink,
  product: Product,
  seller: Seller
): PublicPurchaseLinkView {
  return {
    publicId: link.publicId,
    product: {
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      currency: product.currency,
      images: product.images.length
        ? product.images
        : product.imageUrl
          ? [product.imageUrl]
          : [],
      // Expose a boolean, never the raw stock level.
      inStock: product.stock > 0 && product.isActive,
      deliveryOptions: product.deliveryOptions,
    },
    seller: {
      storeUsername: seller.storeUsername,
      storeName: seller.storeName,
      logoUrl: seller.logoUrl,
      description: seller.description,
      kycVerified: seller.kycStatus === "verified",
    },
  };
}

// --------------------------------------------------------------------------
// Buyer — sees their own order, addressed by an opaque token
// --------------------------------------------------------------------------

export interface BuyerOrderItemView {
  title: string;
  imageUrl: string | null;
  quantity: number;
  lineTotal: number;
}

export interface BuyerShipmentView {
  carrierName: string;
  trackingNumber: string;
  status: ShipmentStatus;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  lastEvent: { description: string; occurredAt: string } | null;
}

/**
 * What a buyer sees for their own order.
 *
 * Excludes contact credentials and Stripe internals. The authenticated buyer
 * receives their delivery address for the receipt; public link DTOs never do.
 */
export interface BuyerOrderView {
  /**
   * The order's own id.
   *
   * Safe to return: the buyer already holds it (it is in the URL that brought
   * them here) and every endpoint still requires the buyer token, so the id
   * grants nothing on its own. The tracking page needs it to navigate.
   */
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  refundedAmount?: number;
  currency: string;
  /** City summary, alongside the authenticated buyer's receipt address. */
  destinationCity: string;
  deliveryMethod: Order["deliveryMethod"];
  deliveryAddress: Omit<Order["shippingAddress"], "phone">;
  items: BuyerOrderItemView[];
  shipment: BuyerShipmentView | null;
  createdAt: string;
  paidAt: string | null;
  canConfirm: boolean;
  canDispute: boolean;
  dispute: { id: string; reason: DisputeReason; status: DisputeStatus; createdAt: string } | null;
}

export function toBuyerOrderView(
  order: Order,
  shipment: Shipment | null,
  shipmentEvents: ShipmentEvent[],
  dispute: Dispute | null
): BuyerOrderView {
  const sorted = [...shipmentEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const lastEvent = sorted[0] ?? null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    amount: order.amount,
    refundedAmount: order.refundedAmount ?? 0,
    currency: order.currency,
    destinationCity: order.shippingAddress.city,
    deliveryMethod: order.deliveryMethod,
    deliveryAddress: {
      fullName: order.shippingAddress.fullName,
      street: order.shippingAddress.street,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      postalCode: order.shippingAddress.postalCode,
      country: order.shippingAddress.country,
      notes: order.shippingAddress.notes,
    },
    items: order.items.map<BuyerOrderItemView>((item) => ({
      title: item.title,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    shipment: shipment

      ? {
          carrierName: shipment.carrierName,
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          trackingUrl: shipment.trackingUrl,
          estimatedDelivery: shipment.estimatedDelivery,
          lastEvent: lastEvent
            ? { description: lastEvent.description, occurredAt: lastEvent.occurredAt }
            : null,
        }
      : null,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    canConfirm: order.status === "DELIVERED" || order.status === "IN_TRANSIT",
    canDispute:
      order.paymentStatus === "SUCCEEDED" &&
      order.status !== "REFUNDED" &&
      order.status !== "CANCELLED" &&
      dispute === null,
    dispute: dispute
      ? { id: dispute.id, reason: dispute.reason, status: dispute.status, createdAt: dispute.createdAt }
      : null,
  };
}

// --------------------------------------------------------------------------
// Seller — contact details, but only for their own orders
// --------------------------------------------------------------------------

export interface SellerShipmentView {
  id: string;
  provider: Shipment["provider"];
  carrierName: string;
  trackingNumber: string;
  status: ShipmentStatus;
  labelUrl: string | null;
  /**
   * Carrier's own public tracking page.
   *
   * A seller must be able to follow their own parcel, but they are NOT given
   * the buyer's token, so the buyer-facing `/order/[id]` screen would refuse
   * them. This link is the seller's equivalent route to the same information.
   */
  trackingUrl: string | null;
}

/**
 * Seller-facing order row.
 *
 * A seller legitimately needs buyer contact details in order to ship, so they
 * are present — but only ever for orders whose sellerId matches the
 * authenticated seller (enforced in lib/authz.ts, covered by tests).
 */
export interface SellerOrderView {
  id: string;
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  shippingAddress: Order["shippingAddress"];
  shippingService?: string | null;
  deliveryMethod: Order["deliveryMethod"];
  amount: number;
  refundedAmount?: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: OrderItem[];
  shipment: SellerShipmentView | null;
  createdAt: string;
}

/** Standalone shipment DTO for the buyer tracking view. */
export function toBuyerShipmentView(
  shipment: Shipment,
  shipmentEvents: ShipmentEvent[]
): BuyerShipmentView {
  const sorted = [...shipmentEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const lastEvent = sorted[0] ?? null;

  return {
    carrierName: shipment.carrierName,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    trackingUrl: shipment.trackingUrl,
    estimatedDelivery: shipment.estimatedDelivery,
    lastEvent: lastEvent
      ? { description: lastEvent.description, occurredAt: lastEvent.occurredAt }
      : null,
  };
}

export function toSellerOrderView(order: Order, shipment: Shipment | null): SellerOrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    buyerPhone: order.buyerPhone,
    shippingAddress: order.shippingAddress,
    shippingService: order.shippingService ?? null,
    deliveryMethod: order.deliveryMethod,
    amount: order.amount,
    refundedAmount: order.refundedAmount ?? 0,
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus,
    items: order.items,
    shipment: shipment
      ? {
          id: shipment.id,
          provider: shipment.provider,
          carrierName: shipment.carrierName,
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          labelUrl: shipment.labelUrl,
          trackingUrl: shipment.trackingUrl,
        }
      : null,
    createdAt: order.createdAt,
  };
}

/** Seller's own product, plus the id of its purchase link when one exists. */
export interface SellerProductView {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  stock: number;
  isActive: boolean;
  deliveryOptions: Product["deliveryOptions"];
  weightKg: number | null;
  publicLinkId: string | null;
}

export function toSellerProductView(product: Product, publicLinkId: string | null): SellerProductView {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    price: product.price,
    currency: product.currency,
    images: product.images.length
      ? product.images
      : product.imageUrl
        ? [product.imageUrl]
        : [],
    stock: product.stock,
    isActive: product.isActive,
    deliveryOptions: product.deliveryOptions,
    weightKg: product.weightKg,
    publicLinkId,
  };
}

/** A purchase link as shown in the seller's own link manager. */
export interface SellerPurchaseLinkView {
  id: string;
  publicId: string;
  status: PurchaseLink["status"];
  viewCount: number;
  productId: string;
  productTitle: string;
  productPrice: number;
  currency: string;
  productImage: string | null;
  createdAt: string;
}
