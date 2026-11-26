import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
import { readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { parseInventoryImport, inventoryTemplate } from "@/domain/inventoryImport";
import { csvCell, financeUuid } from "@/domain/financeLedger";
import { generatePublicId } from "@/lib/buyerToken";
const headers = { "Cache-Control": "private, no-store" };
function download(text: string, name: string) {
  return new Response(text, {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  });
}
export async function GET(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok) return apiErrorResponse(seller.code, "Acceso requerido", seller.status);
  const params = new URL(request.url).searchParams;
  if (params.get("format") === "template")
    return download("\ufeff" + inventoryTemplate, "routeflow-plantilla-inventario");
  try {
    const db = getSupabaseAdmin();
    const products = await db
      .from("products")
      .select("id,title,description,price,stock,currency,is_active,delivery_options")
      .eq("seller_id", seller.value.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(501);
    if (products.error) throw products.error;
    const ids = (products.data ?? []).slice(0, 500).map((p) => p.id);
    // Keep each GET query below common proxy URL limits (500 UUIDs can exceed 16 KB).
    const detailPages = await Promise.all(
      Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
        db
          .from("product_business_details")
          .select("product_id,sku,unit_cost,condition,low_stock_threshold")
          .eq("seller_id", seller.value.id)
          .in("product_id", ids.slice(i * 100, (i + 1) * 100)),
      ),
    );
    if (detailPages.some((p) => p.error)) throw new Error("Private inventory unavailable");
    const details = detailPages.flatMap((p) => p.data ?? []);
    const items = (products.data ?? []).slice(0, 500).map((p) => {
      const d = details.find((item) => item.product_id === p.id);
      return { ...p, business: d ?? null };
    });
    if (params.get("format") === "csv") {
      if ((products.data ?? []).length > 500)
        return apiErrorResponse(
          "CONFLICT",
          "Hay más de 500 productos. No se exportó un archivo parcial.",
          409,
        );
      return download(
        "\ufeff" +
          [
            [
              "sku",
              "nombre",
              "descripcion",
              "precio",
              "stock",
              "moneda",
              "costo",
              "condicion",
              "alerta",
              "entrega",
            ],
            ...items.map((p) => [
              p.business?.sku ?? "",
              p.title,
              p.description ?? "",
              p.price,
              p.stock,
              p.currency,
              p.business?.unit_cost ?? "",
              p.business?.condition ?? "unspecified",
              p.business?.low_stock_threshold ?? 3,
              p.delivery_options?.length === 1 ? p.delivery_options[0] : "",
            ]),
          ]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n"),
        "routeflow-inventario",
      );
    }
    const history = await db
      .from("product_stock_history")
      .select("id,product_id,before_stock,after_stock,created_at")
      .eq("seller_id", seller.value.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (history.error) throw history.error;
    return NextResponse.json(
      { products: items, hasMore: (products.data ?? []).length > 500, history: history.data ?? [] },
      { headers },
    );
  } catch {
    return apiErrorResponse("INTERNAL_ERROR", "No pudimos consultar inventario e historial", 500);
  }
}
export async function POST(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok) return apiErrorResponse(seller.code, "Acceso requerido", seller.status);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return apiErrorResponse("FORBIDDEN", "Solicitud no permitida", 403);
  try {
    const body = await readPublicJson(request, 1100000);
    const db = getSupabaseAdmin();
    if (body.action === "publish") {
      if (typeof body.productId !== "string" || !financeUuid.test(body.productId))
        return apiErrorResponse("VALIDATION_ERROR", "Producto inválido", 400);
      const { error } = await db.rpc("publish_imported_product", {
        p_seller: seller.value.id,
        p_product: body.productId,
        p_public_id: generatePublicId(),
      });
      if (error)
        return apiErrorResponse(
          "CONFLICT",
          "Revisa fotos, precio, existencias y configuración de envío antes de publicar.",
          409,
        );
      return NextResponse.json({ published: true }, { headers });
    }
    if (
      typeof body.csv !== "string" ||
      typeof body.clientId !== "string" ||
      !financeUuid.test(body.clientId)
    )
      return apiErrorResponse("VALIDATION_ERROR", "Archivo o intento inválido", 400);
    let parsed: ReturnType<typeof parseInventoryImport>;
    try {
      parsed = parseInventoryImport(body.csv);
    } catch (error) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        error instanceof Error ? error.message : "CSV inválido",
        400,
      );
    }
    if (parsed.errors.length)
      return apiErrorResponse("VALIDATION_ERROR", parsed.errors.slice(0, 5).join(" "), 400);
    const { data, error } = await db.rpc("import_seller_inventory", {
      p_seller: seller.value.id,
      p_actor: seller.value.userId,
      p_client: body.clientId,
      p_rows: parsed.products,
    });
    if (error)
      return apiErrorResponse(
        "CONFLICT",
        "No se importó. Comprueba que los SKU no existan ya y que los datos sean válidos. No se guardaron filas parciales.",
        409,
      );
    return NextResponse.json(data, { headers });
  } catch (error) {
    const guarded = publicRequestError(error);
    if (guarded) return guarded;
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No pudimos completar la operación. Conserva el archivo para reintentar.",
      500,
    );
  }
}
