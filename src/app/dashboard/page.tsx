"use client";

import Image from "next/image";
import { StoreReadiness } from "@/components/dashboard/StoreReadiness";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatCard, Card } from "@/components/ui/Card";
import { Button, buttonStyles } from "@/components/ui/Button";
import { OrderStatusBadge } from "@/components/ui/Badge";
import {
  DollarSign,
  ShoppingBag,
  Clock,
  CheckCircle2,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import type { OrderStatus, PaymentStatus } from "@/domain/types";

/** Catalog row as served by GET /api/dashboard/catalog. */
interface CatalogLink {
  publicId: string;
  productId: string;
  active: boolean;
  createdAt: string;
}

interface CatalogProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  images?: string[];
}

/** Order row as served by GET /api/dashboard/orders (product is joined server-side). */
interface OverviewOrder {
  id: string;
  orderNumber: string;
  buyerName: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  product?: { title: string; images?: string[] } | null;
}

interface OverviewData {
  seller: {
    businessName: string;
    logoUrl: string | null;
    contactEmail: string | null;
  };
  stats: {
    totalSales: number;
    totalOrders: number;
    pendingOrders: number;
    paidOrders: number;
    shippedOrders: number;
    completedOrders: number;
  };
  links: {
    publicId: string;
    productId: string;
    active: boolean;
    createdAt: string;
    product?: {
      title: string;
      price: number;
      currency: string;
      images?: string[];
    };
  }[];
  orders: {
    id: string;
    orderNumber: string;
    buyerName: string;
    amount: number;
    currency: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    product?: { title: string; images?: string[] } | null;
  }[];
  analytics: {
    linkViews: number;
    checkoutStarts: number;
    paymentSuccess: number;
    completedOrders: number;
    gmv: number;
    averageOrderValue: number;
    conversionRate: number;
  };
}

export default function DashboardOverviewPage() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    Promise.all([
      fetch("/api/dashboard/me", { cache: "no-store" }),
      fetch("/api/dashboard/catalog", { cache: "no-store" }),
      fetch("/api/dashboard/orders", { cache: "no-store" }),
      fetch("/api/dashboard/analytics", { cache: "no-store" }),
    ])
      .then((results) =>
        Promise.all(
          results.map((r) => {
            if (!r.ok)
              throw new Error(
                "No se pudo actualizar el resumen. Intenta de nuevo; tus pedidos no se han borrado.",
              );
            return r.json();
          }),
        ),
      )
      .then(([meRes, catRes, ordRes, anaRes]) => {
        if (cancelled) return;
        const seller = meRes?.seller ?? {
          businessName: "",
          logoUrl: null,
          contactEmail: null,
        };

        // Typed response shapes: the catalog returns links and products as two
        // parallel arrays, so the product a link belongs to is joined here.
        const products: CatalogProduct[] = catRes?.products ?? [];
        const links: OverviewData["links"] = (catRes?.links ?? []).map((link: CatalogLink) => ({
          ...link,
          product: products.find((p) => p.id === link.productId) ?? undefined,
        }));
        const orders: OverviewData["orders"] = (ordRes?.orders ?? []).map(
          (order: OverviewOrder) => ({
            ...order,
            product: order.product ?? null,
          }),
        );

        setData({
          seller,
          stats: meRes?.stats ?? {},
          links,
          orders,
          analytics: anaRes ?? {
            linkViews: 0,
            checkoutStarts: 0,
            paymentSuccess: 0,
            completedOrders: 0,
            gmv: 0,
            averageOrderValue: 0,
            conversionRate: 0,
          },
        });
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : "No se pudo cargar el resumen");
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const orders = data?.orders ?? [];
  const links = (data?.links ?? []).filter((link) => link.active);
  const analytics = data?.analytics ?? {
    linkViews: 0,
    checkoutStarts: 0,
    paymentSuccess: 0,
    completedOrders: 0,
    gmv: 0,
    averageOrderValue: 0,
    conversionRate: 0,
  };

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setLoadError(
        "No se pudo copiar el enlace. Abre Vista previa para copiarlo desde la barra de direcciones.",
      );
    }
  };

  if (!data)
    return (
      <DashboardLayout>
        {loadError ? (
          <div role="alert" className="p-5">
            <p>{loadError}</p>
            <button
              className="min-h-11 underline text-accent-700"
              onClick={() => setReload((value) => value + 1)}
            >
              Volver a cargar resumen
            </button>
          </div>
        ) : (
          <p role="status" className="p-5">
            Cargando resumen de tu tienda…
          </p>
        )}
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      {loadError && <p role="alert">{loadError}</p>}
      <div className="space-y-6">
        <header className="mb-8">
          <p className="text-sm text-muted mb-3">Tu próxima venta empieza aquí</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink">
            ¿Qué quieres vender?
          </h1>
          <p className="mt-3 text-slate-500">
            Elige cómo compartirlo. Nosotros te ayudamos con el pedido.
          </p>
        </header>
        <section className="grid @min-[36rem]:grid-cols-2 gap-5" aria-label="Dos formas de vender">
          <Link
            href="/dashboard/products/new?mode=quick"
            className="sell-choice sell-choice-primary group"
          >
            <span className="sell-choice-icon">
              <ShoppingBag size={25} aria-hidden="true" />
            </span>
            <span className="block text-2xl font-semibold tracking-tight mt-4 sm:mt-8">
              Un artículo
            </span>
            <span className="block mt-2 text-sm leading-relaxed opacity-80">
              Una camisa, un reloj, algo que quieres vender. Crea su enlace y compártelo.
            </span>
            <span className="mt-4 sm:mt-8 inline-flex items-center gap-3 text-sm font-semibold">
              Crear venta rápida{" "}
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
              />
            </span>
          </Link>
          <Link href="/dashboard/catalogo" className="sell-choice group">
            <span className="sell-choice-icon">
              <ShoppingBag size={25} aria-hidden="true" />
            </span>
            <span className="block text-2xl font-semibold tracking-tight mt-4 sm:mt-8">
              Varios productos
            </span>
            <span className="block mt-2 text-sm leading-relaxed text-slate-500">
              Reúne tus productos en un catálogo sencillo, con el nombre y logo de tu tienda.
            </span>
            <span className="mt-4 sm:mt-8 inline-flex items-center gap-3 text-sm font-semibold">
              Preparar mi catálogo{" "}
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
              />
            </span>
          </Link>
        </section>
        <div className="flex items-center justify-between gap-4 py-2">
          <p className="text-sm text-slate-500">¿Ya publicaste algo?</p>
          <Link href="/dashboard/products" className={buttonStyles({ variant: "secondary" })}>
            Ver inventario <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <StoreReadiness />
        <details className="rounded-2xl border border-line bg-white p-5 space-y-5">
          <summary className="cursor-pointer min-h-11 py-2 font-semibold text-accent-700">
            Mis resultados y actividad
          </summary>
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title={t("dashboard.overview.totalSales")}
              value={`$${analytics.gmv.toLocaleString()} MXN`}
              icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
            />
            <StatCard
              title={t("dashboard.overview.orders")}
              value={orders.length}
              icon={<ShoppingBag className="w-5 h-5 text-accent-600" />}
            />
            <StatCard
              title={t("dashboard.overview.pendingShip")}
              value={
                orders.filter((o) => o.status === "READY_TO_SHIP" || o.status === "PAID").length
              }
              icon={<Clock className="w-5 h-5 text-amber-600" />}
            />
            <StatCard
              title={t("dashboard.overview.completed")}
              value={orders.filter((o) => o.status === "COMPLETED").length}
              icon={<CheckCircle2 className="w-5 h-5 text-accent-600" />}
            />
          </div>

          {/* Conversion Funnel */}
          <Card className="p-5">
            <p className="text-xs font-medium text-slate-500 mb-4">
              {t("dashboard.overview.funnelTitle")}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-xs text-slate-500 block">
                  {t("dashboard.overview.linkViews")}
                </span>
                <span className="text-xl font-bold text-ink">{analytics.linkViews}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-xs text-slate-500 block">
                  {t("dashboard.overview.checkoutStarted")}
                </span>
                <span className="text-xl font-bold text-ink">{analytics.checkoutStarts}</span>
              </div>
              <div className="p-3 bg-accent-50/60 rounded-lg">
                <span className="text-xs text-accent-600 block">
                  {t("dashboard.overview.paymentSuccess")}
                </span>
                <span className="text-xl font-bold text-accent-600">
                  {analytics.paymentSuccess}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-xs text-slate-500 block">{t("status.IN_TRANSIT")}</span>
                <span className="text-xl font-bold text-slate-800">
                  {orders.filter((o) => o.status === "IN_TRANSIT").length}
                </span>
              </div>
              <div className="p-3 bg-emerald-50/60 rounded-lg">
                <span className="text-xs text-emerald-600 block">
                  {t("dashboard.overview.completed")}
                </span>
                <span className="text-xl font-bold text-brand-success">
                  {analytics.completedOrders}
                </span>
              </div>
            </div>
          </Card>

          {/* Active Purchase Links */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-slate-500">
                {t("dashboard.overview.yourLinks")}
              </p>
              <Link
                href="/dashboard/links"
                className="text-xs font-semibold text-accent-600 hover:underline"
              >
                {t("common.viewAll")} ({links.length})
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {links.slice(0, 3).map((link) => {
                const product = link.product;
                return (
                  <div
                    key={link.publicId}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                        {product?.images?.[0] ? (
                          <Image
                            src={product.images[0]}
                            alt=""
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink">{product?.title}</p>
                        <span className="text-xs text-slate-500 font-mono">
                          ${product?.price} MXN
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded-sm text-slate-700">
                        p/{link.publicId}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Copiar enlace de ${link.product?.title ?? link.publicId}`}
                        onClick={() => handleCopy(link.publicId)}
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Link
                        href={`/p/${link.publicId}`}
                        target="_blank"
                        className={buttonStyles({ variant: "outline", size: "sm" })}
                      >
                        {t("common.preview")}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Recent Orders */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-slate-500">
                {t("dashboard.overview.recentOrders")}
              </p>
              <Link
                href="/dashboard/orders"
                className="text-xs font-semibold text-accent-600 hover:underline"
              >
                {t("common.viewAll")}
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] font-medium text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="pb-3">{t("common.order")}</th>
                    <th className="pb-3">{t("common.buyer")}</th>
                    <th className="pb-3">{t("common.product")}</th>
                    <th className="pb-3">{t("common.amount")}</th>
                    <th className="pb-3">{t("common.status")}</th>
                    <th className="pb-3 text-right">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.slice(0, 4).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-semibold text-ink">{order.orderNumber}</td>
                      <td className="py-3 text-slate-600">{order.buyerName}</td>
                      <td className="py-3 text-slate-600 truncate max-w-[180px]">
                        {order.product?.title}
                      </td>
                      <td className="py-3 font-medium text-ink">${order.amount} MXN</td>
                      <td className="py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          className={buttonStyles({ variant: "ghost", size: "sm" })}
                        >
                          {t("common.details")} <ArrowRight className="w-3 h-3 ml-1" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </details>
      </div>
    </DashboardLayout>
  );
}
