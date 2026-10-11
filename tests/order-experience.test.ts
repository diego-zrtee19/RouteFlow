import { describe, it, expect } from "vitest";
import { orderMoney } from "@/domain/orderMoney";
import { orderProgress } from "@/domain/orderProgress";
describe("Buyer and seller order experience", () => {
  it("shows net proceeds using the same proportional refund rounding as settlement", () => {
    expect(orderMoney(100, 5, 25, 80)).toEqual({ total: 100, shipping: 20, refunded: 25, retainedFee: 3.75, sellerNet: 71.25 });
    expect(orderMoney(100, 5, 100, 80).sellerNet).toBe(0);
    expect(orderMoney(0, 0, 0, 0).sellerNet).toBe(0);
  });
  it("never presents a disputed or refunded order as an active completed delivery", () => {
    expect(orderProgress("COMPLETED", true).index).toBe(3);
    expect(orderProgress("DISPUTED", false).exception).toBeTruthy();
    expect(orderProgress("REFUNDED", false).index).toBe(-1);
    expect(orderProgress("PAYMENT_PENDING", false).index).toBe(-1);
    expect(orderProgress("PAID", true).stages[2]).toBe("Entrega coordinada");
  });
});
