import type {
  Address,
  DeliveryMethod,
  Dispute,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Seller,
  Shipment,
  ShipmentEvent,
} from "@/domain/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DatabaseError, ValidationError } from "@/lib/errors";
import {
  generateBuyerToken,
  generateOrderNumber,
  hashBuyerToken,
} from "@/lib/buyerToken";
import { assertTransition } from "@/domain/orderStateMachine";
import { recordEvent } from "@/services/orderService";

/**
 * ORDER REPOSITORY — orders + order_items.
 *
 * SECURITY RULES ENFORCED HERE, not at the call site:
 *
 *   The request may only carry a `publicId` and buyer contact details. Every
 *   money and ownership field is re-read from the stored product:
 *
 *     unit_price   <- products.price          (never from the client)
 *     line_total   <- unit_price * quantity   (computed)
 *     amount       <- sum(line_total)         (computed)
 *     platform_fee <- amount * PLATFORM_FEE_RATE (computed)
 *     seller_id    <- purchase_links.seller_id  (from the DB)
 *
 *   The signature takes a `publicId`, not a price: there is no parameter
 *   through which a client could smuggle an amount.
 */

export const PLATFORM_FEE_RATE = 0.05;

export interface CreateOrderInput {
  publicId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  shippingAddress: Address;
  deliveryMethod: DeliveryMethod;
  quoteId?: string;
}

export interface CreateOrderResult {
  order: Order;
  /** Plaintext buyer token. Returned ONCE, at checkout; never persisted. */
  buyerToken: string;
  productTitle: string;
  unitPrice: number;
  currency: string;
}
/**
 * Creates an order for a purchase link.
 *
 * Rejects (rather than trusting) when the link or product is missing,
 * inactive, out of stock, or carries an unusable price.
 */
export async function createOrderFromPurchaseLink(
  input: CreateOrderInput,
): Promise<CreateOrderResult | null> {
  const buyerToken = generateBuyerToken();
  const { data, error } = await getSupabaseAdmin().rpc("reserve_purchase", {
    p_public_id: input.publicId,
    p_order_number: generateOrderNumber(),
    p_token_hash: hashBuyerToken(buyerToken),
    p_buyer_name: input.buyerName,
    p_buyer_email: input.buyerEmail,
    p_buyer_phone: input.buyerPhone,
    p_address: input.shippingAddress,
    p_delivery_method: input.deliveryMethod,
    p_quote_id: input.quoteId ?? null,
  });
  if (error) throw new ValidationError(error.message);
  if (!data) return null;
  const order = rowToOrder(data as Record<string, unknown>);
  return {
    order,
    buyerToken,
    productTitle: order.items[0].title,
    unitPrice: order.items[0].unitPrice,
    currency: order.currency,
  };
}
/** Loads an order scoped to its seller. Null when it is not theirs. */
export async function findOrderForSeller(
  orderId: string,
  seller: Seller,
): Promise<Order | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .eq("seller_id", seller.id)
    .maybeSingle();

  if (error)
    throw new DatabaseError(`Could not load the order: ${error.message}`);
  return data ? rowToOrder(data as Record<string, unknown>) : null;
}

/** All orders belonging to one seller, newest first. */
export async function listOrdersForSeller(seller: Seller): Promise<Order[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(`Could not list orders: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToOrder);
}

/**
 * Loads an order for a buyer, requiring the opaque buyer token.
 *
 * Returns null when the token does not match, so an unknown id and a wrong
 * token are indistinguishable and order ids cannot be enumerated.
 */
export async function findOrderForBuyer(
  orderId: string,
  buyerToken: string | null | undefined,
): Promise<Order | null> {
  if (!buyerToken) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (error)
    throw new DatabaseError(`Could not load the order: ${error.message}`);
  if (!data) return null;

  const order = rowToOrder(data as Record<string, unknown>);
  if (hashBuyerToken(buyerToken) !== order.buyerTokenHash) return null;

  return order;
}

/** Finds an order by the hash of the buyer token (post-checkout redirect). */
export async function findOrderByTokenHash(
  buyerToken: string,
): Promise<Order | null> {
  if (!buyerToken) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("buyer_token_hash", hashBuyerToken(buyerToken))
    .maybeSingle();

  if (error)
    throw new DatabaseError(`Could not load the order: ${error.message}`);
  return data ? rowToOrder(data as Record<string, unknown>) : null;
}

/**
 * Applies a status transition, enforcing the state machine.
 *
 * Ownership is re-asserted in the WHERE clause, so a foreign id cannot be
 * moved even if a caller passes one.
 */
export async function transitionOrder(
  order: Order,
  to: OrderStatus,
): Promise<Order> {
  assertTransition(order.status, to);

  // Re-applying the current status is a no-op (Stripe redelivers webhooks).
  if (order.status === to) return order;

  const admin = getSupabaseAdmin();
  const patch: Record<string, unknown> = { status: to };
  const now = new Date().toISOString();
  if (to === "COMPLETED") patch.completed_at = now;
  if (to === "CANCELLED") patch.cancelled_at = now;

  const { data, error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", order.id)
    .eq("seller_id", order.sellerId)
    .select("*, order_items(*)")
    .single();

  if (error || !data) {
    throw new DatabaseError(
      `Could not update the order: ${error?.message ?? "unknown"}`,
    );
  }
  return rowToOrder(data as Record<string, unknown>);
}
/**
 * Marks an order paid. ONLY ever called from the verified Stripe webhook.
 *
 * `amountPaid` is what Stripe actually collected. It is compared against the
 * server-computed order amount so a mismatched or tampered session cannot mark
 * an order paid for the wrong figure.
 */
export async function markOrderPaid(
  orderId: string,
  amountPaid: number,
  currency: string,
): Promise<Order | null> {
  const admin = getSupabaseAdmin();

  const { data: order, error } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (error)
    throw new DatabaseError(`Could not load the order: ${error.message}`);
  if (!order) return null;

  const expected = Number(order.amount);
  if (Number.isFinite(amountPaid) && Math.abs(amountPaid - expected) > 0.01) {
    await recordEvent({
      type: "PAYMENT_FAILED",
      orderId,
      sellerId: String(order.seller_id),
      amount: expected,
      currency,
      metadata: { reason: "amount_mismatch" },
    });
    throw new ValidationError("Stripe amount does not match the order amount");
  }

  if (String(order.currency).toLowerCase() !== String(currency).toLowerCase()) {
    throw new ValidationError(
      "Stripe currency does not match the order currency",
    );
  }

  // Idempotent: a redelivered webhook must not change anything.
  if (order.payment_status === "SUCCEEDED") {
    return rowToOrder(order as Record<string, unknown>);
  }

  const { data: updated, error: updateError } = await admin
    .from("orders")
    .update({
      status: "PAID",
      payment_status: "SUCCEEDED",
      paid_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("*, order_items(*)")
    .single();

  if (updateError || !updated) {
    throw new DatabaseError(
      `Could not mark the order paid: ${updateError?.message}`,
    );
  }

  await recordEvent({
    type: "PAYMENT_SUCCEEDED",
    orderId,
    sellerId: String(order.seller_id),
    amount: expected,
    currency: String(order.currency),
    metadata: {},
  });

  return rowToOrder(updated as Record<string, unknown>);
}

/** Records a failed payment without cancelling the order. */
export async function markOrderPaymentFailed(
  orderId: string,
  reason: string,
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("orders")
    .update({ payment_status: "FAILED" })
    .eq("id", orderId)
    .neq("payment_status", "SUCCEEDED");
  await recordEvent({ type: "PAYMENT_FAILED", orderId, metadata: { reason } });
}

/** Cancels an order that never got paid. */
export async function cancelOrder(
  orderId: string,
  reason: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("cancel_unpaid_purchase", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw new DatabaseError("Could not release the stock reservation");
}

/** Updates payment_status without touching the order status. */
export async function setPaymentStatus(
  orderId: string,
  status: PaymentStatus,
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("orders")
    .update({ payment_status: status })
    .eq("id", orderId);
}

/**
 * Maps a `shipments` row to the domain type.
 *
 * Shared by every route that returns a shipment (buyer order view, seller
 * order view, tracking). Duplicating this mapping per route is how a route ends
 * up silently missing a field, so it lives here next to `rowToOrder`.
 */
export function rowToShipment(row: Record<string, unknown>): Shipment {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    provider: row.provider as Shipment["provider"],
    providerShipmentId: (row.provider_shipment_id as string) ?? null,
    trackingNumber: String(row.tracking_number ?? ""),
    serviceCode: String(row.service_code ?? ""),
    carrierName: String(row.carrier_name ?? ""),
    status: row.status as Shipment["status"],
    trackingUrl: (row.tracking_url as string) ?? null,
    labelUrl: (row.label_url as string) ?? null,
    estimatedDelivery: (row.estimated_delivery as string) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/** Maps a `shipments` row (plus its events) to the domain type. */
export function rowToShipmentEvent(
  row: Record<string, unknown>,
): ShipmentEvent {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    status: row.status as ShipmentEvent["status"],
    description: String(row.description ?? ""),
    location: (row.location as string) ?? null,
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Maps a `disputes` row to the domain type. */
export function rowToDispute(row: Record<string, unknown>): Dispute {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    reason: row.reason as Dispute["reason"],
    description: String(row.description ?? ""),
    status: row.status as Dispute["status"],
    resolution: (row.resolution as string) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Loads the shipment, its events and any dispute for one order.
 *
 * The three buyer-facing surfaces (order tracking, checkout success,
 * `checkout/verify`) all need the same three rows, and none of them needs more
 * than a couple of small queries, so the load is centralised here rather than
 * copy-pasted per route.
 */
export async function loadOrderContext(orderId: string): Promise<{
  shipment: Shipment | null;
  shipmentEvents: ShipmentEvent[];
  dispute: Dispute | null;
}> {
  const admin = getSupabaseAdmin();

  const [{ data: shipmentRow }, { data: disputeRow }] = await Promise.all([
    admin.from("shipments").select("*").eq("order_id", orderId).maybeSingle(),
    admin.from("disputes").select("*").eq("order_id", orderId).maybeSingle(),
  ]);

  let shipmentEvents: ShipmentEvent[] = [];
  if (shipmentRow) {
    const { data: eventRows } = await admin
      .from("shipment_events")
      .select("*")
      .eq("shipment_id", shipmentRow.id)
      .order("occurred_at", { ascending: false });

    shipmentEvents = ((eventRows ?? []) as Record<string, unknown>[]).map(
      rowToShipmentEvent,
    );
  }

  return {
    shipment: shipmentRow
      ? rowToShipment(shipmentRow as Record<string, unknown>)
      : null,
    shipmentEvents,
    dispute: disputeRow
      ? rowToDispute(disputeRow as Record<string, unknown>)
      : null,
  };
}

/**
 * Loads an order for the webhook handler, with no seller scoping.
 *
 * Used ONLY after a Stripe event has been signature-verified and its id has
 * been claimed, so it is safe to read any order by id. It performs no writes.
 */
export async function findOrderByIdForWebhook(
  orderId: string,
): Promise<Order | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (error)
    throw new DatabaseError(`Could not load the order: ${error.message}`);
  return data ? rowToOrder(data as Record<string, unknown>) : null;
}

/**
 * Marks an order refunded, after Stripe has already accepted the refund.
 *
 * The Stripe call happens first and this records the outcome, so a failure here
 * can never invent a refund that Stripe never made.
 *
 * Idempotent: an already-refunded order returns unchanged, so a retried
 * webhook cannot move it to a second terminal state.
 */
export async function markOrderRefunded(
  orderId: string,
  refundId: string,
  amount: number,
): Promise<Order | null> {
  const admin = getSupabaseAdmin();

  const { data: existing, error: loadError } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (loadError)
    throw new DatabaseError(`Could not load the order: ${loadError.message}`);
  if (!existing) return null;

  if (existing.payment_status === "REFUNDED") {
    return rowToOrder(existing as Record<string, unknown>);
  }

  const { data: updated, error } = await admin
    .from("orders")
    .update({
      status: "REFUNDED",
      payment_status: "REFUNDED",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("*, order_items(*)")
    .single();

  if (error || !updated) {
    throw new DatabaseError(
      `Could not mark the order refunded: ${error?.message}`,
    );
  }

  await recordEvent({
    type: "REFUND_CREATED",
    orderId,
    sellerId: String(existing.seller_id),
    amount: Number(amount) || Number(existing.amount),
    currency: String(existing.currency),
    metadata: { refund_id: refundId },
  });

  return rowToOrder(updated as Record<string, unknown>);
}

/** Maps an `orders` row (plus nested order_items) to the domain type. */
export function rowToOrder(row: Record<string, unknown>): Order {
  const rawItems = (row.order_items ?? []) as Record<string, unknown>[];

  const items: OrderItem[] = rawItems.map((item) => ({
    id: String(item.id),
    orderId: String(item.order_id),
    productId: String(item.product_id),
    title: String(item.title),
    imageUrl: (item.image_url as string) ?? null,
    unitPrice: Number(item.unit_price ?? 0),
    quantity: Number(item.quantity ?? 1),
    lineTotal: Number(item.line_total ?? 0),
  }));

  return {
    id: String(row.id),
    orderNumber: String(row.order_number),
    sellerId: String(row.seller_id),
    purchaseLinkId: (row.purchase_link_id as string) ?? null,
    buyerName: String(row.buyer_name ?? ""),
    buyerEmail: String(row.buyer_email ?? ""),
    buyerPhone: String(row.buyer_phone ?? ""),
    shippingAddress: (row.shipping_address as Address) ?? fallbackAddress(row),
    deliveryMethod: (row.delivery_method as DeliveryMethod) ?? "shipping",
    amount: Number(row.amount ?? 0),
    refundedAmount: Number(row.refunded_amount ?? 0),
    shippingService: (row.shipping_service as string) ?? null,
    currency: String(row.currency ?? "MXN"),
    platformFee: Number(row.platform_fee ?? 0),
    status: (row.status as OrderStatus) ?? "CREATED",
    paymentStatus: (row.payment_status as PaymentStatus) ?? "PENDING",
    buyerTokenHash: String(row.buyer_token_hash ?? ""),
    items,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    paidAt: (row.paid_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null,
  };
}

function fallbackAddress(row: Record<string, unknown>): Address {
  return {
    fullName: String(row.buyer_name ?? ""),
    phone: String(row.buyer_phone ?? ""),
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  };
}

/** Rounds to 2 decimals without floating-point drift on money. */
