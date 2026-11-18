import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/dashboard/instagram/inbox/route";
import { encryptInstagramToken } from "@/services/instagramMessaging";

const { requireSeller, from, rpc } = vi.hoisted(() => ({
  requireSeller: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({ requireSeller }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ from, rpc }) }));
const endpoint = "https://example.com/api/dashboard/instagram/inbox";
const clientId = "11111111-1111-4111-8111-111111111111";
function query(data: unknown, error: unknown = null) {
  const result = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    insert: vi.fn().mockResolvedValue({ error }),
    update: vi.fn(),
  };
  [result.select, result.eq, result.not, result.order, result.limit, result.update].forEach(
    (method) => method.mockReturnValue(result),
  );
  return result;
}
function request(
  body = { senderId: "456", text: "Hola", clientId },
  origin = "https://example.com",
) {
  return new Request(endpoint, {
    method: "POST",
    headers: { Origin: origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  requireSeller.mockResolvedValue({ ok: true, value: { id: "seller-a" } });
  vi.stubEnv("INSTAGRAM_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("seller Instagram inbox", () => {
  it("requires seller authentication before any database access", async () => {
    requireSeller.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", status: 401 });
    expect((await GET(new Request(endpoint))).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it("scopes all inbox queries to the authenticated seller and never returns a credential", async () => {
    const connection = query({
      id: "connection-a",
      username: "test",
      token_ciphertext: "secret-ciphertext",
    });
    from.mockReturnValue(connection);
    rpc.mockResolvedValue({
      data: [{ sender_id: "456", message_text: "Hello", sent_at: new Date().toISOString() }],
      error: null,
    });
    const response = await GET(new Request(endpoint + "?seller_id=seller-b"));
    expect(connection.eq).toHaveBeenCalledWith("seller_id", "seller-a");
    expect(rpc).toHaveBeenCalledWith("instagram_inbox_threads", {
      p_connection: "connection-a",
      p_before: null,
      p_sender: "",
    });
    const data = await response.json();
    expect(JSON.stringify(data)).not.toContain("secret-ciphertext");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects foreign origins and invalid recipients before database work", async () => {
    expect((await POST(request(undefined, "https://evil.example"))).status).toBe(403);
    expect((await POST(request({ senderId: "456,or(other)", text: "Hi", clientId }))).status).toBe(
      400,
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("does not resend an existing request", async () => {
    from
      .mockReturnValueOnce(query({ id: "connection-a", token_ciphertext: "encrypted" }))
      .mockReturnValueOnce(query({ recipient_id: "456", message_text: "Hola", status: "sent" }));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await (await POST(request())).json()).toEqual({ status: "sent", duplicate: true });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cannot send to a recipient who has not messaged this seller", async () => {
    from
      .mockReturnValueOnce(query({ id: "connection-a", token_ciphertext: "encrypted" }))
      .mockReturnValueOnce(query(null))
      .mockReturnValueOnce(query(null));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(request())).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("marks an ambiguous failure without retrying the remote send", async () => {
    const update = query(null);
    from
      .mockReturnValueOnce(
        query({
          id: "connection-a",
          instagram_account_id: "123",
          token_ciphertext: encryptInstagramToken("private-test-token", "connection-a"),
        }),
      )
      .mockReturnValueOnce(query(null))
      .mockReturnValueOnce(query({ sent_at: new Date(Date.now() - 1000).toISOString() }))
      .mockReturnValueOnce(query(null))
      .mockReturnValueOnce(update);
    const fetcher = vi.fn().mockRejectedValue(new Error("network timeout"));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await POST(request())).json()).toEqual({ status: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(update.update).toHaveBeenCalledWith({ status: "unknown" });
  });
});
