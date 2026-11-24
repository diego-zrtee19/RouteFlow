"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button, buttonStyles } from "@/components/ui/Button";
import type { FinanceEntry } from "@/domain/financeLedger";
type Purchase = {
  id: string;
  order_number: string;
  amount: number;
  currency: string;
  payment_status: string;
  status: string;
  manualReceived: number;
  manualRemaining: number | null;
  providerConflict: boolean;
};
type Ledger = {
  entries: FinanceEntry[];
  orders: Purchase[];
  hasMore: boolean;
  moreOrders: boolean;
};
class RequestFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const v = await r.json();
  if (!r.ok)
    throw new RequestFailure(v.error?.message ?? "No se pudo completar la solicitud", r.status);
  return v;
}
const money = (n: number, c: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: c }).format(n);
const field = "mt-2 w-full rounded-xl border border-line bg-white p-3";
function Finances() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [kind, setKind] = useState("receipt");
  const [method, setMethod] = useState("cash");
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const attemptBody = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [voidId, setVoidId] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    json<Ledger>("/api/dashboard/finances?month=" + month)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, refresh]);
  const purchase = data?.orders.find((o) => o.id === orderId);
  const conflicts = data?.orders.filter((o) => o.providerConflict) ?? [];
  const code = kind === "receipt" ? (purchase?.currency ?? "MXN") : currency;
  const totals = new Map<string, { receipts: number; expenses: number }>();
  for (const entry of data?.entries ?? []) {
    if (entry.voided_at) continue;
    const v = totals.get(entry.currency) ?? { receipts: 0, expenses: 0 };
    v[entry.kind === "receipt" ? "receipts" : "expenses"] += Math.round(Number(entry.amount) * 100);
    totals.set(entry.currency, v);
  }
  function changed() {
    setClientId("");
    setNotice("");
  }
  async function save() {
    setSaving(true);
    setNotice("");
    const key = clientId || crypto.randomUUID();
    setClientId(key);
    try {
      await json("/api/dashboard/finances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          attemptBody.current ??
          (attemptBody.current = JSON.stringify({
            clientId: key,
            kind,
            method: kind === "expense" ? "expense" : method,
            orderId: kind === "receipt" ? orderId : null,
            amount: Number(amount),
            currency: code,
            description,
          })),
      });
      setAmount("");
      setDescription("");
      setClientId("");
      attemptBody.current = null;
      setNotice("Movimiento registrado. El pago del proveedor y el inventario no cambian.");
      setRefresh((n) => n + 1);
    } catch (e) {
      if (e instanceof RequestFailure && [400, 401, 403, 409].includes(e.status)) {
        setClientId("");
        attemptBody.current = null;
      }
      setNotice(e instanceof Error ? e.message : "No se registró. Conservamos el borrador.");
    } finally {
      setSaving(false);
    }
  }
  async function voidEntry() {
    setSaving(true);
    setNotice("");
    try {
      await json("/api/dashboard/finances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", id: voidId, reason }),
      });
      setVoidId("");
      setReason("");
      setRefresh((n) => n + 1);
      setNotice("Registro anulado; conservamos su historial y motivo.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-7">
        <p className="text-sm font-medium text-accent-700">El dinero de tu negocio</p>
        <h1 className="mt-1 text-3xl font-semibold">Cobros y gastos</h1>
        <p className="mt-3 max-w-3xl text-muted">
          Registra cobros externos a Stripe y gastos. Una anotación no confirma una transferencia,
          no libera fondos ni cambia inventario.
        </p>
      </header>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label>
          Mes del registro (UTC)
          <input
            type="month"
            min="2000-01"
            max="2099-12"
            className={field}
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
        <Button variant="secondary" onClick={() => setRefresh((n) => n + 1)}>
          Actualizar
        </Button>
        <a
          className={buttonStyles({ variant: "secondary" })}
          href={"/api/dashboard/finances?format=csv&month=" + month}
        >
          Exportar CSV para Excel
        </a>
      </div>
      {loading && <p role="status">Consultando movimientos…</p>}
      {error && <p role="alert">{error}</p>}
      {conflicts.length > 0 && (
        <section role="alert" className="mb-6 rounded-xl border border-amber-300 bg-white p-5">
          <h2 className="font-semibold">Cobros que necesitan conciliación</h2>
          <p>
            Estos pedidos tienen cobros manuales y un pago del proveedor. Revisa ambos antes de
            registrar más dinero o devolverlo.
          </p>
          {conflicts.map((o) => (
            <Link
              key={o.id}
              href={"/dashboard/orders/" + o.id}
              className="mr-4 text-accent-700 underline"
            >
              {o.order_number}
            </Link>
          ))}
        </section>
      )}
      <div className="mb-7 grid gap-3 sm:grid-cols-2">
        {[...totals].map(([c, v]) => (
          <section key={c} className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-semibold">{c} · Registros del mes</h2>
            <p>
              Cobros manuales: <strong>{money(v.receipts / 100, c)}</strong>
            </p>
            <p>
              Gastos: <strong>{money(v.expenses / 100, c)}</strong>
            </p>
            <p className="mt-2 text-sm text-muted">
              No es utilidad neta: faltan costos de mercancía y cobros del proveedor.
            </p>
          </section>
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-xl font-semibold">Registrar movimiento</h2>
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset
              disabled={saving || loading || !data || Boolean(clientId)}
              className="space-y-4"
            >
              <label className="block">
                Tipo
                <select
                  className={field}
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    changed();
                  }}
                >
                  <option value="receipt">Cobro manual o anticipo</option>
                  <option value="expense">Gasto</option>
                </select>
              </label>
              {kind === "receipt" ? (
                <>
                  <label className="block">
                    Pedido
                    <select
                      required
                      className={field}
                      value={orderId}
                      onChange={(e) => {
                        setOrderId(e.target.value);
                        changed();
                      }}
                    >
                      <option value="">Selecciona un pedido</option>
                      {data?.orders
                        .filter(
                          (o) =>
                            !["SUCCEEDED", "REFUNDED"].includes(o.payment_status) &&
                            !["CANCELLED", "REFUNDED"].includes(o.status),
                        )
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.order_number} · Pendiente manual:{" "}
                            {o.manualRemaining === null
                              ? "Por consultar"
                              : money(o.manualRemaining, o.currency)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block">
                    Método
                    <select
                      className={field}
                      value={method}
                      onChange={(e) => {
                        setMethod(e.target.value);
                        changed();
                      }}
                    >
                      <option value="cash">Efectivo recibido</option>
                      <option value="transfer">Transferencia revisada por mí</option>
                    </select>
                  </label>
                  <p className="text-sm text-muted">
                    Comprueba tú el ingreso antes de registrarlo. No equivale a un pago protegido
                    por RouteFlow.
                  </p>
                </>
              ) : (
                <label className="block">
                  Moneda
                  <select
                    className={field}
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      changed();
                    }}
                  >
                    <option>MXN</option>
                    <option>USD</option>
                  </select>
                </label>
              )}
              {kind === "receipt" && purchase && (
                <p className="text-sm text-muted">
                  Registrado manualmente: {money(purchase.manualReceived, code)} · Pendiente:{" "}
                  {purchase.manualRemaining === null
                    ? "Por consultar"
                    : money(purchase.manualRemaining, code)}
                </p>
              )}
              <label className="block">
                Importe ({code})
                <input
                  required
                  type="number"
                  min="0.01"
                  max="999999999"
                  step="0.01"
                  className={field}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    changed();
                  }}
                />
              </label>
              <label className="block">
                Concepto o referencia
                <input
                  required
                  maxLength={500}
                  className={field}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    changed();
                  }}
                />
              </label>
              <Button type="submit" isLoading={saving}>
                Registrar
              </Button>
            </fieldset>
            {clientId && !saving && (
              <Button type="button" onClick={save}>
                Comprobar el mismo registro
              </Button>
            )}
          </form>
          <p role="status" className="mt-4 text-sm">
            {notice}
          </p>
        </section>
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-xl font-semibold">Movimientos</h2>
          {data && !data.entries.length && !loading && (
            <p className="mt-4 text-muted">No hay movimientos registrados en este mes.</p>
          )}
          <ul className="divide-y divide-line">
            {data?.entries.map((entry) => (
              <li key={entry.id} className="py-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{entry.description}</strong>
                  <span>{money(Number(entry.amount), entry.currency)}</span>
                </div>
                <p className="text-sm text-muted">
                  {new Date(entry.created_at).toLocaleString("es-MX")} ·{" "}
                  {entry.kind === "expense"
                    ? "Gasto"
                    : entry.method === "cash"
                      ? "Efectivo"
                      : "Transferencia declarada"}
                </p>
                {entry.order_id && (
                  <Link
                    className="text-sm text-accent-700 underline"
                    href={"/dashboard/orders/" + entry.order_id}
                  >
                    Ver pedido
                  </Link>
                )}
                {entry.voided_at ? (
                  <p className="mt-2 text-sm">Anulado: {entry.void_reason}</p>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      setVoidId(entry.id);
                      setReason("");
                    }}
                  >
                    Corregir registro
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {data?.hasMore && (
            <p role="alert">
              Mostrando solo 500 movimientos. Los totales son parciales y la exportación se bloquea
              para no descargar datos incompletos.
            </p>
          )}
          {voidId && (
            <form
              className="mt-5 rounded-xl border border-line p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void voidEntry();
              }}
            >
              <p className="font-medium">Anular registro sin borrar el historial</p>
              <label className="mt-3 block">
                Motivo
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={field}
                />
              </label>
              <div className="mt-3 flex gap-2">
                <Button type="submit" variant="destructive" isLoading={saving}>
                  Anular registro
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setVoidId("")}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}
          {data?.moreOrders && (
            <p className="mt-5 text-sm text-muted">El selector muestra los últimos 100 pedidos.</p>
          )}
        </section>
      </div>
    </div>
  );
}
export default function FinancesPage() {
  const { userId } = useAuth();
  return <DashboardLayout>{userId && <Finances key={userId} />}</DashboardLayout>;
}
