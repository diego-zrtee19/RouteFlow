/**
 * CANONICAL DOMAIN MODEL — the single source of truth for RouteFlow entities.
 *
 * Why this file exists
 * --------------------
 * The audit found THREE competing type systems describing the same domain:
 *   - src/types/index.ts   (V1 "in-memory" model, camelCase, 15 order states)
 *   - src/lib/types_v2.ts  (V2 "Supabase" model, snake_case, 6 escrow states)
 *   - src/lib/types.ts     (V1 "Punto Route" legacy, different domain entirely)
 *
 * Having three is worse than having one bad one: a developer edits the file the
 * code does not import, the type checker passes, and nothing changes at runtime.
 *
 * Two of the three are now gone. `src/lib/types_v2.ts` was deleted with the
 * V2-era endpoints that still queried the `stores` table and the `escrow_status`
 * column, neither of which exist in schema V3. `src/types/index.ts` survives only
 * because it contributes pure union types (statuses, carriers) that are not a
 * competing model of the same entities — it describes no storage or behaviour.
 *
 * These types are the domain contract. They are deliberately decoupled from the
 * storage engine (Supabase) and from any UI, so:
 *   - API routes parse untrusted input into these shapes (lib/validation.ts)
 *   - the data layer maps DB rows -> these shapes
 *   - the UI receives explicit DTOs derived from them (domain/dto.ts)
 *
 * Naming: camelCase in TypeScript, snake_case only in SQL/PostgREST rows.
 */

// --------------------------------------------------------------------------
// Identity
// --------------------------------------------------------------------------

/** Role is derived from the auth provider, never from client input. */
export type UserRole = "BUYER" | "SELLER" | "ADMIN";

export type KycStatus = "unverified" | "pending" | "verified";

/**
 * A seller's storefront. `userId` is the Clerk subject id; it is the ONLY
 * trusted link between an authenticated session and a seller account.
 */
export interface Seller {
  id: string;
  userId: string;
  storeUsername: string;
  storeName: string;
  instagramHandle: string | null;
  logoUrl: string | null;
  kycStatus: KycStatus;
  kycDocumentUrl: string | null;
  description: string | null;
  /**
   * Required to create a real shipment. Until this exists the shipping layer
   * must refuse to dispatch rather than invent a sender address.
   */
  shipFromAddress: Address | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Address
// --------------------------------------------------------------------------

/**
 * One canonical address shape. The previous code had incompatible variants
 * (`Address` with postalCode, v2 `ShippingAddress` with zip, plus a
 * `shipping_address` JSONB blob), which made carrier mapping guesswork.
 */
export interface Address {
  fullName: string;
  phone: string;
  street: string;
  streetNumber?: string;
  neighborhood?: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO-3166 alpha-2, uppercased. */
  country: string;
  notes?: string;
}

// --------------------------------------------------------------------------
// Product
// --------------------------------------------------------------------------

export type DeliveryMethod = "shipping" | "local_delivery" | "meetup";

export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string | null;
  /** Decimal amount in `currency`. ALWAYS resolved server-side. */
  price: number;
  currency: string;
  imageUrl: string | null;
  images: string[];
  category: string | null;
  stock: number;
  isExpress: boolean;
  isActive: boolean;
  deliveryOptions: DeliveryMethod[];
  /**
   * Required for real shipments. Optional because a product can be published
   * before its shipping profile is set; the shipping layer blocks dispatch
   * until it exists.
   */
  weightKg: number | null;
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------------------------
// PurchaseLink
// --------------------------------------------------------------------------

export type PurchaseLinkStatus = "active" | "inactive" | "expired";

export interface PurchaseLink {
  id: string;
  sellerId: string;
  productId: string;
  /** Short, unguessable, URL-safe. UNIQUE in the database. */
  publicId: string;
  status: PurchaseLinkStatus;
  viewCount: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Order
// --------------------------------------------------------------------------

/**
 * The order lifecycle. Transitions are enforced centrally by
 * `domain/orderStateMachine.ts` and never mutated ad hoc inside a route handler.
 */
export type OrderStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "BUYER_CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | "DISPUTED";

export type PaymentStatus = "PENDING" | "AUTHORIZED" | "SUCCEEDED" | "FAILED" | "REFUNDED";

/**
 * `buyerTokenHash` is the buyer's credential.
 *
 * The plaintext token is shown to the buyer exactly once (at checkout) and is
 * never persisted: we store only a SHA-256 hash, so a database disclosure
 * cannot be replayed against live buyer sessions.
 *
 * This is what closes the IDOR the audit found: previously any request that
 * knew an order id could confirm delivery, open a dispute or read tracking.
 */
export interface Order {
  id: string;
  orderNumber: string;
  sellerId: string;
  purchaseLinkId: string | null;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  shippingAddress: Address;
  shippingService?: string | null;
  deliveryMethod: DeliveryMethod;
  /** Resolved server-side from the stored product. Never from the request body. */
  amount: number;
  currency: string;
  platformFee: number;
  refundedAmount?: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  buyerTokenHash: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

/** A line item, so the model can grow into multi-product orders. */
export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  title: string;
  imageUrl: string | null;
  /** Price captured at purchase time, so later price edits cannot rewrite history. */
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

// --------------------------------------------------------------------------
// Payment / Refund
// --------------------------------------------------------------------------

export type PaymentProvider = "stripe";


// --------------------------------------------------------------------------
// Shipment
// --------------------------------------------------------------------------

export type ShippingProviderType = "DHL" | "FEDEX" | "UBER" | "MOCK";

/**
 * A quoted rate from a carrier.
 *
 * This lived in the retired V1 type module. It is a shipping concept, so it
 * belongs here next to `ShippingProviderType`; the providers import it from
 * the canonical domain model like everything else.
 */
export interface ShippingRate {
  provider: ShippingProviderType;
  carrierName: string;
  serviceName: string;
  serviceCode: string;
  rate: number;
  currency: string;
  estimatedDays: string;
}

export type ShipmentStatus =
  | "LABEL_CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

export interface Shipment {
  id: string;
  orderId: string;
  provider: ShippingProviderType;
  providerShipmentId: string | null;
  trackingNumber: string;
  serviceCode: string;
  carrierName: string;
  status: ShipmentStatus;
  trackingUrl: string | null;
  labelUrl: string | null;
  estimatedDelivery: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentEvent {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  description: string;
  location: string | null;
  /** When the carrier reported the event (not when we stored it). */
  occurredAt: string;
  createdAt: string;
}

// --------------------------------------------------------------------------
// Dispute
// --------------------------------------------------------------------------

export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "CLOSED";

export type DisputeReason =
  | "product_not_received"
  | "wrong_product"
  | "damaged_product"
  | "other";

export interface Dispute {
  id: string;
  orderId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Events (the only source of analytics truth)
// --------------------------------------------------------------------------

/**
 * Real, recorded events.
 *
 * The previous implementation fabricated metrics by adding a constant
 * (`+ 1240` views) to make dashboards look populated. That is gone: every
 * number rendered by a dashboard is now a COUNT or SUM over stored rows.
 */
export type DomainEventType =
  | "PURCHASE_LINK_VIEWED"
  | "CHECKOUT_STARTED"
  | "PAYMENT_STARTED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "ORDER_CREATED"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "BUYER_CONFIRMED"
  | "ORDER_COMPLETED"
  | "ORDER_CANCELLED"
  | "DISPUTE_CREATED"
  | "REFUND_CREATED";

export interface DomainEvent {
  id: string;
  type: DomainEventType;
  sellerId: string | null;
  orderId: string | null;
  purchaseLinkId: string | null;
  productId: string | null;
  amount: number | null;
  currency: string | null;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}

/** Aggregates computed from real events only. */
export interface AnalyticsSummary {
  linkViews: number;
  checkoutStarts: number;
  paymentSuccess: number;
  completedOrders: number;
  gmv: number;
  averageOrderValue: number;
  conversionRate: number;
}
export interface Payment {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  /** Stripe identifiers, nullable while the checkout session is still open. */
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export type RefundStatus = "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED";

export interface Refund {
  id: string;
  orderId: string;
  paymentId: string;
  providerRefundId: string | null;
  amount: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  createdAt: string;
  updatedAt: string;
}
