import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const env = vi.hoisted(() => ({ configured: true }));
vi.mock("@/lib/supabaseEnv", () => ({
  SUPABASE_ENV_VARS: { url: "TEST_URL", anonKey: "TEST_ANON", serviceRoleKey: "TEST_SECRET" },
  checkSupabaseUrl: () => ({
    ok: env.configured,
    preview: env.configured ? "https://fixture.supabase.co" : null,
    error: "internal diagnosis",
  }),
  checkSupabaseKey: () => ({ ok: true, preview: "secret-preview", error: null }),
  getSupabaseProjectRef: () => "private-project-ref",
}));
let getHealth: typeof import("@/app/api/health/supabase/route").GET;
beforeEach(async () => {
  vi.resetModules();
  env.configured = true;
  vi.stubEnv("TEST_SECRET", "private-key");
  // Load framework modules in setup; test timing measures the probe itself.
  getHealth = (await import("@/app/api/health/supabase/route")).GET;
}, 30000);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Public health privacy", () => {
  it("exposes only availability and reuses the bounded probe", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const responses = await Promise.all([getHealth(), getHealth(), getHealth()]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "connected" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not expose configuration details when unavailable", async () => {
    env.configured = false;
    const response = await getHealth();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
