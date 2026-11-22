"use client";

import Image from "next/image";
import { DeliveryArrangement } from "@/components/shared/DeliveryArrangement";
import { logisticsGuidance } from "@/domain/operationalExperience";
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { OrderMoney } from "@/components/dashboard/OrderMoney";
import { Button, buttonStyles } from "@/components/ui/Button";
import { OrderStatusBadge, PaymentStatusBadge, ShipmentStatusBadge } from "@/components/ui/Badge";
import { ArrowLeft, Truck, ExternalLink, ShieldCheck, RotateCcw } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import type { Order, ShipmentStatus, ShippingProviderType } from "@/domain/types";

const CARRIERS: ShippingProviderType[] = ["DHL", "FEDEX", "UBER"];

/**
 * What `GET /api/dashboard/orders?id=...` returns for the owning seller.
 *
 * Derived from the canonical V3 `Order` with `Pick` instead of being
 * re-declared field by field. If the domain model gains, renames or retypes a
 * field, this type follows automatically and TypeScript reports every page that
 * has to change. The previous copy-pasted interface could silently drift away
 * from the real schema, which is how the V1/V3 divergence went unnoticed.
 */
type SellerOrderView = Pick<
  Order,
  | "id"
  | "orderNumber"
  | "buyerName"
  | "buyerEmail"
  | "buyerPhone"
  | "shippingAddress"
  | "shippingService"
  | "deliveryMethod"
  | "amount"
  | "refundedAmount"
  | "currency"
  | "status"
  | "paymentStatus"
  | "items"
  | "createdAt"
> & {
  finance: { platformFee: number; settlementStatus: string };
  shipment: {
    id: string;
    carrierName: string;
    trackingNumber: string;
    status: ShipmentStatus;
    trackingUrl: string | null;
    labelUrl: string | null;
  } | null;
};

/** Narrows an unknown JSON value to an object, without an unsafe cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads a string field, defaulting rather than yielding `undefined`. */
function str(row: Record<string, unknown>, key: string, fallback = ""): string {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

/**
 * Rebuilds a canonical `Address` from the JSONB column.
 *
 * The column is stored untyped, so it is validated field by field rather than
 * asserted. Every field the domain requires is always present, which is what
 * stops an `undefined` street from reaching the UI.
 */
function parseAddress(value: unknown): SellerOrderView["shippingAddress"] {
  const row = isRecord(value) ? value : {};
  return {
    fullName: str(row, "fullName"),
    phone: str(row, "phone"),
    street: str(row, "street"),
    city: str(row, "city"),
    state: str(row, "state"),
    postalCode: str(row, "postalCode"),
    country: str(row, "country"),
  };
}

/**
 * Reads one order out of the response body.
 *
 * Returning `null` for anything unrecognised keeps the page on its "not found"
 * branch instead of rendering `undefined` into the table, and it means the
 * component never has to assert the shape of server JSON.
 */
function parseSellerOrder(payload: unknown): SellerOrderView | null {
  if (!isRecord(payload) || !isRecord(payload.order)) return null;

  const row = payload.order;

  return {
    id: str(row, "id"),
    orderNumber: str(row, "orderNumber"),
    buyerName: str(row, "buyerName"),
    buyerEmail: str(row, "buyerEmail"),
    buyerPhone: str(row, "buyerPhone"),
    shippingAddress: parseAddress(row.shippingAddress),
    shippingService: str(row, "shippingService") || null,
    deliveryMethod: (row.deliveryMethod as Order["deliveryMethod"]) || "shipping",
    amount: Number(row.amount ?? 0),
    refundedAmount: Number(row.refundedAmount ?? 0),
    finance: {
      platformFee: isRecord(row.finance) ? Number(row.finance.platformFee ?? 0) : 0,
      settlementStatus: isRecord(row.finance)
        ? str(row.finance, "settlementStatus", "PENDING")
        : "PENDING",
    },
    currency: str(row, "currency", "MXN"),
    status: row.status as SellerOrderView["status"],
    paymentStatus: row.paymentStatus as SellerOrderView["paymentStatus"],
    createdAt: str(row, "createdAt"),
    items: Array.isArray(row.items)
      ? row.items.filter(isRecord).map((item) => ({
          id: str(item, "id"),
          orderId: str(item, "orderId"),
          productId: str(item, "productId"),
          title: str(item, "title"),
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
          unitPrice: Number(item.unitPrice ?? 0),
          quantity: Number(item.quantity ?? 1),
          lineTotal: Number(item.lineTotal ?? 0),
        }))
      : [],
    shipment: isRecord(row.shipment)
      ? {
          id: str(row.shipment, "id"),
          carrierName: str(row.shipment, "carrierName"),
          trackingNumber: str(row.shipment, "trackingNumber"),
          status: row.shipment.status as ShipmentStatus,
          trackingUrl:
            typeof row.shipment.trackingUrl === "string" ? row.shipment.trackingUrl : null,
          labelUrl: typeof row.shipment.labelUrl === "string" ? row.shipment.labelUrl : null,
        }
      : null,
  };
}

export default function OrderDetailPage() {
  const params = useParams();
  const { t } = useI18n();
  const orderId = params?.id as string;
  const [conversationSender, setConversationSender] = useState("");
  const [conversationChannel, setConversationChannel] = useState("instagram");
  useEffect(() => {
    const query = new URL(window.location.href).searchParams;
    const channel = query.get("channel") === "whatsapp" ? "whatsapp" : "instagram";
    const sender = query.get("instagram");
    setConversationChannel(channel);
    setConversationSender(
      sender &&
        (channel === "whatsapp"
          ? /^(?:\d{6,20}|[A-Z]{2}\.(?:ENT\.)?[a-zA-Z0-9]{1,128})$/
          : /^\d{1,32}$/
        ).test(sender)
        ? sender
        : "",
    );
  }, [orderId]);

  // Read the order from the server. `null` means "not loaded yet"; the loading
  // flag below distinguishes that from "not found".
  const [order, setOrder] = useState<SellerOrderView | null>(null);
  const [loaded, setLoaded] = useState(false);
  // FedEx is preselected because it is the only carrier with credentials in
  // this environment (FEDEX_*); defaulting to DHL guaranteed a
  // NotConfiguredError. The seller may still pick any entry in CARRIERS.
  const [selectedCarrier, setSelectedCarrier] = useState<ShippingProviderType>("FEDEX");
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundKey, setRefundKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`refund-request:${orderId}`);
      if (saved) {
        const value = JSON.parse(saved);
        if (typeof value.key === "string" && typeof value.amount === "string") {
          setRefundKey(value.key);
          setRefundAmount(value.amount);
        }
      }
    } catch {
      /* Private browsing can disable storage. */
    }
  }, [orderId]);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [deliveryPin, setDeliveryPin] = useState("");
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const refreshServerOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/orders?id=${encodeURIComponent(orderId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const parsed = parseSellerOrder(await res.json());
        if (parsed) setOrder(parsed);
      }
    } catch {
      /* keep whatever is already displayed */
    } finally {
      setLoaded(true);
    }
  }, [orderId]);

  useEffect(() => {
    refreshServerOrder();
  }, [refreshServerOrder]);

  const handleCreateShipment = async () => {
    if (!order) return;
    setShippingLoading(true);
    setShippingError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: order.shippingService ? "FEDEX" : selectedCarrier,
          serviceCode:
            order.shippingService ||
            (selectedCarrier === "FEDEX" ? "STANDARD_OVERNIGHT" : `${selectedCarrier}_EXPRESS`),
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error?.message || data.message || t("dashboard.order.shipError"));
      await refreshServerOrder();
    } catch (error) {
      setShippingError(error instanceof Error ? error.message : t("dashboard.order.shipError"));
    } finally {
      setShippingLoading(false);
    }
  };

  const handleCompleteDelivery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!order) return;
    setDeliveryBusy(true);
    setDeliveryError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/complete-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: deliveryPin }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error?.message || data.message || "No se pudo confirmar el NIP.");
      setDeliveryPin("");
      await refreshServerOrder();
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "No se pudo confirmar la entrega.");
    } finally {
      setDeliveryBusy(false);
    }
  };

  const handleRefund = async () => {
    if (!order) return;
    const amount = refundAmount ? Number(refundAmount) : order.amount - (order.refundedAmount ?? 0);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > order.amount - (order.refundedAmount ?? 0)
    ) {
      setRefundError("Indica un importe válido dentro del saldo restante");
      return;
    }
    if (!window.confirm(`¿Reembolsar ${amount.toFixed(2)} ${order.currency} al comprador?`)) return;
    const requestKey = refundKey ?? crypto.randomUUID();
    setRefundKey(requestKey);
    try {
      sessionStorage.setItem(
        `refund-request:${orderId}`,
        JSON.stringify({ key: requestKey, amount: String(amount) }),
      );
    } catch {
      /* Server idempotency still protects this request. */
    }
    setRefundLoading(true);
    setRefundError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, requestKey }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error?.message || "No se pudo solicitar el reembolso");
      if (result.pending)
        setRefundError("Reembolso en proceso. Se actualizará después de confirmarse en Stripe.");
      else {
        setRefundKey(null);
        setRefundAmount("");
        try {
          sessionStorage.removeItem(`refund-request:${orderId}`);
        } catch {
          /* Storage unavailable. */
        }
      }
      await refreshServerOrder();
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : t("dashboard.order.refundError"));
    } finally {
      setRefundLoading(false);
    }
  };

  if (!order) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <p className="text-lg font-bold text-slate-800">
            {loaded ? t("dashboard.order.notFound") : t("common.loading")}
          </p>
          {loaded ? (
            <Link
              href="/dashboard/orders"
              className={buttonStyles({ variant: "outline", className: "mt-4" })}
            >
              {t("dashboard.order.backCta")}
            </Link>
          ) : null}
        </div>
      </DashboardLayout>
    );
  }

  const isPaid = order.paymentStatus === "SUCCEEDED";
  const canRefund = isPaid && order.status !== "REFUNDED";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={
              conversationSender
                ? `/dashboard/messages?sender=${encodeURIComponent(conversationSender)}${conversationChannel === "whatsapp" ? "&channel=whatsapp" : ""}`
                : "/dashboard/orders"
            }
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />{" "}
            {conversationSender ? "Volver a la conversación" : t("dashboard.order.backToOrders")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{order.orderNumber}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-5">
                {t("dashboard.order.item")}
              </h2>
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 mb-4 last:mb-0">
                  <div className="w-20 h-20 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt=""
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 py-1">
                    <h3 className="font-semibold text-base text-ink break-words">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-600 mt-2">
                      Cantidad: {item.quantity} · ${item.unitPrice.toFixed(2)} por unidad · $
                      {item.lineTotal.toFixed(2)} {order.currency}
                    </p>
                  </div>
                </div>
              ))}
            </Card>

            <Card className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("dashboard.order.shipping")}
                </h2>
                {order.shipment ? <ShipmentStatusBadge status={order.shipment.status} /> : null}
              </div>
              {order.shipment && (
                <p
                  role="status"
                  className="border border-amber-200 rounded-lg p-4 bg-amber-50 text-sm leading-relaxed text-amber-900"
                >
                  {logisticsGuidance(order.shipment.status)}
                </p>
              )}
              {order.deliveryMethod !== "shipping" && (
                <DeliveryArrangement
                  orderId={order.id}
                  audience="seller"
                  editable={["PAID", "READY_TO_SHIP"].includes(order.status)}
                />
              )}

              {order.deliveryMethod !== "shipping" ? (
                <div className="space-y-3">
                  <h2 className="font-semibold">Entrega coordinada con NIP</h2>
                  {order.status === "COMPLETED" ? (
                    <p className="text-emerald-700 font-semibold">
                      Entrega confirmada y pedido completado.
                    </p>
                  ) : (
                    <form onSubmit={handleCompleteDelivery} className="space-y-3">
                      <p className="text-sm text-slate-600">
                        Entrega el producto y solicita al comprador su NIP de seis dígitos.
                      </p>
                      <label className="block text-sm font-semibold" htmlFor="delivery-pin">
                        NIP del comprador
                      </label>
                      <input
                        id="delivery-pin"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        autoComplete="off"
                        value={deliveryPin}
                        onChange={(e) => setDeliveryPin(e.target.value.replace(/\D/g, ""))}
                        className="block w-full max-w-xs border border-slate-300 rounded-lg p-4 text-xl font-mono tracking-widest bg-slate-50"
                        disabled={!isPaid || deliveryBusy}
                      />
                      <Button
                        type="submit"
                        disabled={!isPaid || deliveryBusy || !/^\d{6}$/.test(deliveryPin)}
                      >
                        {deliveryBusy ? "Verificando…" : "Confirmar entrega y completar pedido"}
                      </Button>
                      {deliveryError && (
                        <p role="alert" className="text-sm text-rose-700">
                          {deliveryError}
                        </p>
                      )}
                    </form>
                  )}
                </div>
              ) : order.shipment ? (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm space-y-2">
                  <p>
                    <strong>{t("common.carrier")}:</strong> {order.shipment.carrierName}
                  </p>
                  <p>
                    <strong>{t("common.tracking")}:</strong> {order.shipment.trackingNumber}
                  </p>
                  {order.shipment.labelUrl && (
                    <a
                      href={`/api/orders/${order.id}/label`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-accent-700 underline font-semibold"
                    >
                      Imprimir / descargar etiqueta PDF
                    </a>
                  )}
                  {/*
                    A seller is deliberately NOT given the buyer's token, so the
                    buyer-facing `/order/[id]` screen would refuse them. Link to the
                    carrier's own tracking page instead.
                  */}
                  {order.shipment.trackingUrl ? (
                    <Link
                      href={order.shipment.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonStyles({
                        variant: "outline",
                        size: "sm",
                        className: "mt-2",
                      })}
                    >
                      {t("dashboard.order.viewTracking")}{" "}
                      <ExternalLink className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  {!isPaid ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      {t("dashboard.order.awaitingPayment")}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-600">{t("dashboard.order.selectCourier")}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {CARRIERS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setSelectedCarrier(c)}
                            className={`p-2.5 text-center rounded-lg border text-xs font-bold ${
                              selectedCarrier === c
                                ? "border-accent-600 bg-accent-50 text-accent-700"
                                : "border-slate-200"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      {shippingError ? (
                        <p className="text-xs text-rose-600 font-semibold">{shippingError}</p>
                      ) : null}
                      <Button
                        onClick={handleCreateShipment}
                        isLoading={shippingLoading}
                        className="w-full mt-2"
                      >
                        <Truck className="w-4 h-4 mr-1.5" />{" "}
                        {t("dashboard.order.dispatch", {
                          carrier: selectedCarrier,
                        })}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900">{t("common.buyer")}</h2>
              <p className="text-sm font-semibold">{order.buyerName}</p>
              <p className="text-sm text-slate-600 break-all">{order.buyerEmail}</p>
              <p className="text-sm text-slate-600">{order.buyerPhone}</p>
            </Card>

            <Card className="p-5 space-y-2">
              <h2 className="text-base font-semibold text-slate-900">{t("common.payment")}</h2>
              <p className="text-2xl font-bold tracking-tight text-slate-900">
                ${order.amount.toFixed(2)}{" "}
                <span className="text-sm font-medium text-slate-500">{order.currency}</span>
              </p>
              <PaymentStatusBadge status={order.paymentStatus} />
              {/*
                The seller DTO deliberately omits `stripePaymentIntentId`: a Stripe
                id should not be shipped to the browser at all. The payment status
                badge above already communicates the same thing.
              */}
              {isPaid ? (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Pago confirmado en Stripe
                </p>
              ) : null}
              {canRefund ? (
                <details
                  className="pt-3 border-t border-slate-100"
                  open={!!refundError || !!refundKey}
                >
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">
                    {t("dashboard.order.refund")}
                  </summary>
                  <div className="space-y-3 pb-2">
                    <p className="text-xs">
                      Devuelto: {(order.refundedAmount ?? 0).toFixed(2)} {order.currency}.
                      Disponible: {(order.amount - (order.refundedAmount ?? 0)).toFixed(2)}{" "}
                      {order.currency}.
                    </p>
                    <label className="block text-xs">
                      Importe a reembolsar (vacío = saldo restante)
                      <input
                        aria-label="Importe a reembolsar"
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={order.amount - (order.refundedAmount ?? 0)}
                        value={refundAmount}
                        disabled={refundLoading || !!refundKey}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-3 mt-2"
                      />
                    </label>
                    {refundError ? (
                      <p className="text-xs text-rose-600 font-semibold">{refundError}</p>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleRefund}
                      isLoading={refundLoading}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t("dashboard.order.refund")}
                    </Button>
                  </div>
                </details>
              ) : null}
            </Card>
            <details className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <summary className="min-h-12 cursor-pointer p-5 text-base font-semibold text-slate-900">
                Dinero de este pedido
              </summary>
              <OrderMoney
                paid={order.paymentStatus === "SUCCEEDED" || order.paymentStatus === "REFUNDED"}
                total={order.amount}
                refunded={order.refundedAmount ?? 0}
                fee={order.finance.platformFee}
                itemTotal={order.items.reduce((sum, item) => sum + item.lineTotal, 0)}
                currency={order.currency}
                settlement={order.finance.settlementStatus}
              />
            </details>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
