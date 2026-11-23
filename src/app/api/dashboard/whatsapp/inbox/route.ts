import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  decryptWhatsAppToken,
  whatsappKeyConfigured,
  whatsappPhoneAllowed,
  sendWhatsAppText,
  WhatsAppProviderRejection,
} from "@/services/whatsappConnection";
import { readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { whatsappReplyAllowed, whatsappSenderPattern } from "@/domain/whatsapp";

const privateHeaders = { "Cache-Control": "private, no-store" };
const idPattern = whatsappSenderPattern;

async function sellerConnection(sellerId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("seller_whatsapp_connections")
    .select("id, display_phone_number, phone_number_id, token_ciphertext, token_expires_at")
    .eq("seller_id", sellerId)
    .not("connected_at", "is", null)
    .maybeSingle();
  if (error) throw new Error("WhatsApp connection lookup failed");
  return data as {
    id: string;
    display_phone_number: string;
    phone_number_id: string;
    token_ciphertext: string | null;
    token_expires_at: string | null;
  } | null;
}

export async function GET(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  const params = new URL(request.url).searchParams;
  const sender = params.get("sender");
  const before = params.get("before");
  const key = params.get("key") ?? "";
  if (
    (sender && !idPattern.test(sender)) ||
    (before && (!Number.isFinite(Date.parse(before)) || !key || key.length > 600))
  ) {
    return apiErrorResponse("VALIDATION_ERROR", "Conversación o página inválida", 400);
  }
  try {
    const connection = await sellerConnection(seller.value.id);
    if (!connection)
      return NextResponse.json(
        { username: null, repliesEnabled: false, threads: [], hasMore: false },
        { headers: privateHeaders },
      );
    const admin = getSupabaseAdmin();
    if (!sender) {
      const { data, error } = await admin.rpc("whatsapp_inbox_threads", {
        p_connection: connection.id,
        p_before: before,
        p_sender: key,
      });
      if (error) throw error;
      return NextResponse.json(
        {
          username: connection.display_phone_number,
          repliesEnabled: Boolean(
            connection.token_ciphertext &&
            whatsappKeyConfigured() &&
            whatsappPhoneAllowed(connection.phone_number_id) &&
            (!connection.token_expires_at || Date.parse(connection.token_expires_at) > Date.now()),
          ),
          threads: (data ?? []).slice(0, 30),
          hasMore: (data ?? []).length > 30,
        },
        { headers: privateHeaders },
      );
    }
    const [{ data, error }, latest] = await Promise.all([
      admin.rpc("whatsapp_inbox_messages", {
        p_connection: connection.id,
        p_sender: sender,
        p_before: before,
        p_key: key,
      }),
      admin
        .from("seller_whatsapp_messages")
        .select("sent_at")
        .eq("connection_id", connection.id)
        .eq("sender_id", sender)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (error || latest.error) throw new Error("WhatsApp conversation lookup failed");
    return NextResponse.json(
      {
        messages: (data ?? []).slice(0, 50),
        hasMore: (data ?? []).length > 50,
        replyAllowed: Boolean(latest.data && whatsappReplyAllowed(latest.data.sent_at)),
        lastIncomingAt: latest.data?.sent_at ?? null,
      },
      { headers: privateHeaders },
    );
  } catch {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No se pudieron cargar los mensajes. Intenta de nuevo.",
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
  let body;
  try {
    body = await readPublicJson(request);
  } catch (error) {
    return (
      publicRequestError(error) ?? apiErrorResponse("VALIDATION_ERROR", "Solicitud inválida", 400)
    );
  }
  if (
    !body ||
    typeof body.senderId !== "string" ||
    !idPattern.test(body.senderId) ||
    typeof body.text !== "string" ||
    !body.text.trim() ||
    body.text.trim().length > 1000 ||
    body.text.includes("\0") ||
    typeof body.clientId !== "string" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.clientId) ||
    (body.saleId !== undefined &&
      (typeof body.saleId !== "string" ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.saleId)))
  ) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "Escribe un mensaje de hasta 1,000 caracteres",
      400,
    );
  }
  try {
    const connection = await sellerConnection(seller.value.id);
    if (
      !connection?.token_ciphertext ||
      !whatsappKeyConfigured() ||
      !whatsappPhoneAllowed(connection.phone_number_id) ||
      (connection.token_expires_at && Date.parse(connection.token_expires_at) <= Date.now())
    )
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Vuelve a conectar WhatsApp desde Ajustes para habilitar respuestas",
        409,
      );
    const admin = getSupabaseAdmin();
    const text = body.text.trim();
    const { data: previous, error: previousError } = await admin
      .from("seller_whatsapp_replies")
      .select("recipient_id,message_text,status,sale_id")
      .eq("connection_id", connection.id)
      .eq("client_id", body.clientId)
      .maybeSingle();
    if (previousError) throw previousError;
    if (previous) {
      if (
        previous.recipient_id !== body.senderId ||
        previous.message_text !== text ||
        (previous.sale_id ?? null) !== (body.saleId ?? null)
      )
        return apiErrorResponse(
          "VALIDATION_ERROR",
          "Esta solicitud ya pertenece a otro mensaje",
          409,
        );
      return NextResponse.json(
        { status: previous.status, duplicate: true },
        { headers: privateHeaders },
      );
    }
    if (body.saleId) {
      const sale = await admin
        .from("instagram_conversation_sales")
        .select("public_id,cancelled_at,expires_at,order_id")
        .eq("id", body.saleId)
        .eq("seller_id", seller.value.id)
        .eq("whatsapp_connection_id", connection.id)
        .eq("channel", "whatsapp")
        .eq("sender_id", body.senderId)
        .maybeSingle();
      if (sale.error) throw sale.error;
      const origin = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
        /\/$/,
        "",
      );
      if (
        !sale.data ||
        sale.data.cancelled_at ||
        sale.data.order_id ||
        Date.parse(sale.data.expires_at) <= Date.now() ||
        !text.includes(`${origin}/comprar/${sale.data.public_id}`)
      )
        return apiErrorResponse(
          "VALIDATION_ERROR",
          "Prepara un enlace válido para esta conversación e inclúyelo en la respuesta",
          409,
        );
    }
    const { data: latest, error: latestError } = await admin
      .from("seller_whatsapp_messages")
      .select("sent_at")
      .eq("connection_id", connection.id)
      .eq("sender_id", body.senderId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (!latest || !whatsappReplyAllowed(latest.sent_at))
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Solo puedes responder durante las 24 horas posteriores al último mensaje recibido",
        409,
      );
    let token: string;
    try {
      token = decryptWhatsAppToken(connection.token_ciphertext, connection.id);
    } catch {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Renueva la autorización de WhatsApp desde Ajustes para responder",
        409,
      );
    }
    const { error: reserveError } = await admin.from("seller_whatsapp_replies").insert({
      connection_id: connection.id,
      client_id: body.clientId,
      recipient_id: body.senderId,
      message_text: text,
      ...(body.saleId ? { sale_id: body.saleId } : {}),
    });
    if (reserveError?.code === "23505")
      return NextResponse.json({ status: "pending", duplicate: true }, { headers: privateHeaders });
    if (reserveError) throw reserveError;
    try {
      const messageId = await sendWhatsAppText(
        connection.phone_number_id,
        body.senderId,
        text,
        token,
        body.clientId,
      );
      const { error } = await admin
        .from("seller_whatsapp_replies")
        .update({ status: "sent", meta_message_id: messageId })
        .eq("connection_id", connection.id)
        .eq("client_id", body.clientId)
        .eq("status", "pending");
      if (error) throw error;
      return NextResponse.json({ status: "sent" }, { headers: privateHeaders });
    } catch (error) {
      // A structured 4xx rejection proves no acceptance; timeouts/5xx remain uncertain.
      const rejected = error instanceof WhatsAppProviderRejection;
      await admin
        .from("seller_whatsapp_replies")
        .update({ status: rejected ? "failed" : "unknown" })
        .eq("connection_id", connection.id)
        .eq("client_id", body.clientId)
        .eq("status", "pending");
      return NextResponse.json(
        {
          status: rejected ? "failed" : "unknown",
          ...(rejected ? { providerCode: error.providerCode } : {}),
        },
        { headers: privateHeaders },
      );
    }
  } catch {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No se pudo enviar. Tu borrador sigue disponible.",
      500,
    );
  }
}
