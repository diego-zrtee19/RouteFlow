"use client";

import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/analytics", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setAnalytics({ ...EMPTY, ...data });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0B1220]">Analytics & Conversion</h1>
          <p className="text-sm text-slate-500">Track purchase link performance across social channels.</p>
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
            icon={<Eye className="w-5 h-5 text-blue-600" />}
          />
          <StatCard
            title="Checkout Starts"
            value={analytics.checkoutStarts}
            icon={<ShoppingCart className="w-5 h-5 text-amber-600" />}
          />
          <StatCard
            title="Completed Orders"
            value={analytics.completedOrders}
            icon={<CheckCircle2 className="w-5 h-5 text-indigo-600" />}
          />
        </div>

        {/* Social Commerce Funnel */}
        <Card className="p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">
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
                  {analytics.checkoutStarts}{" "}
                  ({analytics.linkViews ? Math.round((analytics.checkoutStarts / analytics.linkViews) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full"
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
                  {analytics.paymentSuccess}{" "}
                  ({analytics.checkoutStarts
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
                  {analytics.completedOrders}{" "}
                  ({analytics.paymentSuccess
                    ? Math.round((analytics.completedOrders / analytics.paymentSuccess) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full"
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
