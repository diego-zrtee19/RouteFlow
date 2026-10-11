"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Plus, Link2, ExternalLink } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";

interface CatalogProduct {
  id: string;
  title: string;
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
      if (!res.ok)
        throw new Error(data.error?.message || "No se pudo guardar el peso");
      setWeight(String(data.product.weightKg));
      setMessage("Datos del paquete guardados");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo guardar el peso",
      );
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
              onChange={(e) =>
                setDimensions({ ...dimensions, [key]: e.target.value })
              }
              className="border rounded w-full p-2"
            />
          </label>
        ))}
      </div>
      <label className="block text-xs">
        Quién paga el envío
        <select
          className="border rounded w-full p-2"
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/catalog", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setProducts(data.products ?? []);
        setLinks(data.links ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0B1220]">
              {t("dashboard.products.title")}
            </h1>
            <p className="text-sm text-slate-500">
              {t("dashboard.products.subtitle")}
            </p>
            <Link
              href="/dashboard/settings"
              className="text-sm text-blue-700 underline"
            >
              Configurar origen de los envíos FedEx
            </Link>
          </div>
          <Link href="/dashboard/products/new">
            <Button size="md">
              <Plus className="w-4 h-4 mr-1.5" />
              {t("dashboard.products.add")}
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => {
            const link = links.find((l) => l.productId === product.id);
            return (
              <Card
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
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        No image
                      </div>
                    )}
                    <span className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs font-bold text-slate-800">
                      ${product.price} {product.currency}
                    </span>
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="font-bold text-base text-[#0B1220]">
                      {product.title}
                    </h3>
                    <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
                      <span>
                        Stock: <strong>{product.stock}</strong>
                      </span>
                      <span>·</span>
                      <span>Options: {product.deliveryOptions.join(", ")}</span>
                    </div>
                    <PackageWeightEditor product={product} />
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  {link ? (
                    <Link
                      href={`/p/${link.publicId}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      {t("dashboard.products.viewLink", { id: link.publicId })}
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {t("dashboard.products.noLink")}
                    </span>
                  )}
                  <Link href={`/p/${link?.publicId || ""}`} target="_blank">
                    <Button variant="outline" size="sm">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
