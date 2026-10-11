"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/Badge";
import { ArrowRight, Search } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import type { Order } from "@/domain/types";

/**
 * One row of the seller order table.
 *
 * Derived from the canonical V3 `Order` rather than redeclared, so this page
 * cannot drift away from the domain model the API actually returns. The API
 * sends a projection of the order (the table does not render every field), plus
 * the product joined in for the "Product" column.
 */
type DashboardOrder = Pick<
  Order,
  | "id"
  | "orderNumber"
  | "buyerName"
  | "buyerPhone"
  | "amount"
  | "currency"
  | "status"
  | "paymentStatus"
> & {
  product: { id: string; title: string; images?: string[] } | null;
};

/** Narrows an unknown JSON value to an object, without an unsafe cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parses the order list out of the response body.
 *
 * The previous version cast the raw JSON straight to `Order[]` through a
 * double assertion, which told TypeScript nothing while the runtime shape was
 * actually the API's projection. Building each field explicitly means a field
 * the server stops sending renders as empty instead of crashing the table.
 */
function parseDashboardOrders(payload: unknown): DashboardOrder[] {
  if (!isRecord(payload) || !Array.isArray(payload.orders)) return [];

  return payload.orders.filter(isRecord).map((row) => ({
    id: String(row.id ?? ""),
    orderNumber: String(row.orderNumber ?? ""),
    buyerName: String(row.buyerName ?? ""),
    buyerPhone: String(row.buyerPhone ?? ""),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "MXN"),
    status: row.status as DashboardOrder["status"],
    paymentStatus: row.paymentStatus as DashboardOrder["paymentStatus"],
    product: isRecord(row.product)
      ? {
          id: String(row.product.id ?? ""),
          title: String(row.product.title ?? ""),
          images: Array.isArray(row.product.images)
            ? row.product.images.filter((image): image is string => typeof image === "string")
            : undefined,
        }
      : null,
  }));
}

export default function OrdersPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Keep the last successful list if a subsequent refresh fails.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetch("/api/dashboard/orders", { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error("Orders request failed"); return res.json(); })
      .then((data) => {
        if (!cancelled) { setOrders(parseDashboardOrders(data)); setLoadError(false); }
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  

  const filteredOrders = orders.filter((o) => {
    const matchesFilter = filter === "ALL" ? true : o.status === filter;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.buyerName.toLowerCase().includes(search.toLowerCase()) ||
      (o.product?.title || "").toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0B1220]">{t("dashboard.orders.title")}</h1>
            <p className="text-sm text-slate-500">{t("dashboard.orders.subtitle")}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 overflow-x-auto">
            {["ALL", "PAID", "READY_TO_SHIP", "IN_TRANSIT", "DELIVERED", "COMPLETED"].map((st) => (
              <button
                key={st}
                onClick={() => setFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  filter === st
                    ? "bg-[#0B1220] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t(st === "ALL" ? "common.all" : `status.${st}`)}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t("dashboard.orders.searchPlaceholder")}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-full sm:w-60 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loadError && <p role="alert" className="text-sm text-rose-600">{t("dashboard.orders.loadError")}</p>}
        {/* Orders Table */}
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">{t("common.order")}</th>
                  <th className="py-3.5 px-4">{t("common.buyer")}</th>
                  <th className="py-3.5 px-4">{t("common.product")}</th>
                  <th className="py-3.5 px-4">{t("common.amount")}</th>
                  <th className="py-3.5 px-4">{t("common.payment")}</th>
                  <th className="py-3.5 px-4">{t("dashboard.orders.orderStatus")}</th>
                  <th className="py-3.5 px-4 text-right">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      {!loaded ? t("common.loading") : loadError ? t("dashboard.orders.loadError") : t("dashboard.orders.empty")}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-bold text-[#0B1220]">{order.orderNumber}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[#0B1220]">{order.buyerName}</div>
                        <div className="text-xs text-slate-400">{order.buyerPhone}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 max-w-[200px] truncate">
                        {order.product?.title}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#0B1220]">
                        ${order.amount} {order.currency}
                      </td>
                      <td className="py-3.5 px-4">
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </td>
                      <td className="py-3.5 px-4">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link href={`/dashboard/orders/${order.id}`}>
                          <Button variant="outline" size="sm">
                            {t("common.manage")} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

