import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  parseWhatsAppWebhook,
  whatsappReplyAllowed,
  whatsappSenderPattern,
} from "@/domain/whatsapp";
import {
  createWhatsAppState,
  validWhatsAppState,
  encryptWhatsAppToken,
  decryptWhatsAppToken,
  whatsappPhoneAllowed,
  sendWhatsAppText,
  verifiedWhatsAppPhone,
} from "@/services/whatsappConnection";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), seller: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
import { GET, POST } from "@/app/api/webhooks/whatsapp/route";
import { GET as inbox, POST as reply } from "@/app/api/dashboard/whatsapp/inbox/route";
import { GET as sales, POST as prepare } from "@/app/api/dashboard/whatsapp/sales/route";
const now = Date.parse("2026-11-21T20:00:00Z");
const message = {
  id: "wamid.test",
  from: "523312345678",
  from_user_id: "MX.abc123",
  type: "text",
  text: { body: "Quiero una gorra" },
  timestamp: String(now / 1000 - 5),
};
function payload(messages: unknown[] = [message], statuses: unknown[] = []) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "456" },
              messages,
              statuses,
            },
          },
        ],
      },
    ],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  vi.stubEnv("WHATSAPP_META_APP_SECRET", "whatsapp-test-secret");
  vi.stubEnv("WHATSAPP_TOKEN_ENCRYPTION_KEY", "ab".repeat(32));
  vi.stubEnv("WHATSAPP_TEST_PHONE_NUMBER_IDS", "456");
  vi.stubEnv("WHATSAPP_LIVE_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("accepts phone and business-scoped identities without requiring a visible phone", () => {
  expect(whatsappSenderPattern.test("MX.abc123")).toBe(true);
  expect(whatsappSenderPattern.test("US.ENT.ab12")).toBe(true);
  expect(whatsappSenderPattern.test("523312345678")).toBe(true);
  expect(whatsappSenderPattern.test("<script>")).toBe(false);
  const parsed = parseWhatsAppWebhook(payload([{ ...message, from: undefined }]), now);
  expect(parsed.messages[0].sender_id).toBe("MX.abc123");
});
it("deduplicates incoming IDs within a phone and preserves separate phones", () => {
  const p = payload([message, message]);
  expect(parseWhatsAppWebhook(p, now).messages).toHaveLength(1);
  p.entry.push({
    ...p.entry[0],
    changes: [
      {
        ...p.entry[0].changes[0],
        value: { ...p.entry[0].changes[0].value, metadata: { phone_number_id: "789" } },
      },
    ],
  });
  expect(parseWhatsAppWebhook(p, now).messages).toHaveLength(2);
});
it("does not let delivery callbacks or future messages open a response window", () => {
  expect(
    parseWhatsAppWebhook(payload([{ ...message, timestamp: String(now / 1000 + 1) }]), now)
      .messages,
  ).toEqual([]);
  expect(
    parseWhatsAppWebhook(
      payload([], [{ id: "wamid.sent", status: "read", timestamp: message.timestamp }]),
      now,
    ).messages,
  ).toEqual([]);
  expect(whatsappReplyAllowed(new Date(now - 86400000).toISOString(), now)).toBe(false);
  expect(whatsappReplyAllowed(new Date(now + 1).toISOString(), now)).toBe(false);
  expect(whatsappReplyAllowed(new Date(now - 1000).toISOString(), now)).toBe(true);
});
it("shows media placeholders without copying remote attachments or locations", () => {
  const parsed = parseWhatsAppWebhook(
    payload([{ ...message, type: "image", image: { link: "https://evil.example" } }]),
    now,
  );
  expect(parsed.messages[0].message_text).toContain("consultar en WhatsApp");
  expect(JSON.stringify(parsed)).not.toContain("evil.example");
});
it("binds authorization state and encrypted credentials to the seller and connection", () => {
  const state = createWhatsAppState("seller-a", "secret");
  expect(validWhatsAppState(state.state, state.cookie, "seller-a", "secret")).toBe(true);
  expect(validWhatsAppState(state.state, state.cookie, "seller-b", "secret")).toBe(false);
  const encrypted = encryptWhatsAppToken("private-token", "connection-a");
  expect(decryptWhatsAppToken(encrypted, "connection-a")).toBe("private-token");
  expect(() => decryptWhatsAppToken(encrypted, "connection-b")).toThrow();
});
it("uses an isolated key context when falling back to the existing messaging key", () => {
  vi.stubEnv("WHATSAPP_TOKEN_ENCRYPTION_KEY", "");
  vi.stubEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY", "cd".repeat(32));
  const value = encryptWhatsAppToken("token", "a");
  expect(decryptWhatsAppToken(value, "a")).toBe("token");
  vi.stubEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY", "ef".repeat(32));
  expect(() => decryptWhatsAppToken(value, "a")).toThrow();
});
it("keeps unapproved phone numbers disabled in Preview", () => {
  expect(whatsappPhoneAllowed("456")).toBe(true);
  expect(whatsappPhoneAllowed("999")).toBe(false);
});
it("sends BSUIDs using recipient and adds a callback key for timeout recovery", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.out" }] }) });
  vi.stubGlobal("fetch", fetch);
  expect(await sendWhatsAppText("456", "MX.abc123", "Hola", "private-token", "client-id")).toBe(
    "wamid.out",
  );
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.recipient).toBe("MX.abc123");
  expect(body.to).toBeUndefined();
  expect(body.biz_opaque_callback_data).toBe("client-id");
});
it("checks token issuer and granted assets before accepting the phone", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            is_valid: true,
            app_id: "wrong-app",
            scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
          },
        }),
      }),
  );
  await expect(
    verifiedWhatsAppPhone("token", "123", "456", "correct-app", "secret"),
  ).rejects.toThrow();
});
it("verifies the webhook challenge without exposing stored messages", async () => {
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "verify");
  expect(
    GET(
      new Request(
        "https://routeflow.example?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1",
      ),
    ).status,
  ).toBe(403);
  const response = GET(
    new Request(
      "https://routeflow.example?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123",
    ),
  );
  expect(await response.text()).toBe("123");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires a valid raw-body signature and retries when persistence fails", async () => {
  const body = JSON.stringify(payload());
  const signature =
    "sha256=" + createHmac("sha256", "whatsapp-test-secret").update(body).digest("hex");
  expect(
    (await POST(new Request("https://routeflow.example", { method: "POST", body }))).status,
  ).toBe(403);
  expect(
    (
      await POST(
        new Request("https://routeflow.example", {
          method: "POST",
          headers: { "x-hub-signature-256": signature },
          body,
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "save_seller_whatsapp_webhook",
    expect.objectContaining({ p_messages: expect.any(Array) }),
  );
  mocks.rpc.mockResolvedValue({ error: new Error("offline") });
  expect(
    (
      await POST(
        new Request("https://routeflow.example", {
          method: "POST",
          headers: { "x-hub-signature-256": signature },
          body,
        }),
      )
    ).status,
  ).toBe(503);
});
it("denies anonymous inbox, replies and sale preparation before accessing private data", async () => {
  mocks.seller.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", status: 401 });
  for (const handler of [inbox, reply, sales, prepare])
    expect(
      (
        await handler(
          new Request("https://routeflow.example", {
            method: handler === inbox || handler === sales ? "GET" : "POST",
          }),
        )
      ).status,
    ).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
