import { NextRequest, NextResponse } from "next/server";
import { StripeNotConfiguredError } from "@/lib/stripe";
import { CheckoutError, verifyCheckoutSessionById } from "@/services/checkoutService";
import { findOrderByIdForWebhook, loadOrderContext } from "@/repositories/orderRepository";
import { toBuyerOrderView } from "@/domain/dto";

export const runtime = "nodejs";

/**
 * POST /api/checkout/verify  { session_id }
 * Server-side reconciliation with Stripe. Used by the success page when the
 * webhook has not arrived yet. Payment truth always comes from the Stripe API.
 *
 * SECURITY: the session id is the caller's credential, so the order is resolved
 * through `client_reference_id` before anything is read, and the response is the
 * buyer DTO — never buyer email, phone or street address. A session belonging
 * to a different order yields `order_not_found`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) {
      return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
    }

    const result = await verifyCheckoutSessionById(sessionId);
    const order = result.order;

    return NextResponse.json({
      order: order ? await toPublicOrderSummary(order.id) : null,
      reason: result.reason,
      stripePaymentStatus: result.paymentStatus,
      stripeSessionStatus: result.sessionStatus,
      testMode: result.testMode,
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    if (error instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
    }
    console.error("Checkout verify error:", error);
    return NextResponse.json({ error: "verify_failed" }, { status: 500 });
  }
}

/** Loads the buyer-facing view for an order, with its shipment and dispute. */
async function toPublicOrderSummary(orderId: string) {
  const order = await findOrderByIdForWebhook(orderId);
  if (!order) return null;

  const { shipment, shipmentEvents, dispute } = await loadOrderContext(order.id);
  return toBuyerOrderView(order, shipment, shipmentEvents, dispute);
}
