"use client";

import { BrandMark } from "@/components/shared/BrandMark";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowRight, CheckCircle2, AlertCircle, Truck, MapPin } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useI18n } from "@/i18n/LanguageProvider";
import type { DeliveryMethod } from "@/domain/types";
import { ProductGallery } from "@/components/shared/ProductGallery";
import { PurchaseGuide } from "@/components/shared/PurchaseGuide";

interface PublicLinkPayload {
  publicId: string;
  product: {
    id: string;
    title: string;
    description: string | null;
    price: number;
    currency: string;
    images: string[];
    inStock: boolean;
    deliveryOptions: DeliveryMethod[];
    hasVariants?: boolean;
  };
  seller: {
    storeUsername: string;
    storeName: string;
    logoUrl: string | null;
    kycVerified: boolean;
  };
}

export default function PublicProductPage() {
  const params = useParams();
  const { t } = useI18n();
  const publicId = (params?.publicId as string) || "";
  const [serverItem, setServerItem] = useState<PublicLinkPayload | null>(null);
  const [serverMissed, setServerMissed] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setServerItem(null);
    setServerMissed(false);
    setLoadError(false);
    fetch(`/api/public/links/${encodeURIComponent(publicId)}`, { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404 || res.status === 410) setServerMissed(true);
          else setLoadError(true);
          return;
        }
        return res.json().then((data) => {
          if (!cancelled) setServerItem(data);
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [publicId, reload]);

  // The server resolver is the single source of truth: a link is either persisted
  // (and therefore resolvable in any browser) or it does not exist. Falling back to
  // in-memory demo data here would let the client invent a product and would mask
  // the inactive-link state, so a 404 from the API is shown as "not found".
  const item = serverItem;

  if (!item && !serverMissed && !loadError) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <p className="text-sm text-slate-500">{t("p.loading")}</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-slate-500 mx-auto" />
          <h1 className="text-xl font-semibold text-ink">
            {loadError ? "No pudimos cargar el producto" : "Este enlace no está disponible"}
          </h1>
          <p className="text-sm text-slate-500">
            {loadError
              ? "Puede ser una interrupción temporal. Comprueba tu conexión y vuelve a intentar."
              : "Puede haber vencido o dejado de estar activo. Pide al vendedor un enlace actualizado."}
          </p>
          {loadError && (
            <Button onClick={() => setReload((value) => value + 1)} className="w-full">
              Volver a intentar
            </Button>
          )}
          <Link
            href="/mis-compras"
            className="block min-h-11 py-3 text-sm text-accent-700 underline"
          >
            Si ya compraste, consulta Mis compras
          </Link>
          <Link href="/" className={buttonStyles({ variant: "outline", className: "w-full" })}>
            {t("p.goToRouteFlow")}
          </Link>
        </Card>
      </div>
    );
  }

  const { product, seller } = item;
  const purchaseHref = product.hasVariants
    ? `/catalogo/${seller.storeUsername}`
    : `/checkout/${publicId}`;
  const price = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: product.currency,
  }).format(product.price);

  return (
    <div className="min-h-screen bg-canvas pb-28 md:pb-12">
      <header className="bg-accent-700 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-16 flex flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <BrandMark />
            RouteFlow
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/mis-compras" className="text-sm text-white/90 hover:underline">
              Mis compras
            </Link>
            <LanguageSwitcher variant="dark" />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8">
        <nav aria-label="Ubicación" className="mb-5 text-sm text-slate-600">
          <Link href={`/catalogo/${seller.storeUsername}`} className="hover:underline">
            {seller.storeName}
          </Link>
          <span aria-hidden="true" className="mx-2">
            /
          </span>
          <span>Producto</span>
        </nav>
        <div className="bg-white border border-slate-200 rounded-lg grid md:grid-cols-12">
          <div className="md:col-span-7 min-w-0 p-4 sm:p-8">
            <ProductGallery
              key={product.id}
              images={product.images}
              title={product.title}
              spacious
            />
          </div>
          <div className="md:col-span-5 p-5 sm:p-8 md:border-l border-slate-200">
            <p
              className={`text-sm mb-3 ${product.inStock ? "text-emerald-700" : "text-slate-500"}`}
            >
              {product.inStock ? t("p.availableItem") : "Producto agotado"}
            </p>
            <h1 className="text-2xl sm:text-[28px] font-medium text-slate-900 leading-snug break-words">
              {product.title}
            </h1>
            <div className="flex items-baseline gap-2 mt-5 mb-6">
              <span className="text-4xl font-normal tracking-tight text-slate-950">{price}</span>
              <span className="text-sm text-slate-500">{product.currency}</span>
            </div>
            <div className="border-y border-slate-200 py-5 space-y-3 text-sm text-slate-700">
              {product.deliveryOptions.includes("shipping") && (
                <p className="flex items-center gap-3">
                  <Truck className="size-5 shrink-0 text-slate-500" />
                  Envío por paquetería
                </p>
              )}
              {product.deliveryOptions.some((option) => option !== "shipping") && (
                <p className="flex items-center gap-3">
                  <MapPin className="size-5 shrink-0 text-slate-500" />
                  Entrega coordinada con el vendedor
                </p>
              )}
              <p className="flex items-center gap-3">
                <ShieldCheck className="size-5 shrink-0 text-slate-500" />
                Pedido con seguimiento
              </p>
            </div>
            <div className="mt-6">
              {product.inStock ? (
                <Link
                  href={purchaseHref}
                  className={buttonStyles({ size: "lg", className: "w-full" })}
                >
                  {t("p.buySecurely")}
                  <ArrowRight className="size-4" />
                </Link>
              ) : (
                <Button disabled size="lg" className="w-full">
                  Producto agotado
                </Button>
              )}
            </div>
            <div className="mt-6 pt-5 border-t border-slate-200">
              <p className="text-xs text-slate-500 mb-3">Vendido por</p>
              <Link
                href={`/catalogo/${seller.storeUsername}`}
                className="flex items-center gap-3 group"
              >
                {seller.logoUrl && (
                  <Image
                    src={seller.logoUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 rounded-full object-cover border border-slate-200"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-accent-700 group-hover:underline flex items-center gap-1.5">
                    {seller.storeName}
                    {seller.kycVerified && <CheckCircle2 className="size-4" />}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">@{seller.storeUsername}</p>
                </div>
              </Link>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                {seller.kycVerified
                  ? "Identidad verificada registrada."
                  : "Este vendedor todavía no tiene una verificación de identidad registrada."}
              </p>
            </div>
          </div>
          <section className="md:col-span-12 border-t border-slate-200 p-5 sm:p-8">
            <h2 className="text-xl font-medium text-slate-900 mb-4">Descripción del producto</h2>
            <p className="text-base leading-7 text-slate-600 whitespace-pre-line break-words max-w-3xl">
              {product.description}
            </p>
          </section>
        </div>
        <div className="mt-6">
          <PurchaseGuide />
        </div>
      </main>
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-4 z-40 flex items-center justify-between gap-4">
        <div className="shrink-0">
          <span className="text-xs text-slate-500 block">{t("common.total")}</span>
          <span className="text-xl text-slate-950">
            {price} <span className="text-xs">{product.currency}</span>
          </span>
        </div>
        {product.inStock ? (
          <Link
            href={purchaseHref}
            className={buttonStyles({ className: "flex-1 max-w-[220px] w-full" })}
          >
            {t("p.buySecurely")}
          </Link>
        ) : (
          <Button disabled>Producto agotado</Button>
        )}
      </div>
    </div>
  );
}
