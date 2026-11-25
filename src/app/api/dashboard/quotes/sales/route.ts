import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
import { readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { validateCartLines } from "@/domain/catalogCart";
import { loadCartProfile } from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export async function GET(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("instagram_conversation_sales")
      .select(
        "id,public_id,line_snapshot,subtotal,currency,order_id,created_at,expires_at,shared_at,cancelled_at",
      )
      .eq("seller_id", seller.value.id)
      .eq("sale_source", "quote")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const ids = (data ?? []).flatMap((q) => (q.order_id ? [q.order_id] : []));
    const orders = ids.length
      ? await db
          .from("orders")
          .select("id,order_number,status,payment_status,delivery_method")
          .eq("seller_id", seller.value.id)
          .in("id", ids)
      : { data: [], error: null };
    if (orders.error) throw orders.error;
    const origin = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
      /\/$/,
      "",
    );
    return NextResponse.json(
      {
        sales: (data ?? []).map((q) => {
          const order = orders.data?.find((o) => o.id === q.order_id);
          return {
            id: q.id,
            publicId: q.public_id,
            url: origin + "/comprar/" + q.public_id,
            lines: q.line_snapshot,
            subtotal: Number(q.subtotal),
            currency: q.currency,
            createdAt: q.created_at,
            expiresAt: q.expires_at,
            sharedAt: q.shared_at,
            cancelledAt: q.cancelled_at,
            order: order
              ? {
                  id: order.id,
                  number: order.order_number,
                  status: order.status,
                  paymentStatus: order.payment_status,
                  deliveryMethod: order.delivery_method,
                  trackingNumber: null,
                }
              : null,
          };
        }),
      },
      { headers },
    );
  } catch {
    return apiErrorResponse("INTERNAL_ERROR", "No pudimos consultar tus cotizaciones", 500);
  }
}
export async function POST(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return apiErrorResponse("FORBIDDEN", "Solicitud no permitida", 403);
  try {
    const body = await readPublicJson(request);
    const db = getSupabaseAdmin();
    if (body.action === "cancel") {
      if (typeof body.id !== "string" || !uuid.test(body.id))
        return apiErrorResponse("VALIDATION_ERROR", "Cotización inválida", 400);
      const { data, error } = await db
        .from("instagram_conversation_sales")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("seller_id", seller.value.id)
        .eq("sale_source", "quote")
        .is("order_id", null)
        .is("cancelled_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return apiErrorResponse(
          "CONFLICT",
          "La cotización ya tiene pedido o no está disponible",
          409,
        );
      return NextResponse.json({ cancelled: true }, { headers });
    }
    if (typeof body.clientId !== "string" || !uuid.test(body.clientId))
      return apiErrorResponse("VALIDATION_ERROR", "Actualiza la selección", 400);
    const items = validateCartLines(body.items);
    const existing = await db
      .from("instagram_conversation_sales")
      .select("id,public_id,items,sale_source")
      .eq("seller_id", seller.value.id)
      .eq("client_id", body.clientId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (
        existing.data.sale_source !== "quote" ||
        JSON.stringify(validateCartLines(existing.data.items)) !== JSON.stringify(items)
      )
        return apiErrorResponse("CONFLICT", "El intento pertenece a otra selección", 409);
      return NextResponse.json(
        { id: existing.data.id, publicId: existing.data.public_id },
        { headers },
      );
    }
    const profile = await loadCartProfile(
      seller.value.storeUsername,
      items,
      undefined,
      undefined,
      true,
    );
    if (profile.deliveryOptions.length === 1 && profile.deliveryOptions[0] === "shipping")
      await loadCartProfile(seller.value.storeUsername, items, "shipping", undefined, true);
    const { data, error } = await db
      .from("instagram_conversation_sales")
      .insert({
        public_id: randomBytes(32).toString("hex"),
        seller_id: seller.value.id,
        connection_id: null,
        sender_id: "standalone-quote",
        sale_source: "quote",
        client_id: body.clientId,
        items,
        line_snapshot: profile.items,
        subtotal: profile.subtotal,
        currency: profile.currency,
      })
      .select("id,public_id")
      .single();
    if (error?.code === "23505")
      return apiErrorResponse(
        "CONFLICT",
        "Este intento ya se está guardando; actualiza la lista",
        409,
      );
    if (error || !data) throw error;
    return NextResponse.json({ id: data.id, publicId: data.public_id }, { headers });
  } catch (error) {
    const guarded = publicRequestError(error);
    if (guarded) return guarded;
    if (error instanceof CheckoutError)
      return apiErrorResponse("VALIDATION_ERROR", error.message, error.status);
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "No se pudo preparar la cotización. Revisa artículos, cantidades y disponibilidad.",
      400,
    );
  }
}
