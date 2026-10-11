import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { findOrderForSeller } from "@/repositories/orderRepository";
import { findShipmentByOrder } from "@/repositories/shipmentRepository";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const seller = await requireSeller();
  if (!seller.ok) return apiErrorResponse(seller.code, "Seller access required", seller.status);
  const { id } = await params;
  const order = await findOrderForSeller(id, seller.value);
  if (!order) return apiErrorResponse("ORDER_NOT_FOUND", "Pedido no encontrado", 404);
  const shipment = await findShipmentByOrder(id);
  if (!shipment?.labelUrl) return apiErrorResponse("NOT_FOUND", "Etiqueta no disponible", 404);
  if (shipment.labelUrl.startsWith("https://")) return NextResponse.redirect(shipment.labelUrl);
  const { data, error } = await getSupabaseAdmin().storage.from("shipping-labels").download(`${id}.pdf`);
  if (error || !data) return apiErrorResponse("NOT_FOUND", "Etiqueta no disponible", 404);
  return new Response(await data.arrayBuffer(), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${order.orderNumber}.pdf"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
