import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
export async function PATCH(req: NextRequest) {
  const access = await requireSeller();
  if (!access.ok) return apiErrorResponse(access.code, "Acceso de vendedor requerido", access.status);
  const body = await req.json().catch(() => ({}));
  if (typeof body.variantId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.variantId) || !Number.isInteger(body.stock) || body.stock < 0 || body.stock > 100000) return apiErrorResponse("VALIDATION_ERROR", "Inventario inválido", 400);
  const { data, error } = await getSupabaseAdmin().rpc("set_catalog_variant_stock", { p_seller_id: access.value.id, p_variant_id: body.variantId, p_stock: body.stock });
  if (error) return apiErrorResponse("INTERNAL_ERROR", "No se pudo actualizar el inventario", 500, error);
  if (!data) return apiErrorResponse("NOT_FOUND", "Variante no encontrada", 404);
  return NextResponse.json(data);
}
