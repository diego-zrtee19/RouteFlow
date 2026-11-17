import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => db }));
import { guardPublicRequest, readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
const request = (body = "{}", headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/checkout/session", { method: "POST", body, headers });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL", "");
  db.rpc.mockResolvedValue({ data: { allowed: true, retry_after: 60 }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("Public API cost protection", () => {
  it("does not let forged client forwarding headers create new local quota identities", async () => {
    await guardPublicRequest(request("{}", { "x-forwarded-for": "1.2.3.4" }), "checkout");
    await guardPublicRequest(request("{}", { "x-forwarded-for": "9.8.7.6" }), "checkout");
    expect(db.rpc.mock.calls[0][1].p_identity).toBe(db.rpc.mock.calls[1][1].p_identity);
  });
  it("returns a retry delay when the shared database quota denies the operation", async () => {
    db.rpc.mockResolvedValue({ data: { allowed: false, retry_after: 42 }, error: null });
    const error = await guardPublicRequest(request(), "quote").catch((e) => e);
    const response = publicRequestError(error)!;
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
  });
  it("fails closed when the guard database is unavailable", async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: "secret internal error" } });
    const response = publicRequestError(
      await guardPublicRequest(request(), "checkout").catch((e) => e),
    )!;
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
  it("bounds the actual body even if Content-Length claims it is small", async () => {
    await expect(
      readPublicJson(request('"' + "x".repeat(40000) + '"', { "Content-Length": "2" })),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("accepts valid small JSON and refuses malformed data or arrays", async () => {
    expect(await readPublicJson(request('{"publicId":"TEST"}'))).toEqual({ publicId: "TEST" });
    await expect(readPublicJson(request("not json"))).rejects.toMatchObject({ status: 400 });
    await expect(readPublicJson(request("[]"))).rejects.toMatchObject({ status: 400 });
  });
});
