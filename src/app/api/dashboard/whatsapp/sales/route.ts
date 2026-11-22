import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { validateCartLines } from "@/domain/catalogCart";
import { loadCartProfile } from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
import { readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";

import { whatsappSenderPattern } from "@/domain/whatsapp";

const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

async function conversation(sellerId: string, sender: string) {
  if (!whatsappSenderPattern.test(sender)) return null;
  const db = getSupabaseAdmin();
  const connection = await db
    .from("seller_whatsapp_connections")
    .select("id")
    .eq("seller_id", sellerId)
    .not("connected_at", "is", null)
    .maybeSingle();
  if (connection.error) throw connection.error;
  if (!connection.data) return null;
  const message = await db
    .from("seller_whatsapp_messages")
    .select("message_id")
    .eq("connection_id", connection.data.id)
    .eq("sender_id", sender)
    .limit(1)
    .maybeSingle();
  if (message.error) throw message.error;
  return message.data ? (connection.data.id as string) : null;
}

export async function GET(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  const sender = new URL(request.url).searchParams.get("sender") ?? "";
  try {
    const connectionId = await conversation(seller.value.id, sender);
    if (!connectionId) return apiErrorResponse("NOT_FOUND", "Conversación no disponible", 404);
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("instagram_conversation_sales")
      .select(
        "id,public_id,line_snapshot,subtotal,currency,order_id,created_at,expires_at,shared_at,cancelled_at",
      )
      .eq("seller_id", seller.value.id)
      .eq("whatsapp_connection_id", connectionId)
      .eq("channel", "whatsapp")
      .eq("sender_id", sender)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const orderIds = (data ?? []).flatMap((sale) => (sale.order_id ? [sale.order_id] : []));
    const orders = orderIds.length
      ? await db
          .from("orders")
          .select("id,order_number,status,payment_status,delivery_method")
          .eq("seller_id", seller.value.id)
          .in("id", orderIds)
      : { data: [], error: null };
    if (orders.error) throw orders.error;
    const shipments = orderIds.length
      ? await db
          .from("shipments")
          .select("order_id,tracking_number")
          .in(
            "order_id",
            (orders.data ?? []).map((order) => order.id),
          )
      : { data: [], error: null };
    if (shipments.error) throw shipments.error;
    const origin = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
      /\/$/,
      "",
    );
    return NextResponse.json(
      {
        sales: (data ?? []).map((sale) => {
          const order = orders.data?.find((item) => item.id === sale.order_id);
          return {
            id: sale.id,
            publicId: sale.public_id,
            url: `${origin}/comprar/${sale.public_id}`,
            lines: sale.line_snapshot,
            subtotal: Number(sale.subtotal),
            currency: sale.currency,
            createdAt: sale.created_at,
            expiresAt: sale.expires_at,
            sharedAt: sale.shared_at,
            cancelledAt: sale.cancelled_at,
            order: order
              ? {
                  id: order.id,
                  number: order.order_number,
                  status: order.status,
                  paymentStatus: order.payment_status,
                  deliveryMethod: order.delivery_method,
                  trackingNumber:
                    shipments.data?.find((s) => s.order_id === order.id)?.tracking_number ?? null,
                }
              : null,
          };
        }),
      },
      { headers },
    );
  } catch {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No se pudieron cargar las compras de esta conversación",
      500,
    );
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
    const sender = typeof body.sender === "string" ? body.sender : "";
    const connectionId = await conversation(seller.value.id, sender);
    if (!connectionId) return apiErrorResponse("NOT_FOUND", "Conversación no disponible", 404);
    const db = getSupabaseAdmin();
    if (body.action === "cancel") {
      if (typeof body.id !== "string" || !uuid.test(body.id))
        return apiErrorResponse("VALIDATION_ERROR", "Enlace inválido", 400);
      const { data, error } = await db
        .from("instagram_conversation_sales")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("seller_id", seller.value.id)
        .eq("whatsapp_connection_id", connectionId)
        .eq("channel", "whatsapp")
        .eq("sender_id", sender)
        .is("order_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return apiErrorResponse(
          "CONFLICT",
          "El enlace ya tiene un pedido. Gestiona ese pedido para cancelarlo.",
          409,
        );
      return NextResponse.json({ cancelled: true }, { headers });
    }
    if (typeof body.clientId !== "string" || !uuid.test(body.clientId))
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Actualiza la selección antes de preparar el enlace",
        400,
      );
    let items;
    try {
      items = validateCartLines(body.items);
    } catch (error) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        error instanceof Error ? error.message : "Selecciona productos válidos",
        400,
      );
    }
    const existing = await db
      .from("instagram_conversation_sales")
      .select("id,items,whatsapp_connection_id,sender_id,public_id,channel")
      .eq("seller_id", seller.value.id)
      .eq("client_id", body.clientId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (
        existing.data.whatsapp_connection_id !== connectionId ||
        existing.data.channel !== "whatsapp" ||
        existing.data.sender_id !== sender ||
        JSON.stringify(validateCartLines(existing.data.items)) !== JSON.stringify(items)
      )
        return apiErrorResponse("CONFLICT", "Ese intento pertenece a otra selección", 409);
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
    if (profile.deliveryOptions.length === 1 && profile.deliveryOptions[0] === "shipping") {
      await loadCartProfile(seller.value.storeUsername, items, "shipping", undefined, true);
    }
    const result = await db
      .from("instagram_conversation_sales")
      .insert({
        public_id: randomBytes(32).toString("hex"),
        seller_id: seller.value.id,
        whatsapp_connection_id: connectionId,
        channel: "whatsapp",
        sender_id: sender,
        client_id: body.clientId,
        items,
        line_snapshot: profile.items,
        subtotal: profile.subtotal,
        currency: profile.currency,
      })
      .select("id,public_id")
      .single();
    if (result.error?.code === "23505")
      return apiErrorResponse(
        "CONFLICT",
        "Este intento ya se está guardando. Actualiza la conversación.",
        409,
      );
    if (result.error || !result.data) throw new Error("Sale creation failed");
    return NextResponse.json({ id: result.data.id, publicId: result.data.public_id }, { headers });
  } catch (error) {
    const guarded = publicRequestError(error);
    if (guarded) return guarded;
    if (error instanceof CheckoutError)
      return apiErrorResponse("VALIDATION_ERROR", error.message, error.status);
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No se pudo preparar el enlace. La selección se conserva.",
      500,
    );
  }
}
