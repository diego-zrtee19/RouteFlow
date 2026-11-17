import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { instagramConfig } from "@/services/instagramConnection";

export const runtime = "nodejs";

function matchesVerifyToken(provided: string, expected: string) {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  );
}

export function GET(request: Request) {
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) return new Response(null, { status: 503 });

  const params = new URL(request.url).searchParams;
  const challenge = params.get("hub.challenge");
  const provided = params.get("hub.verify_token");
  if (params.get("hub.mode") !== "subscribe" || !challenge || !provided) {
    return new Response(null, { status: 400 });
  }
  if (!matchesVerifyToken(provided, verifyToken)) return new Response(null, { status: 403 });

  return new Response(challenge, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

type IncomingMessage = {
  instagram_account_id: string;
  message_id: string;
  sender_id: string;
  message_text: string;
  sent_at: string | null;
};

function incomingMessages(payload: unknown): IncomingMessage[] {
  const event = object(payload);
  if (event?.object !== "instagram" || !Array.isArray(event.entry)) return [];

  const messages = new Map<string, IncomingMessage>();
  for (const value of event.entry) {
    const entry = object(value);
    if (!entry) continue;
    const accountId = entry.id;
    if (
      typeof accountId !== "string" ||
      !/^\d{1,32}$/.test(accountId) ||
      !Array.isArray(entry.messaging)
    )
      continue;

    for (const item of entry.messaging) {
      const envelope = object(item);
      if (object(envelope?.recipient)?.id !== accountId) continue;

      const senderId = object(envelope?.sender)?.id;
      const message = object(envelope?.message);
      const messageId = message?.mid;
      const messageText = message?.text;
      if (message?.is_echo || message?.is_self || message?.is_deleted) continue;
      if (typeof senderId !== "string" || !/^\d{1,32}$/.test(senderId) || senderId === accountId) {
        continue;
      }
      if (typeof messageId !== "string" || !messageId || messageId.length > 512) continue;
      if (typeof messageText !== "string" || !messageText.trim() || messageText.includes("\0")) {
        continue;
      }

      const timestamp = envelope?.timestamp;
      const sentAt =
        typeof timestamp === "number" &&
        Number.isInteger(timestamp) &&
        timestamp > 0 &&
        timestamp <= 8_640_000_000_000_000
          ? new Date(timestamp).toISOString()
          : null;
      messages.set(accountId + ":" + messageId, {
        instagram_account_id: accountId,
        message_id: messageId,
        sender_id: senderId,
        message_text: messageText,
        sent_at: sentAt,
      });
    }
  }
  return [...messages.values()];
}

export async function POST(request: Request) {
  const appSecret = process.env.INSTAGRAM_META_APP_SECRET;
  const accountId = process.env.INSTAGRAM_TEST_ACCOUNT_ID;
  const sellerConnections = Boolean(instagramConfig());
  if (!appSecret || (!sellerConnections && (!accountId || !/^\d{1,32}$/.test(accountId)))) {
    return new Response(null, { status: 503 });
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature || !/^sha256=[0-9a-f]{64}$/i.test(signature)) {
    return new Response(null, { status: 403 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  const expected = createHmac("sha256", appSecret).update(body).digest();
  if (!timingSafeEqual(Buffer.from(signature.slice(7), "hex"), expected)) {
    return new Response(null, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return new Response(null, { status: 400 });
  }

  const messages = incomingMessages(payload);
  if (messages.length > 0) {
    try {
      const admin = getSupabaseAdmin();
      const sellerMessages = messages.filter((message) => message.sent_at);
      if (sellerConnections && sellerMessages.length) {
        const { error } = await admin.rpc("save_seller_instagram_messages", {
          p_messages: sellerMessages,
        });
        if (error) throw error;
      }
      const testMessages = messages
        .filter((message) => message.instagram_account_id === accountId)
        .map(({ instagram_account_id, message_id, sender_id, message_text }) => ({
          instagram_account_id,
          message_id,
          sender_id,
          message_text,
        }));
      if (testMessages.length) {
        const { error } = await admin.from("instagram_test_messages").upsert(testMessages, {
          onConflict: "instagram_account_id,message_id",
          ignoreDuplicates: true,
        });
        if (error) throw error;
      }
    } catch {
      console.error("[routeflow] Instagram webhook could not store messages.");
      return new Response(null, { status: 503 });
    }
  }
  return Response.json({ received: true });
}
