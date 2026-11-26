import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
import { readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { parseCustomerFollowup, parseProspect } from "@/domain/customerFollowup";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  const params = new URL(request.url).searchParams;
  const email = params.get("email");
  const search = params.get("search") ?? "";
  const offset = Number(params.get("offset") ?? 0);
  if (
    search.length > 100 ||
    (email && email.length > 254) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 50000
  )
    return apiErrorResponse("VALIDATION_ERROR", "Búsqueda inválida", 400);
  try {
    const admin = getSupabaseAdmin();
    if (email) {
      const { data, error } = await admin.rpc("seller_customer_orders", {
        p_seller: seller.value.id,
        p_email: email,
      });
      if (error) throw error;
      return NextResponse.json(
        { orders: (data ?? []).slice(0, 100), hasMore: (data ?? []).length > 100 },
        { headers },
      );
    }
    const { data, error } = await admin.rpc("seller_customer_list", {
      p_seller: seller.value.id,
      p_search: search,
      p_offset: offset,
    });
    if (error) throw error;
    return NextResponse.json(
      { customers: (data ?? []).slice(0, 50), hasMore: (data ?? []).length > 50 },
      { headers },
    );
  } catch {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No pudimos cargar tus clientes. Intenta de nuevo.",
      500,
    );
  }
}
export async function POST(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return apiErrorResponse("FORBIDDEN", "Solicitud no permitida", 403);
  let body;
  try {
    const raw = await readPublicJson(request);
    if (raw.action === "prospect") {
      const prospect = parseProspect(raw);
      if (!prospect)
        return apiErrorResponse("VALIDATION_ERROR", "Revisa nombre y correo del contacto", 400);
      const { data, error } = await getSupabaseAdmin().rpc("create_seller_prospect", {
        p_seller: seller.value.id,
        p_actor: seller.value.userId,
        p_email: prospect.email,
        p_name: prospect.name,
      });
      if (error)
        return apiErrorResponse(
          "INTERNAL_ERROR",
          "No pudimos guardar el contacto. Puedes reintentar.",
          500,
        );
      return NextResponse.json({ created: data === true, email: prospect.email }, { headers });
    }
    body = parseCustomerFollowup(raw);
  } catch (error) {
    return (
      publicRequestError(error) ?? apiErrorResponse("VALIDATION_ERROR", "Datos inválidos", 400)
    );
  }
  if (!body)
    return apiErrorResponse("VALIDATION_ERROR", "Revisa la nota y la fecha de seguimiento", 400);
  try {
    const { data, error } = await getSupabaseAdmin().rpc("save_customer_followup", {
      p_seller: seller.value.id,
      p_email: body.email,
      p_note: body.note,
      p_followup: body.followupAt,
      p_revision: body.revision,
    });
    if (error) throw error;
    if (data === null)
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "La ficha cambió en otra ventana. Recarga antes de guardar; conserva tu borrador.",
        409,
      );
    return NextResponse.json({ revision: data }, { headers });
  } catch {
    return apiErrorResponse("INTERNAL_ERROR", "No se guardó. Tu borrador sigue disponible.", 500);
  }
}
