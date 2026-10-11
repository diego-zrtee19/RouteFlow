"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { OperationalAlert, type AlertView } from "./OperationalAlert";
interface Readiness {
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
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error");
      }
    };
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="bg-white rounded-xl border p-5 space-y-4">
      <h2 className="font-bold">Prepara tu tienda</h2>
      <Link href="/dashboard/disputes" className="text-blue-700 underline">
        Gestionar disputas y evidencias
      </Link>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Cargando preparación…</p>}
      {data && (
        <>
          {data.checks.find(c => !c.done) ? <div className="rounded-lg bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-700">Tu siguiente paso</p><Link className="block min-h-11 font-bold text-blue-900 underline" href={data.checks.find(c => !c.done)!.href}>{data.checks.find(c => !c.done)!.label}</Link></div> : <p className="text-emerald-800 font-semibold">Configuración básica completa. Revisa un pedido de prueba antes de vender.</p>}
          {!!data.actions?.length && <div className="space-y-2"><h3 className="font-bold">Qué hacer ahora</h3>{data.actions.map(action => <Link key={action.id} href={action.href} className="block rounded-lg border p-3 text-blue-700 font-semibold">{action.label}</Link>)}</div>}
          {!!data.alerts?.length && (
            <div className="space-y-2">
              <h3 className="font-bold">Pedidos que requieren atención</h3>
              {data.alerts.map((alert) => (
                <OperationalAlert key={alert.id} alert={alert} />
              ))}
            </div>
          )}
          <p>
            {data.checks.filter((c) => c.done).length} de {data.checks.length}{" "}
            pasos completos
          </p>
          {data.checks.map((c) => (
            <div key={c.label} className="flex justify-between gap-3">
              <span className="text-sm">
                {c.done ? "✓" : "○"} {c.label}
              </span>
              <Link className="text-blue-700 underline" href={c.href}>
                {c.done ? "Revisar" : "Configurar"}
              </Link>
            </div>
          ))}
          <h3 className="font-bold pt-3">Notificaciones</h3>
          <p className="text-sm">
            {data.emailDelivery
              ? "Correo habilitado; las pruebas se guardan como vista previa."
              : "Correo pendiente de configurar. Las notificaciones quedan guardadas aquí."}
          </p>
          {data.notifications.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no hay notificaciones.
            </p>
          ) : (
            data.notifications.map((n) => (
              <article key={n.id} className="border-t pt-2">
                <strong>{n.subject}</strong>
                <p className="text-sm">{n.body}</p>
                <small>{n.status === "SENT" ? "Correo enviado" : n.status === "FAILED" ? "Correo pendiente de reintento; aviso disponible aquí" : "Aviso disponible en tu tienda"}</small>
                {n.order_id && <Link href={`/dashboard/orders/${n.order_id}`} className="block min-h-11 text-blue-700 underline">Ver pedido y siguiente acción</Link>}
              </article>
            ))
          )}
          {data.settlements.length > 0 && (
            <>
              <h3 className="font-bold">
                Transferencias de pedidos entregados
              </h3>
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
