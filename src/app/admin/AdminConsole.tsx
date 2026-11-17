import Link from "next/link";
import { Card, StatCard } from "@/components/ui/Card";
import { buttonStyles } from "@/components/ui/Button";
import type { AdminStats, IntegrationStates } from "./adminData";
interface Props {
  stripe: { configured: boolean; webhookConfigured: boolean; testMode: boolean };
  stats: AdminStats;
  integrationStates: IntegrationStates;
}
export default function AdminConsole({ stripe, stats, integrationStates }: Props) {
  return (
    <main className="p-5 sm:p-8 space-y-8">
      <div>
        <p className="text-sm text-muted">Vista general de la plataforma</p>
        <h1 className="mt-2 text-3xl font-semibold">Todo lo importante, en un lugar</h1>
        <p className="mt-3 text-muted">
          Revisa la actividad y atiende lo que necesita tu intervención.
        </p>
        <p className="mt-2 text-xs text-muted">
          Consulta: {new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" })} · Hora
          de Ciudad de México
        </p>
      </div>
      <div className="rounded-xl border border-line bg-accent-50 px-5 py-4 text-sm">
        {stripe.testMode
          ? "Entorno de prueba: estas cifras pueden incluir compras simuladas."
          : "Las cifras corresponden al entorno conectado. La configuración no certifica disponibilidad comercial."}
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Vendedores registrados" value={stats.activeSellers} />
        <StatCard title="Productos publicados" value={stats.totalProducts} />
        <StatCard title="Pedidos creados" value={stats.totalOrders} />
        <StatCard title="Casos abiertos" value={stats.openDisputes} />
      </div>
      <Card>
        <h2 className="text-xl font-semibold">Primero, lo que necesita atención</h2>
        <p className="mt-2 text-muted">
          {stats.openDisputes
            ? `${stats.openDisputes} casos esperan revisión. Abre cada caso antes de decidir cómo resolverlo.`
            : "No hay casos abiertos registrados. Consulta Operación para revisar errores de pagos, avisos y entregas."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/disputes" className={buttonStyles()}>
            Revisar casos
          </Link>
          <Link href="/admin/operations" className={buttonStyles({ variant: "secondary" })}>
            Revisar operación
          </Link>
        </div>
      </Card>
      <div className="grid sm:grid-cols-2 gap-5">
        {[
          ["Pedidos", "Consulta el estado de las compras y sus importes.", "/admin/orders"],
          [
            "Vendedores",
            "Revisa las tiendas registradas y su estado de verificación.",
            "/admin/sellers",
          ],
        ].map(([title, body, href]) => (
          <Card key={href}>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 mb-4 text-muted">{body}</p>
            <Link href={href} className={buttonStyles({ variant: "outline" })}>
              Ver {title.toLowerCase()}
            </Link>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="text-xl font-semibold">Cómo leer tus números</h2>
        <p className="mt-2 text-muted">
          Los pedidos creados incluyen compras pendientes o canceladas. Los vendedores registrados
          no equivalen a vendedores activos. El importe vendido pertenece a los vendedores: no
          representa la ganancia de RouteFlow.
        </p>
        <p className="mt-3 text-sm text-muted">
          El margen neto sigue pendiente de confirmar tarifas, impuestos, reembolsos y costos
          operativos.
        </p>
      </Card>
      <details className="rounded-2xl bg-white border border-line p-6">
        <summary className="cursor-pointer font-semibold">Configuración de servicios</summary>
        <div className="mt-4 space-y-3 text-sm">
          <p>
            Stripe: {stripe.configured ? "Configurado" : "Pendiente"} · Webhook:{" "}
            {stripe.webhookConfigured ? "Configurado" : "Pendiente"}
          </p>
          {Object.entries(integrationStates).map(([name, state]) => (
            <p key={name}>
              {name}: {state === "CONFIGURED" ? "Configurado" : "Pendiente"}
            </p>
          ))}
          <p className="text-muted">
            Indica presencia de configuración. Consulta Operación para revisar ejecuciones y fallos
            registrados.
          </p>
        </div>
      </details>
    </main>
  );
}
