"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useI18n } from "@/i18n/LanguageProvider";
import type { DeliveryMethod } from "@/domain/types";
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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/links/${encodeURIComponent(publicId)}`, { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setServerMissed(true);
          return;
        }
        return res.json().then((data) => {
          if (!cancelled) setServerItem(data);
        });
      })
      .catch(() => {
        if (!cancelled) setServerMissed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  // The server resolver is the single source of truth: a link is either persisted
  // (and therefore resolvable in any browser) or it does not exist. Falling back to
  // in-memory demo data here would let the client invent a product and would mask
  // the inactive-link state, so a 404 from the API is shown as "not found".
  const item = serverItem;

  if (!item && !serverMissed) {
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
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
          <h1 className="text-xl font-bold text-[#0B1220]">{t("p.notFoundTitle")}</h1>
          <p className="text-sm text-slate-500">{t("p.notFoundBody")}</p>
          <Link href="/">
            <Button variant="outline" className="w-full">{t("p.goToRouteFlow")}</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const { product, seller } = item;

  return (
    <div className="min-h-screen bg-brand-bg pb-24 md:pb-12">
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-sm bg-[#0B1220] flex items-center justify-center text-white font-bold text-xs">
              RF
            </div>
            <span className="font-extrabold text-sm text-[#0B1220]">RouteFlow</span>
          </Link>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Pedido con seguimiento</span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 sm:pt-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div>
            <div className="w-full aspect-square rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
              <Image
                src={product.images[0] || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800"}
                alt={product.title}
                width={800}
                height={800}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
                {product.inStock ? t("p.availableItem") : "Producto agotado"}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1220] mt-1 mb-2 leading-tight">
                {product.title}
              </h1>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#0B1220]">${product.price}</span>
                <span className="text-sm font-semibold text-slate-500">{product.currency}</span>
              </div>
            </div>

            <div className="text-sm text-slate-600 border-t border-b border-slate-200 py-4">
              <p>{product.description}</p>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                  {seller.logoUrl && (
                    <Image
                      src={seller.logoUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-[#0B1220]">{seller.storeName}</span>
                    {seller.kycVerified && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <span className="text-xs text-slate-500 font-mono">@{seller.storeUsername}</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-600">{seller.kycVerified ? "Identidad verificada registrada." : "Este vendedor todavía no tiene una verificación de identidad registrada."}</p>
            <PurchaseGuide />
            <div className="hidden md:block pt-2">
              <Link href={product.hasVariants ? `/catalogo/${seller.storeUsername}` : `/checkout/${publicId}`}>
                <Button disabled={!product.inStock} size="lg" className="w-full py-4 text-base font-bold shadow-md">
                  {t("p.buySecurely")}
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-xl z-40 flex items-center justify-between gap-4">
        <div>
          <span className="text-xs text-slate-400 block">{t("common.total")}</span>
          <span className="text-xl font-black text-[#0B1220]">${product.price} {product.currency}</span>
        </div>
        <Link href={product.hasVariants ? `/catalogo/${seller.storeUsername}` : `/checkout/${publicId}`} className="flex-1 max-w-[200px]">
          <Button disabled={!product.inStock} size="md" className="w-full py-3 font-bold">
            {t("p.buySecurely")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
