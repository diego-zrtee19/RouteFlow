"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { SharePurchaseLink } from "@/components/shared/SharePurchaseLink";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Link2, Check, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";

export default function NewProductPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<"quick" | "catalog">("quick");
  const [variants, setVariants] = useState<{ label: string; stock: string; price: string }[]>([]);
  const [username, setUsername] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "catalog") setMode("catalog");
    fetch("/api/dashboard/me", { cache: "no-store" }).then(response => response.json()).then(data => setUsername(data.seller?.storeUsername ?? "")).catch(() => {});
  }, []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [weightKg, setWeightKg] = useState("");
  const [shipping, setShipping] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [dimensions, setDimensions] = useState({ length: "", width: "", height: "" });
  const [uploading, setUploading] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The product and its purchase link are created on the server so the public
   * URL keeps resolving in a new tab, another browser, or after a restart. A
   * previous version built the link in browser memory only, which made every
   * generated `/p/{publicId}` return "link not found".
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !price) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          price: parseFloat(price),
          currency: "MXN",
          images: imageUrl ? [imageUrl] : [],
          stock: parseInt(stock, 10),
          catalogVisible: mode === "catalog",
          variants: mode === "catalog" ? variants.map(variant => ({ label: variant.label, stock: Number(variant.stock), price: variant.price ? Number(variant.price) : null })) : [],
          ...(shipping ? { weightKg: Number(weightKg), dimensions: Object.fromEntries(Object.entries(dimensions).map(([k, v]) => [k, Number(v)])) } : {}),
          deliveryOptions: shipping ? ["shipping", "meetup"] : ["meetup"],
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message || (data?.error === "unauthorized" ? t("productForm.errorAuth") : t("productForm.errorGeneric")));
        return;
      }
      if (!data?.link?.publicId) {
        setError(t("productForm.errorGeneric"));
        return;
      }
      setCreatedLink(data.link.publicId);
    } catch {
      setError(t("productForm.errorNetwork"));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!createdLink) return;
    // The canonical public URL a buyer receives, built from the live origin so
    // it is never "/p/undefined" or a bare relative path.
    const url = `${window.location.origin}${mode === "catalog" && username ? `/catalogo/${username}` : `/p/${createdLink}`}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0B1220]">{mode === "quick" ? "Crear venta rápida" : "Agregar producto al catálogo"}</h1>
          <p className="text-sm text-slate-500">
            {t("productForm.subtitle")}
          </p>
        </div>
        {!createdLink && <div className="flex flex-wrap gap-3"><button className={`border rounded-lg p-3 ${mode === "quick" ? "bg-blue-50" : ""}`} onClick={() => setMode("quick")}>Venta rápida · artículo individual</button><button className={`border rounded-lg p-3 ${mode === "catalog" ? "bg-blue-50" : ""}`} onClick={() => setMode("catalog")}>Catálogo · venta recurrente</button></div>}

        {createdLink ? (
          <Card className="p-8 text-center space-y-6 border-blue-200 bg-linear-to-b from-blue-50/50 to-white">
            <div className="w-16 h-16 rounded-full bg-blue-100 text-[#2563EB] flex items-center justify-center mx-auto">
              <Link2 className="w-8 h-8" />
            </div>
            <div>
              {mode === "catalog" && username && <a className="inline-block text-blue-700 underline min-h-11" href={`/catalogo/${username}`}>Ver mi catálogo y comprar con carrito</a>}
              <h2 className="text-2xl font-black text-[#0B1220]">{t("productForm.linkReady")}</h2>
              <p className="text-sm text-slate-600 mt-1">
                {t("productForm.linkReadyBody")}
              </p>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-xs">
              <span className="font-mono text-sm font-semibold text-slate-800 truncate">
                {typeof window !== "undefined" ? window.location.origin : ""}{mode === "catalog" && username ? `/catalogo/${username}` : `/p/${createdLink}`}
              </span>
              <Button size="sm" onClick={copyToClipboard} variant="secondary">
                {copied ? <Check className="w-4 h-4 text-emerald-600 mr-1" /> : null}
                {copied ? t("productForm.copied") : t("common.copy")}
              </Button>
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="primary" onClick={() => router.push(mode === "catalog" && username ? `/catalogo/${username}` : `/p/${createdLink}`)}>
                {t("productForm.preview")} <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            {mode === "quick" && <SharePurchaseLink publicId={createdLink} title={title} />}
          </Card>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "catalog" && <fieldset className="space-y-3"><legend className="font-bold">Variantes opcionales: talla / color</legend><p className="text-sm">Cada opción tiene inventario propio. Deja el precio vacío para usar el precio del producto.</p>{variants.map((variant, index) => <div className="grid grid-cols-2 gap-2 border rounded-lg p-3" key={index}><Input id={`variant-label-${index}`} label="Opción (ej. Azul / M)" value={variant.label} maxLength={100} required onChange={event => setVariants(variants.map((row, i) => i === index ? { ...row, label: event.target.value } : row))} /><Input id={`variant-stock-${index}`} label="Disponibles" type="number" min={0} step={1} value={variant.stock} required onChange={event => setVariants(variants.map((row, i) => i === index ? { ...row, stock: event.target.value } : row))} /><Input id={`variant-price-${index}`} label="Precio opcional" type="number" min="0.01" step="0.01" value={variant.price} onChange={event => setVariants(variants.map((row, i) => i === index ? { ...row, price: event.target.value } : row))} /><button type="button" className="text-rose-700 underline min-h-11" onClick={() => setVariants(variants.filter((_, i) => i !== index))}>Quitar opción</button></div>)}<button type="button" disabled={variants.length >= 30} className="border p-3 rounded-lg min-h-11" onClick={() => setVariants([...variants, { label: "", stock: "1", price: "" }])}>Agregar talla / color</button>{!!variants.length && <p>El inventario total se calcula sumando las opciones.</p>}</fieldset>}
              <Input
                label={t("productForm.name")}
                placeholder={t("productForm.namePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t("productForm.description")}
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-[#0B1220] h-24"
                  placeholder={t("productForm.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t("productForm.price")}
                  type="number"
                min="0.01"
                step="0.01"
                  placeholder="650"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
                <Input
                  label={t("productForm.stock")}
                  type="number"
                min="1"
                step="1"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  required
                />
              </div>

              <Input
                label={t("productForm.imageUrl")}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
              <label className="block text-sm font-semibold">Subir foto del producto (pública, JPG / PNG / WebP; hasta 3 MB)
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || loading} className="block w-full mt-2 min-h-11" onChange={async e => {
                  const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
                  if (file.size > 3 * 1024 * 1024) { setError("La foto debe pesar hasta 3 MB."); return; }
                  setUploading(true); setError(null);
                  try { const form = new FormData(); form.append("file", file); const res = await fetch("/api/dashboard/images", { method: "POST", body: form }); const data = await res.json(); if (!res.ok) throw Error(data.error?.message || "No se pudo subir la foto"); setImageUrl(data.url); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo subir la foto"); } finally { setUploading(false); }
                }} />
              </label>
              {uploading && <p role="status">Subiendo foto…</p>}
              {imageUrl.startsWith("https://") && <Image src={imageUrl} alt="Vista previa del producto" width={180} height={180} unoptimized className="rounded-lg object-cover" />}

              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shipping} onChange={(e) => setShipping(e.target.checked)} />Ofrecer envío por paquetería además de entrega coordinada</label>
              {shipping && <Input label="Peso del paquete (kg)" type="number" min="0.001" step="0.001" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} required />}
              {shipping && <fieldset className="space-y-2"><legend className="text-sm font-bold">Dimensiones del paquete cerrado (cm)</legend><div className="grid grid-cols-3 gap-2">{(["length", "width", "height"] as const).map((key, i) => <Input key={key} label={["Largo", "Ancho", "Alto"][i]} type="number" min="1" max="300" step="1" value={dimensions[key]} required onChange={e => setDimensions({ ...dimensions, [key]: e.target.value })} />)}</div></fieldset>}
              <p className="text-sm text-slate-500">Usa fotos y stock reales. Para envío, completa también tu dirección de origen en Ajustes.</p>

              {error && (
                <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="pt-4">
                <Button disabled={uploading} type="submit" size="lg" className="w-full shadow-md" isLoading={loading}>
                  {t("productForm.submit")}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
