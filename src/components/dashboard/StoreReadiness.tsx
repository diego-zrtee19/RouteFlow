"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { OperationalAlert, type AlertView } from "./OperationalAlert";
interface Readiness {
  taskSummary?: { pendingOrders: number; incompletePackages: number };
  actions?: { id: string; label: string; href: string }[];
  alerts?: AlertView[];
  checks: { label: string; done: boolean; href: string }[];
  notifications: {
    id: string;
    subject: string;
    body: string;
    status: string;
    order_id?: string;
  }[];
  settlements: {
    id: string;
    order_number: string;
    settlement_status: string;
    settlement_error: string | null;
  }[];
  emailDelivery: boolean;
}
export function StoreReadiness() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch("/api/dashboard/readiness", {
          cache: "no-store",
        });
        if (!r.ok) throw new Error("No se pudo consultar la tienda");
        const d = await r.json();
        if (active) {
          setData(d);
          setError("");
        }
      } catch {
        if (active)
          setError("No pudimos actualizar tus tareas. Revisa tu conexión e intenta de nuevo.");
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [reload]);
  return (
    <section className="bg-white rounded-2xl border border-line p-6 space-y-4">
      <h2 className="font-semibold text-xl">Tu siguiente paso</h2>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {data && (
            <p className="mt-1 text-sm text-muted">
              Los datos de abajo corresponden a la última consulta disponible.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => setReload((value) => value + 1)}
          >
            Actualizar tareas
          </Button>
        </div>
      )}
      {!data && !error && <p>Cargando preparación…</p>}
      {data && (
        <>
          {data.actions?.[0] ? (
            <div className="rounded-lg bg-accent-50 p-4">
              <p className="text-sm font-semibold">Atiende primero</p>
              <Link
                className="block min-h-11 font-bold text-accent-700 underline py-2"
                href={data.actions[0].href}
              >
                {data.actions[0].label}
              </Link>
            </div>
          ) : data.checks.find((c) => !c.done) ? (
            <div className="rounded-lg bg-accent-50 p-4">
              <p className="text-sm font-semibold">Completa la configuración</p>
              <Link
                className="block min-h-11 font-bold text-accent-700 underline py-2"
                href={data.checks.find((c) => !c.done)!.href}
              >
                {data.checks.find((c) => !c.done)!.label}
              </Link>
            </div>
          ) : (
            <p className="text-emerald-800 font-semibold">
              Configuración básica completa. Revisa un pedido de prueba antes de vender.
            </p>
          )}
          {data.taskSummary && (
            <p className="text-sm">
              {data.taskSummary.pendingOrders} pedidos requieren una acción ·{" "}
              {data.taskSummary.incompletePackages} productos con paquete incompleto.{" "}
              <Link
                className="inline-block min-h-11 underline text-accent-600"
                href="/dashboard/orders"
              >
                Ver todos los pedidos
              </Link>
            </p>
          )}
          {(data.actions?.length ?? 0) > 1 && (
            <details className="space-y-2">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                Otras tareas pendientes
              </summary>
              {data.actions?.slice(1).map((action) => (
                <Link
                  key={action.id}
                  href={action.href}
                  className="block rounded-lg border p-3 text-accent-600 font-semibold"
                >
                  {action.label}
                </Link>
              ))}
            </details>
          )}
          {!!data.alerts?.length && (
            <div className="space-y-2">
              <h3 className="font-semibold">Pedidos que requieren atención</h3>
              {data.alerts.map((alert) => (
                <OperationalAlert key={alert.id} alert={alert} />
              ))}
            </div>
          )}
          <details className="border-t border-slate-200 pt-3 space-y-3">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              Configuración de tu tienda · {data.checks.filter((c) => c.done).length} de{" "}
              {data.checks.length} pasos completos
            </summary>
            <p>
              {data.checks.filter((c) => c.done).length} de {data.checks.length} pasos completos
            </p>
            {data.checks.map((c) => (
              <div key={c.label} className="flex justify-between gap-3">
                <span className="text-sm">
                  {c.done ? "✓" : "○"} {c.label}
                </span>
                <Link className="text-accent-600 underline" href={c.href}>
                  {c.done ? "Revisar" : "Configurar"}
                </Link>
              </div>
            ))}
          </details>
          <details className="border-t border-slate-200 pt-3 space-y-3">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              Notificaciones ({data.notifications.length})
            </summary>
            <p className="text-sm">
              {data.emailDelivery
                ? "Correo habilitado; las pruebas se guardan como vista previa."
                : "Correo pendiente de configurar. Las notificaciones quedan guardadas aquí."}
            </p>
            {data.notifications.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay notificaciones.</p>
            ) : (
              data.notifications.map((n) => (
                <article key={n.id} className="border-t pt-2">
                  <strong>{n.subject}</strong>
                  <p className="text-sm">{n.body}</p>
                  <small>
                    {n.status === "SENT"
                      ? "Correo enviado"
                      : n.status === "FAILED"
                        ? "Correo pendiente de reintento; aviso disponible aquí"
                        : "Aviso disponible en tu tienda"}
                  </small>
                  {n.order_id && (
                    <Link
                      href={`/dashboard/orders/${n.order_id}`}
                      className="block min-h-11 text-accent-600 underline"
                    >
                      Ver pedido y siguiente acción
                    </Link>
                  )}
                </article>
              ))
            )}
          </details>
          {data.settlements.length > 0 && (
            <>
              <h3 className="font-semibold">Transferencias de pedidos entregados</h3>
              {data.settlements.map((s) => (
                <p key={s.id}>
                  {s.order_number}: {s.settlement_status}
                  {s.settlement_error ? ` · ${s.settlement_error}` : ""}
                </p>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
