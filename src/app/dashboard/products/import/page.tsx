"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button, buttonStyles } from "@/components/ui/Button";
import { parseInventoryImport, type InventoryImportRow } from "@/domain/inventoryImport";

type Product = {
  id: string;
  title: string;
  stock: number;
  currency: string;
  is_active: boolean;
  business: {
    sku: string;
    unit_cost: number | null;
    condition: string;
    low_stock_threshold: number;
  } | null;
};
type History = {
  id: number;
  product_id: string;
  before_stock: number;
  after_stock: number;
  created_at: string;
};
const endpoint = "/api/dashboard/inventory/import";
function InventoryTools() {
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<InventoryImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const load = useCallback(async () => {
    const res = await fetch(endpoint, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "No pudimos cargar el inventario");
    setProducts(data.products);
    setHistory(data.history);
    setHasMore(data.hasMore);
    setLoaded(true);
  }, []);
  useEffect(() => {
    let active = true;
    load().catch((e) => {
      if (active) setFailure(e.message);
    });
    return () => {
      active = false;
    };
  }, [load]);
  async function choose(file: File | undefined) {
    setCsv("");
    setRows([]);
    setErrors([]);
    setNotice("");
    setFailure("");
    if (!file) return;
    if (file.size > 1000000) {
      setErrors(["El archivo supera 1 MB."]);
      return;
    }
    try {
      const text = await file.text();
      const result = parseInventoryImport(text);
      setCsv(text);
      setRows(result.products);
      setErrors(result.errors);
      setClientId(crypto.randomUUID());
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "No pudimos leer el archivo"]);
    }
  }
  async function send(productId?: string) {
    if (busy) return;
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productId ? { action: "publish", productId } : { csv, clientId }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error?.message || data.message || "No pudimos completar la operación");
      setNotice(
        productId
          ? "Producto publicado en tu catálogo."
          : `${data.count} productos ${data.duplicate ? "ya estaban importados; no se duplicaron" : "guardados como borradores"}.`,
      );
      if (!productId) {
        setCsv("");
        setRows([]);
      }
      await load();
    } catch (e) {
      setFailure(
        e instanceof Error
          ? e.message
          : "Conexión interrumpida. Puedes reintentar con el mismo archivo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <Link href="/dashboard/products" className="text-sm text-accent-700 underline">
        Volver al inventario
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-ink">Importar y revisar inventario</h1>
        <p className="mt-2 text-muted">
          Tus costos son privados. Los productos importados quedan ocultos hasta que los revises y
          publiques.
        </p>
      </header>
      {failure && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          {failure}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              load()
                .then(() => setFailure(""))
                .catch((e) => setFailure(e.message))
            }
          >
            Actualizar inventario
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-accent-200 bg-accent-50 p-4">
          {notice}
        </p>
      )}
      <section
        aria-labelledby="import-title"
        className="rounded-2xl border border-line bg-white p-5 sm:p-6 space-y-4"
      >
        <h2 id="import-title" className="text-lg font-semibold">
          1. Prepara tu archivo
        </h2>
        <p className="text-sm text-muted">
          Descarga la plantilla y ábrela en Excel. Guarda como CSV UTF-8: máximo 200 productos y 1
          MB. Importa artículos nuevos; no actualiza productos ni reservas existentes. Usa punto
          decimal, sin separador de miles.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            className={buttonStyles({ variant: "secondary" })}
            href={`${endpoint}?format=template`}
          >
            Descargar plantilla
          </a>
          <a className={buttonStyles({ variant: "outline" })} href={`${endpoint}?format=csv`}>
            Exportar inventario CSV
          </a>
        </div>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer py-2">Cómo completar las columnas</summary>
          <p>
            SKU: clave única por artículo. Condición: new (nuevo), used (usado), refurbished
            (reacondicionado) o unspecified (sin especificar). Entrega: meetup (coordinada),
            shipping (paquetería) o local_delivery (local). Costo puede quedar vacío; alerta indica
            a partir de cuántas unidades avisarte.
          </p>
        </details>
        <label className="block rounded-xl border-2 border-dashed border-accent-200 bg-surface p-5">
          <span className="block font-semibold">Seleccionar archivo CSV</span>
          <span className="mt-1 block text-sm text-muted">
            Lo revisaremos en tu navegador antes de guardarlo.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            className="mt-4 block max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-700 file:px-4 file:py-3 file:font-semibold file:text-white"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>
        {errors.length > 0 && (
          <div role="alert" className="rounded-xl bg-rose-50 p-4">
            <p className="font-semibold">Corrige el archivo antes de importar</p>
            <ul className="list-disc pl-5 text-sm">
              {errors.slice(0, 10).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            {errors.length > 10 && <p>Hay {errors.length} filas con errores.</p>}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <h3 className="font-semibold">2. Revisa {rows.length} productos</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Primeros diez productos del archivo</caption>
                <thead>
                  <tr>
                    {["SKU", "Producto", "Precio", "Stock", "Costo privado"].map((h) => (
                      <th className="border-b border-line p-3" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((p) => (
                    <tr key={p.sku}>
                      <td className="p-3">{p.sku}</td>
                      <td className="p-3">{p.title}</td>
                      <td className="p-3">
                        {p.price.toFixed(2)} {p.currency}
                      </td>
                      <td className="p-3">{p.stock}</td>
                      <td className="p-3">{p.unitCost?.toFixed(2) ?? "Sin registrar"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 10 && (
              <p className="text-sm text-muted">
                Vista previa de los primeros 10. Se validarán las {rows.length} filas.
              </p>
            )}
            <Button
              disabled={errors.length > 0 || !csv || busy}
              isLoading={busy}
              onClick={() => void send()}
            >
              Guardar {rows.length} borradores
            </Button>
          </>
        )}
      </section>
      <section aria-labelledby="drafts-title" className="space-y-3">
        <h2 id="drafts-title" className="text-lg font-semibold">
          3. Completa fotos y publica
        </h2>
        <p className="text-sm text-muted">
          En Inventario puedes editar fotos, descripción y paquete. Después vuelve aquí para
          publicar. No publicaremos un producto sin foto ni existencias.
        </p>
        {!loaded ? (
          <p role="status">Cargando inventario…</p>
        ) : products.filter((p) => p.business).length === 0 ? (
          <p className="rounded-xl border border-line p-5 text-muted">
            Todavía no tienes artículos importados.
          </p>
        ) : (
          products
            .filter((p) => p.business)
            .map((p) => (
              <article
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-4"
              >
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="text-sm text-muted">
                    {p.business?.sku} · {p.stock} unidades · Costo:{" "}
                    {p.business?.unit_cost == null
                      ? "sin registrar"
                      : `${p.business.unit_cost.toFixed(2)} ${p.currency}`}
                  </p>
                  {p.stock <= (p.business?.low_stock_threshold ?? 3) && (
                    <p className="text-sm font-semibold text-amber-800">
                      Existencias bajas · alerta en {p.business?.low_stock_threshold}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/products#product-${p.id}`}
                    className={buttonStyles({ variant: "secondary" })}
                  >
                    Editar producto
                  </Link>
                  {!p.is_active ? (
                    <Button disabled={busy} onClick={() => void send(p.id)}>
                      Publicar
                    </Button>
                  ) : (
                    <span className="self-center text-sm text-muted">Publicado</span>
                  )}
                </div>
              </article>
            ))
        )}
        {hasMore && (
          <p role="status">
            Se muestran los 500 productos más recientes. La exportación se bloquea para evitar un
            archivo incompleto.
          </p>
        )}
      </section>
      <section
        aria-labelledby="history-title"
        className="rounded-2xl border border-line bg-white p-5"
      >
        <h2 id="history-title" className="text-lg font-semibold">
          Cambios recientes de existencias
        </h2>
        <p className="mt-1 text-sm text-muted">
          Últimos 50 cambios del total por producto desde que se habilitó este historial. Incluye
          reservas y ajustes; aún no identifica el motivo ni quién lo hizo.
        </p>
        <ul className="mt-3 divide-y divide-line">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
              <span>
                {products.find((p) => p.id === h.product_id)?.title ??
                  "Producto fuera de esta lista"}{" "}
                · {h.before_stock} → {h.after_stock} unidades
              </span>
              <time dateTime={h.created_at} className="text-muted">
                {new Date(h.created_at).toLocaleString("es-MX")}
              </time>
            </li>
          ))}
        </ul>
        {loaded && history.length === 0 && (
          <p className="mt-3 text-sm text-muted">Sin movimientos registrados todavía.</p>
        )}
      </section>
    </div>
  );
}
export default function InventoryImportPage() {
  const { userId } = useAuth();
  return <DashboardLayout>{userId && <InventoryTools key={userId} />}</DashboardLayout>;
}
