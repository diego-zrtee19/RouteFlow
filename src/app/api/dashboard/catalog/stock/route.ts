import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiResponse";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.id) ||
    !["product", "variant"].includes(body.kind) ||
    !Number.isInteger(body.stock) ||
    body.stock < 0 ||
    body.stock > 100000 ||
    !Number.isInteger(body.expected) ||
    body.expected < 0 ||
    body.expected > 2147483647
  ) {
    return apiErrorResponse("VALIDATION_ERROR", "Indica una cantidad válida", 400);
  }

  try {
    const { data, error } = await getSupabaseAdmin().rpc("adjust_catalog_stock", {
      p_seller_id: seller.value.id,
      p_item_id: body.id,
      p_is_variant: body.kind === "variant",
      p_stock: body.stock,
      p_expected: body.expected,
    });
    if (error) throw error;
    if (!data) return apiErrorResponse("NOT_FOUND", "Producto o variante no disponible", 404);
    if (data.variants)
      return apiErrorResponse("VALIDATION_ERROR", "Ajusta las existencias por variante", 409);
    return NextResponse.json(data, { status: data.conflict ? 409 : 200 });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "No se pudo actualizar el inventario", 500, error);
  }
}
