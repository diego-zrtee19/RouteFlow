"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatCard, Card } from "@/components/ui/Card";
import { DollarSign, Eye, ShoppingCart, CheckCircle2 } from "lucide-react";

interface AnalyticsSummary {
  linkViews: number;
  checkoutStarts: number;
  paymentSuccess: number;
  completedOrders: number;
  gmv: number;
  averageOrderValue: number;
  conversionRate: number;
  operations?: {
    reservedUnpaid: number;
    paymentMinutes: number | null;
    dispatchMinutes: number | null;
    sampleSize: number;
  };
}

const EMPTY: AnalyticsSummary = {
  linkViews: 0,
  checkoutStarts: 0,
  paymentSuccess: 0,
  completedOrders: 0,
  gmv: 0,
  averageOrderValue: 0,
  conversionRate: 0,
};

export default function AnalyticsPage() {
  // Metrics are read from the `events` table via the server. Nothing is
  // invented client-side.
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/analytics", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw Error("No se pudieron consultar las métricas");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data) {
          setAnalytics({ ...EMPTY, ...data });
          setLoaded(true);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  if (!loaded)
    return (
      <DashboardLayout>
        {error ? (
          <p role="alert">
            {error}{" "}
            <button className="min-h-11 underline" onClick={() => setReload((n) => n + 1)}>
              Reintentar
            </button>
          </p>
        ) : (
          <p role="status">Consultando métricas reales…</p>
        )}
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="border rounded-lg bg-white p-5 space-y-3">
          <h2 className="font-semibold">Tiempo y puntos de fricción</h2>
          <p>
            Reservas sin pago finalizado: {analytics.operations?.reservedUnpaid ?? 0}. No equivale a
            compradores que abandonaron: pueden seguir pagando.
          </p>
          <p>
            Mediana de tiempo hasta pagar: {analytics.operations?.paymentMinutes ?? "Sin datos"} min
            · Hasta crear guía después del pago:{" "}
            {analytics.operations?.dispatchMinutes ?? "Sin datos"} min.
          </p>
          <p className="text-sm">
            Muestra: últimos {analytics.operations?.sampleSize ?? 0} pedidos pagados, máximo 200.
            Crear guía no confirma despacho físico. Las vistas y los intentos pueden repetirse; no
            representan personas únicas.
          </p>
          <Link
            href="/dashboard/piloto"
            className="inline-block min-h-11 underline text-accent-700"
          >
            Preparar prueba con vendedores y compradores
          </Link>
        </section>
        <div>
          <h1 className="text-2xl font-semibold text-ink">Analytics & Conversion</h1>
          <p className="text-sm text-slate-500">
            Track purchase link performance across social channels.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Gross Merchandise Value"
            value={`$${analytics.gmv.toLocaleString()} MXN`}
            icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          />
          <StatCard
            title="Total Link Views"
            value={analytics.linkViews.toLocaleString()}
            icon={<Eye className="w-5 h-5 text-accent-600" />}
          />
          <StatCard
            title="Checkout Starts"
            value={analytics.checkoutStarts}
            icon={<ShoppingCart className="w-5 h-5 text-amber-600" />}
          />
          <StatCard
            title="Completed Orders"
            value={analytics.completedOrders}
            icon={<CheckCircle2 className="w-5 h-5 text-accent-600" />}
          />
        </div>

        {/* Social Commerce Funnel */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6">
            Social Commerce End-to-End Funnel
          </h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>1. Link Views (WhatsApp, Instagram DMs)</span>
                <span>{analytics.linkViews}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div className="bg-slate-400 h-full rounded-full w-full" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>2. Checkouts Initiated</span>
                <span>
                  {analytics.checkoutStarts} (
                  {analytics.linkViews
                    ? Math.round((analytics.checkoutStarts / analytics.linkViews) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-accent-500 h-full rounded-full"
                  style={{
                    width: `${analytics.linkViews ? (analytics.checkoutStarts / analytics.linkViews) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>3. Payments Authorized</span>
                <span>
                  {analytics.paymentSuccess} (
                  {analytics.checkoutStarts
                    ? Math.round((analytics.paymentSuccess / analytics.checkoutStarts) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{
                    width: `${analytics.linkViews ? (analytics.paymentSuccess / analytics.linkViews) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>4. Completed & Confirmed</span>
                <span>
                  {analytics.completedOrders} (
                  {analytics.paymentSuccess
                    ? Math.round((analytics.completedOrders / analytics.paymentSuccess) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-accent-600 h-full rounded-full"
                  style={{
                    width: `${analytics.linkViews ? (analytics.completedOrders / analytics.linkViews) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
