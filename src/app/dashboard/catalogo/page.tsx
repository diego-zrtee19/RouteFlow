"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { VariantInventory } from "@/components/dashboard/VariantInventory";
type Seller = { storeUsername: string; businessName: string; bio: string | null; logoUrl: string | null };
type Product = { id: string; title: string; stock: number; catalogVisible: boolean; variants: { id: string; label: string; stock: number }[] };
export default function SellerCatalogPage() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ businessName: "", bio: "", logoUrl: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    const controller = new AbortController();
    Promise.all([fetch("/api/dashboard/me", { cache: "no-store", signal: controller.signal }), fetch("/api/dashboard/catalog", { cache: "no-store", signal: controller.signal })]).then(async ([me, catalog]) => {
      if (!me.ok || !catalog.ok) throw Error("No se pudo cargar tu catálogo");
      const identity = (await me.json()).seller; setSeller(identity); setForm({ businessName: identity.businessName, bio: identity.bio ?? "", logoUrl: identity.logoUrl ?? "" }); setProducts((await catalog.json()).products);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, []);
  const url = seller ? `${origin}/catalogo/${seller.storeUsername}` : "";
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const response = await fetch("/api/dashboard/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await response.json(); if (!response.ok) throw Error(data.error?.message ?? "No se pudo guardar"); setSeller(seller => seller ? { ...seller, ...data.seller } : seller); setMessage("Presentación del catálogo guardada"); } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); } finally { setBusy(false); }
  }
  async function toggle(product: Product) {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/dashboard/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, catalogVisible: !product.catalogVisible }) }); const data = await response.json(); if (!response.ok) throw Error(data.error?.message ?? "No se pudo actualizar"); setProducts(products => products.map(row => row.id === product.id ? { ...row, catalogVisible: !row.catalogVisible } : row)); } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); } finally { setBusy(false); }
  }
  return <DashboardLayout><main className="max-w-3xl space-y-6"><h1 className="text-3xl font-bold">Mi catálogo</h1><p>Una página sencilla con tu marca y productos. Tus compradores pueden elegir varios artículos y pagar juntos.</p><p role="status">{message}</p>
    {seller && <><section className="border rounded-xl bg-white p-5 space-y-3"><h2 className="font-bold">Comparte tu catálogo</h2><a className="text-blue-700 underline break-all" href={url} target="_blank" rel="noreferrer">{url}</a><div className="flex flex-wrap gap-3"><button className="border rounded-lg p-3 min-h-11" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Enlace del catálogo copiado"); } catch { setMessage("No se pudo copiar. Selecciona el enlace para copiarlo."); } }}>Copiar enlace</button><a className="bg-emerald-700 text-white p-3 rounded-lg min-h-11" href={`https://wa.me/?text=${encodeURIComponent(`Este es mi catálogo. Elige tus productos y sigue tu pedido en RouteFlow: ${url}`)}`} target="_blank" rel="noreferrer">Compartir por WhatsApp</a><Link href="/dashboard/products/new?mode=catalog" className="bg-blue-600 text-white p-3 rounded-lg">Agregar producto al catálogo</Link></div></section>
      <form className="bg-white border rounded-xl p-5 space-y-3" onSubmit={save}><h2 className="font-bold">Tu marca, sin complicaciones</h2>{(["businessName", "bio", "logoUrl"] as const).map((key, index) => <label key={key} className="block">{["Nombre del catálogo", "Descripción breve", "URL de tu logo (HTTPS)"][index]}<input className="block w-full border rounded-lg p-3" value={form[key]} type={key === "logoUrl" ? "url" : "text"} required={key === "businessName"} maxLength={key === "bio" ? 500 : 300} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<label className="block">Subir logo (JPG, PNG, WebP; máximo 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} className="block min-h-11 mt-2" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setUploading(true); try { const body = new FormData(); body.append("file", file); const response = await fetch("/api/dashboard/images", { method: "POST", body }); const data = await response.json(); if (!response.ok) throw Error(data.error?.message ?? "No se pudo subir"); setForm(form => ({ ...form, logoUrl: data.url })); setMessage("Logo subido. Guarda la presentación para publicarlo."); } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); } finally { setUploading(false); } }} /></label><button disabled={busy || uploading} className="bg-blue-600 text-white rounded-lg p-3 min-h-11">Guardar presentación</button></form>
      <section className="space-y-3"><h2 className="font-bold text-xl">Productos visibles</h2><p className="text-sm">Los enlaces rápidos de productos sin variantes siguen disponibles aunque se oculten del catálogo. Los productos agotados muestran su estado.</p>{products.map(product => <article key={product.id} className="bg-white rounded-xl border p-4 flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{product.title}</h3><p>Disponibles: {product.stock}</p>{product.variants?.map(variant => <VariantInventory key={variant.id} variant={variant} onSaved={(stock, productStock) => setProducts(products => products.map(row => row.id === product.id ? { ...row, stock: productStock, variants: row.variants.map(option => option.id === variant.id ? { ...option, stock } : option) } : row))} />)}</div><button disabled={busy} onClick={() => toggle(product)} className="border rounded-lg p-3 min-h-11">{product.catalogVisible ? "Ocultar del catálogo" : "Agregar al catálogo"}</button></article>)}</section>
    </>}
  </main></DashboardLayout>;
}
