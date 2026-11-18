import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function instagramReplyKey() {
  const value = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
  return value && /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : null;
}

export function encryptInstagramToken(token: string, connectionId: string) {
  const key = instagramReplyKey();
  if (!key) throw new Error("Instagram reply encryption is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(connectionId));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptInstagramToken(value: string, connectionId: string) {
  const key = instagramReplyKey();
  const [version, iv, tag, ciphertext, extra] = value.split(".");
  if (!key || version !== "v1" || !iv || !tag || !ciphertext || extra)
    throw new Error("Invalid Instagram credential");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(connectionId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function instagramReplyAllowed(lastIncoming: string, now = Date.now()) {
  const timestamp = Date.parse(lastIncoming);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp < 24 * 60 * 60 * 1000;
}

export async function sendInstagramText(
  accountId: string,
  recipientId: string,
  text: string,
  token: string,
) {
  const response = await fetch(`https://graph.facebook.com/v27.0/${accountId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  // Never include Meta's response body or the token in an error or log.
  if (!response.ok) throw new Error("Meta did not confirm delivery");
  const result = await response.json();
  if (typeof result.message_id !== "string" || !result.message_id)
    throw new Error("Meta did not confirm delivery");
  return result.message_id as string;
}
