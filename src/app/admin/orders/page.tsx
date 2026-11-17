import { requireAdmin } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
const labels: Record<string, string> = {
  PAID: "Pagado",
  READY_TO_SHIP: "Preparando",
  IN_TRANSIT: "En camino",
  DELIVERED: "Entrega registrada",
  COMPLETED: "Completado",
  DISPUTED: "Caso abierto",
  REFUNDED: "Reembolsado",
  CANCELLED: "Cancelado",
  PAYMENT_PENDING: "Pago pendiente",
  CREATED: "Creado",
};
export default async function Orders() {
  if (!(await requireAdmin()).ok) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("id,order_number,status,payment_status,amount,currency,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (
    <main className="p-5 sm:p-8 space-y-6">
      <h1 className="text-3xl font-semibold">Pedidos</h1>
      <p className="text-muted">
        Los 50 pedidos más recientes. Los importes no representan ingresos de RouteFlow.
      </p>
      <div className="space-y-3">
        {data?.map((o) => (
          <article
            key={o.id}
            className="rounded-2xl border border-line bg-white p-5 flex flex-wrap justify-between gap-3"
          >
            <div>
              <h2 className="font-semibold">{o.order_number}</h2>
              <p className="text-sm text-muted">
                {labels[o.status] || o.status} ·{" "}
                {new Date(o.created_at).toLocaleDateString("es-MX")}
              </p>
            </div>
            <p className="font-semibold tabular-nums">
              {new Intl.NumberFormat("es-MX", { style: "currency", currency: o.currency }).format(
                Number(o.amount),
              )}
            </p>
          </article>
        ))}
        {!data?.length && <p className="rounded-xl border p-6 bg-white">Todavía no hay pedidos.</p>}
      </div>
    </main>
  );
}
