import { describe, expect, it } from "vitest";
import { createInstagramLogin, validInstagramState } from "@/services/instagramConnection";

describe("Instagram seller authorization", () => {
  it("binds Meta's response to the seller who started the flow", () => {
    const config = {
      appId: "123",
      configId: "456",
      secret: "test-secret",
      redirect: new URL("https://example.com/api/dashboard/instagram/callback"),
    };
    const { url, cookie } = createInstagramLogin(config, "seller-a");
    const state = url.searchParams.get("state");
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.searchParams.get("config_id")).toBe("456");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("override_default_response_type")).toBe("true");
    expect(validInstagramState(state, cookie, "seller-a", config.secret)).toBe(true);
    expect(validInstagramState(state, cookie, "seller-b", config.secret)).toBe(false);
    expect(validInstagramState(state, undefined, "seller-a", config.secret)).toBe(false);
    expect(validInstagramState("x".repeat(43), cookie, "seller-a", config.secret)).toBe(false);
  });
});
