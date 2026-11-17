"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { CommerceHeader } from "@/components/shared/CommerceHeader";
import { readBuyerToken, storeBuyerSession } from "@/lib/buyerTokenStore";
import { clearPaidCatalogCart } from "@/lib/catalogCartStore";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/i18n/LanguageProvider";
import Link from "next/link";
import { BuyerReceipt, type BuyerReceiptView } from "@/components/shared/BuyerReceipt";

type SuccessOrder = BuyerReceiptView;

type Phase = "verifying" | "pending" | "paid" | "failed" | "missing";

/**
 * Checkout success page. It never decides that the payment succeeded: it
 * polls the server order and asks the server to reconcile with Stripe
 * (webhook delivery takes precedence; direct API verification is the
 * fallback when the webhook has not arrived yet).
 */
function SuccessInner() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const orderId = searchParams.get("order_id");
  const sessionId = searchParams.get("session_id");

  const [phase, setPhase] = useState<Phase>("verifying");
  const [order, setOrder] = useState<SuccessOrder | null>(null);
  const [testMode, setTestMode] = useState(true);
  const attempts = useRef(0);
  useEffect(() => {
    if (order?.id && sessionId) storeBuyerSession(order.id, sessionId);
  }, [order?.id, sessionId]);
  useEffect(() => {
    if (phase === "paid" && order?.id) clearPaidCatalogCart(order.id);
  }, [phase, order?.id]);

  // Appended to the tracking link only when the token is actually parked in this
  // tab. sessionStorage is unavailable during SSR, hence the `typeof window`
  // guard, which yields the bare link during the server pass and fills in on the
  // client pass.
  const buyerTokenParam = (() => {
    if (!orderId || typeof window === "undefined") return "";
    try {
      const token = window.sessionStorage.getItem(`routeflow.buyerToken.${orderId}`);
      return token ? "" : sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
    } catch {
      return "";
    }
  })();

  const loadOrder = useCallback(async (): Promise<SuccessOrder | null> => {
    if (!orderId) return null;
    try {
      // Prefer the buyer token parked before the Stripe redirect: it is the
      // buyer's own credential and travels as a header, so it never lands in a
      // URL, in history or in a Referer. The Stripe session id is the fallback
      // for a buyer who finished on another device, where sessionStorage is
      // empty.
      const params = new URLSearchParams({ order_id: orderId });
      const buyerToken = readBuyerToken(orderId);
      const headers: Record<string, string> = {};

      if (buyerToken) {
        headers["x-buyer-token"] = buyerToken;
      } else if (sessionId) {
        params.set("session_id", sessionId);
      }

      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}?${params.toString()}`, {
        cache: "no-store",
        headers,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data?.order ?? null) as SuccessOrder | null;
    } catch {
      return null;
    }
  }, [orderId, sessionId]);

  const attemptVerify = useCallback(async () => {
    if (!sessionId) return false;
    try {
      const res = await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (typeof data?.testMode === "boolean") setTestMode(data.testMode);
      return Boolean(data?.order && data.order.paymentStatus === "SUCCEEDED");
    } catch {
      return false;
    }
  }, [sessionId]);

  useEffect(() => {
    if (!orderId) {
      setPhase("missing");
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (!alive) return;
      attempts.current += 1;

      const current = await loadOrder();
      if (!alive) return;

      if (!current) {
        if (attempts.current < 8) {
          timer = setTimeout(poll, 2500);
          return;
        }
        setPhase("missing");
        return;
      }

      setOrder(current);

      if (current.paymentStatus === "SUCCEEDED") {
        setPhase("paid");
        return;
      }
      if (current.paymentStatus === "FAILED" || current.paymentStatus === "REFUNDED") {
        setPhase("failed");
        return;
      }

      if (sessionId) {
        const reconciled = await attemptVerify();
        if (!alive) return;
        if (reconciled) {
          const refreshed = await loadOrder();
          if (!alive) return;
          if (refreshed) setOrder(refreshed);
          setPhase("paid");
          return;
        }
      }

      if (attempts.current < 24) {
        setPhase("pending");
        timer = setTimeout(poll, 2500);
        return;
      }
      setPhase("pending");
    };

    poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, sessionId, loadOrder, attemptVerify]);

  const supportEmail = "soporte@routeflow.mx";

  return (
    <div className="min-h-screen bg-brand-bg pb-16">
      <CommerceHeader />

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        {phase === "verifying" && (
          <Card className="p-8 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-accent-600 mx-auto animate-spin" />
            <p className="text-sm font-semibold text-ink">{t("checkout.success.verifying")}</p>
          </Card>
        )}

        {phase === "pending" && (
          <Card className="p-8 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-amber-500 mx-auto animate-spin" />
            <h1 className="text-xl font-semibold text-ink">{t("checkout.success.pendingTitle")}</h1>
            <p className="text-sm text-slate-500">{t("checkout.success.pendingBody")}</p>
            <p className="text-xs text-slate-500">{t("checkout.success.pendingHint")}</p>
          </Card>
        )}

        {phase === "failed" && (
          <Card className="p-8 text-center space-y-3 border-rose-200">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h1 className="text-xl font-semibold text-ink">{t("checkout.success.failedTitle")}</h1>
            <p className="text-sm text-slate-500">{t("checkout.success.failedBody")}</p>
          </Card>
        )}

        {(phase === "missing" || !orderId) && (
          <Card className="p-8 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-slate-500 mx-auto" />
            <h1 className="text-xl font-semibold text-ink">
              {t("checkout.success.notFoundTitle")}
            </h1>
            <p className="text-sm text-slate-500">
              {orderId ? t("checkout.success.notFoundBody") : t("checkout.success.missingOrder")}
            </p>
            <Link href="/" className={buttonStyles({ variant: "outline" })}>
              {t("checkout.success.backHome")}
            </Link>
          </Card>
        )}

        {phase === "paid" && order && (
          <>
            <Card className="p-8 text-center space-y-3 bg-white">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h1 className="text-xl font-semibold text-ink">{t("checkout.success.paidTitle")}</h1>
              <p className="text-sm text-slate-500">{t("checkout.success.paidBody")}</p>
              {testMode && (
                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider">
                  {t("checkout.testMode")}
                </span>
              )}
            </Card>

            <BuyerReceipt order={order} />
            <Card className="p-5 space-y-2">
              <h2 className="font-semibold">Encuentra esta compra cuando la necesites</h2>
              <p className="text-sm">
                Entra a Mis compras con el correo que usaste al pagar. Podrás recuperar el
                seguimiento desde otro dispositivo y pedir ayuda. Comprar no requiere registrarte.
              </p>
              <Link href="/mis-compras" className="inline-block text-accent-700 underline min-h-11">
                Mis compras / recuperar acceso
              </Link>
            </Card>

            <p className="text-center text-xs text-slate-500">
              {t("checkout.success.questions", { email: supportEmail })}
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              {/*
              The tracking page authenticates with the buyer token. It has to
              travel in the query string here because a plain link cannot carry a
              header, so `rel="noreferrer"` keeps the token out of the Referer of
              anything the tracking page links to. When no token is parked (the
              buyer came back on another device) the link still resolves, because
              /order/[id] falls back to the Stripe session credential.
            */}
              <Link
                href={order ? `/order/${order.id}${buyerTokenParam}` : "/"}
                rel="noreferrer"

                className={buttonStyles({ className: "flex-1 w-full" })}
              >
                Seguir mi pedido
              </Link>
              <Link
                href="/"
                className={buttonStyles({ variant: "secondary", className: "flex-1 w-full" })}
              >
                {t("checkout.success.backHome")}
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
