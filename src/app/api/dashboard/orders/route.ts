import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { listOrdersForSeller, findOrderForSeller } from "@/services/orderService";
import { toSellerOrderView } from "@/domain/dto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Order, Shipment } from "@/domain/types";

export const runtime = "nodejs";

/**
 * Maps a `shipments` row to the domain type.
 *
 * `toSellerOrderView` only surfaces a subset of these fields, but a complete
 * `Shipment` is built here so no `as never` cast is needed at the call site.
 */
function rowToShipment(row: Record<string, unknown>): Shipment {
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

/**
 * Loads the shipment for each of the given orders, in one query.
 *
 * The seller detail screen needs the tracking number and carrier, which are NOT
 * on the `orders` row. Fetching them per order would be an N+1 query.
 */
async function shipmentsForOrders(orderIds: string[]) {
  const shipments = new Map<string, Shipment>();

  if (orderIds.length === 0) return shipments;

  const admin = getSupabaseAdmin();
  const { data } = await admin.from("shipments").select("*").in("order_id", orderIds);

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    shipments.set(String(row.order_id), rowToShipment(row));
  }

  return shipments;
}

/**
 * GET /api/dashboard/orders[?id=...]
 *
 * Returns only the signed-in seller's orders, read from Supabase.
 *
 * SECURITY: previously used `resolveSellerFromSession()`, which fell back to
 * `dataStore.sellers[0]`. Any authenticated user therefore received the demo
 * seller's orders, including other buyers' email, phone and address.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  try {
    const id = req.nextUrl.searchParams.get("id");

    if (id) {
      // findOrderForSeller is scoped by seller_id in the query itself, so an id
      // belonging to another seller is simply not found.
      const order = await findOrderForSeller(id, auth.value);
      if (!order) {
        return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
      }

      const shipments = await shipmentsForOrders([order.id]);
      const { data: settlement, error: settlementError } = await getSupabaseAdmin().from("orders").select("settlement_status").eq("id", order.id).eq("seller_id", auth.value.id).single();
      if (settlementError) throw settlementError;
      return NextResponse.json({
        order: { ...toSellerOrderView(order, shipments.get(order.id) ?? null), finance: { platformFee: order.platformFee, settlementStatus: settlement?.settlement_status ?? "PENDING" } },
      });
    }

    const orders: Order[] = await listOrdersForSeller(auth.value);
    const shipments = await shipmentsForOrders(orders.map((order) => order.id));

    return NextResponse.json({
      sellerId: auth.value.id,
      orders: orders.map((order) => {
        const view = toSellerOrderView(order, shipments.get(order.id) ?? null);
        return {
          ...view,
          // The seller list renders the product title/image, which lives on
          // order_items rather than on the order row itself.
          product: order.items[0]
            ? {
                id: order.items[0].productId,
                title: order.items[0].title,
                images: order.items[0].imageUrl ? [order.items[0].imageUrl] : [],
              }
            : null,
        };
      }),
    });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "Could not load orders", 500, error);
  }
}
