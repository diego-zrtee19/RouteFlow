import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import { reconcileCheckoutSession } from "@/services/checkoutService";
import type Stripe from "stripe";
async function legacySession(
  orderId: string,
): Promise<Stripe.Checkout.Session> {
  const db = getSupabaseAdmin();
  const { data: o, error } = await db
    .from("orders")
    .select("id,created_at,payments(checkout_session_id)")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  const binding = o.payments?.find(
    (p: { checkout_session_id: string | null }) => p.checkout_session_id,
  )?.checkout_session_id;
  if (binding) {
    const session = await getStripe().checkout.sessions.retrieve(binding);
    if (session.metadata?.order_id && session.metadata.order_id !== orderId)
      throw new Error("Stripe session binding mismatch");
    if (session.client_reference_id && session.client_reference_id !== orderId)
      throw new Error("Stripe session reference mismatch");
    return session;
  }
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const sessions = await getStripe().checkout.sessions.list({
      created: {
        gte: Math.floor(new Date(o.created_at).getTime() / 1000) - 60,
        lte: Math.floor(new Date(o.created_at).getTime() / 1000) + 86400,
      },
      limit: 100,
      ...(after ? { starting_after: after } : {}),
    });
    const found = sessions.data.find(
      (s) =>
        s.metadata?.order_id === orderId || s.client_reference_id === orderId,
    );
    if (found) return found;
    if (!sessions.has_more) break;
    after = sessions.data.at(-1)?.id;
  }
  throw new Error(
    "No se encontró la sesión con las credenciales actuales. Revisa Stripe antes de cancelar",
  );
}
export async function reviewLegacyReservations() {
  const db = getSupabaseAdmin();
  const { data: orders, error } = await db
    .from("orders")
    .select("id,seller_id")
    .is("reservation_expires_at", null)
    .is("stock_released_at", null)
    .in("payment_status", ["PENDING", "FAILED"])
    .in("status", ["CREATED", "PAYMENT_PENDING"])
    .lt("created_at", new Date(Date.now() - 35 * 60000).toISOString())
    .limit(20);
  if (error) throw error;
  let reviewRequired = 0,
    reconciled = 0;
  for (const o of orders ?? []) {
    let kind = "LEGACY_INVENTORY_REVIEW",
      message =
        "Compra antigua sin pagar. Confirma si se reservó inventario antes de cancelarla.";
    try {
      const session = await legacySession(o.id);
      if (session.payment_status === "paid") {
        const result = await reconcileCheckoutSession(session);
        if (result.order?.paymentStatus === "SUCCEEDED") {
          reconciled++;
          await db
            .from("operational_alerts")
            .update({
              status: "RESOLVED",
              resolved_at: new Date().toISOString(),
            })
            .eq("order_id", o.id)
            .like("kind", "LEGACY_%");
          continue;
        }
        throw new Error("El pago requiere revisión");
      }
      if (session.status !== "expired") {
        kind = "LEGACY_STRIPE_REVIEW";
        message =
          "La sesión antigua sigue abierta o pendiente. Revisa el pedido antes de cancelarlo.";
      }
    } catch {
      kind = "LEGACY_STRIPE_REVIEW";
      message =
        "No se pudo verificar el pago antiguo con la cuenta Stripe actual. No se modificó el pedido ni el inventario.";
    }
    const { error: e } = await db
      .from("operational_alerts")
      .upsert(
        {
          dedupe_key: `legacy:${o.id}`,
          kind,
          seller_id: o.seller_id,
          order_id: o.id,
          message,
          status: "OPEN",
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "dedupe_key" },
      );
    if (e) throw e;
    reviewRequired++;
  }
  return { reviewRequired, reconciled };
}
export async function recoverLegacyReservation(
  orderId: string,
  sellerId: string,
  restoreStock: boolean,
) {
  const db = getSupabaseAdmin();
  const { data: o, error } = await db
    .from("orders")
    .select(
      "id,created_at,payment_status,stock_released_at,reservation_expires_at",
    )
    .eq("id", orderId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error) throw error;
  if (!o) throw new Error("Pedido no encontrado");
  if (o.stock_released_at) return { alreadyRecovered: true };
  if (
    !["PENDING", "FAILED"].includes(o.payment_status) ||
    o.reservation_expires_at !== null ||
    new Date(o.created_at).getTime() > Date.now() - 35 * 60000
  )
    throw new Error("El pedido no permite recuperar una reserva antigua");
  let session = await legacySession(orderId);
  if (session.payment_status === "paid") {
    await reconcileCheckoutSession(session);
    throw new Error(
      "Stripe confirma un pago. El inventario permanece reservado",
    );
  }
  if (session.status === "open")
    session = await getStripe().checkout.sessions.expire(session.id);
  if (session.status !== "expired")
    throw new Error("El pago sigue pendiente en Stripe; no se cancelará");
  const { data, error: e } = await db.rpc("cancel_legacy_reservation", {
    p_order_id: orderId,
    p_seller_id: sellerId,
    p_restore_stock: restoreStock,
  });
  if (e) throw e;
  return { alreadyRecovered: !data };
}
