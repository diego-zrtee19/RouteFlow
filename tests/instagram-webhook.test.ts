import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/webhooks/instagram/route";

const { from, rpc, upsert } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ from, rpc }) }));

const url = "https://routeflow.example/api/webhooks/instagram";
const appSecret = "test-app-secret";
const accountId = "17841457369640000";

function signedRequest(body: string, secret = appSecret) {
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request(url, {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${signature}` },
    body,
  });
}

function messageEvent() {
  return {
    sender: { id: "101" },
    recipient: { id: accountId },
    message: { mid: "m_test", text: "Prueba de RouteFlow 📦" },
  };
}

function messageBody() {
  return JSON.stringify({
    object: "instagram",
    entry: [{ id: accountId, messaging: [messageEvent()] }],
  });
}

beforeEach(() => {
  vi.stubEnv("INSTAGRAM_WEBHOOK_VERIFY_TOKEN", "verification-secret");
  vi.stubEnv("INSTAGRAM_META_APP_SECRET", appSecret);
  vi.stubEnv("INSTAGRAM_TEST_ACCOUNT_ID", accountId);
  vi.stubEnv("INSTAGRAM_META_CONFIG_ID", "");
  vi.resetAllMocks();
  from.mockReturnValue({ upsert });
  upsert.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Instagram webhook", () => {
  it("returns the exact challenge only with the configured token", async () => {
    const challengeUrl = `${url}?hub.mode=subscribe&hub.challenge=0123&hub.verify_token=`;
    const response = GET(new Request(challengeUrl + "verification-secret"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("0123");
    expect(GET(new Request(challengeUrl + "wrong")).status).toBe(403);
    expect(GET(new Request(url)).status).toBe(400);
  });

  it("rejects an invalid signature before writing or parsing", async () => {
    expect((await POST(signedRequest("invalid-json", "wrong-secret"))).status).toBe(403);
    expect((await POST(signedRequest("invalid-json"))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("writes only incoming text for the test account, once per message ID in the batch", async () => {
    const event = messageEvent();
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: accountId,
          messaging: [
            event,
            event,
            { ...event, message: { ...event.message, mid: "echo", is_echo: true } },
            { ...event, recipient: { id: "999" } },
          ],
        },
        { id: "999", messaging: [event] },
      ],
    });

    expect((await POST(signedRequest(body))).status).toBe(200);
    expect(from).toHaveBeenCalledWith("instagram_test_messages");
    expect(upsert).toHaveBeenCalledExactlyOnceWith(
      [
        {
          instagram_account_id: accountId,
          message_id: "m_test",
          sender_id: "101",
          message_text: "Prueba de RouteFlow 📦",
        },
      ],
      { onConflict: "instagram_account_id,message_id", ignoreDuplicates: true },
    );
  });

  it("returns a retryable error when the message could not be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    upsert.mockResolvedValue({ error: { code: "connection_failure" } });
    expect((await POST(signedRequest(messageBody()))).status).toBe(503);
  });

  it("stays disabled when the test account is missing", async () => {
    vi.stubEnv("INSTAGRAM_TEST_ACCOUNT_ID", "");
    expect((await POST(signedRequest(messageBody()))).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
  });

  it("routes timestamped messages to the seller database without the test account configured", async () => {
    vi.stubEnv("INSTAGRAM_TEST_ACCOUNT_ID", "");
    vi.stubEnv("INSTAGRAM_META_APP_ID", "123");
    vi.stubEnv("INSTAGRAM_META_CONFIG_ID", "456");
    vi.stubEnv(
      "INSTAGRAM_OAUTH_REDIRECT_URI",
      "https://example.com/api/dashboard/instagram/callback",
    );
    rpc.mockResolvedValue({ error: null });
    const timestamp = Date.UTC(2026, 10, 17);
    const body = JSON.stringify({
      object: "instagram",
      entry: [{ id: accountId, messaging: [messageEvent(), { ...messageEvent(), timestamp }] }],
    });
    expect((await POST(signedRequest(body))).status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("save_seller_instagram_messages", {
      p_messages: [
        expect.objectContaining({
          instagram_account_id: accountId,
          sent_at: new Date(timestamp).toISOString(),
        }),
      ],
    });
  });
});
