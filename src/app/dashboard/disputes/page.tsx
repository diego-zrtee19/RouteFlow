"use client";

import { DisputeManager } from "@/components/shared/DisputeManager";
import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";

interface DisputeView {
  id: string;
  orderId: string;
  reason: string;
  description: string;
  status: string;
  createdAt: string;
}

export default function SellerDisputesPage() {
  const { t } = useI18n();

  // Disputes are read from the server, scoped to the signed-in seller's orders.
  // The old `dataStore.disputes` was one shared in-memory array for all sellers.
  const [disputes, setDisputes] = useState<DisputeView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/disputes", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("No se pudieron cargar las disputas");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.disputes)) {
          setDisputes(data.disputes as DisputeView[]);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0B1220]">
            {t("dashboard.disputes.title")}
          </h1>
          <p className="text-sm text-slate-500">
            {t("dashboard.disputes.subtitle")}
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        ) : !loaded ? (
          <p>Cargando disputas…</p>
        ) : disputes.length === 0 ? (
          <Card className="p-12 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-base font-bold text-[#0B1220]">
              {t("dashboard.disputes.emptyTitle")}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {t("dashboard.disputes.emptyBody")}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {disputes.map((disp) => (
              <Card
                key={disp.id}
                className="p-4 flex items-start justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#0B1220]">
                      {t("dashboard.disputes.order", { orderId: disp.orderId })}
                    </span>
                    <Badge variant="error">
                      {t(`status.dispute.${disp.status}`)}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {t("dashboard.disputes.reason")}{" "}
                    <strong>{t(`status.reason.${disp.reason}`)}</strong>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {disp.description}
                  </p>
                  <DisputeManager id={disp.id} audience="seller" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
