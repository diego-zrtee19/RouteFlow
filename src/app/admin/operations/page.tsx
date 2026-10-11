import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Operations() {
  const a = await requireAdmin();
  if (!a.ok) redirect("/dashboard?error=forbidden_admin");
  const db = getSupabaseAdmin();
  const [
    { data: alerts, error: ae },
    { data: runs, error: re },
    { count: failedEvents, error: fe },
    { count: failedMail, error: me },
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
  ]);
  if (ae || re || fe || me) throw ae || re || fe || me;
  const stale =
    !runs?.length ||
    Date.now() - new Date(runs[0].created_at).getTime() > 15 * 60000;
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="font-bold text-2xl">Estado de la operación</h1>
      <p>
        Webhooks fallidos: {failedEvents ?? 0} · Correos fallidos:{" "}
        {failedMail ?? 0}
      </p>
      <p className={stale ? "text-rose-700" : "text-emerald-700"}>
        {stale
          ? "El proceso automático lleva más de 15 minutos sin registrar una ejecución."
          : "Proceso automático activo"}
      </p>
      <Link href="/admin/disputes" className="text-blue-700 underline">
        Resolver disputas
      </Link>
      {alerts?.map((alert) => (
        <article key={alert.id} className="border rounded p-3">
          <strong>{alert.kind}</strong>
          <p>{alert.message}</p>
          {alert.order_id && <p>Pedido: {alert.order_id}</p>}
        </article>
      ))}
      <h2 className="font-bold">Últimas ejecuciones</h2>
      {runs?.map((run) => (
        <p key={run.id}>
          {new Date(run.created_at).toLocaleString("es-MX")} · {run.status}
        </p>
      ))}
    </main>
  );
}
