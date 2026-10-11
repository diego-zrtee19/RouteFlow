"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { PublicCatalog, CartLine } from "@/domain/catalogCart";
import { readCatalogCart, saveCatalogCart } from "@/lib/catalogCartStore";

export default function CatalogPage() {
  const username = String(useParams().username);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setCatalog(null); setError(""); setCart(readCatalogCart(username));
    fetch(`/api/public/catalog/${encodeURIComponent(username)}`, { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); setCatalog(data); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [username]);
  function update(lines: CartLine[]) { setCart(lines); if (!saveCatalogCart(username, lines)) setMessage("No se pudo guardar el carrito. Permite almacenamiento en este navegador para continuar."); }
  function add(productId: string) {
    const product = catalog?.products.find(product => product.id === productId);
    if (!product) return;
    const variantId = selected[productId];
    if (product.variants.length && !variantId) { setMessage("Selecciona la talla o color antes de agregarlo."); return; }
    const variant = product.variants.find(variant => variant.id === variantId);
    if (!product.inStock || (product.variants.length && !variant?.inStock)) return;
    if (cart.reduce((sum, line) => sum + line.quantity, 0) >= 50) { setMessage("Máximo 50 unidades por pedido."); return; }
    const found = cart.find(line => line.productId === productId && line.variantId === variantId);
    if (found && found.quantity >= 20) { setMessage("Máximo 20 unidades por artículo."); return; }
    if (!found && cart.length >= 20) { setMessage("Máximo 20 artículos distintos."); return; }
    update(found ? cart.map(line => line === found ? { ...line, quantity: line.quantity + 1 } : line) : [...cart, { productId, ...(variantId ? { variantId } : {}), quantity: 1 }]);
    setMessage(`${product.title} agregado al carrito`);
  }
  const money = (value: number, currency = "MXN") => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
  const subtotal = cart.reduce((sum, line) => { const product = catalog?.products.find(product => product.id === line.productId); return sum + (product?.variants.find(variant => variant.id === line.variantId)?.price ?? product?.price ?? 0) * line.quantity; }, 0);
  return <div className="min-h-screen bg-brand-bg pb-12">
    <header className="border-b bg-white"><nav className="max-w-5xl mx-auto p-4 flex flex-wrap gap-4 justify-between"><Link className="font-bold" href="/">RouteFlow</Link><div className="flex gap-4"><Link href="/mis-compras">Mis compras</Link><Link href="/help">Ayuda</Link></div></nav></header>
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      {error && <p role="alert">{error}</p>}
      {!catalog && !error && <p role="status">Cargando catálogo…</p>}
      {catalog && <>
        <section className="bg-white border rounded-2xl p-6 flex items-center gap-4">{catalog.seller.logo?.startsWith("https://") && <Image unoptimized src={catalog.seller.logo} alt={`Logo de ${catalog.seller.name}`} width={72} height={72} className="rounded-xl object-cover" />}<div><h1 className="text-3xl font-bold">{catalog.seller.name}</h1><p>{catalog.seller.description}</p><p className="text-sm text-slate-500">Catálogo de @{username} · Compra sin registrarte y consulta tu pedido en RouteFlow.</p></div></section>
        <label className="block font-semibold">Buscar en este catálogo<input className="block w-full border rounded-lg p-3 mt-2" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre del producto" /></label>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{catalog.products.filter(product => product.title.toLowerCase().includes(search.toLowerCase())).map(product => {
          const variant = product.variants.find(variant => variant.id === selected[product.id]);
          return <article key={product.id} className="bg-white border rounded-xl p-4 space-y-3">{product.images[0]?.startsWith("https://") && <Image unoptimized src={product.images[0]} alt={product.title} width={320} height={240} className="rounded-lg w-full h-48 object-cover" />}<h2 className="text-lg font-bold">{product.title}</h2><p className="text-sm">{product.description}</p><p className="font-bold">{product.variants.length && !variant ? "Desde " : ""}{money(variant?.price ?? (product.variants.length ? Math.min(...product.variants.map(option => option.price)) : product.price), product.currency)}</p>
            {!!product.variants.length && <label className="block text-sm">Talla / color<select value={selected[product.id] ?? ""} className="block border p-3 rounded-lg w-full" onChange={event => setSelected({ ...selected, [product.id]: event.target.value })}><option value="">Selecciona una opción</option>{product.variants.map(variant => <option key={variant.id} value={variant.id} disabled={!variant.inStock}>{variant.label}{!variant.inStock ? " · agotada" : ""}</option>)}</select></label>}
            <button className="w-full min-h-11 bg-blue-600 text-white rounded-lg p-3 disabled:bg-slate-300" onClick={() => add(product.id)} disabled={!product.inStock || (!!variant && !variant.inStock)}>{product.inStock ? "Agregar al carrito" : "Agotado"}</button>
          </article>;
        })}</div>
        {!catalog.products.length && <p>Este vendedor todavía no tiene productos publicados en su catálogo.</p>}
        <section id="carrito" className="bg-white border rounded-xl p-5 space-y-4"><h2 className="text-xl font-bold">Tu carrito</h2><p role="status" className="text-sm text-blue-700">{message}</p>{!cart.length && <p>Agrega los productos que quieras comprar.</p>}
          {cart.map(line => { const product = catalog.products.find(product => product.id === line.productId); const variant = product?.variants.find(variant => variant.id === line.variantId); return <div className="border-t pt-3 flex flex-wrap gap-3 items-center justify-between" key={`${line.productId}:${line.variantId ?? ""}`}><div><p className="font-semibold">{product?.title ?? "Producto ya no disponible"}{variant ? ` · ${variant.label}` : ""}</p><p>{money((variant?.price ?? product?.price ?? 0) * line.quantity, product?.currency)}</p></div><label className="text-sm">Cantidad<input className="block border p-2 rounded-lg w-20" aria-label={`Cantidad de ${product?.title ?? "producto"} ${variant?.label ?? ""}`} type="number" min={1} max={20} value={line.quantity} onChange={event => { const quantity = Number(event.target.value); if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 20 && cart.reduce((sum, item) => sum + (item === line ? quantity : item.quantity), 0) <= 50) update(cart.map(item => item === line ? { ...item, quantity } : item)); }} /></label><button className="text-rose-700 underline min-h-11" onClick={() => update(cart.filter(item => item !== line))}>Quitar</button></div>; })}
          {!!cart.length && <><p className="font-bold">Subtotal estimado: {money(subtotal, catalog.products.find(product => product.id === cart[0].productId)?.currency)}. Envío calculado antes de pagar.</p><p className="text-sm">Los precios y la disponibilidad se comprueban al continuar. Una compra incluye productos de este vendedor únicamente.</p><Link className="inline-block bg-blue-600 text-white rounded-lg px-5 py-3" href={`/catalogo/${username}/checkout`}>Continuar con mi compra</Link></>}
        </section>
      </>}
    </main></div>;
}
