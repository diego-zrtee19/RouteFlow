"use client";

import React from "react";
import Link from "next/link";
import { Card, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Users, ShoppingBag, PackageCheck, ShieldAlert, ArrowLeft } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import type { AdminStats, IntegrationStates } from "./adminData";

/**
 * ADMIN CONSOLE (client component).
 *
 * SECURITY: this used to import `dataStore` and `ShippingRegistry` directly and
 * render `dataStore.orders` — a client component, so the audit found every
 * seller's orders, including buyer email, phone and address, in the browser
 * bundle. It now receives plain counts as props and imports no data layer at
 * all, so there is nothing sensitive to leak.
 */
interface AdminConsoleProps {
  stripe: {
    configured: boolean;
    webhookConfigured: boolean;
    testMode: boolean;
  };
  stats: AdminStats;
  integrationStates: IntegrationStates;
}

export default function AdminConsole({ stripe, stats, integrationStates }: AdminConsoleProps) {
  const { t } = useI18n();
  const statusLabel = (ok: boolean) => (ok ? t("admin.connected") : t("admin.notConfigured"));

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 max-w-6xl mx-auto space-y-6">
      <Link href="/admin/disputes" className="text-blue-700 underline">Revisar y resolver disputas</Link>
      <Link href="/admin/operations" className="block text-blue-700 underline">Estado de la operación y alertas</Link>
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600">{t("admin.eyebrow")}</span>
          <h1 className="text-2xl font-extrabold text-[#0B1220]">{t("admin.title")}</h1>
        </div>
        <Link href="/dashboard" className="text-xs font-semibold text-slate-500 hover:text-[#0B1220] flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> {t("admin.back")}
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("admin.activeSellers")} value={stats.activeSellers} icon={<Users className="w-5 h-5 text-blue-600" />} />
        <StatCard title={t("admin.totalProducts")} value={stats.totalProducts} icon={<ShoppingBag className="w-5 h-5 text-emerald-600" />} />
        <StatCard title={t("admin.platformOrders")} value={stats.totalOrders} icon={<PackageCheck className="w-5 h-5 text-indigo-600" />} />
        <StatCard title={t("admin.openDisputes")} value={stats.openDisputes} icon={<ShieldAlert className="w-5 h-5 text-rose-600" />} />
      </div>

      {/* Payment Integration Readiness */}
      <Card className="p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{t("admin.paymentsTitle")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center gap-2">
            <span className="text-xs font-semibold">{t("admin.stripe")}</span>
            <span className="flex items-center gap-1.5">
              {stripe.testMode && (
                <Badge variant="warning">{t("admin.testMode")}</Badge>
              )}
              <Badge variant={stripe.configured ? "success" : "blue"}>
                {statusLabel(stripe.configured)}
              </Badge>
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
            <span className="text-xs font-semibold">{t("admin.stripeWebhook")}</span>
            <Badge variant={stripe.webhookConfigured ? "success" : "blue"}>
              {statusLabel(stripe.webhookConfigured)}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Carrier Integration Readiness */}
      <Card className="p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{t("admin.carriersTitle")}</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
            <span className="text-xs font-semibold">DHL Express</span>
            <Badge variant="blue">{integrationStates.DHL}</Badge>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
            <span className="text-xs font-semibold">FedEx Ground/Express</span>
            <Badge variant="blue">{integrationStates.FEDEX}</Badge>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
            <span className="text-xs font-semibold">Uber Direct Local</span>
            <Badge variant="blue">{integrationStates.UBER}</Badge>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          {t("admin.integrationConfiguredNote")}
        </p>
      </Card>
    </div>
  );
}
