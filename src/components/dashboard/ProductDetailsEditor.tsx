"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PhotoUpload } from "@/components/shared/PhotoUpload";
interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  updatedAt: string;
  variants: { id: string; label: string; price: number | null }[];
}
export function ProductDetailsEditor({
  product,
  onSaved,
}: {
  product: Product;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description);
  const [price, setPrice] = useState(String(product.price));
  const [images, setImages] = useState(product.images);
  const [variants, setVariants] = useState(
    product.variants.map((v) => ({ ...v, priceText: v.price === null ? "" : String(v.price) })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/dashboard/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          details: {
            title,
            description,
            price: Number(price),
            images: images.filter(Boolean),
            variants: variants.map((v) => ({
              id: v.id,
              label: v.label,
              price: v.priceText === "" ? null : Number(v.priceText),
              expectedLabel: product.variants.find((old) => old.id === v.id)?.label,
              expectedPrice: v.price,
            })),
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error?.message || "No se pudo guardar");
      setMessage("Cambios guardados. Los pedidos anteriores conservan sus datos originales.");
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="border-t pt-3">
      <summary className="min-h-11 py-3 cursor-pointer font-semibold">
        Editar descripción, precio, fotos y opciones
      </summary>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm">
          Se modifica lo que comprarán nuevos clientes. No se sobrescribe el inventario ni los
          pedidos existentes.
        </p>
        <fieldset disabled={busy} className="space-y-3">
          <label className="block">
            Nombre
            <input
              required
              maxLength={200}
              className="block border rounded-lg p-3 w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block">
            Descripción
            <textarea
              maxLength={4000}
              className="block border rounded-lg p-3 w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="block">
            Precio base (MXN)
            <input
              type="number"
              min="0.01"
              max="500000"
              step="0.01"
              required
              className="block border rounded-lg p-3 w-full"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          {images.map((url, i) => (
            <label key={i} className="block text-sm">
              Foto {i + 1} (URL HTTPS)
              <input
                type="url"
                className="block border rounded-lg p-3 w-full"
                value={url}
                onChange={(e) =>
                  setImages((old) => old.map((v, index) => (index === i ? e.target.value : v)))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setImages((old) => old.filter((_, index) => index !== i))}
              >
                Quitar foto {i + 1}
              </Button>
            </label>
          ))}
          {images.length < 4 && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setImages((old) => [...old, ""])}
              >
                Añadir URL de foto
              </Button>
              <PhotoUpload
                label="Añadir foto al producto"
                disabled={busy}
                onBusyChange={setBusy}
                onUploaded={(url) => setImages((old) => [...old.filter(Boolean), url].slice(0, 4))}
              />
            </>
          )}
          {variants.map((v, i) => (
            <div key={v.id} className="border rounded-lg p-3 space-y-2">
              <label className="block">
                Talla / color
                <input
                  className="block border rounded-lg p-3 w-full"
                  required
                  maxLength={100}
                  value={v.label}
                  onChange={(e) =>
                    setVariants((old) =>
                      old.map((o, index) => (index === i ? { ...o, label: e.target.value } : o)),
                    )
                  }
                />
              </label>
              <label className="block">
                Precio de opción (vacío usa precio base)
                <input
                  type="number"
                  min="0.01"
                  max="500000"
                  step="0.01"
                  className="block border rounded-lg p-3 w-full"
                  value={v.priceText}
                  onChange={(e) =>
                    setVariants((old) =>
                      old.map((o, index) =>
                        index === i ? { ...o, priceText: e.target.value } : o,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
          <Button type="submit">Guardar detalles</Button>
        </fieldset>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
