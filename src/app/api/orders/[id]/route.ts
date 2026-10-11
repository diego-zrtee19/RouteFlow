import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiResponse";
import {
  findOrderForBuyer,
  findOrderByStripeSessionForBuyer,
} from "@/services/orderService";
import { loadOrderContext } from "@/repositories/orderRepository";
import { toBuyerOrderView } from "@/domain/dto";
import type { Order } from "@/domain/types";
import { getBuyerDeliveryPin } from "@/services/deliveryService";
import { findOrderForBuyerIdentity, getVerifiedBuyerEmails } from "@/lib/buyerIdentity";

export const runtime = "nodejs";

/**
 * GET /api/orders/[id]
 *
 * The order id alone grants nothing: the buyer must also present the opaque
 * token issued at checkout, in the `x-buyer-token` header (preferred) or a
 * `token` query parameter.
 *
 * SECURITY: previously this route called `dataStore.toPublicOrderPayload(id)`
 * with no credential at all, so anyone who learned an order id read the order.
 * `findOrderForBuyer` returns null for both an unknown id and a wrong token, so
 * the endpoint does not confirm that an order exists.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const presentedToken =
    req.headers.get("x-buyer-token") ?? req.nextUrl.searchParams.get("token");
  const sessionId = req.nextUrl.searchParams.get("session_id");

  // The buyer's tracking link carries the buyer token. The post-checkout
  // success page, however, only holds Stripe's `session_id`, because the V1
  // checkout flow never issued a buyer token to the browser. A Stripe session
  // is itself an unguessable capability, and it is bound to exactly one order
  // via `client_reference_id`, so it is accepted as an equivalent credential —
  // but ONLY after Stripe itself confirms the binding.
  if (!presentedToken && !sessionId && !(await getVerifiedBuyerEmails()).length) {
    return apiErrorResponse("UNAUTHENTICATED", "Buyer token required", 401);
  }

  let order: Order | null = null;

  try {
    if (presentedToken) {
      order = await findOrderForBuyer(id, presentedToken);
    } else if (sessionId) {
      order = await findOrderByStripeSessionForBuyer(id, sessionId);
    } else {
      order = await findOrderForBuyerIdentity(id);
    }

    // Indistinguishable from an unknown id, on purpose.
    if (!order) {
      return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    }

    const { shipment, shipmentEvents, dispute } = await loadOrderContext(order.id);

    // `toBuyerOrderView` never emits buyerEmail, buyerPhone, the street address,
    // a Stripe id or the token hash.
    return NextResponse.json({
      order: { ...toBuyerOrderView(order, shipment, shipmentEvents, dispute), deliveryPin: await getBuyerDeliveryPin(order) },
    }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "Could not load the order", 500, error);
  }
}
