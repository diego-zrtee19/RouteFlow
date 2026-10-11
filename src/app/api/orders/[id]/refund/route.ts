import { NextRequest, NextResponse } from "next/server";
import { requireSeller, assertSellerOwns } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import {
  CheckoutError,
  refundOrderWithStripe,
} from "@/services/checkoutService";
import { findOrderForSeller } from "@/services/orderService";
import { StripeNotConfiguredError } from "@/lib/stripe";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * POST /api/orders/[id]/refund  { amount? }
 *
 * Seller-only. The refund is created through the Stripe API and the RouteFlow
 * order is only updated after Stripe accepts it. Idempotent: a repeated request
 * returns the existing refund instead of refunding twice.
 *
 * SECURITY: `requireSeller()` replaces the old `resolveSellerFromSession()`,
 * which fell back to the demo seller. Ownership is checked with
 * `assertSellerOwns`, so seller A cannot refund seller B's order.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  const body = (await req.json().catch(() => ({}))) as {
    amount?: unknown;
    requestKey?: unknown;
  };
  const requestKey =
    req.headers.get("idempotency-key") ??
    (typeof body.requestKey === "string" ? body.requestKey : undefined);
  if (
    requestKey &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requestKey,
    )
  )
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "Clave de idempotencia inválida",
      400,
    );
  const amount = body.amount != null ? Number(body.amount) : undefined;

  if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
    return apiErrorResponse("VALIDATION_ERROR", "Invalid amount", 400);
  }

  try {
    const order = await findOrderForSeller(id, auth.value);
    if (!order) {
      return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    }

    const owns = assertSellerOwns(auth.value, order.sellerId);
    if (!owns.ok) {
      return apiErrorResponse(owns.code, "Not your order", owns.status);
    }

    if (amount != null && amount > order.amount) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Amount exceeds the order total",
        400,
      );
    }

    const result = await refundOrderWithStripe(order.id, amount, requestKey);
    return NextResponse.json({
      ok: true,
      alreadyRefunded: result.alreadyRefunded,
      refundId: result.refundId,
      pending: result.pending,
      refundedAmount: result.order.refundedAmount ?? 0,
      orderNumber: result.order.orderNumber,
    });
  } catch (error) {
    if (error instanceof AppError)
      return apiErrorResponse(error.code, error.message, error.status);
    if (error instanceof CheckoutError) {
      return apiErrorResponse("CONFLICT", error.message, error.status);
    }
    if (error instanceof StripeNotConfiguredError) {
      return apiErrorResponse(
        "NOT_CONFIGURED",
        "Stripe is not configured",
        503,
      );
    }
    return apiErrorResponse("INTERNAL_ERROR", "Refund failed", 500, error);
  }
}
