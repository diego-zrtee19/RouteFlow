import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parseWhatsAppWebhook } from "@/domain/whatsapp";
import { whatsappSecret } from "@/services/whatsappConnection";
export const runtime = "nodejs";
function equal(a: string, b: string) {
  return (
    Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function GET(request: Request) {
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) return new Response(null, { status: 503 });
  const params = new URL(request.url).searchParams;
  const supplied = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (params.get("hub.mode") !== "subscribe" || !supplied || !challenge || challenge.length > 4096)
    return new Response(null, { status: 400 });
  if (!equal(supplied, expected)) return new Response(null, { status: 403 });
  return new Response(challenge, {
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}
export async function POST(request: Request) {
  const secret = whatsappSecret();
  if (!secret) return new Response(null, { status: 503 });
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature))
    return new Response(null, { status: 403 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1048576) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks);
  if (
    !timingSafeEqual(
      Buffer.from(signature.slice(7), "hex"),
      createHmac("sha256", secret).update(body).digest(),
    )
  )
    return new Response(null, { status: 403 });
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return new Response(null, { status: 400 });
  }
  const events = parseWhatsAppWebhook(payload);
  if (events.messages.length || events.statuses.length) {
    try {
      const { error } = await getSupabaseAdmin().rpc("save_seller_whatsapp_webhook", {
        p_messages: events.messages,
        p_statuses: events.statuses,
      });
      if (error) throw error;
    } catch {
      return new Response(null, { status: 503 });
    }
  }
  return Response.json({ received: true });
}
