import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import {
  findOrderForBuyer,
  findOrderForSeller,
  findOrderByStripeSessionForBuyer,
} from "@/services/orderService";
import { findOrderForBuyerIdentity, sameOriginBuyerAction } from "@/lib/buyerIdentity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
async function access(req: NextRequest, id: string) {
  if (req.method !== "GET" && !sameOriginBuyerAction(req)) return null;
  if (req.headers.get("x-routeflow-audience") === "seller") {
    const seller = await requireSeller();
    return seller.ok
      ? { order: await findOrderForSeller(id, seller.value), actor: "seller" }
      : null;
  }
  const token = req.headers.get("x-buyer-token");
  const session = req.headers.get("x-checkout-session-id");
  const order = token
    ? await findOrderForBuyer(id, token)
    : session
      ? await findOrderByStripeSessionForBuyer(id, session)
      : await findOrderForBuyerIdentity(id);
  return { order, actor: "buyer" };
}
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const a = await access(req, id);
    if (!a?.order) return apiErrorResponse("NOT_FOUND", "Pedido no encontrado", 404);
    const db = getSupabaseAdmin();
    const [current, history] = await Promise.all([
      db
        .from("delivery_arrangements")
        .select("version,place,scheduled_at,proposed_by,status,updated_at")
        .eq("order_id", id)
        .maybeSingle(),
      db
        .from("operational_activity")
        .select("id,actor_kind,action,created_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (current.error || history.error) throw current.error || history.error;
    return NextResponse.json(
      { arrangement: current.data, history: history.data ?? [] },
      { headers },
    );
  } catch (e) {
    return apiErrorResponse("INTERNAL_ERROR", "No se pudo consultar el acuerdo", 500, e);
  }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const a = await access(req, id);
    if (!a?.order) return apiErrorResponse("NOT_FOUND", "Pedido no encontrado", 404);
    const b = await req.json();
    if (
      !["propose", "confirm", "missed"].includes(b.action) ||
      !Number.isInteger(b.version) ||
      b.version < 0 ||
      (b.action === "propose" &&
        (typeof b.place !== "string" ||
          b.place.trim().length < 3 ||
          b.place.length > 300 ||
          typeof b.scheduledAt !== "string" ||
          !Number.isFinite(Date.parse(b.scheduledAt))))
    )
      return apiErrorResponse("VALIDATION_ERROR", "Revisa lugar, fecha y acción", 400);
    const { data, error } = await getSupabaseAdmin().rpc("change_delivery_arrangement", {
      p_order_id: id,
      p_seller_id: a.order.sellerId,
      p_actor: a.actor,
      p_action: b.action,
      p_version: b.version,
      p_place: b.action === "propose" ? b.place : null,
      p_scheduled_at: b.action === "propose" ? b.scheduledAt : null,
    });
    if (error)
      return apiErrorResponse(
        "CONFLICT",
        "No se guardó el acuerdo. Reconsulta: debe ser una propuesta futura confirmada por la otra parte y el pedido debe permitir entrega.",
        409,
        error,
      );
    return NextResponse.json({ arrangement: data }, { headers });
  } catch (e) {
    return apiErrorResponse("INTERNAL_ERROR", "No se pudo guardar el acuerdo", 500, e);
  }
}
