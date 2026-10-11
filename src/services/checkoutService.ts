import Stripe from "stripe";
import { validateShippingQuote } from "@/services/shippingQuoteService";
import { requestRefund } from "@/services/refundService";
import { getStripe, isStripeConfigured, isStripeTestMode } from "@/lib/stripe";
import { resolvePublicPurchaseLink } from "@/repositories/purchaseLinkRepository";
import {
  createOrderFromPurchaseLink,
  findOrderByIdForWebhook,
  cancelOrder,
} from "@/repositories/orderRepository";
import {
  findOrderIdByCheckoutSession,
  upsertPayment,
} from "@/repositories/paymentRepository";
import { recordEvent } from "@/services/orderService";
import type { DeliveryMethod } from "@/domain/types";
import type { Order } from "@/domain/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const PLATFORM_FEE_RATE = 0.05;
export const DEFAULT_CURRENCY = "MXN";

export class CheckoutError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400, message?: string) {
    super(message || code);
    this.name = "CheckoutError";
    this.code = code;
    this.status = status;
  }
}

export interface CheckoutInput {
  publicId: string;
  quoteId?: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  deliveryMethod: DeliveryMethod;
  address: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country?: string;
    notes?: string;
  };
}

function requiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validates and normalises client input. The client can only send the link id
 * plus buyer data: prices, amounts, fees and statuses are always resolved
 * server-side from the stored product.
 */
export function validateCheckoutInput(payload: unknown): CheckoutInput {
  const body = (payload ?? {}) as Record<string, unknown>;
  const address = (body.address ?? {}) as Record<string, unknown>;

  const publicId = requiredString(body.publicId);
  const buyerName = requiredString(body.buyerName);
  const buyerEmail = requiredString(body.buyerEmail);
  const buyerPhone = requiredString(body.buyerPhone);
  const street = requiredString(address.street);
  const city = requiredString(address.city);
  const postalCode = requiredString(address.postalCode);
  const deliveryMethod = requiredString(body.deliveryMethod) || "shipping";

  if (!publicId) throw new CheckoutError("missing_public_id", 400);
  if (
    requiredString(body.quoteId) &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requiredString(body.quoteId),
    )
  )
    throw new CheckoutError("invalid_shipping_quote", 400);
  if (!buyerName) throw new CheckoutError("missing_buyer_name", 400);
  if (!EMAIL_RE.test(buyerEmail))
    throw new CheckoutError("invalid_buyer_email", 400);
  if (!buyerPhone) throw new CheckoutError("missing_buyer_phone", 400);
  if (!street || !city || !postalCode)
    throw new CheckoutError("missing_shipping_address", 400);
  if (!["shipping", "local_delivery", "meetup"].includes(deliveryMethod)) {
    throw new CheckoutError("invalid_delivery_method", 400);
  }

  return {
    publicId: publicId.toUpperCase(),
    ...(requiredString(body.quoteId)
      ? { quoteId: requiredString(body.quoteId) }
      : {}),
    buyerName,
    buyerEmail,
    buyerPhone,
    deliveryMethod: deliveryMethod as DeliveryMethod,
    address: {
      street,
      city,
      state: requiredString(address.state) || city,
      postalCode,
      country: requiredString(address.country) || "Mexico",
      notes: requiredString(address.notes) || undefined,
    },
  };
}

export function computePlatformFee(amount: number): number {
  return Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
}

export function toStripeAmount(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Resolves the purchase link and its product/seller straight from Supabase.
 *
 * There is no in-memory fallback: an unknown, deactivated, expired,
 * out-of-stock or unpriced link is a typed error, so a buyer can never be shown
 * a product that the database does not actually contain.
 */
async function resolveLink(publicId: string) {
  const resolved = await resolvePublicPurchaseLink(publicId);
  if (!resolved) throw new CheckoutError("link_not_found", 404);

  const { product } = resolved;
  if (!product.isActive) throw new CheckoutError("product_inactive", 409);
  if (product.stock <= 0) throw new CheckoutError("product_out_of_stock", 409);

  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0)
    throw new CheckoutError("invalid_price", 409);

  return resolved;
}

function resolveAppOrigin(explicit?: string): string {
  const origin = explicit || process.env.NEXT_PUBLIC_APP_URL || "";
  return origin.replace(/\/$/, "");
}

export interface ReconcileResult {
  order: Order | null;
  changed: boolean;
  reason: string;
}

function extractPaymentIntentId(
  session: Stripe.Checkout.Session,
): string | undefined {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
}

/** Defence in depth: never mark an order paid for an amount the server did not calculate. */
export function orderMatchesSessionAmount(
  order: Order,
  session: Stripe.Checkout.Session,
): boolean {
  if (session.amount_total == null) return true;
  const sameCurrency =
    (session.currency || order.currency).toLowerCase() ===
    order.currency.toLowerCase();
  return sameCurrency && toStripeAmount(order.amount) === session.amount_total;
}

/**
 * Applies the authoritative Stripe Checkout Session state to the RouteFlow
 * order. Idempotent, so it is safe to call from both the webhook and the
 * success page verification endpoint.
 *
 * IMPORTANT: this REFLECTS Stripe state, it never grants it. The only writer
 * that moves an order to PAID is the signature-verified webhook
 * (`/api/webhooks/stripe`); this function runs afterwards purely to repair
 * state when the webhook has not been delivered yet, and it re-validates the
 * amount before it does.
 */
export async function reconcileCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<ReconcileResult> {
  const orderId =
    session.metadata?.order_id ||
    session.client_reference_id ||
    (await findOrderIdByCheckoutSession(session.id)) ||
    undefined;

  let order = orderId ? await findOrderByIdForWebhook(orderId) : null;
  if (!order) {
    const foundId = await findOrderIdByCheckoutSession(session.id);
    order = foundId ? await findOrderByIdForWebhook(foundId) : null;
  }
  if (!order) return { order: null, changed: false, reason: "order_not_found" };

  const paymentIntentId = extractPaymentIntentId(session) ?? null;

  // Record the session/intent binding before anything else, so a later
  // reconciliation (or a support investigation) can follow the money.
  await upsertPayment({
    orderId: order.id,
    checkoutSessionId: session.id,
    paymentIntentId,
    amount: order.amount,
    currency: order.currency,
    status: order.paymentStatus === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
  });

  if (session.payment_status === "paid") {
    if (!orderMatchesSessionAmount(order, session)) {
      await recordEvent({
        type: "PAYMENT_FAILED",
        orderId: order.id,
        sellerId: order.sellerId,
        amount: order.amount,
        currency: order.currency,
        metadata: { reason: "amount_mismatch", stripe_session_id: session.id },
      });
      return { order, changed: false, reason: "amount_mismatch" };
    }

    const amountPaid =
      session.amount_total != null ? session.amount_total / 100 : order.amount;
    const currency = String(session.currency ?? order.currency).toUpperCase();

    if (order.paymentStatus === "SUCCEEDED") {
      return { order, changed: false, reason: "already_paid" };
    }

    const { data: completion, error: completionError } =
      await getSupabaseAdmin().rpc("complete_payment_and_mark_order_paid", {
        p_order_id: order.id,
        p_checkout_session_id: session.id,
        p_payment_intent_id: paymentIntentId,
        p_amount_paid: amountPaid,
        p_currency: currency,
        p_payer_id: null,
      });
    if (completionError || !completion?.success)
      throw new CheckoutError("payment_reconciliation_failed", 503);
    const paidOrder = await findOrderByIdForWebhook(order.id);
    return {
      order: paidOrder ?? order,
      changed: Boolean(paidOrder),
      reason: paidOrder ? "paid" : "already_paid",
    };
  }

  if (session.status === "expired") {
    if (order.paymentStatus === "SUCCEEDED")
      return { order, changed: false, reason: "already_paid" };
    await cancelOrder(order.id, "checkout_expired");
    const cancelled = await findOrderByIdForWebhook(order.id);
    return { order: cancelled ?? order, changed: true, reason: "expired" };
  }

  return {
    order,
    changed: false,
    reason: `pending:${session.payment_status || session.status}`,
  };
}

/**
 * Server-side verification used by the success page when the webhook has not
 * been delivered yet (local dev without `stripe listen`, network retries, ...).
 * The truth always comes from the Stripe API, never from the browser.
 */
export async function verifyCheckoutSessionById(sessionId: string) {
  if (!isStripeConfigured())
    throw new CheckoutError("stripe_not_configured", 503);
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const result = await reconcileCheckoutSession(session);
  return {
    order: result.order,
    changed: result.changed,
    reason: result.reason,
    paymentStatus: session.payment_status,
    sessionStatus: session.status,
    testMode: isStripeTestMode(),
  };
}

/**
 * Refunds through the Stripe API (never simulated) and only then updates the order.
 *
 * Callers must have already authorized the seller against the order (see
 * `assertSellerOwns`): this function looks the order up by id alone, so it is
 * only safe behind that check.
 */
export async function refundOrderWithStripe(orderId: string, amount?: number, requestKey?: string) {
  return requestRefund(orderId, amount, requestKey);
}

export interface CreatedCheckout {
  order: Order;
  url: string;
  sessionId: string;
  /**
   * Plaintext buyer token, returned ONCE at checkout.
   *
   * Only its SHA-256 hash is stored, so this is the sole opportunity to hand the
   * buyer the credential their tracking link needs.
   */
  buyerToken: string;
  testMode: boolean;
}

/**
 * Creates the RouteFlow order (PAYMENT_PENDING) and the real Stripe Checkout
 * Session. The buyer is then redirected to Stripe to enter card details: the
 * order is never marked as paid here.
 */
export async function createCheckoutSession(
  input: CheckoutInput,
  appOrigin?: string,
): Promise<CreatedCheckout> {
  if (!isStripeConfigured())
    throw new CheckoutError("stripe_not_configured", 503);

  const { product, seller, link } = await resolveLink(input.publicId);
  if (!product.deliveryOptions.includes(input.deliveryMethod)) {
    throw new CheckoutError("delivery_method_not_available", 400);
  }
  await validateShippingQuote(input, product.id);

  // Every money and ownership field is re-derived inside the repository from
  // the stored product. The caller cannot influence price, fee, seller or stock.
  const created = await createOrderFromPurchaseLink({
    publicId: input.publicId,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    shippingAddress: {
      fullName: input.buyerName,
      phone: input.buyerPhone,
      street: input.address.street,
      city: input.address.city,
      state: input.address.state || input.address.city,
      postalCode: input.address.postalCode,
      country: input.address.country || "Mexico",
      notes: input.address.notes,
    },
    deliveryMethod: input.deliveryMethod,
    quoteId: input.quoteId,
  });

  if (!created) throw new CheckoutError("link_not_found", 404);

  const order = created.order;
  const productAmount = created.unitPrice;
  const amount = order.amount;
  const shippingAmount = Math.round((amount - productAmount) * 100) / 100;
  const currency = (created.currency || DEFAULT_CURRENCY).toLowerCase();
  const origin = resolveAppOrigin(appOrigin);
  const metadata = {
    order_id: order.id,
    order_number: order.orderNumber,
    public_id: input.publicId,
    product_id: product.id,
    seller_id: seller.id,
    delivery_method: input.deliveryMethod,
    platform_fee: String(order.platformFee ?? computePlatformFee(amount)),
  };

  // Amount is server-controlled: unit_amount comes from the stored product price.
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: toStripeAmount(productAmount),
              product_data: {
                name: created.productTitle,
                description: `RouteFlow ${order.orderNumber}`,
                images: product.images?.slice(0, 1),
              },
            },
          },
          ...(shippingAmount > 0
            ? [
                {
                  quantity: 1,
                  price_data: {
                    currency,
                    unit_amount: toStripeAmount(shippingAmount),
                    product_data: { name: "Envío FedEx" },
                  },
                },
              ]
            : []),
        ],
        customer_email: input.buyerEmail,
        client_reference_id: order.id,
        metadata,
        payment_intent_data: {
          capture_method: "automatic",
          transfer_group: `rf_order_${order.id}`,
          description: `RouteFlow ${order.orderNumber} · ${product.title}`,
          metadata,
        },
        success_url: `${origin}/checkout/success?order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout/${input.publicId}?payment=cancelled&order_id=${order.id}`,
      },
      { idempotencyKey: `rf_checkout_${order.id}` },
    );
  } catch (error) {
    // A timeout/5xx can mean Stripe created the session. Keep its reservation
    // until the worker reconciles Stripe; releasing it here could oversell.
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.statusCode === 400
    ) {
      await cancelOrder(order.id, "stripe_session_creation_rejected");
    }
    throw error;
  }

  if (!session.url) {
    await getStripe().checkout.sessions.expire(session.id);
    await cancelOrder(order.id, "stripe_session_without_url");
    throw new CheckoutError("stripe_session_failed", 502);
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  // Persist the session binding BEFORE redirecting the buyer, so the success
  // page can always resolve session -> order even if this process dies here.
  await upsertPayment({
    orderId: order.id,
    checkoutSessionId: session.id,
    paymentIntentId: paymentIntentId ?? null,
    amount,
    currency: currency.toUpperCase(),
    status: "PENDING",
  });

  // A real funnel needs both stages. `CHECKOUT_STARTED` is recorded here, when
  // the buyer actually commits to paying, so the analytics funnel measures real
  // behaviour instead of leaving the middle stage permanently at zero.
  await Promise.all([
    recordEvent({
      type: "CHECKOUT_STARTED",
      orderId: order.id,
      sellerId: seller.id,
      purchaseLinkId: link.id,
      productId: product.id,
      amount,
      currency: currency.toUpperCase(),
      metadata: {},
    }),
    recordEvent({
      type: "PAYMENT_STARTED",
      orderId: order.id,
      sellerId: seller.id,
      purchaseLinkId: link.id,
      productId: product.id,
      amount,
      currency: currency.toUpperCase(),
      metadata: { stripe_session_id: session.id },
    }),
  ]);

  return {
    order,
    url: session.url,
    sessionId: session.id,
    // Returned ONCE. The plaintext is never stored, so the buyer tracking link
    // is the only way back to this order.
    buyerToken: created.buyerToken,
    testMode: isStripeTestMode(),
  };
}
