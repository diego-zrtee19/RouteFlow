import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import {
  StripeNotConfiguredError,
  getStripePublishableKey,
  isStripeConfigured,
  isStripeTestMode,
} from "@/lib/stripe";
import {
  CheckoutError,
  createCheckoutSession,
  validateCheckoutInput,
} from "@/services/checkoutService";

export const runtime = "nodejs";

/**
 * GET /api/checkout/session
 * Lets the checkout page render the delivery screen truthfully: whether real
 * payments are configured, and whether the account is in test mode.
 * Only the publishable key is ever exposed.
 */
export async function GET() {
  return NextResponse.json({
    configured: isStripeConfigured(),
    testMode: isStripeTestMode(),
    publishableKey: getStripePublishableKey(),
  });
}

/**
 * POST /api/checkout/session
 * Creates the RouteFlow order (PAYMENT_PENDING) plus a real Stripe Checkout
 * Session and returns the hosted Stripe URL. Prices are resolved server-side
 * from the stored product, never from the request body.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const input = validateCheckoutInput(payload);
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    // Reads the link and product from Supabase and writes the order,
    // order_item and pending payment rows. No in-memory store is involved, so
    // a cold start or a redeploy cannot lose a created order.
    const result = await createCheckoutSession(input, origin);

    return NextResponse.json({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      sessionId: result.sessionId,
      url: result.url,
      buyerToken: result.buyerToken,
      testMode: result.testMode,
    });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.code, code: error.code, message: error.message },
        { status: error.status },
      );
    if (error instanceof CheckoutError) {
      return NextResponse.json(
        { error: error.code, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { error: "stripe_not_configured", code: "stripe_not_configured" },
        { status: 503 },
      );
    }

    console.error("Checkout session error:", error);
    return NextResponse.json(
      {
        error: "checkout_failed",
        code: "checkout_failed",
        ...(process.env.NODE_ENV !== "production"
          ? { detail: error instanceof Error ? error.message : String(error) }
          : {}),
      },
      { status: 500 },
    );
  }
}
