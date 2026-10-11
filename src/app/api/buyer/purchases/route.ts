import { NextRequest, NextResponse } from "next/server";
import { getVerifiedBuyerEmails, buyerEmailFilter } from "@/lib/buyerIdentity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";

export async function GET(req: NextRequest) {
  const emails = await getVerifiedBuyerEmails();
  if (!emails.length) return apiErrorResponse("UNAUTHENTICATED", "Inicia sesión con el correo verificado que usaste al comprar", 401);
  const page = Math.max(0, Math.min(10000, Number(req.nextUrl.searchParams.get("page")) || 0));
  if (!Number.isInteger(page)) return apiErrorResponse("VALIDATION_ERROR", "Página inválida", 400);
  try {
    const db = getSupabaseAdmin();
    const result = await db.from("orders")
      .select("id,order_number,status,payment_status,amount,currency,created_at,seller_id,delivery_method,order_items(title,quantity,image_url)")
      .or(buyerEmailFilter(emails)).order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * 20, page * 20 + 20);
    if (result.error) throw new Error("Database unavailable");
    const rows = result.data ?? [];
    const sellerIds = [...new Set(rows.slice(0, 20).map(row => row.seller_id))];
    const sellers = sellerIds.length ? await db.from("sellers").select("id,store_name").in("id", sellerIds) : { data: [], error: null };
    if (sellers.error) throw new Error("Database unavailable");
    return NextResponse.json({ purchases: rows.slice(0, 20).map(row => ({ id: row.id, orderNumber: row.order_number, status: row.status, paymentStatus: row.payment_status, amount: row.amount, currency: row.currency, createdAt: row.created_at, deliveryMethod: row.delivery_method, sellerName: sellers.data?.find(seller => seller.id === row.seller_id)?.store_name ?? "Vendedor", items: row.order_items })), hasMore: rows.length > 20 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiErrorResponse("INTERNAL_ERROR", "No se pudieron cargar tus compras", 500, error); }
}
