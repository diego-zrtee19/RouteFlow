import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),update:vi.fn(),eq:vi.fn(),select:vi.fn(),maybeSingle:vi.fn()}));
vi.mock("@/lib/authz",()=>({requireSeller:mocks.auth}));
vi.mock("@/lib/supabaseAdmin",()=>({getSupabaseAdmin:mocks.admin}));
import { PATCH } from "@/app/api/dashboard/catalog/route";
const productId="12345678-1234-1234-1234-123456789012";
const request=(body:object)=>new NextRequest("http://localhost/api/dashboard/catalog",{method:"PATCH",body:JSON.stringify(body),headers:{"Content-Type":"application/json"}});
beforeEach(()=>{
 vi.clearAllMocks();mocks.auth.mockResolvedValue({ok:true,value:{id:"seller-a"}});
 const chain={update:mocks.update,eq:mocks.eq,select:mocks.select,maybeSingle:mocks.maybeSingle};
 mocks.update.mockReturnValue(chain);mocks.eq.mockReturnValue(chain);mocks.select.mockReturnValue(chain);mocks.admin.mockReturnValue({from:()=>chain});
 mocks.maybeSingle.mockResolvedValue({data:{id:productId,weight_kg:3},error:null});
});
describe("Editing package weight",()=>{
 it("requires a seller session",async()=>{mocks.auth.mockResolvedValue({ok:false,code:"UNAUTHORIZED",status:401});expect((await PATCH(request({productId,weightKg:3}))).status).toBe(401);expect(mocks.admin).not.toHaveBeenCalled();});
 it("rejects invalid weight without writing",async()=>{expect((await PATCH(request({productId,weightKg:0}))).status).toBe(400);expect(mocks.admin).not.toHaveBeenCalled();});
 it("updates only package weight within the authenticated seller's products",async()=>{expect((await PATCH(request({productId,weightKg:3}))).status).toBe(200);expect(mocks.update).toHaveBeenCalledWith({weight_kg:3});expect(mocks.eq).toHaveBeenCalledWith("seller_id","seller-a");expect(mocks.eq).toHaveBeenCalledWith("id",productId);});
 it("does not update another seller's product",async()=>{mocks.maybeSingle.mockResolvedValue({data:null,error:null});expect((await PATCH(request({productId,weightKg:3}))).status).toBe(404);});
});
