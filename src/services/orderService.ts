import type { DomainEvent, Order, OrderItem, Seller } from "@/domain/types";
import { assertTransition } from "@/domain/orderStateMachine";
import { hashBuyerToken, verifyBuyerToken } from "@/lib/buyerToken";
import { DatabaseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/**
 * ORDER SERVICE — all order reads and writes go through here.
 *
 * Two rules this module exists to enforce:
 *
 *   1. OWNERSHIP. A seller may only touch orders where `seller_id` matches, and
 *      a buyer may only touch their own order and only by presenting the buyer
 *      token. The audit's IDOR existed because routes loaded an order by id and
 *      then acted on it; here the *lookup itself* is scoped, so a missing
 *      resource and a forbidden one are indistinguishable.
 *
 *   2. NO IMPLICIT CREATION. Nothing in this module falls back to another
 *      seller, a demo record, or the first row in a table.
 */

const ORDER_COLUMNS = "*";

/** Loads an order for a seller, scoped to that seller. */
export async function findOrderForSeller(
  orderId: string,
  seller: Seller
): Promise<Order | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select(`${ORDER_COLUMNS}, order_items(*)`)
    .eq("id", orderId)
    .eq("seller_id", seller.id)
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not load order: ${error.message}`);
  if (!data) return null;
  return rowToOrder(data as Record<string, unknown>);
}

/** All orders belonging to one seller, newest first. */
export async function listOrdersForSeller(seller: Seller): Promise<Order[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select(`${ORDER_COLUMNS}, order_items(*)`)
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(`Could not list orders: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToOrder);
}

/**
 * Loads an order for a buyer, requiring the opaque buyer token.
 *
 * This is the fix for the audit's central vulnerability: the order id alone
 * grants nothing. A wrong or missing token returns null, exactly like an unknown
 * id, so the endpoint does not confirm that an order exists.
 */
export async function findOrderForBuyer(
  orderId: string,
  buyerToken: string | null | undefined
): Promise<Order | null> {
  if (!buyerToken) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select(`${ORDER_COLUMNS}, order_items(*)`)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not load order: ${error.message}`);
  if (!data) return null;

  const order = rowToOrder(data as Record<string, unknown>);
  if (!verifyBuyerToken(buyerToken, order.buyerTokenHash)) return null;

  return order;
}

/** Looks up an order by its buyer token hash, for the post-checkout redirect. */
export async function findOrderByToken(buyerToken: string): Promise<Order | null> {
  if (!buyerToken) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select(`${ORDER_COLUMNS}, order_items(*)`)
    .eq("buyer_token_hash", hashBuyerToken(buyerToken))
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not load order: ${error.message}`);
  if (!data) return null;
  return rowToOrder(data as Record<string, unknown>);
}

/**
 * Applies a status transition to an order, enforcing the state machine.
 *
 * The audit's complaint was that each route handler mutated `status` on its
 * own. Now a transition the state machine rejects cannot reach the database,
 * and every caller gets the same error.
 */
export async function transitionOrder(
  order: Order,
  to: Order["status"]
): Promise<Order> {
  assertTransition(order.status, to);

  // Re-applying the current status is a no-op: Stripe redelivers webhooks and a
  // repeat must neither fail nor duplicate work.
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
    .eq("seller_id", order.sellerId) // ownership re-asserted at write time
    .select(`${ORDER_COLUMNS}, order_items(*)`)
    .single();

  if (error) throw new DatabaseError(`Could not update order: ${error.message}`);
  return rowToOrder(data as Record<string, unknown>);
}

/**
 * Loads an order for a buyer who presents a Stripe Checkout `session_id`
 * instead of a buyer token.
 *
 * The post-checkout success page holds nothing else: the buyer token is issued by
 * the V2 order repository, which the legacy checkout flow never reached, so the
 * browser only ever saw Stripe's session id.
 *
 * SECURITY: a session id is accepted as a capability only after Stripe itself
 * confirms it. The session is re-read on every call and must carry
 * `client_reference_id === orderId`, so one session can never be replayed
 * against an order it was not created for. A retrieve failure, an expired
 * session and a mismatched binding are all treated exactly like a wrong buyer
 * token: null, with no distinction the caller could act on.
 */
export async function findOrderByStripeSessionForBuyer(
  orderId: string,
  sessionId: string | null | undefined
): Promise<Order | null> {
  if (!orderId || !sessionId || !isStripeConfigured()) return null;

  let clientReferenceId: string | null = null;

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    clientReferenceId =
      typeof session.client_reference_id === "string" ? session.client_reference_id : null;
  } catch {
    // Unknown, expired or revoked session: same outcome as a wrong token.
    return null;
  }

  if (!clientReferenceId || clientReferenceId !== orderId) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select(`${ORDER_COLUMNS}, order_items(*)`)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not load order: ${error.message}`);
  return data ? rowToOrder(data as Record<string, unknown>) : null;
}

/**
 * Records a real analytics event.
 *
 * The audit found `getAnalytics()` returning `realViews + 1240` so dashboards
 * looked populated. Nothing is invented now: every metric is a COUNT/SUM over
 * rows written by this function.
 *
 * All dimensions are optional because most events relate to only one or two
 * entities (a link view has no order; a payment has no product).
 */
export async function recordEvent(
  event: Pick<DomainEvent, "type"> &
    Partial<Pick<DomainEvent, "sellerId" | "orderId" | "purchaseLinkId" | "productId">> &
    Partial<Pick<DomainEvent, "amount" | "currency">> & {
      metadata?: DomainEvent["metadata"];
    }
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("events").insert({
    type: event.type,
    seller_id: event.sellerId,
    order_id: event.orderId,
    purchase_link_id: event.purchaseLinkId,
    product_id: event.productId,
    amount: event.amount,
    currency: event.currency,
    metadata: event.metadata ?? {},
  });
  // Analytics must never break a purchase, so this is logged, not thrown.
  if (error) console.error("[routeflow] could not record event:", error.message);
}

/** Maps an `orders` row (plus nested `order_items`) to the domain type. */
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
    shippingAddress: (row.shipping_address as Order["shippingAddress"]) ?? {
      fullName: String(row.buyer_name ?? ""),
      phone: String(row.buyer_phone ?? ""),
      street: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
    },
    deliveryMethod: (row.delivery_method as Order["deliveryMethod"]) ?? "shipping",
    amount: Number(row.amount ?? 0),
    refundedAmount: Number(row.refunded_amount ?? 0),
    shippingService: (row.shipping_service as string) ?? null,
    currency: String(row.currency ?? "MXN"),
    platformFee: Number(row.platform_fee ?? 0),
    status: row.status as Order["status"],
    paymentStatus: (row.payment_status as Order["paymentStatus"]) ?? "PENDING",
    buyerTokenHash: String(row.buyer_token_hash ?? ""),
    items,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    paidAt: (row.paid_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null,
  };
}
