import {describe,it,expect} from "vitest";
import {refundMinorUnits,sellerRemainingMinor} from "@/services/refundService";
describe("partial refund amounts",()=>{
 it("uses exact cents for valid money",()=>{expect(refundMinorUnits(25.01)).toBe(2501);expect(refundMinorUnits(0.29)).toBe(29);});
 it.each([0,-1,Infinity,NaN,0.001,25.999])("rejects invalid amount %s",v=>expect(()=>refundMinorUnits(v)).toThrow());
 it("reduces seller entitlement proportionally",()=>{expect(sellerRemainingMinor(10000,500,2500)).toBe(7125);expect(sellerRemainingMinor(10000,500,10000)).toBe(0);});
 it("preserves consistent rounding across cumulative refunds",()=>{const initial=sellerRemainingMinor(9999,500,0);const partial=sellerRemainingMinor(9999,500,3333);const final=sellerRemainingMinor(9999,500,9999);expect(initial-partial+partial-final).toBe(initial);});
});
