import { NextRequest, NextResponse } from "next/server";
import { findOrderForBuyer, transitionOrder } from "@/services/orderService";
import { apiErrorResponse } from "@/lib/apiResponse";

export const runtime = "nodejs";

/**
 * POST /api/orders/[id]/confirm
 *
 * Buyer confirms receipt.
 *
 * SECURITY: this endpoint previously accepted the order id as proof of
 * ownership, which was an IDOR — anyone who learned or guessed an id could
 * release a buyer's funds. The buyer must now present the opaque token issued
 * at checkout. An unknown id and a wrong token are indistinguishable (404), so
 * the endpoint does not confirm that an order exists.
 *
 * The token is accepted from the `x-buyer-token` header or a `token` body
 * field, so it can be sent as a header (preferred; headers are not logged in
 * URLs) by the buyer's tracking page.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const presentedToken =
    req.headers.get("x-buyer-token") ??
    (typeof body?.token === "string" ? body.token : null);

  if (!presentedToken) {
    return apiErrorResponse("UNAUTHENTICATED", "Buyer token required", 401);
  }

  try {
    const order = await findOrderForBuyer(id, presentedToken);

    // Same response for "no such order" and "wrong token": do not leak existence.
    if (!order) {
      return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    }

    if (order.paymentStatus !== "SUCCEEDED") {
      return apiErrorResponse("CONFLICT", "Order is not paid", 409);
    }

    // transitionOrder enforces the state machine, so a paid-but-unshipped
    // order cannot jump straight to COMPLETED.
    await transitionOrder(order, "BUYER_CONFIRMED");
    const completed = await transitionOrder(
      { ...order, status: "BUYER_CONFIRMED" },
      "COMPLETED"
    );

    return NextResponse.json({ ok: true, orderNumber: completed.orderNumber });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "Could not confirm delivery", 500, error);
  }
}
