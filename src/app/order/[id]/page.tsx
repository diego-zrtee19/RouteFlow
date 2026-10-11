"use client";

import { DisputeManager } from "@/components/shared/DisputeManager";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Truck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ShipmentStatusBadge } from "@/components/ui/Badge";
import { useI18n } from "@/i18n/LanguageProvider";
import { readBuyerToken, readBuyerSession } from "@/lib/buyerTokenStore";
import {
  BuyerReceipt,
  type BuyerReceiptView,
} from "@/components/shared/BuyerReceipt";

/** What GET /api/orders/[id] returns for a buyer who presents a valid token. */
type BuyerOrderView = BuyerReceiptView;

export default function PublicOrderTrackingPage() {
  const { t } = useI18n();
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params?.id as string;

  // The order id alone grants nothing. The buyer must also present the opaque
  // token issued at checkout, sent as a header so it is not logged in a URL.
  const buyerToken = searchParams?.get("token") ?? readBuyerToken(orderId);
  const sessionId =
    searchParams?.get("session_id") ?? readBuyerSession(orderId);

  const [order, setOrder] = useState<BuyerOrderView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("damaged_product");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;

    try {
      const query =
        !buyerToken && sessionId
          ? `?session_id=${encodeURIComponent(sessionId)}`
          : "";
      const res = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}${query}`,
        {
          cache: "no-store",
          headers: buyerToken ? { "x-buyer-token": buyerToken } : {},
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.order) {
          setOrder(data.order as BuyerOrderView);
          if (data.order.dispute?.id) {
            setDisputeId(data.order.dispute.id);
            setDisputeSubmitted(true);
          }
          if ((data.order as BuyerOrderView).status === "COMPLETED")
            setConfirmed(true);
        }
      }
    } catch {
      /* leave order null; the not-found state renders below */
    } finally {
      setLoaded(true);
    }
  }, [orderId, buyerToken, sessionId]);

  useEffect(() => {
    loadOrder();
    const timer = setInterval(() => {
      if (!document.hidden) loadOrder();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadOrder]);

  if (loaded && !order) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <p>{t("order.notFound")}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <p className="text-slate-400">…</p>
      </div>
    );
  }

  const handleConfirmDelivery = async () => {
    setActionError(null);

    const res = await fetch(
      `/api/orders/${encodeURIComponent(orderId)}/confirm`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(buyerToken ? { "x-buyer-token": buyerToken } : {}),
        },
        body: JSON.stringify({ token: buyerToken }),
      },
    );

    if (res.ok) {
      setConfirmed(true);
      loadOrder();
    } else {
      setActionError(t("order.notFound"));
    }
  };

  const handleDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const res = await fetch(
      `/api/orders/${encodeURIComponent(orderId)}/dispute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(buyerToken ? { "x-buyer-token": buyerToken } : {}),
        },
        body: JSON.stringify({
          token: buyerToken,
          reason: disputeReason,
          description: disputeDesc,
        }),
      },
    );

    if (res.ok) {
      const result = await res.json();
      setDisputeId(result.disputeId);
      setDisputeSubmitted(true);
      setShowDispute(false);
      loadOrder();
    } else {
      setActionError(t("order.notFound"));
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-sm text-[#0B1220]">
            RouteFlow Tracking
          </Link>
          <span className="text-xs text-slate-500 font-mono">
            Order {order.orderNumber}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        <Card className="p-5 text-center space-y-2 bg-gradient-to-b from-blue-50/40 to-white">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-[#2563EB] flex items-center justify-center mx-auto">
            {confirmed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <Truck className="w-5 h-5" />
            )}
          </div>
          <h1 className="text-xl font-bold text-[#0B1220]">
            {confirmed ? "Entrega completada" : "Tu pedido"}
          </h1>
          <p className="text-xs text-slate-500">
            {confirmed
              ? "La entrega fue confirmada."
              : "Consulta aquí tu recibo y el estado de la entrega."}
          </p>
        </Card>

        <BuyerReceipt order={order} />

        {!confirmed &&
          order.canConfirm &&
          buyerToken &&
          order.deliveryMethod === "shipping" && (
            <Card className="p-4 border-emerald-200 bg-emerald-50/40 flex items-center justify-between">
              <div>
                <p className="font-bold text-xs text-emerald-950">
                  Did you receive your order?
                </p>
                <p className="text-[11px] text-emerald-700">
                  Confirm receipt to complete purchase.
                </p>
              </div>
              <Button
                variant="success"
                size="sm"
                onClick={handleConfirmDelivery}
              >
                Yes, I received it
              </Button>
            </Card>
          )}

        {order.shipment && (
          <Card className="p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400">
                {t("order.carrier")}
              </span>
              <ShipmentStatusBadge status={order.shipment.status} />
            </div>
            <p className="text-sm">
              <strong>{order.shipment.carrierName}</strong> (
              {order.shipment.trackingNumber})
            </p>
          </Card>
        )}

        {actionError ? (
          <p className="text-xs text-rose-600 font-semibold">{actionError}</p>
        ) : null}

        {order.canDispute && buyerToken && (
          <div className="pt-2 text-center">
            {disputeId && buyerToken && (
              <DisputeManager
                id={disputeId}
                audience="buyer"
                token={buyerToken}
              />
            )}
            {disputeSubmitted ? (
              <p className="text-xs text-amber-600 font-semibold">
                {t("order.disputeReported")}
              </p>
            ) : showDispute ? (
              <Card className="p-4 text-left space-y-3 border-rose-200">
                <p className="text-xs font-bold text-rose-900">
                  {t("order.disputeTitle")}
                </p>
                <form onSubmit={handleDispute} className="space-y-2">
                  <select
                    className="w-full text-xs p-2 border rounded"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                  >
                    <option value="product_not_received">
                      {t("status.reason.product_not_received")}
                    </option>
                    <option value="damaged_product">
                      {t("status.reason.damaged_product")}
                    </option>
                  </select>
                  <textarea
                    className="w-full text-xs p-2 border rounded h-16"
                    placeholder={t("order.disputePlaceholder")}
                    value={disputeDesc}
                    onChange={(e) => setDisputeDesc(e.target.value)}
                    required
                  />
                  <Button variant="destructive" size="sm" type="submit">
                    {t("order.disputeSubmit")}
                  </Button>
                </form>
              </Card>
            ) : (
              <button
                onClick={() => setShowDispute(true)}
                className="text-xs text-slate-400 hover:text-rose-600 inline-flex items-center gap-1"
              >
                <ShieldAlert className="w-3.5 h-3.5" /> {t("order.disputeCta")}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
