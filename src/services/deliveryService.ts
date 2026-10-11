import type { Order } from "@/domain/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AppError, DatabaseError } from "@/lib/errors";

// Call only AFTER checking the buyer's token or Stripe session binding.
export async function getBuyerDeliveryPin(order: Order): Promise<string | null> {
  if (order.deliveryMethod === "shipping" || order.paymentStatus !== "SUCCEEDED") return null;
  const { data, error } = await getSupabaseAdmin().rpc("ensure_delivery_pin", { p_order_id: order.id });
  if (error) throw new DatabaseError("Could not load delivery confirmation");
  return typeof data === "string" ? data : null;
}

export async function completeCoordinatedDelivery(orderId: string, sellerId: string, pin: string) {
  const { data, error } = await getSupabaseAdmin().rpc("complete_coordinated_delivery", {
    p_order_id: orderId, p_seller_id: sellerId, p_pin: pin,
  });
  if (error) throw new DatabaseError("Could not confirm delivery");
  const result = data as { success: boolean; error?: string; already_completed?: boolean };
  if (!result.success) {
    if (result.error === "PIN_LOCKED") throw new AppError("RATE_LIMITED", "Demasiados intentos. Espera 15 minutos.", 429);
    if (result.error === "INVALID_PIN") throw new AppError("VALIDATION_ERROR", "El NIP no es correcto.", 400);
    if (result.error === "ORDER_NOT_FOUND") throw new AppError("ORDER_NOT_FOUND", "Pedido no encontrado.", 404);
    throw new AppError("CONFLICT", "Este pedido no permite confirmar una entrega coordinada.", 409);
  }
  return result;
}
