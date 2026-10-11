import { describe, it, expect } from "vitest";
import { quoteFingerprint } from "@/services/shippingQuoteService";
const address = {
  street: "Demo 123",
  city: "Tlajomulco",
  state: "JAL",
  postalCode: "45640",
  country: "MX",
};
describe("shipping quote integrity", () => {
  it("normalizes case and surrounding whitespace", () =>
    expect(quoteFingerprint(address, {}, 3, {})).toBe(
      quoteFingerprint({ ...address, street: " demo 123 " }, {}, 3, {}),
    ));
  it("binds quote to exact delivery address", () =>
    expect(quoteFingerprint(address, {}, 3, {})).not.toBe(
      quoteFingerprint({ ...address, postalCode: "99999" }, {}, 3, {}),
    ));
  it("invalidates after package weight changes", () =>
    expect(quoteFingerprint(address, {}, 3, {})).not.toBe(
      quoteFingerprint(address, {}, 4, {}),
    ));
  it("invalidates after dimensions or origin changes", () => {
    expect(
      quoteFingerprint(address, { city: "A" }, 3, { length: 10 }),
    ).not.toBe(quoteFingerprint(address, { city: "B" }, 3, { length: 10 }));
    expect(quoteFingerprint(address, {}, 3, { length: 10 })).not.toBe(
      quoteFingerprint(address, {}, 3, { length: 20 }),
    );
  });
});
