import type { NextRequest } from "next/server";
import Stripe from "stripe";
import {syncRefund} from "@/services/refundService";
import { saveConnectAccount } from "@/services/connectService";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  claimStripeEvent,
  markEventProcessed,
  markEventFailed,
} from "@/services/webhookIdempotency";
import {
  markOrderPaymentFailed,
  cancelOrder,
  findOrderByIdForWebhook,
} from "@/repositories/orderRepository";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe
 *
 * THE ONLY SOURCE OF PAYMENT TRUTH.
 *
 * An order becomes PAID here and nowhere else. The browser returning from
 * Stripe Checkout proves nothing: `checkout/session/verify` re-reads Stripe but
 * only reflects state, it never grants it.
 *
 * V2 RELIABILITY IMPROVEMENTS:
 * - Event lifecycle: RECEIVED → PROCESSING → PROCESSED / FAILED
 * - Processing lease with expiration for crash recovery
 * - Atomic payment + order transition via PostgreSQL RPC
 * - Event only marked PROCESSED after successful business logic
 * - Failed events can be reclaimed and retried
 * - Stale worker protection via attempt tracking
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "missing_signature" }, 400);
  }

  if (!isStripeConfigured()) {
    return json({ error: "stripe_not_configured" }, 503);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || isPlaceholderSecret(webhookSecret)) {
    console.error(
      "[routeflow] STRIPE_WEBHOOK_SECRET is not configured. Webhook rejected; " +
        "no order can be marked paid. Run `stripe listen` and set the printed secret."
    );
    return json({ error: "webhook_not_configured" }, 503);
  }

  // The raw body is required: the signature covers the exact bytes sent.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[routeflow] webhook signature verification failed:", err);
    return json({ error: "invalid_signature" }, 400);
  }

  // Atomic claim with recoverable lifecycle
  const claim = await claimStripeEvent(event.id, event.type, JSON.parse(body));

  if (!claim.claimed) {
    if (claim.outcome === "already_processed") {
      // Event already successfully processed - acknowledge without side effects
      return json({ received: true, already_processed: true }, 200);
    }
    if (claim.outcome === "already_claimed") {
      // Another worker is processing - return 5XX so Stripe retries
      // This ensures we don't acknowledge an unfinished event
      return json({ received: true, already_claimed: true }, 500);
    }
    // Cannot guarantee idempotency - fail loudly so Stripe retries
    return json({ error: "idempotency_unavailable", reason: claim.error }, 503);
  }

  try {
    await handleEvent(event, claim.attemptCount || 1);

    // Only mark as PROCESSED after successful business logic
    const marked = await markEventProcessed(event.id, claim.attemptCount || 1);
    if (!marked.success) {
      console.error(`[routeflow] failed to mark event ${event.id} as processed: ${marked.error}`);
      // Lease lost - return 5XX so Stripe retries
      return json({ received: true, lease_lost: true }, 500);
    }

    return json({ received: true }, 200);
  } catch (err) {
    console.error(`[routeflow] webhook handler failed for ${event.id}:`, err);

    // Mark event as FAILED so it can be reclaimed and retried
    const failed = await markEventFailed(
      event.id,
      claim.attemptCount || 1,
      err instanceof Error ? err.message : String(err)
    );

    if (!failed.success) {
      console.error(`[routeflow] failed to mark event ${event.id} as failed: ${failed.error}`);
    }

    // 5XX so Stripe retries - event is now in FAILED state and can be reclaimed
    return json({ error: "handler_failed" }, 500);
  }
}

async function handleEvent(event: Stripe.Event, _attemptCount: number): Promise<void> {
  switch (event.type) {
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
      await syncRefund(event.data.object as Stripe.Refund);
      return;
    case "account.updated":
      await saveConnectAccount(event.data.object as Stripe.Account);
      return;
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id ?? session.client_reference_id ?? null;
      
      if (!orderId) {
        console.error(
          `[routeflow] checkout.session.completed missing order_id for session ${session.id}`
        );
        throw new Error("Missing order_id in session metadata");
      }

      const order = await findOrderByIdForWebhook(orderId);
      if (!order) {
        console.error(
          `[routeflow] checkout.session.completed unknown order ${orderId} for session ${session.id}`
        );
        throw new Error(`Order not found: ${orderId}`);
      }

      // Only mark as paid if Stripe confirms payment is actually paid
      // Asynchronous payment methods have payment_status === "unpaid" at this stage
      if (session.payment_status !== "paid") {
        console.log(`[routeflow] checkout.session.completed payment not paid (status: ${session.payment_status}) for order ${orderId}`);
        // Do not mark order PAID for unpaid/pending payments
        // The order will be marked PAID when async_payment_succeeded fires
        return;
      }

      // Validate Stripe provides required amount and currency BEFORE doing anything else.
      // No server-side fallback is safe: the server amount is only authoritative for
      // orders that Stripe has actually paid, and it never decides that a payment happened.
      if (session.amount_total == null || session.amount_total <= 0) {
        console.error(
          `[routeflow] checkout.session.completed missing amount_total for order ${orderId} session ${session.id}`
        );
        throw new Error("Stripe amount_total is required");
      }

      if (!session.currency) {
        console.error(
          `[routeflow] checkout.session.completed missing currency for order ${orderId} session ${session.id}`
        );
        throw new Error("Stripe currency is required");
      }

      // Stripe has actually succeeded the payment here, so we can rely on the
      // exact Stripe amount/currency. Asynchronous payments are legitimately paid.
      const amountPaid = session.amount_total / 100;
      const currency = session.currency.toUpperCase();
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

      await completePayment(orderId, session.id, paymentIntentId, amountPaid, currency);
      return;
    }

    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id ?? session.client_reference_id ?? null;
      
      if (!orderId) {
        console.error(
          `[routeflow] checkout.session.async_payment_succeeded missing order_id for session ${session.id}`
        );
        throw new Error("Missing order_id in session metadata");
      }

      const order = await findOrderByIdForWebhook(orderId);
      if (!order) {
        console.error(
          `[routeflow] checkout.session.async_payment_succeeded unknown order ${orderId} for session ${session.id}`
        );
        throw new Error(`Order not found: ${orderId}`);
      }

      // Validate Stripe provides required amount and currency BEFORE doing anything else.
      // No server-side fallback is safe for the same reason as above.
      if (session.amount_total == null || session.amount_total <= 0) {
        console.error(
          `[routeflow] checkout.session.async_payment_succeeded missing amount_total for order ${orderId} session ${session.id}`
        );
        throw new Error("Stripe amount_total is required");
      }

      if (!session.currency) {
        console.error(
          `[routeflow] checkout.session.async_payment_succeeded missing currency for order ${orderId} session ${session.id}`
        );
        throw new Error("Stripe currency is required");
      }

      // Stripe has actually succeeded the payment here, so we can rely on the
      // exact Stripe amount/currency. Asynchronous payments are legitimately paid.
      const amountPaid = session.amount_total / 100;
      const currency = session.currency.toUpperCase();
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

      await completePayment(orderId, session.id, paymentIntentId, amountPaid, currency);
      return;
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id ?? session.client_reference_id ?? null;
      if (!orderId) return;
      await markOrderPaymentFailed(orderId, "async_payment_failed");
      return;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id ?? session.client_reference_id ?? null;
      if (!orderId) return;
      await cancelOrder(orderId, "checkout_expired");
      return;
    }

    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata?.order_id ?? null;
      if (orderId) await markOrderPaymentFailed(orderId, event.type);
      return;
    }

    default:
      // Unhandled types are acknowledged so Stripe stops retrying them.
      return;
  }
}

/**
 * Server-side, exact Stripe amount/currency enforcement.
 *
 * This enforces:
 *  - Stripe actually reported a payment_success and a usable amount/currency,
 *    with no fallback to order.amount / order.currency (which a stale or wrong
 *    session could otherwise smuggle through).
 *  - MXN is handled as cents (10000 = 100.00 MXN, the standard Stripe sub-unit),
 *    so the amount conversion is a clean / 100 for every currency.
 *  - The RPC is the only thing that may mark the order PAID, and it re-validates
 *    amount, currency, session ownership, and order state atomically.
 */
async function completePayment(
  orderId: string,
  checkoutSessionId: string,
  paymentIntentId: string | null,
  amountPaid: number,
  currency: string
): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin.rpc("complete_payment_and_mark_order_paid", {
    p_order_id: orderId,
    p_checkout_session_id: checkoutSessionId,
    p_payment_intent_id: paymentIntentId,
    p_amount_paid: amountPaid,
    p_currency: currency,
    p_payer_id: null, // Clerk user ID not available in webhook
  });

  if (error) {
    console.error(
      `[routeflow] atomic payment completion failed for order ${orderId}:`,
      error
    );
    throw new Error(`Payment completion failed: ${error.message}`);
  }

  const result = data as Record<string, unknown>;
  if (!result.success) {
    console.error(
      `[routeflow] payment validation failed for order ${orderId}:`,
      result
    );
    throw new Error(`Payment validation failed: ${result.error}`);
  }
}

/**
 * Rejects the placeholder value that shipped in `.env.example`, so a copied
 * config cannot silently accept unsigned webhooks.
 */
function isPlaceholderSecret(secret: string): boolean {
  return /localdev|your_|^xxx/i.test(secret);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
