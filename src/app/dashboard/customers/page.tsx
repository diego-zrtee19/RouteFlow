"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/Button";
import type { CustomerSummary, CustomerOrder } from "@/domain/customerFollowup";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok) throw Error(result.error?.message ?? "No se pudo completar la solicitud");
  return result;
}
const date = (value: string) => new Date(value).toLocaleString("es-MX");
function CustomerCard({
  customer,
  onSaved,
  onDirty,
}: {
  customer: CustomerSummary;
  onSaved: (value: CustomerSummary) => void;
  onDirty: (value: boolean) => void;
}) {
  const [note, setNote] = useState(customer.note);
  const [followup, setFollowup] = useState(customer.followup_at ?? "");
  const [revision, setRevision] = useState(customer.revision);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    request<{ orders: CustomerOrder[]; hasMore: boolean }>(
      "/api/dashboard/customers?email=" + encodeURIComponent(customer.email),
    )
      .then((data) => {
        if (active) {
          setOrders(data.orders);
          setHasMore(data.hasMore);
        }
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customer.email, retry]);
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const result = await request<{ revision: number }>("/api/dashboard/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: customer.email,
          note,
          followupAt: followup || null,
          revision,
        }),
      });
      setRevision(result.revision);
      onDirty(false);
      onSaved({ ...customer, note, followup_at: followup || null, revision: result.revision });
      setMessage("Ficha guardada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se guardó. Conservamos tus datos.");
    } finally {
      setSaving(false);
    }
  }
  const localDate = followup
    ? new Date(Date.parse(followup) - new Date(followup).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
  return (
    <section
      className="rounded-2xl border border-line bg-white p-5 sm:p-7"
      aria-label="Ficha del cliente"
    >
      <h2 className="text-xl font-semibold text-ink">{customer.name || "Cliente"}</h2>
      <p className="break-all text-sm text-muted">{customer.email}</p>
      <p className="mt-2 text-sm text-muted">
        Agrupado por el correo indicado al comprar. No implica identidad verificada.
      </p>
      <div className="my-6 space-y-4">
        <label className="block text-sm font-medium">
          Notas y preferencias
          <textarea
            className="mt-2 min-h-32 w-full rounded-xl border border-line p-3 font-normal"
            maxLength={4000}
            value={note}
            disabled={saving}
            onChange={(e) => {
              setNote(e.target.value);
              onDirty(true);
            }}
            placeholder="Talla habitual, dudas o acuerdos que necesitas recordar"
          />
        </label>
        <label className="block text-sm font-medium">
          Próximo contacto
          <input
            type="datetime-local"
            className="mt-2 block w-full rounded-xl border border-line p-3"
            value={localDate}
            disabled={saving}
            onChange={(e) => {
              if (e.target.value && !Number.isFinite(Date.parse(e.target.value))) return;
              setFollowup(e.target.value ? new Date(e.target.value).toISOString() : "");
              onDirty(true);
            }}
          />
        </label>
        <p className="text-sm text-muted">
          La fecha organiza tus pendientes aquí. No envía mensajes ni notificaciones
          automáticamente.
        </p>
        <Button onClick={save} isLoading={saving}>
          Guardar ficha
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
      <h3 className="border-t border-line pt-5 font-semibold">Historial de pedidos</h3>
      <Link
        href="/dashboard/finances"
        className="mt-3 inline-flex text-sm font-medium text-accent-700 underline underline-offset-4"
      >
        Revisar cobros y gastos del negocio
      </Link>
      {loading ? (
        <p className="py-4" role="status">
          Cargando historial…
        </p>
      ) : loadError ? (
        <div role="alert">
          <p>{loadError}</p>
          <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {orders.map((order) => (
            <li key={order.id} className="py-4">
              <Link
                className="font-semibold text-accent-700 underline underline-offset-4"
                href={"/dashboard/orders/" + order.id}
              >
                {order.order_number}
              </Link>
              <p className="text-sm">
                {date(order.created_at)} ·{" "}
                {new Intl.NumberFormat("es-MX", {
                  style: "currency",
                  currency: order.currency,
                }).format(order.amount)}
              </p>
              <p className="text-sm text-muted">
                Pedido: {order.status} · Pago: {order.payment_status}
              </p>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <p className="text-sm text-muted">
          Mostrando los 100 pedidos más recientes. Consulta Pedidos para el resto.
        </p>
      )}
    </section>
  );
}
function Customers() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CustomerSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<CustomerSummary | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    request<{ customers: CustomerSummary[]; hasMore: boolean }>(
      "/api/dashboard/customers?search=" + encodeURIComponent(query) + "&offset=" + offset,
    )
      .then((data) => {
        if (active) {
          setRows(data.customers);
          setHasMore(data.hasMore);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, offset, retry]);
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-7">
        <p className="text-sm font-medium text-accent-700">Relación con tus compradores</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Clientes</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Tus compras ya generan un historial. Guarda preferencias y decide a quién dar seguimiento.
        </p>
      </header>
      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setQuery(search.trim());
          setRetry((n) => n + 1);
        }}
      >
        <label className="sr-only" htmlFor="customer-search">
          Buscar por nombre o correo
        </label>
        <input
          id="customer-search"
          className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3"
          maxLength={100}
          placeholder="Buscar por nombre o correo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit">Buscar</Button>
      </form>
      {error ? (
        <div role="alert" className="mb-5 rounded-xl border border-line bg-white p-5">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-label="Lista de clientes" aria-busy={loading} className="space-y-3">
          {loading ? (
            <p role="status">Cargando clientes…</p>
          ) : rows.length === 0 && !error ? (
            <div className="rounded-2xl border border-line bg-white p-7">
              <h2 className="font-semibold">
                {query ? "No hay coincidencias" : "Todavía no tienes clientes con pedidos"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                Cada pedido con correo aparecerá aquí automáticamente. No necesitas capturarlo otra
                vez.
              </p>
            </div>
          ) : (
            rows.map((customer) => (
              <button
                type="button"
                key={customer.email}
                aria-pressed={selected?.email === customer.email}
                onClick={() => {
                  if (selected?.email === customer.email) return;
                  if (
                    selected?.email !== customer.email &&
                    dirty &&
                    !window.confirm("¿Abrir otra ficha? Guarda primero tus cambios pendientes.")
                  )
                    return;
                  setSelected(customer);
                  setDirty(false);
                }}
                className={`w-full rounded-2xl border bg-white p-5 text-left transition-colors hover:border-accent-400 focus-visible:outline-2 focus-visible:outline-accent-700 ${selected?.email === customer.email ? "border-accent-700" : "border-line"}`}
              >
                <span className="block font-semibold text-ink">{customer.name || "Cliente"}</span>
                <span className="block break-all text-sm text-muted">{customer.email}</span>
                <span className="mt-3 block text-sm">
                  {customer.order_count} pedidos · Último: {date(customer.last_order_at)}
                </span>
                {customer.followup_at && (
                  <span className="mt-2 block text-sm font-medium text-accent-700">
                    {Date.parse(customer.followup_at) < Date.now()
                      ? "Contacto pendiente"
                      : "Próximo contacto"}
                    : {date(customer.followup_at)}
                  </span>
                )}
              </button>
            ))
          )}
          <div className="flex justify-between gap-3">
            <Button
              variant="secondary"
              disabled={loading || offset === 0}
              onClick={() => setOffset((n) => Math.max(0, n - 50))}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={loading || !hasMore || offset >= 50000}
              onClick={() => setOffset((n) => n + 50)}
            >
              Siguiente
            </Button>
          </div>
        </section>
        {selected ? (
          <CustomerCard
            key={selected.email}
            customer={selected}
            onDirty={setDirty}
            onSaved={(value) => {
              setSelected(value);
              setRows((old) => old.map((row) => (row.email === value.email ? value : row)));
            }}
          />
        ) : (
          <aside className="rounded-2xl border border-dashed border-line p-7 text-muted">
            Selecciona un cliente para ver sus pedidos y preparar el siguiente contacto.
          </aside>
        )}
      </div>
    </div>
  );
}
export default function CustomersPage() {
  const { userId } = useAuth();
  return <DashboardLayout>{userId && <Customers key={userId} />}</DashboardLayout>;
}
