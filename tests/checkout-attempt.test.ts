import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkoutAttemptIdentity,
  assertCheckoutResumable,
} from "@/services/checkoutAttemptService";
import { checkoutAttemptKey, storedCheckoutAttemptKey } from "@/lib/checkoutAttemptStore";
import { makeOrder } from "./fixtures";
describe("checkout retry credentials", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    });
  });
  it("reuses an intent across retries and a module reload without storing personal data", async () => {
    const payload = { email: "private@example.invalid", address: "Private address" };
    const key = await checkoutAttemptKey("retry-test", payload);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(await checkoutAttemptKey("retry-test", payload)).toBe(key);
    vi.resetModules();
    const reloaded = await import("@/lib/checkoutAttemptStore");
    expect(await reloaded.checkoutAttemptKey("retry-test", payload)).toBe(key);
    expect(reloaded.storedCheckoutAttemptKey("retry-test")).toBe(key);
    expect(sessionStorage.getItem("routeflow:checkout-attempt:retry-test")).not.toContain(
      "private@example",
    );
  });
  it("changed forms get a separate intent", async () => {
    expect(await checkoutAttemptKey("change", { q: 1 })).not.toBe(
      await checkoutAttemptKey("change", { q: 2 }),
    );
  });
  it("retries work when browser storage is disabled", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw Error("disabled");
      },
      setItem: () => {
        throw Error("disabled");
      },
    });
    const a = await checkoutAttemptKey("private", {});
    expect(await checkoutAttemptKey("private", {})).toBe(a);
    expect(storedCheckoutAttemptKey("private")).toBe(a);
  });
  it("hashes credentials and canonicalizes nested requests", () => {
    const key = "a".repeat(64);
    const a = checkoutAttemptIdentity(key, { a: { b: 1, c: 2 } }, "quick");
    expect(a).toEqual(checkoutAttemptIdentity(key, { a: { c: 2, b: 1 } }, "quick"));
    expect(a.keyHash).not.toBe(key);
    expect(a.buyerToken).not.toBe(key);
    expect(a.requestHash).not.toBe(checkoutAttemptIdentity(key, { a: 2 }, "quick").requestHash);
  });
  it.each([null, "123", "z".repeat(64)])("rejects weak or missing credentials", (key) => {
    expect(() => checkoutAttemptIdentity(key, {}, "quick")).toThrow();
  });
  it("does not reopen cancelled or expired orders", () => {
    expect(() =>
      assertCheckoutResumable(makeOrder({ status: "CANCELLED", paymentStatus: "PENDING" })),
    ).toThrow();
    expect(() =>
      assertCheckoutResumable(
        makeOrder({ status: "PAYMENT_PENDING", paymentStatus: "PENDING", createdAt: "2020-01-01" }),
      ),
    ).toThrow();
  });
  it("paid retries may recover the receipt but do not require another payment", () => {
    expect(() => assertCheckoutResumable(makeOrder())).not.toThrow();
  });
});
