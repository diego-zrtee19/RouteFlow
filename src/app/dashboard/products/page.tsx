"use client";

import Image from "next/image";
import { isTestProduct } from "@/domain/catalogExperience";
import { ProductDetailsEditor } from "@/components/dashboard/ProductDetailsEditor";
import { StockEditor, VariantInventory } from "@/components/dashboard/VariantInventory";
import { inventoryStatus, lowStockLimit } from "@/domain/inventoryStatus";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { SharePurchaseLink } from "@/components/shared/SharePurchaseLink";
import { Card } from "@/components/ui/Card";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Plus, Link2 } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";

interface CatalogProduct {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  variants: {
    id: string;
    label: string;
    price: number | null;
    stock: number;
    is_active: boolean;
  }[];
  price: number;
  currency: string;
  images: string[];
  stock: number;
  weightKg: number | null;
  dimensions?: { length: number; width: number; height: number } | null;
  shippingPayer?: "buyer" | "seller";
  isActive: boolean;
  deliveryOptions: string[];
}

interface CatalogLink {
  id: string;
  publicId: string;
  productId: string;
  views: number;
  active: boolean;
  createdAt: string;
}

function PackageWeightEditor({ product }: { product: CatalogProduct }) {
  const [weight, setWeight] = useState(product.weightKg?.toString() || "");
  const [dimensions, setDimensions] = useState({
    length: String(product.dimensions?.length ?? ""),
    width: String(product.dimensions?.width ?? ""),
    height: String(product.dimensions?.height ?? ""),
  });
  const [payer, setPayer] = useState(product.shippingPayer ?? "seller");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/dashboard/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          weightKg: Number(weight),
          dimensions: Object.fromEntries(
            Object.entries(dimensions).map(([k, v]) => [k, Number(v)]),
          ),
          shippingPayer: payer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "No se pudo guardar el peso");
      setWeight(String(data.product.weightKg));
      setMessage("Datos del paquete guardados");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el peso");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="space-y-2 pt-3">
      <div className="grid grid-cols-3 gap-2">
        {(["length", "width", "height"] as const).map((key, index) => (
          <label key={key} className="text-xs">
            {["Largo", "Ancho", "Alto"][index]} (cm)
            <input
              type="number"
              min="1"
              max="300"
              step="1"
              required
              value={dimensions[key]}
              onChange={(e) => setDimensions({ ...dimensions, [key]: e.target.value })}
              className="border rounded-sm w-full p-2"
            />
          </label>
        ))}
      </div>
      <label className="block text-xs">
        Quién paga el envío
        <select
          className="border rounded-sm w-full p-2"
          value={payer}
          onChange={(e) => setPayer(e.target.value as "seller" | "buyer")}
        >
          <option value="seller">Vendedor (envío incluido)</option>
          <option value="buyer">Comprador (cotizar antes de pagar)</option>
        </select>
      </label>
      <label htmlFor={`weight-${product.id}`} className="text-xs font-semibold">
        Peso del paquete cerrado (kg)
      </label>
      <div className="flex gap-2">
        <input
          id={`weight-${product.id}`}
          type="number"
          min="0.001"
          max="1000"
          step="0.001"
          required
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="border rounded-lg px-2 py-1 w-24 text-sm"
        />
        <Button type="submit" size="sm" isLoading={busy}>
          Guardar paquete
        </Button>
      </div>
      {message && (
        <p role="status" className="text-xs text-slate-600">
          {message}
        </p>
      )}
    </form>
  );
}

export default function ProductsPage() {
  const { t } = useI18n();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [links, setLinks] = useState<CatalogLink[]>([]);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/catalog", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw Error("No se pudo cargar el catálogo");
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        setProducts(data.products ?? []);
        setLinks(data.links ?? []);
        setError("");
        setLoaded(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const term = search.trim().toLocaleLowerCase("es");
  const visibleProducts = products.filter((product) => {
    const state = inventoryStatus(product);
    return (
      product.title.toLocaleLowerCase("es").includes(term) &&
      (availability === "all" ||
        availability === state ||
        (availability === "available" && state === "low"))
    );
  });
  const lowStockCount = products.filter((product) => inventoryStatus(product) === "low").length;
  const soldOutCount = products.filter((product) => inventoryStatus(product) === "empty").length;
  const refresh = () => setReload((n) => n + 1);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {error && (
          <p role="alert">
            {error}{" "}
            <button className="min-h-11 underline" onClick={() => setReload((n) => n + 1)}>
              Reintentar
            </button>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Inventario</h1>
            <p className="text-sm text-slate-500">
              Consulta existencias, prepara el envío y comparte enlaces desde tus productos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/products/import"
              className={buttonStyles({ variant: "secondary" })}
            >
              Importar y exportar
            </Link>
            <Link href="/dashboard/products/new?mode=quick" className={buttonStyles()}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Nuevo producto
            </Link>
          </div>
        </div>

        {loaded && (
          <div className="flex flex-wrap gap-2" aria-label="Resumen de existencias">
            <Button
              variant={availability === "low" ? "primary" : "secondary"}
              size="sm"
              aria-pressed={availability === "low"}
              onClick={() => setAvailability("low")}
            >
              Stock bajo ({lowStockCount})
            </Button>
            <Button
              variant={availability === "empty" ? "primary" : "secondary"}
              size="sm"
              aria-pressed={availability === "empty"}
              onClick={() => setAvailability("empty")}
            >
              Agotados ({soldOutCount})
            </Button>
          </div>
        )}
        {loaded && (
          <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4">
            <label className="flex-1 min-w-48 text-sm font-semibold">
              Buscar producto
              <input
                type="search"
                className="mt-2 block w-full border px-3"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nombre del producto"
              />
            </label>
            <label className="text-sm font-semibold">
              Disponibilidad
              <select
                className="mt-2 block border px-3"
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
              >
                <option value="all">Todos</option>
                <option value="available">Disponibles</option>
                <option value="low">Stock bajo (hasta {lowStockLimit})</option>
                <option value="empty">Sin unidades disponibles</option>
                <option value="inactive">Inactivos</option>
              </select>
            </label>
            <Button type="button" variant="secondary" onClick={() => setReload((n) => n + 1)}>
              Recargar inventario
            </Button>
          </div>
        )}
        {!loaded && !error && <p role="status">Cargando inventario…</p>}
        {loaded && !visibleProducts.length && (
          <p role="status">
            {products.length
              ? "No hay productos que coincidan con esos filtros."
              : "Agrega tu primer producto para empezar a controlar tus existencias."}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleProducts.map((product) => {
            const link = links.find((l) => l.productId === product.id && l.active);
            const status = inventoryStatus(product);
            return (
              <Card
                id={`product-${product.id}`}
                key={product.id}
                className="p-0 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="h-44 bg-slate-100 relative overflow-hidden">
                    {product.images[0] ? (
                      <Image
                        src={product.images[0]}
                        alt={product.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        Sin foto todavía
                      </div>
                    )}
                    <span className="absolute top-3 right-3 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded-full text-xs font-bold text-slate-800">
                      ${product.price} {product.currency}
                    </span>
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="font-semibold text-base text-ink">{product.title}</h3>
                    {(!product.images.length ||
                      isTestProduct(product.title) ||
                      product.title.trim().length < 4 ||
                      !product.description?.trim()) && (
                      <details className="rounded-xl bg-amber-50 px-3 text-sm text-amber-900 space-y-1">
                        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                          Mejorar esta publicación
                        </summary>
                        <ul className="list-disc pl-4">
                          {!product.images.length && <li>Agrega una foto propia del artículo.</li>}
                          {(isTestProduct(product.title) || product.title.trim().length < 4) && (
                            <li>
                              Revisa el nombre: debe identificar el producto real; evita
                              abreviaturas o nombres de prueba.
                            </li>
                          )}
                          {!product.description?.trim() && (
                            <li>Describe su estado, talla o características importantes.</li>
                          )}
                        </ul>
                        <p>
                          Abre «Editar descripción, precio, fotos y opciones» para corregirlo. Los
                          productos de prueba se ocultan por defecto en el catálogo público.
                        </p>
                      </details>
                    )}
                    <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
                      <span>
                        {product.isActive ? (
                          <>
                            <strong>{product.stock}</strong> disponibles para comprar
                          </>
                        ) : (
                          "Inactivo"
                        )}
                      </span>
                      <span>·</span>
                      <span>
                        Entrega:{" "}
                        {product.deliveryOptions
                          .map((option) =>
                            option === "shipping"
                              ? "Paquetería"
                              : option === "meetup"
                                ? "Encuentro"
                                : "Local",
                          )
                          .join(", ")}
                      </span>
                    </div>
                    {(status === "low" || status === "empty") && (
                      <p className="text-sm font-semibold text-amber-900">
                        {status === "empty" ? "Agotado" : "Stock bajo"}
                      </p>
                    )}
                    <details className="border-t border-slate-200 pt-2">
                      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                        Ajustar existencias
                      </summary>
                      {product.variants.length ? (
                        product.variants.some((variant) => variant.is_active) ? (
                          product.variants
                            .filter((variant) => variant.is_active)
                            .map((variant) => (
                              <VariantInventory
                                key={variant.id}
                                variant={variant}
                                onSaved={refresh}
                              />
                            ))
                        ) : (
                          <p className="text-sm text-slate-600">No hay variantes activas.</p>
                        )
                      ) : (
                        <StockEditor
                          key={product.stock}
                          item={{ id: product.id, label: product.title, stock: product.stock }}
                          kind="product"
                          onSaved={refresh}
                        />
                      )}
                    </details>
                    {product.deliveryOptions.includes("shipping") && (
                      <details className="border-t border-slate-200 pt-3">
                        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                          Configurar paquete para paquetería
                        </summary>
                        <PackageWeightEditor product={product} />
                        <Link
                          href="/dashboard/settings"
                          className="inline-flex min-h-11 items-center text-sm text-accent-600 underline"
                        >
                          Configurar dirección de origen
                        </Link>
                      </details>
                    )}
                    <ProductDetailsEditor
                      key={`${product.id}:${product.updatedAt}`}
                      product={product}
                      onSaved={() => setReload((n) => n + 1)}
                    />
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
                  {link ? (
                    <Link
                      href={`/p/${link.publicId}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-600 hover:underline"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      {t("dashboard.products.viewLink", { id: link.publicId })}
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-500">Sin enlace activo</span>
                  )}
                  {link && product.isActive && product.stock > 0 && (
                    <SharePurchaseLink publicId={link.publicId} title={product.title} showCopy />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
