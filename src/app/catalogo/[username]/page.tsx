"use client";
import { CommerceHeader } from "@/components/shared/CommerceHeader";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { PublicCatalog, CartLine } from "@/domain/catalogCart";
import { readCatalogCart, saveCatalogCart } from "@/lib/catalogCartStore";
import { filterCatalog, isTestProduct, catalogStartingPrice } from "@/domain/catalogExperience";
import { ProductGallery } from "@/components/shared/ProductGallery";

export default function CatalogPage() {
  const username = String(useParams().username);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [availableOnly, setAvailableOnly] = useState(true);
  const [showTests, setShowTests] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    setError("");
    setCart(readCatalogCart(username));
    fetch(`/api/public/catalog/${encodeURIComponent(username)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        setCatalog(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [username, reload]);
  function update(lines: CartLine[]) {
    if (!saveCatalogCart(username, lines)) {
      setMessage(
        "No se pudo guardar el carrito. Permite almacenamiento en este navegador para continuar.",
      );
      return false;
    }
    setCart(lines);
    return true;
  }
  function add(productId: string) {
    const product = catalog?.products.find((product) => product.id === productId);
    if (!product) return;
    const variantId = selected[productId];
    if (product.variants.length && !variantId) {
      setMessage("Selecciona la talla o color antes de agregarlo.");
      return;
    }
    const variant = product.variants.find((variant) => variant.id === variantId);
    if (!product.inStock || (product.variants.length && !variant?.inStock)) return;
    if (cart.reduce((sum, line) => sum + line.quantity, 0) >= 50) {
      setMessage("Máximo 50 unidades por pedido.");
      return;
    }
    const found = cart.find((line) => line.productId === productId && line.variantId === variantId);
    if (found && found.quantity >= 20) {
      setMessage("Máximo 20 unidades por artículo.");
      return;
    }
    if (!found && cart.length >= 20) {
      setMessage("Máximo 20 artículos distintos.");
      return;
    }
    if (
      update(
        found
          ? cart.map((line) => (line === found ? { ...line, quantity: line.quantity + 1 } : line))
          : [...cart, { productId, ...(variantId ? { variantId } : {}), quantity: 1 }],
      )
    ) {
      setMessage(`${product.title} agregado al carrito`);
    }
  }
  const money = (value: number, currency = "MXN") =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
  const subtotal = cart.reduce((sum, line) => {
    const product = catalog?.products.find((product) => product.id === line.productId);
    return (
      sum +
      (product?.variants.find((variant) => variant.id === line.variantId)?.price ??
        product?.price ??
        0) *
        line.quantity
    );
  }, 0);
  const visibleProducts = catalog
    ? filterCatalog(catalog.products, search, availableOnly, showTests)
    : [];
  return (
    <div className="min-h-screen bg-brand-bg pb-28">
      <CommerceHeader>
        <a href="#carrito" className="border-l border-white/30 pl-4 hover:underline">
          Carrito ({cart.reduce((sum, line) => sum + line.quantity, 0)})
        </a>
      </CommerceHeader>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button
              className="min-h-11 underline text-accent-700"
              onClick={() => setReload((value) => value + 1)}
            >
              Volver a cargar catálogo
            </button>
          </div>
        )}
        {!catalog && !error && <p role="status">Cargando catálogo…</p>}
        {catalog && (
          <>
            <section className="bg-white border-b border-slate-200 p-5 sm:p-8 flex items-start sm:items-center gap-4">
              {catalog.seller.logo?.startsWith("https://") && (
                <Image
                  unoptimized
                  src={catalog.seller.logo}
                  alt={`Logo de ${catalog.seller.name}`}
                  width={72}
                  height={72}
                  className="rounded-lg object-cover"
                />
              )}
              <div>
                <h1 className="text-3xl font-medium">{catalog.seller.name}</h1>
                <p>{catalog.seller.description}</p>
                <p className="text-sm text-slate-500">
                  Catálogo de @{username} · Compra sin registrarte y consulta tu pedido en
                  RouteFlow.
                </p>
              </div>
            </section>
            <label className="block text-sm font-medium text-slate-700">
              Buscar en este catálogo
              <input
                className="block w-full border rounded-lg p-3 mt-2"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nombre del producto"
              />
            </label>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="font-semibold mb-2">Qué productos quieres ver</legend>
              <label className="inline-flex items-center gap-2 min-h-11">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(event) => setAvailableOnly(event.target.checked)}
                />
                Solo disponibles
              </label>
              {catalog.products.some((product) => isTestProduct(product.title)) && (
                <label className="inline-flex items-center gap-2 min-h-11">
                  <input
                    type="checkbox"
                    checked={showTests}
                    onChange={(event) => setShowTests(event.target.checked)}
                  />
                  Mostrar productos con nombre de prueba / demo
                </label>
              )}
            </fieldset>
            <p role="status" className="text-sm text-slate-600">
              {visibleProducts.length} productos con estos filtros. Los agotados y los nombres que
              comienzan con PRUEBA, DEMO o TEST se pueden mostrar usando los filtros.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProducts.map((product) => {
                const variant = product.variants.find(
                  (variant) => variant.id === selected[product.id],
                );
                return (
                  <article
                    key={product.id}
                    className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 flex flex-col"
                  >
                    <ProductGallery
                      key={product.id}
                      images={product.images}
                      title={product.title}
                    />
                    <p
                      className={`text-xs font-medium ${product.inStock ? "text-emerald-700" : "text-slate-500"}`}
                    >
                      {product.inStock ? "Disponible" : "Agotado"}
                    </p>
                    <h2 className="text-base font-medium text-slate-900">{product.title}</h2>
                    <p className="text-sm leading-relaxed text-slate-600 break-words">
                      {product.description}
                    </p>
                    <p className="text-2xl font-normal text-slate-950">
                      {product.variants.length && !variant ? "Desde " : ""}
                      {money(
                        variant?.price ??
                          (product.variants.length ? catalogStartingPrice(product) : product.price),
                        product.currency,
                      )}
                    </p>
                    {!!product.variants.length && (
                      <label className="block text-sm">
                        Talla / color
                        <select
                          value={selected[product.id] ?? ""}
                          className="block border p-3 rounded-lg w-full"
                          onChange={(event) =>
                            setSelected({ ...selected, [product.id]: event.target.value })
                          }
                        >
                          <option value="">Selecciona una opción</option>
                          {product.variants.map((variant) => (
                            <option key={variant.id} value={variant.id} disabled={!variant.inStock}>
                              {variant.label}
                              {!variant.inStock ? " · agotada" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      className="mt-auto w-full min-h-11 bg-accent-700 text-white rounded-lg p-3 disabled:bg-slate-300"
                      onClick={() => add(product.id)}
                      disabled={!product.inStock || (!!variant && !variant.inStock)}
                    >
                      {product.inStock ? "Agregar al carrito" : "Agotado"}
                    </button>
                  </article>
                );
              })}
            </div>
            {!catalog.products.length ? (
              <p>Este vendedor todavía no tiene productos publicados en su catálogo.</p>
            ) : (
              !visibleProducts.length && (
                <p>
                  No hay coincidencias. Cambia la búsqueda o muestra los productos agotados / de
                  prueba.
                </p>
              )
            )}
            <section id="carrito" className="bg-white border rounded-lg p-5 space-y-4">
              <h2 className="text-xl font-semibold">Tu carrito</h2>
              <p role="status" className="text-sm text-accent-700">
                {message}
              </p>
              {!cart.length && <p>Agrega los productos que quieras comprar.</p>}
              {cart.map((line) => {
                const product = catalog.products.find((product) => product.id === line.productId);
                const variant = product?.variants.find((variant) => variant.id === line.variantId);
                return (
                  <div
                    className="border-t pt-3 flex flex-wrap gap-3 items-center justify-between"
                    key={`${line.productId}:${line.variantId ?? ""}`}
                  >
                    <div>
                      <p className="font-semibold">
                        {product?.title ?? "Producto ya no disponible"}
                        {variant ? ` · ${variant.label}` : ""}
                      </p>
                      <p>
                        {money(
                          (variant?.price ?? product?.price ?? 0) * line.quantity,
                          product?.currency,
                        )}
                      </p>
                    </div>
                    <label className="text-sm">
                      Cantidad
                      <input
                        className="block border p-2 rounded-lg w-20"
                        aria-label={`Cantidad de ${product?.title ?? "producto"} ${variant?.label ?? ""}`}
                        type="number"
                        min={1}
                        max={20}
                        value={line.quantity}
                        onChange={(event) => {
                          const quantity = Number(event.target.value);
                          if (
                            Number.isInteger(quantity) &&
                            quantity >= 1 &&
                            quantity <= 20 &&
                            cart.reduce(
                              (sum, item) => sum + (item === line ? quantity : item.quantity),
                              0,
                            ) <= 50
                          )
                            update(
                              cart.map((item) => (item === line ? { ...item, quantity } : item)),
                            );
                        }}
                      />
                    </label>
                    <button
                      className="text-rose-700 underline min-h-11"
                      onClick={() => update(cart.filter((item) => item !== line))}
                    >
                      Quitar
                    </button>
                  </div>
                );
              })}
              {!!cart.length && (
                <>
                  <p className="font-bold">
                    Subtotal estimado:{" "}
                    {money(
                      subtotal,
                      catalog.products.find((product) => product.id === cart[0].productId)
                        ?.currency,
                    )}
                    . Envío calculado antes de pagar.
                  </p>
                  <p className="text-sm">
                    Los precios y la disponibilidad se comprueban al continuar. Una compra incluye
                    productos de este vendedor únicamente.
                  </p>
                  <Link
                    className="inline-block bg-accent-700 text-white rounded-lg px-5 py-3"
                    href={`/catalogo/${username}/checkout`}
                  >
                    Continuar con mi compra
                  </Link>
                </>
              )}
            </section>
          </>
        )}
      </main>
      {catalog && !!cart.length && (
        <aside
          aria-label="Acceso rápido al carrito"
          className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white px-4 py-3"
        >
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <a
              href="#carrito"
              className="min-h-11 inline-flex items-center text-sm font-medium text-accent-700 underline"
            >
              Ver carrito ({cart.reduce((sum, line) => sum + line.quantity, 0)})
            </a>
            <span className="text-sm">
              Subtotal:{" "}
              {money(
                subtotal,
                catalog.products.find((product) => product.id === cart[0].productId)?.currency,
              )}
            </span>
            <Link
              href={`/catalogo/${username}/checkout`}
              className="min-h-11 inline-flex items-center rounded-md bg-accent-700 px-4 text-sm font-semibold text-white"
            >
              Continuar compra
            </Link>
          </div>
        </aside>
      )}
    </div>
  );
}
