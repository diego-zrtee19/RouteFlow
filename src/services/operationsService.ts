import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notificationMessage, readableNotificationBody } from "@/domain/notificationMessage";
import { getStripe, isStripeTestMode } from "@/lib/stripe";
import { cancelOrder } from "@/repositories/orderRepository";
import { reconcileCheckoutSession } from "@/services/checkoutService";
import { settleCompletedOrder } from "@/services/connectService";
import { recoverRefunds } from "@/services/refundService";
import { reviewLegacyReservations } from "@/services/legacyReservationService";

export async function processNotifications() {
  const db = getSupabaseAdmin();
  const { data: jobs, error } = await db.rpc("claim_notifications", {
    p_limit: 20,
  });
  if (error) throw error;
  let sent = 0,
    preview = 0,
    failed = 0;
  for (const job of jobs ?? []) {
    try {
      // Development is a durable preview inbox. Activating real mail is explicit configuration.
      if (
        process.env.ROUTEFLOW_EMAIL_DELIVERY !== "enabled" ||
        isStripeTestMode()
      ) {
        const { error: e } = await db
          .from("notification_outbox")
          .update({ status: "PREVIEW", locked_at: null })
          .eq("id", job.id);
        if (e) throw e;
        preview++;
        continue;
      }
      if (
        !process.env.RESEND_API_KEY ||
        !process.env.ROUTEFLOW_EMAIL_FROM ||
        !job.recipient
      )
        throw new Error(
          "Configura el correo del vendedor y el proveedor de notificaciones",
        );
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `rf_notification_${job.id}`,
        },
        body: JSON.stringify({
          from: process.env.ROUTEFLOW_EMAIL_FROM,
          to: [job.recipient],
          subject: job.subject,
          text: `${readableNotificationBody(job.body)}\n\n${notificationMessage(job.kind, job.audience)}${job.audience === "buyer" && process.env.NEXT_PUBLIC_APP_URL ? `\n\nSeguir mi pedido: ${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/order/${job.order_id}\nRecupera el acceso con el correo de tu compra: ${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/mis-compras` : ""}`,
        }),
      });
      if (!response.ok)
        throw new Error(`Proveedor de correo: HTTP ${response.status}`);
      const { error: e } = await db
        .from("notification_outbox")
        .update({
          status: "SENT",
          sent_at: new Date().toISOString(),
          locked_at: null,
          last_error: null,
        })
        .eq("id", job.id);
      if (e) throw e;
      sent++;
    } catch (e) {
      await db
        .from("notification_outbox")
        .update({
          status: "FAILED",
          locked_at: null,
          last_error: e instanceof Error ? e.message : "Error de envío",
          available_at: new Date(
            Date.now() + Math.min(3600, 60 * 2 ** job.attempts) * 1000,
          ).toISOString(),
        })
        .eq("id", job.id);
      failed++;
    }
  }
  return { sent, preview, failed };
}
async function executeOperations() {
  const db = getSupabaseAdmin();
  const errors: string[] = [];
  let expired = 0,
    settled = 0;
  const { data: orders, error } = await db
    .from("orders")
    .select("id,created_at,payments(checkout_session_id)")
    .not("reservation_expires_at", "is", null)
    .lt("reservation_expires_at", new Date().toISOString())
    .is("stock_released_at", null)
    .in("payment_status", ["PENDING", "FAILED"])
    .limit(30);
  if (error) throw error;
  for (const order of orders ?? [])
    try {
      let id = order.payments?.find(
        (p: { checkout_session_id: string | null }) => p.checkout_session_id,
      )?.checkout_session_id;
      if (!id) {
        const sessions = await getStripe().checkout.sessions.list({
          created: {
            gte: Math.floor(new Date(order.created_at).getTime() / 1000) - 10,
          },
          limit: 100,
        });
        id = sessions.data.find((s) => s.metadata?.order_id === order.id)?.id;
        if (!id && sessions.has_more)
          throw new Error("Reconciliación de sesiones requiere otra página");
      }
      if (id) {
        let session = await getStripe().checkout.sessions.retrieve(id);
        if (session.payment_status === "paid") {
          await reconcileCheckoutSession(session);
          continue;
        }
        if (session.status === "open")
          session = await getStripe().checkout.sessions.expire(id);
        if (session.status !== "expired") continue;
      }
      await cancelOrder(order.id, "reservation_expired");
      expired++;
    } catch (e) {
      errors.push(
        `expiry:${order.id}:${e instanceof Error ? e.message : "error"}`,
      );
    }
  const { data: completed, error: completedError } = await db
    .from("orders")
    .select("id")
    .eq("status", "COMPLETED")
    .eq("payment_status", "SUCCEEDED")
    .is("transfer_id", null)
    .limit(20);
  if (completedError) throw completedError;
  for (const o of completed ?? [])
    try {
      const result = await settleCompletedOrder(o.id);
      if ("transferId" in result) settled++;
    } catch (e) {
      errors.push(
        `settlement:${o.id}:${e instanceof Error ? e.message : "error"}`,
      );
    }
  const refunds = await recoverRefunds();
  errors.push(...refunds.errors);
  const legacy = await reviewLegacyReservations();
  const { data: overdueDisputes, error: alertError } = await db.rpc(
    "queue_overdue_disputes",
  );
  if (alertError) throw alertError;
  const notifications = await processNotifications();
  return {
    expired,
    settled,
    notifications,
    refunds: refunds.recovered,
    legacy,
    overdueDisputes,
    errors,
  };
}
export async function runOperations() {
  const db = getSupabaseAdmin();
  try {
    const result = await executeOperations();
    const { error } = await db
      .from("operation_runs")
      .insert({
        status:
          result.errors.length || result.notifications.failed
            ? "FAILED"
            : "SUCCEEDED",
        summary: result,
      });
    if (error) throw error;
    return result;
  } catch (e) {
    await db
      .from("operation_runs")
      .insert({
        status: "FAILED",
        summary: { error: "Operations failed; review server logs" },
      });
    throw e;
  }
}
