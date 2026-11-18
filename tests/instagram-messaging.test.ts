import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptInstagramToken,
  encryptInstagramToken,
  instagramReplyAllowed,
  sendInstagramText,
} from "@/services/instagramMessaging";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Instagram reply credentials", () => {
  it("encrypts tokens and binds each ciphertext to its connection", () => {
    vi.stubEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    const ciphertext = encryptInstagramToken("private-test-token", "connection-a");
    expect(ciphertext).not.toContain("private-test-token");
    expect(decryptInstagramToken(ciphertext, "connection-a")).toBe("private-test-token");
    expect(() => decryptInstagramToken(ciphertext, "connection-b")).toThrow();
    expect(encryptInstagramToken("private-test-token", "connection-a")).not.toBe(ciphertext);
    const pieces = ciphertext.split(".");
    pieces[2] = Buffer.alloc(16).toString("base64url");
    expect(() => decryptInstagramToken(pieces.join("."), "connection-a")).toThrow();
    vi.stubEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY", "b".repeat(64));
    expect(() => decryptInstagramToken(ciphertext, "connection-a")).toThrow();
  });
  it("fails closed without a valid encryption key", () => {
    vi.stubEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY", "short");
    expect(() => encryptInstagramToken("private-test-token", "a")).toThrow();
  });
  it("blocks expired, future and invalid reply windows", () => {
    const now = Date.UTC(2026, 10, 18, 12);
    expect(instagramReplyAllowed(new Date(now - 1000).toISOString(), now)).toBe(true);
    expect(instagramReplyAllowed(new Date(now - 86400000).toISOString(), now)).toBe(false);
    expect(instagramReplyAllowed(new Date(now + 1).toISOString(), now)).toBe(false);
    expect(instagramReplyAllowed("invalid", now)).toBe(false);
  });
  it("sends a single authenticated text request and requires Meta confirmation", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message_id: "meta-mid" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendInstagramText("123", "456", "Hola", "private-test-token")).toBe("meta-mid");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v27.0/123/messages");
    expect(JSON.parse(options.body)).toMatchObject({
      recipient: { id: "456" },
      message: { text: "Hola" },
    });
    fetcher.mockResolvedValue(
      Response.json({ error: { message: "secret-error-details" } }, { status: 400 }),
    );
    await expect(sendInstagramText("123", "456", "Hola", "private-test-token")).rejects.toThrow(
      "Meta did not confirm delivery",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
