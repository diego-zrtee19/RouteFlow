import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { CheckoutError } from "@/services/checkoutService";
import { validateCartLines, type CartLine } from "@/domain/catalogCart";

export const conversationPublicId = /^[a-f0-9]{64}$/;
export type ConversationSaleSelection = {
  username: string;
  items: CartLine[];
  conversationSaleId?: string;
};

export async function readConversationSale(publicId: string) {
  if (!conversationPublicId.test(publicId))
    throw new CheckoutError("invalid_link", 404, "Enlace no disponible");
  const { data, error } = await getSupabaseAdmin()
    .from("instagram_conversation_sales")
    .select("id,seller_id,items,line_snapshot,subtotal,currency,cancelled_at,expires_at,order_id")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error)
    throw new CheckoutError(
      "sale_unavailable",
      503,
      "No se pudo consultar la compra. Intenta de nuevo.",
    );
  if (!data || data.cancelled_at || Date.parse(data.expires_at) <= Date.now())
    throw new CheckoutError(
      "sale_closed",
      410,
      "Este enlace venció o fue desactivado. Pide uno nuevo al vendedor.",
    );
  const seller = await getSupabaseAdmin()
    .from("sellers")
    .select("store_username,store_name")
    .eq("id", data.seller_id)
    .single();
  if (seller.error || !seller.data)
    throw new CheckoutError("invalid_link", 404, "Enlace no disponible");
  return {
    ...data,
    username: seller.data.store_username as string,
    storeName: seller.data.store_name as string,
  };
}

export async function resolveConversationSelection(
  body: Record<string, unknown>,
): Promise<ConversationSaleSelection | null> {
  if (body.salePublicId === undefined) return null;
  if (typeof body.salePublicId !== "string")
    throw new CheckoutError("invalid_link", 404, "Enlace no disponible");
  const sale = await readConversationSale(body.salePublicId);
  // Products, quantities and seller come exclusively from the saved offer.
  return {
    username: sale.username,
    items: validateCartLines(sale.items),
    conversationSaleId: sale.id as string,
  };
}
