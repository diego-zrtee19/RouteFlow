"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/Button";
import { conversationSaleProgress, type ConversationSale } from "@/domain/conversationSale";
import type { CartLine } from "@/domain/catalogCart";

type Product = {
  id: string;
  title: string;
  price: number;
  currency: string;
  stock: number;
  isActive: boolean;
  variants: {
    id: string;
    label: string;
    price: number | null;
    stock: number;
    is_active: boolean;
  }[];
};
type ProductOption = {
  key: string;
  productId: string;
  variantId: string | undefined;
  title: string;
  price: number;
  currency: string;
  stock: number;
};
export type ConversationSaleDraft = { quantities: Record<string, number>; clientId?: string };
export const emptySaleDraft: ConversationSaleDraft = { quantities: {} };
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
const endpoint = "/api/dashboard/instagram/sales";
async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "No se pudo completar la operación");
  return data;
}

export function ConversationSales({
  sender,
  draft,
  updateDraft,
  onCompose,
  composeDisabled = false,
}: {
  sender: string;
  draft: ConversationSaleDraft;
  updateDraft: (change: (current: ConversationSaleDraft) => ConversationSaleDraft) => void;
  onCompose: (sale: ConversationSale) => void;
  composeDisabled?: boolean;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<ConversationSale[]>([]);
  const [error, setError] = useState("");
  const [inventoryError, setInventoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const [saleResult, inventoryResult] = await Promise.allSettled([
          json<{ sales: ConversationSale[] }>(`${endpoint}?sender=${sender}`, {
            signal: controller.signal,
          }),
          json<{ products: Product[] }>("/api/dashboard/catalog", {
            signal: controller.signal,
          }),
        ]);
        if (!controller.signal.aborted) {
          if (saleResult.status === "fulfilled") {
            setSales(saleResult.value.sales);
            setError("");
          } else {
            setError("No se pudieron actualizar las compras. Inténtalo de nuevo.");
          }
          if (inventoryResult.status === "fulfilled") {
            setProducts(inventoryResult.value.products);
            setInventoryError("");
          } else {
            setInventoryError(
              "No se pudo actualizar el inventario. Usa Actualizar antes de preparar otro enlace.",
            );
          }
        }
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "No se pudieron cargar las compras",
          );
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [sender, refresh]);
  const options = products
    .filter((p) => p.isActive)
    .flatMap<ProductOption>((p) =>
      p.variants.some((v) => v.is_active)
        ? p.variants
            .filter((v) => v.is_active)
            .map((v) => ({
              key: `${p.id}:${v.id}`,
              productId: p.id,
              variantId: v.id,
              title: `${p.title} · ${v.label}`,
              price: v.price ?? p.price,
              currency: p.currency,
              stock: Math.min(v.stock, p.stock),
            }))
        : [
            {
              key: p.id,
              productId: p.id,
              variantId: undefined,
              title: p.title,
              price: p.price,
              currency: p.currency,
              stock: p.stock,
            },
          ],
    );
  const selected = options.filter((p) => (draft.quantities[p.key] ?? 0) > 0);
  const unavailable = Object.entries(draft.quantities).filter(
    ([key, qty]) => qty > 0 && !options.some((option) => option.key === key && option.stock >= qty),
  );
  const filtered = options.filter((p) =>
    p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  function quantity(key: string, value: number) {
    updateDraft((current) => ({ quantities: { ...current.quantities, [key]: value } }));
  }
  async function prepare() {
    if (busy || inventoryError || !selected.length || unavailable.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    const clientId = draft.clientId ?? crypto.randomUUID();
    updateDraft((current) => ({ ...current, clientId }));
    const items: CartLine[] = selected.map((p) => ({
      productId: p.productId,
      ...(p.variantId ? { variantId: p.variantId } : {}),
      quantity: draft.quantities[p.key],
    }));
    try {
      await json(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, items, clientId }),
      });
      setNotice("Enlace preparado. Consulta su estado en la tarjeta de la compra.");
      updateDraft(() => ({ quantities: {} }));
      setRefresh((v) => v + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo preparar el enlace");
    } finally {
      setBusy(false);
    }
  }
  async function cancel(sale: ConversationSale) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await json(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, action: "cancel", id: sale.id }),
      });
      setNotice("Enlace desactivado. Para cambiar artículos, prepara uno nuevo.");
      setRefresh((v) => v + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo desactivar el enlace");
    } finally {
      setBusy(false);
    }
  }
  async function copy(sale: ConversationSale) {
    try {
      await navigator.clipboard.writeText(sale.url);
      setNotice("Enlace copiado. Copiarlo no confirma que ya se haya enviado.");
    } catch {
      setNotice("Selecciona y copia la dirección del enlace.");
    }
  }
  return (
    <section
      aria-label="Ventas de esta conversación"
      className="border-t border-line bg-white p-4 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">De la conversación a la compra</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Prepara el enlace, compártelo y vuelve aquí para ver el pago y la entrega.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setNotice("");
            setRefresh((v) => v + 1);
          }}
        >
          Actualizar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {inventoryError && (
        <p role="alert" className="text-sm text-rose-700">
          {inventoryError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-accent-700">
          {notice}
        </p>
      )}
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer min-h-9 text-sm font-semibold text-accent-700">
          Seleccionar productos y preparar enlace
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium">
            Buscar en tu inventario
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre del producto o variante"
              className="mt-1 w-full rounded-lg border border-line p-2.5 text-sm"
            />
          </label>
          <div className="max-h-56 overflow-y-auto space-y-2">
            {filtered.slice(0, 80).map((p) => (
              <div key={p.key} className="rounded-lg border border-line p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={(draft.quantities[p.key] ?? 0) > 0}
                    disabled={busy || (p.stock < 1 && !(draft.quantities[p.key] > 0))}
                    onChange={(e) => quantity(p.key, e.target.checked ? 1 : 0)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{p.title}</span>
                    <span className="text-xs text-muted">
                      {money(p.price, p.currency)} ·{" "}
                      {p.stock > 0 ? `${p.stock} disponibles` : "Sin existencias"}
                    </span>
                  </span>
                </label>
                {(draft.quantities[p.key] ?? 0) > 0 && (
                  <label className="mt-2 flex items-center justify-between gap-2 text-xs">
                    Cantidad
                    <input
                      type="number"
                      min={1}
                      max={Math.min(20, p.stock)}
                      value={draft.quantities[p.key]}
                      disabled={busy}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= Math.min(20, p.stock))
                          quantity(p.key, n);
                      }}
                      className="w-20 rounded-lg border border-line p-2"
                    />
                  </label>
                )}
              </div>
            ))}
            {filtered.length > 80 && (
              <p className="text-xs text-muted">Usa la búsqueda para ver más productos.</p>
            )}
            {!filtered.length && (
              <p className="text-sm text-muted">
                {products.length
                  ? "Sin coincidencias."
                  : "Agrega productos a tu inventario para preparar una compra."}
              </p>
            )}
          </div>
          {selected.length > 0 && (
            <p className="text-sm font-medium">
              {selected.length} artículos seleccionados ·{" "}
              {selected.reduce((sum, p) => sum + draft.quantities[p.key], 0)} unidades
            </p>
          )}
          {unavailable.length > 0 && (
            <p role="alert" className="text-sm text-rose-700">
              Hay artículos seleccionados sin existencias suficientes.{" "}
              <button
                className="underline"
                onClick={() =>
                  updateDraft((current) => ({
                    quantities: Object.fromEntries(
                      Object.entries(current.quantities).filter(
                        ([key]) => !unavailable.some(([bad]) => bad === key),
                      ),
                    ),
                  }))
                }
              >
                Quitarlos de la selección
              </button>
            </p>
          )}
          <Button
            size="sm"
            isLoading={busy}
            disabled={
              !selected.length ||
              !!inventoryError ||
              unavailable.length > 0 ||
              selected.length > 20 ||
              selected.reduce((sum, p) => sum + draft.quantities[p.key], 0) > 50
            }
            onClick={prepare}
          >
            Preparar enlace de compra
          </Button>
          <p className="text-xs text-muted">
            El comprador confirma sus datos y entrega. El precio se valida de nuevo y el inventario
            se reserva al iniciar el pago.
          </p>
        </div>
      </details>
      {loading && (
        <p role="status" className="text-sm text-muted">
          Consultando compras…
        </p>
      )}
      {sales.map((sale) => {
        const progress = conversationSaleProgress(sale);
        const active = !sale.order && !sale.cancelledAt && Date.parse(sale.expiresAt) > Date.now();
        return (
          <article key={sale.id} className="rounded-xl border border-line p-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">{progress.label}</h4>
              <span className="text-sm font-semibold">
                {money(sale.subtotal, sale.currency)} + envío si aplica
              </span>
            </div>
            <ol aria-label="Progreso de la venta" className="flex flex-wrap gap-2 text-[11px]">
              {[
                "Conversación",
                "Preparado",
                "Enviado / compra iniciada",
                "Pago confirmado",
                "Entrega",
              ].map((step, index) => (
                <li
                  key={step}
                  className={`rounded-full px-2 py-1 ${progress.step >= index ? "bg-accent-50 font-semibold text-accent-700" : "bg-surface text-muted"}`}
                >
                  {step}
                </li>
              ))}
            </ol>
            <ul className="space-y-1 text-sm text-muted">
              {sale.lines.map((line, index) => (
                <li key={index}>
                  {line.title} × {line.quantity}
                </li>
              ))}
            </ul>
            {sale.order ? (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  Pedido {sale.order.number} · originado en este enlace. Esto vincula la compra, no
                  verifica la identidad del perfil.
                </p>
                {sale.order.trackingNumber && (
                  <p className="text-sm">Rastreo: {sale.order.trackingNumber}</p>
                )}
                <Link
                  href={`/dashboard/orders/${sale.order.id}?instagram=${sender}`}
                  className={buttonStyles({ size: "sm" })}
                >
                  {progress.action}
                </Link>
              </div>
            ) : active ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={composeDisabled} onClick={() => onCompose(sale)}>
                    Poner enlace en la respuesta
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => copy(sale)}>
                    Copiar enlace
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancel(sale)}>
                    Desactivar
                  </Button>
                </div>
                <input
                  aria-label="Enlace preparado para esta compra"
                  readOnly
                  value={sale.url}
                  className="w-full rounded-lg border border-line bg-surface p-2 text-xs"
                />
                <p className="text-xs text-muted">
                  Válido hasta {new Date(sale.expiresAt).toLocaleDateString("es-MX")}. Se marca
                  enviado cuando Meta confirma el mensaje con este enlace.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted">
                Prepara otro enlace si el cliente quiere continuar.
              </p>
            )}
          </article>
        );
      })}
      {!loading && !sales.length && (
        <p className="text-sm text-muted">
          Todavía no has preparado una compra para esta conversación.
        </p>
      )}
    </section>
  );
}
