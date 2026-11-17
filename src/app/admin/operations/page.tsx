import { requireAdmin } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Operations() {
  const a = await requireAdmin();
  if (!a.ok) return null;
  const db = getSupabaseAdmin();
  const [
    { data: alerts, error: ae },
    { data: runs, error: re },
    { count: failedEvents, error: fe },
    { count: failedMail, error: me },
    { data: pending, error: pe },
    { data: activity, error: he },
    { count: failedShipments, error: se },
  ] = await Promise.all([
    db
      .from("operational_alerts")
      .select("id,kind,order_id,message,last_seen_at")
      .eq("status", "OPEN")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("operation_runs")
      .select("id,status,summary,created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    db
      .from("stripe_webhook_events")
      .select("id", { head: true, count: "exact" })
      .eq("status", "FAILED"),
    db
      .from("notification_outbox")
      .select("id", { head: true, count: "exact" })
      .eq("status", "FAILED"),
    db
      .from("orders")
      .select("id,order_number,status,created_at,reservation_expires_at")
      .in("status", ["PAID", "READY_TO_SHIP", "DISPUTED", "PAYMENT_PENDING"])
      .order("created_at", { ascending: true })
      .limit(40),
    db
      .from("operational_activity")
      .select("id,order_id,product_id,seller_id,actor_kind,action,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("shipments")
      .select("id", { head: true, count: "exact" })
      .in("status", ["FAILED", "CANCELLED"]),
  ]);
  if (ae || re || fe || me || pe || he || se) throw ae || re || fe || me || pe || he || se;
  const stale = !runs?.length || Date.now() - new Date(runs[0].created_at).getTime() > 15 * 60000;
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="font-semibold text-2xl">Estado de la operación</h1>
      <p>
        Webhooks fallidos: {failedEvents ?? 0} · Correos fallidos: {failedMail ?? 0} · Incidencias
        de paquetería: {failedShipments ?? 0}
      </p>
      <p className={stale ? "text-rose-700" : "text-emerald-700"}>
        {stale
          ? "El proceso automático lleva más de 15 minutos sin registrar una ejecución."
          : "Proceso automático activo"}
      </p>
      <Link href="/admin/disputes" className="text-accent-700 underline">
        Resolver disputas
      </Link>
      <section className="space-y-3">
        <h2 className="font-semibold">Cola de pedidos por revisar</h2>
        <p className="text-sm">
          Una reserva vencida necesita reconciliar el pago antes de devolver stock. Los pedidos
          pagados no se cancelan por vencer una reserva.
        </p>
        {pending?.map((order) => (
          <article key={order.id} className="border rounded-lg p-3">
            <p className="font-semibold">
              {order.order_number} · {order.status}
            </p>
            <p className="text-sm">
              Creado: {new Date(order.created_at).toLocaleString("es-MX")}
              {order.reservation_expires_at &&
              order.status === "PAYMENT_PENDING" &&
              Date.parse(order.reservation_expires_at) < Date.now()
                ? " · Reserva vencida: revisar proceso automático"
                : ""}
            </p>
            {order.status === "DISPUTED" && (
              <Link
                className="min-h-11 inline-block py-3 underline text-accent-700"
                href="/admin/disputes"
              >
                Revisar caso y evidencia
              </Link>
            )}
          </article>
        ))}
        {!pending?.length && <p>No hay pedidos pendientes en esta consulta.</p>}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Historial de coordinación y edición</h2>
        <p className="text-sm">
          Identifica el rol y tienda que hicieron el cambio. No muestra tokens, NIP ni contactos del
          comprador.
        </p>
        {activity?.map((item) => (
          <p key={item.id} className="text-sm border-b py-2 break-all">
            {new Date(item.created_at).toLocaleString("es-MX")} · {item.actor_kind} · {item.action}{" "}
            · Tienda {item.seller_id} ·{" "}
            {item.order_id ? `Pedido ${item.order_id}` : `Producto ${item.product_id}`}
          </p>
        ))}
        {!activity?.length && <p>Todavía no hay cambios registrados por las funciones nuevas.</p>}
      </section>
      {alerts?.map((alert) => (
        <article key={alert.id} className="border rounded-sm p-3">
          <strong>{alert.kind}</strong>
          <p>{alert.message}</p>
          {alert.order_id && <p>Pedido: {alert.order_id}</p>}
        </article>
      ))}
      <h2 className="font-semibold">Últimas ejecuciones</h2>
      {runs?.map((run) => (
        <p key={run.id}>
          {new Date(run.created_at).toLocaleString("es-MX")} · {run.status}
        </p>
      ))}
    </main>
  );
}
