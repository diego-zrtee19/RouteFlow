import { NextRequest, NextResponse } from "next/server";
import { findOrderForBuyer } from "@/services/orderService";
import { apiErrorResponse } from "@/lib/apiResponse";

export const runtime = "nodejs";

const ALLOWED_REASONS: readonly string[] = [
  "product_not_received",
  "wrong_product",
  "damaged_product",
  "other",
];

/**
 * POST /api/orders/[id]/dispute
 *
 * Opens a buyer-protection dispute on a paid order.
 *
 * SECURITY: previously any request bearing a valid order id could open a
 * dispute against someone else's order. The buyer token is now mandatory.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    reason?: unknown;
    description?: unknown;
    token?: unknown;
  };

  const presentedToken =
    req.headers.get("x-buyer-token") ??
    (typeof body?.token === "string" ? body.token : null);

  if (!presentedToken) {
    return apiErrorResponse("UNAUTHENTICATED", "Buyer token required", 401);
  }

  const reason = typeof body?.reason === "string" ? body.reason : "";
  const description =
    typeof body?.description === "string"
      ? body.description.trim().slice(0, 1000)
      : "";

  if (!ALLOWED_REASONS.includes(reason)) {
    return apiErrorResponse("VALIDATION_ERROR", "Invalid dispute reason", 400);
  }
  if (description.length < 3) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "A description is required",
      400,
    );
  }

  try {
    const order = await findOrderForBuyer(id, presentedToken);
    if (!order) {
      // Indistinguishable from an unknown id, on purpose.
      return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    }

    if (order.paymentStatus !== "SUCCEEDED") {
      return apiErrorResponse("CONFLICT", "Order is not paid", 409);
    }
    if (order.status === "REFUNDED" || order.status === "CANCELLED") {
      return apiErrorResponse(
        "CONFLICT",
        "Order no longer accepts a dispute",
        409,
      );
    }

    const { getSupabaseAdmin } = await import("@/lib/supabaseAdmin");
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc("open_order_dispute", {
      p_order_id: order.id,
      p_reason: reason,
      p_description: description,
    });
    if (error)
      return apiErrorResponse(
        "CONFLICT",
        "El pedido no admite una nueva disputa",
        409,
      );
    return NextResponse.json({ ok: true, disputeId: data });
  } catch (error) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "Could not open the dispute",
      500,
      error,
    );
  }
}
