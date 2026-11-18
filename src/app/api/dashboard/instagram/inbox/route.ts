import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  decryptInstagramToken,
  instagramReplyAllowed,
  instagramReplyKey,
  sendInstagramText,
} from "@/services/instagramMessaging";

const privateHeaders = { "Cache-Control": "private, no-store" };
const idPattern = /^\d{1,32}$/;

async function sellerConnection(sellerId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("seller_instagram_connections")
    .select("id, username, instagram_account_id, token_ciphertext")
    .eq("seller_id", sellerId)
    .not("connected_at", "is", null)
    .maybeSingle();
  if (error) throw new Error("Instagram connection lookup failed");
  return data as {
    id: string;
    username: string;
    instagram_account_id: string;
    token_ciphertext: string | null;
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
      const { data, error } = await admin.rpc("instagram_inbox_threads", {
        p_connection: connection.id,
        p_before: before,
        p_sender: key,
      });
      if (error) throw error;
      return NextResponse.json(
        {
          username: connection.username,
          repliesEnabled: Boolean(connection.token_ciphertext && instagramReplyKey()),
          threads: (data ?? []).slice(0, 30),
          hasMore: (data ?? []).length > 30,
        },
        { headers: privateHeaders },
      );
    }
    const [{ data, error }, latest] = await Promise.all([
      admin.rpc("instagram_inbox_messages", {
        p_connection: connection.id,
        p_sender: sender,
        p_before: before,
        p_key: key,
      }),
      admin
        .from("seller_instagram_messages")
        .select("sent_at")
        .eq("connection_id", connection.id)
        .eq("sender_id", sender)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (error || latest.error) throw new Error("Instagram conversation lookup failed");
    return NextResponse.json(
      {
        messages: (data ?? []).slice(0, 50),
        hasMore: (data ?? []).length > 50,
        replyAllowed: Boolean(latest.data && instagramReplyAllowed(latest.data.sent_at)),
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
  const raw = await request.text();
  const body =
    raw.length <= 8000
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : null;
  if (
    !body ||
    typeof body.senderId !== "string" ||
    !idPattern.test(body.senderId) ||
    typeof body.text !== "string" ||
    !body.text.trim() ||
    body.text.trim().length > 1000 ||
    body.text.includes("\0") ||
    typeof body.clientId !== "string" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.clientId)
  ) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "Escribe un mensaje de hasta 1,000 caracteres",
      400,
    );
  }
  try {
    const connection = await sellerConnection(seller.value.id);
    if (!connection?.token_ciphertext || !instagramReplyKey())
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Vuelve a conectar Instagram desde Ajustes para habilitar respuestas",
        409,
      );
    const admin = getSupabaseAdmin();
    const text = body.text.trim();
    const { data: previous, error: previousError } = await admin
      .from("seller_instagram_replies")
      .select("recipient_id,message_text,status")
      .eq("connection_id", connection.id)
      .eq("client_id", body.clientId)
      .maybeSingle();
    if (previousError) throw previousError;
    if (previous) {
      if (previous.recipient_id !== body.senderId || previous.message_text !== text)
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
    const { data: latest, error: latestError } = await admin
      .from("seller_instagram_messages")
      .select("sent_at")
      .eq("connection_id", connection.id)
      .eq("sender_id", body.senderId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (!latest || !instagramReplyAllowed(latest.sent_at))
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Solo puedes responder durante las 24 horas posteriores al último mensaje recibido",
        409,
      );
    let token: string;
    try {
      token = decryptInstagramToken(connection.token_ciphertext, connection.id);
    } catch {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Renueva la autorización de Instagram desde Ajustes para responder",
        409,
      );
    }
    const { error: reserveError } = await admin.from("seller_instagram_replies").insert({
      connection_id: connection.id,
      client_id: body.clientId,
      recipient_id: body.senderId,
      message_text: text,
    });
    if (reserveError?.code === "23505")
      return NextResponse.json({ status: "pending", duplicate: true }, { headers: privateHeaders });
    if (reserveError) throw reserveError;
    try {
      const messageId = await sendInstagramText(
        connection.instagram_account_id,
        body.senderId,
        text,
        token,
      );
      const { error } = await admin
        .from("seller_instagram_replies")
        .update({ status: "sent", meta_message_id: messageId })
        .eq("connection_id", connection.id)
        .eq("client_id", body.clientId);
      if (error) throw error;
      return NextResponse.json({ status: "sent" }, { headers: privateHeaders });
    } catch {
      // A timeout can happen after Meta accepted the message. Never automatically resend it.
      await admin
        .from("seller_instagram_replies")
        .update({ status: "unknown" })
        .eq("connection_id", connection.id)
        .eq("client_id", body.clientId);
      return NextResponse.json({ status: "unknown" }, { headers: privateHeaders });
    }
  } catch {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No se pudo enviar. Tu borrador sigue disponible.",
      500,
    );
  }
}
