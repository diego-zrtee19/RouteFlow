"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Copy, Check, ExternalLink } from "lucide-react";
import { SharePurchaseLink } from "@/components/shared/SharePurchaseLink";
import { useI18n } from "@/i18n/LanguageProvider";
import { buildPublicLinkUrl, getConfiguredAppOrigin } from "@/lib/appUrl";

interface CatalogLink {
  id: string;
  publicId: string;
  productId: string;
  views: number;
  active: boolean;
  product: {
    id: string;
    title: string;
    price: number;
    currency: string;
    images: string[];
  } | null;
}

export default function LinksPage() {
  const { t } = useI18n();
  const [links, setLinks] = useState<CatalogLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Read the persisted catalog from the server. A browser tab has no copy of the
  // datastore, so links created earlier must come from the API to be visible.
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/catalog", { cache: "no-store" });
      if (!res.ok) throw new Error("catalog_unavailable");
      const data = (await res.json()) as {
        links?: CatalogLink[];
        products?: NonNullable<CatalogLink["product"]>[];
      };
      // The API returns products and links separately; join by identity, never by position.
      const products = new Map((data.products ?? []).map((product) => [product.id, product]));
      setLinks(
        (data.links ?? []).map((link) => ({
          ...link,
          product: products.get(link.productId) ?? null,
        })),
      );
      setError(null);
    } catch {
      setError(t("dashboard.links.loadError"));
      setLinks([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // One canonical URL per link, shared by the visible field, Copy and Preview.
  const [origin, setOrigin] = useState(getConfiguredAppOrigin);
  useEffect(() => {
    if (process.env.NODE_ENV === "development" || !getConfiguredAppOrigin()) {
      setOrigin(window.location.origin);
    }
  }, []);
  const urlFor = useCallback(
    (publicId: string) => buildPublicLinkUrl(publicId, origin || undefined),
    [origin],
  );

  const handleCopy = async (publicId: string) => {
    try {
      await navigator.clipboard.writeText(urlFor(publicId));
      setCopiedId(publicId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError(t("dashboard.links.copyError"));
    }
  };

  const handleToggle = async (link: CatalogLink) => {
    setPendingId(link.id);
    try {
      const res = await fetch("/api/dashboard/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: link.id, active: !link.active }),
      });
      if (!res.ok) throw new Error("toggle_failed");
      await load();
    } catch {
      setError(t("dashboard.links.toggleError"));
    } finally {
      setPendingId(null);
    }
  };

  const displayUrl = useMemo(
    () => (publicId: string) => urlFor(publicId).replace(/^https?:\/\//, ""),
    [urlFor],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">
              Comparte tus productos
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Elige un producto y envía su enlace al comprador.
            </p>
          </div>
          <Link
            href="/dashboard/products/new?mode=quick"
            className={buttonStyles({ variant: "secondary" })}
          >
            Nueva venta
          </Link>
        </div>

        {error ? (
          <Card className="p-6 flex flex-wrap items-center justify-between gap-3 border-rose-200">
            <p className="text-sm text-rose-700">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {t("common.retry")}
            </Button>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4">
          {(links ?? []).map((link) => {
            // Each link resolves its OWN product, so Link A can never show Product B.
            const product = link.product;
            return (
              <Card key={link.id} className="p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                    {product?.images?.[0] ? (
                      <Image
                        src={product.images[0]}
                        alt=""
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <h3 className="font-semibold text-base text-ink">
                      {product?.title ?? "Producto no disponible"}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="font-semibold text-slate-900">
                        {product
                          ? `$${product.price} ${product.currency}`
                          : "Producto no disponible"}
                      </span>
                      <span>·</span>
                      <span>{t("dashboard.links.views", { count: link.views })}</span>
                      <span>·</span>
                      <span
                        className={
                          link.active
                            ? "text-emerald-600 font-medium"
                            : "text-slate-500 font-medium"
                        }
                      >
                        {link.active ? t("common.active") : t("common.inactive")}
                      </span>
                    </div>
                  </div>
                </div>

                {link.active && product && (
                  <SharePurchaseLink
                    publicId={link.publicId}
                    title={product?.title ?? "Mi producto"}
                  />
                )}
                <details className="border-t border-line pt-2">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm text-slate-600">
                    Ver enlace y más opciones
                  </summary>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-mono text-slate-700 select-all">
                      {displayUrl(link.publicId)}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => handleCopy(link.publicId)}>
                      {copiedId === link.publicId ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 mr-1" />
                      )}
                      {copiedId === link.publicId ? t("common.copied") : t("common.copy")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pendingId === link.id}
                      onClick={() => handleToggle(link)}
                    >
                      {link.active
                        ? t("dashboard.links.deactivate")
                        : t("dashboard.links.activate")}
                    </Button>
                    {/* Preview opens the exact same public URL the buyer receives. */}
                    <Link
                      href={`/p/${link.publicId}`}
                      target="_blank"
                      rel="noopener"
                      className={buttonStyles({ variant: "outline", size: "sm" })}
                      aria-label={t("dashboard.links.preview")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </details>
              </Card>
            );
          })}
        </div>

        {links !== null && links.length === 0 ? (
          <Card className="p-10 text-center space-y-2">
            <p className="text-sm font-bold text-ink">{t("dashboard.links.emptyTitle")}</p>
            <p className="text-xs text-slate-500">{t("dashboard.links.emptyBody")}</p>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
