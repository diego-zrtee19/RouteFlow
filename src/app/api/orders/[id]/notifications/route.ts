import { NextRequest, NextResponse } from "next/server";
import { findOrderForBuyer, findOrderByStripeSessionForBuyer } from "@/services/orderService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
import { notificationMessage, readableNotificationBody } from "@/domain/notificationMessage";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get("x-buyer-token");
  const session = req.nextUrl.searchParams.get("session_id");
  if (!token && !session) return apiErrorResponse("UNAUTHENTICATED", "Buyer access required", 401);
  try {
    const order = token ? await findOrderForBuyer(id, token) : await findOrderByStripeSessionForBuyer(id, session);
    if (!order) return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    const { data, error } = await getSupabaseAdmin().from("notification_outbox").select("id,subject,body,kind,status,created_at").eq("order_id", order.id).eq("audience", "buyer").order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    return NextResponse.json({ notifications: (data ?? []).map(note => ({ id: note.id, subject: note.subject, body: `${readableNotificationBody(note.body)} ${notificationMessage(note.kind, "buyer")}`, status: note.status, created_at: note.created_at })) }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) { return apiErrorResponse("INTERNAL_ERROR", "No se pudieron cargar las actualizaciones", 500, e); }
}
