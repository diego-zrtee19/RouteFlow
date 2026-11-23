export const whatsappSenderPattern = /^(?:\d{6,20}|[A-Z]{2}\.(?:ENT\.)?[a-zA-Z0-9]{1,128})$/;
export const metaIdPattern = /^\d{1,32}$/;
export function whatsappReplyAllowed(lastIncoming: string, now = Date.now()) {
  const time = Date.parse(lastIncoming);
  return Number.isFinite(time) && time <= now && now - time < 86400000;
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export type WhatsAppIncoming = {
  waba_id: string;
  phone_number_id: string;
  message_id: string;
  sender_id: string;
  sender_phone: string | null;
  message_text: string;
  sent_at: string;
};
export type WhatsAppStatus = {
  waba_id: string;
  phone_number_id: string;
  message_id: string;
  client_id: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  sent_at: string;
};
export function parseWhatsAppWebhook(payload: unknown, now = Date.now()) {
  const event = object(payload);
  const messages = new Map<string, WhatsAppIncoming>();
  const statuses: WhatsAppStatus[] = [];
  if (event?.object !== "whatsapp_business_account" || !Array.isArray(event.entry))
    return { messages: [], statuses: [] };
  for (const item of event.entry) {
    const entry = object(item);
    if (
      typeof entry?.id !== "string" ||
      !metaIdPattern.test(entry.id) ||
      !Array.isArray(entry.changes)
    )
      continue;
    for (const change of entry.changes) {
      const envelope = object(change);
      const value = object(envelope?.value);
      const phone = object(value?.metadata)?.phone_number_id;
      if (
        envelope?.field !== "messages" ||
        value?.messaging_product !== "whatsapp" ||
        typeof phone !== "string" ||
        !metaIdPattern.test(phone)
      )
        continue;
      const timestamp = (input: unknown) => {
        if (typeof input !== "string" || !/^\d{1,12}$/.test(input)) return null;
        const time = Number(input) * 1000;
        return time > 0 && time <= now ? new Date(time).toISOString() : null;
      };
      for (const raw of Array.isArray(value.messages) ? value.messages : []) {
        const message = object(raw);
        const id = message?.id;
        const sender = message?.from_user_id ?? message?.from;
        const sentAt = timestamp(message?.timestamp);
        const media: Record<string, string> = {
          image: "[Imagen: consultar en WhatsApp]",
          audio: "[Audio: consultar en WhatsApp]",
          video: "[Video: consultar en WhatsApp]",
          document: "[Documento: consultar en WhatsApp]",
          location: "[Ubicación: consultar en WhatsApp]",
          sticker: "[Sticker: consultar en WhatsApp]",
          contacts: "[Contacto: consultar en WhatsApp]",
          interactive: "[Respuesta interactiva: consultar en WhatsApp]",
        };
        const text =
          message?.type === "text"
            ? object(message.text)?.body
            : typeof message?.type === "string"
              ? media[message.type]
              : null;
        if (
          typeof id !== "string" ||
          !id ||
          id.length > 512 ||
          typeof sender !== "string" ||
          !whatsappSenderPattern.test(sender) ||
          !sentAt ||
          typeof text !== "string" ||
          !text.trim() ||
          text.length > 4096 ||
          text.includes("\0")
        )
          continue;
        messages.set(`${phone}:${id}`, {
          waba_id: entry.id,
          phone_number_id: phone,
          message_id: id,
          sender_id: sender,
          // Only the signed webhook may associate a phone with this conversation.
          sender_phone:
            typeof message?.from === "string" && /^\d{6,20}$/.test(message.from)
              ? message.from
              : null,
          message_text: text,
          sent_at: sentAt,
        });
      }
      for (const raw of Array.isArray(value.statuses) ? value.statuses : []) {
        const status = object(raw);
        const sentAt = timestamp(status?.timestamp);
        if (
          typeof status?.id !== "string" ||
          !status.id ||
          status.id.length > 512 ||
          !sentAt ||
          !["sent", "delivered", "read", "failed"].includes(String(status.status))
        )
          continue;
        const client = status.biz_opaque_callback_data;
        statuses.push({
          waba_id: entry.id,
          phone_number_id: phone,
          message_id: status.id,
          client_id:
            typeof client === "string" &&
            /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(client)
              ? client
              : null,
          sent_at: sentAt,
          status: status.status as WhatsAppStatus["status"],
        });
      }
    }
  }
  return { messages: [...messages.values()], statuses };
}
