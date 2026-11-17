"use client";

import React, { useEffect, useState } from "react";
import { PhotoUpload } from "@/components/shared/PhotoUpload";
import { SharePurchaseLink } from "@/components/shared/SharePurchaseLink";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Link2, Check, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import { useUser } from "@clerk/nextjs";
import { useSessionDraft } from "@/components/shared/useSessionDraft";
import { productDraftInitial, parseProductDraft, type ProductDraft } from "@/domain/formDrafts";

export default function NewProductPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<"quick" | "catalog">("quick");
  const { user } = useUser();
  const draft = useSessionDraft(
    user?.id ? `routeflow.productDraft.${user.id}.${mode}` : null,
    productDraftInitial,
    parseProductDraft,
  );
  const { title, description, price, stock, weightKg, shipping, imageUrl, dimensions, variants } =
    draft.value;
  function setField<K extends keyof ProductDraft>(field: K, value: ProductDraft[K]) {
    draft.setValue((previous) => ({ ...previous, [field]: value }));
  }
  const setTitle = (value: string) => setField("title", value);
  const setDescription = (value: string) => setField("description", value);
  const setPrice = (value: string) => setField("price", value);
  const setStock = (value: string) => setField("stock", value);
  const setWeightKg = (value: string) => setField("weightKg", value);
  const setShipping = (value: boolean) => setField("shipping", value);
  const setImageUrl = (value: string) => setField("imageUrl", value);
  const setDimensions = (value: ProductDraft["dimensions"]) => setField("dimensions", value);
  const setVariants = (value: ProductDraft["variants"]) => setField("variants", value);
  const [username, setUsername] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "catalog") setMode("catalog");
    fetch("/api/dashboard/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setUsername(data.seller?.storeUsername ?? ""))
      .catch(() => {});
  }, []);
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
    if (loading || uploading || !draft.ready) return;
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
          variants:
            mode === "catalog"
              ? variants.map((variant) => ({
                  label: variant.label,
                  stock: Number(variant.stock),
                  price: variant.price ? Number(variant.price) : null,
                }))
              : [],
          ...(shipping
            ? {
                weightKg: Number(weightKg),
                dimensions: Object.fromEntries(
                  Object.entries(dimensions).map(([k, v]) => [k, Number(v)]),
                ),
              }
            : {}),
          deliveryOptions: shipping ? ["shipping", "meetup"] : ["meetup"],
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.error?.message ||
            (data?.error === "unauthorized"
              ? t("productForm.errorAuth")
              : t("productForm.errorGeneric")),
        );
        return;
      }
      if (!data?.link?.publicId) {
        setError(t("productForm.errorGeneric"));
        return;
      }
      setCreatedLink(data.link.publicId);
      draft.clear();
    } catch {
      setError(t("productForm.errorNetwork"));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!createdLink) return;
    // The canonical public URL a buyer receives, built from the live origin so
    // it is never "/p/undefined" or a bare relative path.
    const url = `${window.location.origin}${mode === "catalog" && username ? `/catalogo/${username}` : `/p/${createdLink}`}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar. Selecciona el enlace visible y cópialo manualmente.");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {mode === "quick" ? "Crear venta rápida" : "Agregar producto al catálogo"}
          </h1>
          <p className="text-sm text-slate-500">{t("productForm.subtitle")}</p>
        </div>
        {!createdLink && (
          <>
            <div className="flex flex-wrap gap-3">
              <button
                aria-pressed={mode === "quick"}
                className={`rounded-xl border px-5 py-3 text-sm font-semibold transition-colors shadow-none ${mode === "quick" ? "border-accent-700 bg-accent-700 text-white " : "border-slate-200 bg-white text-slate-600 hover:border-accent-300 hover:bg-accent-50"}`}
                onClick={() => setMode("quick")}
              >
                Un artículo
              </button>
              <button
                aria-pressed={mode === "catalog"}
                className={`rounded-xl border px-5 py-3 text-sm font-semibold transition-colors shadow-none ${mode === "catalog" ? "border-accent-700 bg-accent-700 text-white " : "border-slate-200 bg-white text-slate-600 hover:border-accent-300 hover:bg-accent-50"}`}
                onClick={() => setMode("catalog")}
              >
                Para mi catálogo
              </button>
            </div>
            <p className="text-sm">
              {mode === "quick"
                ? "Agrega los detalles, una foto y el precio. Empezamos con una unidad y entrega en persona."
                : "Publica un producto recurrente y agrega tallas o colores si los necesitas."}
            </p>
            <p role="status" className="text-sm text-slate-600">
              {draft.saved
                ? "Borrador guardado solo en esta pestaña durante hasta 4 horas; se borra al publicar."
                : "Si el navegador bloquea el almacenamiento, conserva esta pestaña abierta."}
            </p>
            <details className="text-sm text-slate-500">
              <summary className="min-h-11 cursor-pointer py-3">Opciones del borrador</summary>
              <button className="min-h-11 text-accent-600 underline" onClick={draft.discard}>
                Borrar borrador y empezar de nuevo
              </button>
            </details>
          </>
        )}
        {createdLink && error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}

        {createdLink ? (
          <Card className="p-8 text-center space-y-6 border-accent-200 bg-white">
            <div className="w-16 h-16 rounded-full bg-accent-100 text-accent-600 flex items-center justify-center mx-auto">
              <Link2 className="w-8 h-8" />
            </div>
            <div>
              {mode === "catalog" && username && (
                <a
                  className="inline-block text-accent-700 underline min-h-11"
                  href={`/catalogo/${username}`}
                >
                  Ver mi catálogo y comprar con carrito
                </a>
              )}
              <h2 className="text-2xl font-semibold text-ink">{t("productForm.linkReady")}</h2>
              <p className="text-sm text-slate-600 mt-1">{t("productForm.linkReadyBody")}</p>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 shadow-none">
              <span className="font-mono text-sm font-semibold text-slate-800 truncate">
                {typeof window !== "undefined" ? window.location.origin : ""}
                {mode === "catalog" && username ? `/catalogo/${username}` : `/p/${createdLink}`}
              </span>
              <Button size="sm" onClick={copyToClipboard} variant="secondary">
                {copied ? <Check className="w-4 h-4 text-emerald-600 mr-1" /> : null}
                {copied ? t("productForm.copied") : t("common.copy")}
              </Button>
            </div>

            <div className="flex gap-3 justify-center">
              <Button
                variant="primary"
                onClick={() =>
                  router.push(
                    mode === "catalog" && username ? `/catalogo/${username}` : `/p/${createdLink}`,
                  )
                }
              >
                {t("productForm.preview")} <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            {mode === "quick" && <SharePurchaseLink publicId={createdLink} title={title} />}
          </Card>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "catalog" && (
                <fieldset className="space-y-3">
                  <legend className="font-bold">Variantes opcionales: talla / color</legend>
                  <p className="text-sm">
                    Cada opción tiene inventario propio. Deja el precio vacío para usar el precio
                    del producto.
                  </p>
                  {variants.map((variant, index) => (
                    <div className="grid grid-cols-2 gap-2 border rounded-lg p-3" key={index}>
                      <Input
                        id={`variant-label-${index}`}
                        label="Opción (ej. Azul / M)"
                        value={variant.label}
                        maxLength={100}
                        required
                        onChange={(event) =>
                          setVariants(
                            variants.map((row, i) =>
                              i === index ? { ...row, label: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <Input
                        id={`variant-stock-${index}`}
                        label="Disponibles"
                        type="number"
                        min={0}
                        step={1}
                        value={variant.stock}
                        required
                        onChange={(event) =>
                          setVariants(
                            variants.map((row, i) =>
                              i === index ? { ...row, stock: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <Input
                        id={`variant-price-${index}`}
                        label="Precio opcional"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={variant.price}
                        onChange={(event) =>
                          setVariants(
                            variants.map((row, i) =>
                              i === index ? { ...row, price: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="text-rose-700 underline min-h-11"
                        onClick={() => setVariants(variants.filter((_, i) => i !== index))}
                      >
                        Quitar opción
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={variants.length >= 30}
                    className="border p-3 rounded-lg min-h-11"
                    onClick={() => setVariants([...variants, { label: "", stock: "1", price: "" }])}
                  >
                    Agregar talla / color
                  </button>
                  {!!variants.length && <p>El inventario total se calcula sumando las opciones.</p>}
                </fieldset>
              )}
              <Input
                label={t("productForm.name")}
                placeholder={t("productForm.namePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />

              <div>
                <label
                  htmlFor="product-description"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  {t("productForm.description")}
                </label>
                <textarea
                  id="product-description"
                  maxLength={4000}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-ink h-24"
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
                <details open={mode === "catalog"}>
                  <summary className="cursor-pointer min-h-11 py-2 font-semibold text-sm">
                    Cantidad disponible {mode === "quick" ? "(opcional: por defecto 1)" : ""}
                  </summary>
                  <Input
                    label={t("productForm.stock")}
                    type="number"
                    min="1"
                    step="1"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    required
                  />
                </details>
              </div>

              <details>
                <summary className="min-h-11 py-2 cursor-pointer text-sm">
                  Usar una URL de imagen en lugar de subir foto
                </summary>
                <Input
                  label={t("productForm.imageUrl")}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </details>
              <PhotoUpload
                value={imageUrl}
                onUploaded={setImageUrl}
                onBusyChange={setUploading}
                disabled={loading}
              />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shipping}
                  onChange={(e) => setShipping(e.target.checked)}
                />
                Ofrecer envío por paquetería además de entrega coordinada
              </label>
              {shipping && (
                <Input
                  label="Peso del paquete (kg)"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  required
                />
              )}
              {shipping && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-bold">
                    Dimensiones del paquete cerrado (cm)
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {(["length", "width", "height"] as const).map((key, i) => (
                      <Input
                        key={key}
                        label={["Largo", "Ancho", "Alto"][i]}
                        type="number"
                        min="1"
                        max="300"
                        step="1"
                        value={dimensions[key]}
                        required
                        onChange={(e) => setDimensions({ ...dimensions, [key]: e.target.value })}
                      />
                    ))}
                  </div>
                </fieldset>
              )}
              <p className="text-sm text-slate-500">
                Usa fotos y stock reales. Para envío, completa también tu dirección de origen en
                Ajustes.
              </p>

              {error && (
                <p
                  role="alert"
                  className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
                >
                  {error}
                </p>
              )}

              <div className="pt-4">
                <Button
                  disabled={uploading || !user || !draft.ready}
                  type="submit"
                  size="lg"
                  className="w-full shadow-none"
                  isLoading={loading}
                >
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
