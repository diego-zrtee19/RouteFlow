import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { whatsappSenderPattern } from "@/domain/whatsapp";

export const whatsappCookie = "routeflow_whatsapp_state";
export const whatsappPath = "/api/dashboard/whatsapp";
const graph = "https://graph.facebook.com/v27.0/";
export function whatsappSecret() {
  return process.env.WHATSAPP_META_APP_SECRET || process.env.INSTAGRAM_META_APP_SECRET;
}
function key() {
  const raw =
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
  return raw && /^[a-f0-9]{64}$/i.test(raw)
    ? createHmac("sha256", Buffer.from(raw, "hex")).update("routeflow.whatsapp.v1").digest()
    : null;
}
export function whatsappKeyConfigured() {
  return Boolean(key());
}
export function whatsappPhoneAllowed(id: string) {
  return (
    process.env.WHATSAPP_LIVE_ENABLED === "true" ||
    (process.env.WHATSAPP_TEST_PHONE_NUMBER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(id)
  );
}
export function whatsappConfig() {
  const appId = process.env.WHATSAPP_META_APP_ID || process.env.INSTAGRAM_META_APP_ID;
  const configId = process.env.WHATSAPP_META_CONFIG_ID;
  const secret = whatsappSecret();
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!appId || !configId || !secret || !key() || !origin) return null;
  try {
    if (new URL(origin).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { appId, configId, secret, origin: new URL(origin).origin };
}
export function createWhatsAppState(seller: string, secret: string) {
  const state = randomBytes(32).toString("base64url");
  return {
    state,
    cookie:
      state +
      "." +
      createHmac("sha256", secret)
        .update(seller + ":" + state)
        .digest("base64url"),
  };
}
export function validWhatsAppState(
  state: unknown,
  cookie: string | undefined,
  seller: string,
  secret: string,
) {
  if (typeof state !== "string" || !/^[\w-]{43}$/.test(state) || !cookie) return false;
  const expected =
    state +
    "." +
    createHmac("sha256", secret)
      .update(seller + ":" + state)
      .digest("base64url");
  return (
    Buffer.byteLength(cookie) === expected.length &&
    timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
  );
}
export function encryptWhatsAppToken(token: string, connection: string) {
  const encryptionKey = key();
  if (!encryptionKey) throw Error("WhatsApp encryption unavailable");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  cipher.setAAD(Buffer.from("whatsapp:" + connection));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function decryptWhatsAppToken(value: string, connection: string) {
  const encryptionKey = key();
  const [version, iv, tag, ciphertext, extra] = value.split(".");
  if (!encryptionKey || version !== "v1" || !iv || !tag || !ciphertext || extra)
    throw Error("Invalid WhatsApp credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from("whatsapp:" + connection));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
/** Explicit client rejection is different from a timeout after provider acceptance.
 * Keep only numeric provider codes; never retain messages that may echo credentials. */
export class WhatsAppProviderRejection extends Error {
  constructor(readonly providerCode: number) {
    super("WhatsApp rejected the request");
    this.name = "WhatsAppProviderRejection";
  }
}
export async function whatsappGraph<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(new URL(path, graph), {
    ...init,
    headers: { Authorization: "Bearer " + token, ...init?.headers },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      const result = await response.json().catch(() => null);
      const code = result?.error?.code;
      if (typeof code === "number" && Number.isSafeInteger(code) && code > 0)
        throw new WhatsAppProviderRejection(code);
    }
    throw Error("WhatsApp Graph request failed");
  }
  return response.json();
}
export async function exchangeWhatsAppCode(
  code: string,
  config: NonNullable<ReturnType<typeof whatsappConfig>>,
) {
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.secret,
    code,
  });
  const response = await fetch(new URL("oauth/access_token?" + params, graph), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("WhatsApp authorization failed");
  const result = await response.json();
  if (typeof result.access_token !== "string" || !result.access_token)
    throw Error("WhatsApp credential missing");
  return result.access_token as string;
}
export async function verifiedWhatsAppPhone(
  token: string,
  waba: string,
  phone: string,
  appId: string,
  secret: string,
  designatedTest = false,
) {
  const debug = await whatsappGraph<{
    data?: {
      is_valid?: boolean;
      app_id?: string;
      scopes?: string[];
      expires_at?: number;
      granular_scopes?: { scope: string; target_ids?: string[] }[];
    };
  }>("debug_token?" + new URLSearchParams({ input_token: token }), appId + "|" + secret);
  if (
    !debug.data?.is_valid ||
    debug.data.app_id !== appId ||
    !["whatsapp_business_management", "whatsapp_business_messaging"].every((scope) =>
      debug.data?.scopes?.includes(scope),
    ) ||
    (debug.data.expires_at && debug.data.expires_at * 1000 <= Date.now())
  )
    throw Error("WhatsApp permissions missing");
  const targets = debug.data.granular_scopes
    ?.filter(
      (s) =>
        s.scope === "whatsapp_business_messaging" || s.scope === "whatsapp_business_management",
    )
    .flatMap((s) => s.target_ids ?? []);
  if (!designatedTest && !targets?.includes(waba) && !targets?.includes(phone))
    throw Error("WhatsApp asset not granted");
  const data = await whatsappGraph<{
    data?: { id: string; display_phone_number?: string; verified_name?: string }[];
    paging?: { next?: string };
  }>(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`, token);
  const chosen = data.data?.find((p) => p.id === phone);
  if (!chosen?.display_phone_number) throw Error("WhatsApp phone not authorized");
  return {
    ...chosen,
    expiresAt: debug.data.expires_at ? new Date(debug.data.expires_at * 1000).toISOString() : null,
  };
}
export async function sendWhatsAppText(
  phoneId: string,
  sender: string,
  text: string,
  token: string,
  clientId: string,
  senderPhone?: string | null,
) {
  if (!whatsappPhoneAllowed(phoneId) || !whatsappSenderPattern.test(sender))
    throw Error("WhatsApp phone not enabled");
  const result = await whatsappGraph<{ messages?: { id?: string }[] }>(
    `${phoneId}/messages`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...(senderPhone && /^\d{6,20}$/.test(senderPhone)
          ? { to: senderPhone }
          : sender.includes(".")
            ? { recipient: sender }
            : { to: sender }),
        biz_opaque_callback_data: clientId,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    },
  );
  const id = result.messages?.[0]?.id;
  if (typeof id !== "string" || !id) throw Error("WhatsApp did not confirm send");
  return id;
}
