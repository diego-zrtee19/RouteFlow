"use client";

import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { storeBuyerToken } from "@/lib/buyerTokenStore";
import { useI18n } from "@/i18n/LanguageProvider";
import type { DeliveryMethod } from "@/domain/types";
import { PurchaseGuide } from "@/components/shared/PurchaseGuide";

interface PublicLink {
  publicId: string;
  active: boolean;
  product: {
    id: string;
    title: string;
    description: string;
    price: number;
    currency: string;
    images: string[];
    stock: number;
    active: boolean;
    deliveryOptions: DeliveryMethod[];
  };
  seller: {
    id: string;
    businessName: string;
    username: string;
    profileImage?: string;
    verified: boolean;
  };
}

const SERVER_ERROR_TO_MESSAGE: Record<string, string> = {
  stripe_not_configured: "checkout.stripeNotConfigured",
  link_not_found: "checkout.notFound",
  product_inactive: "checkout.notFound",
  product_out_of_stock: "checkout.notFound",
  invalid_price: "checkout.notFound",
  missing_buyer_name: "checkout.errorFields",
  invalid_buyer_email: "checkout.errorFields",
  missing_buyer_phone: "checkout.errorFields",
  missing_shipping_address: "checkout.errorFields",
  invalid_delivery_method: "checkout.errorFields",
  missing_public_id: "checkout.errorFields",
};

export default function CheckoutPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const publicId = (params?.publicId as string) || "";
  const cancelled = searchParams.get("payment") === "cancelled";

  const [item, setItem] = useState<PublicLink | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [testMode, setTestMode] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("MX");
  const [notes, setNotes] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("shipping");
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<
    { id: string; service_code: string; amount: number; currency: string }[]
  >([]);
  const [quoteId, setQuoteId] = useState("");
  const [shippingPayer, setShippingPayer] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  useEffect(() => {
    setQuotes([]);
    setQuoteId("");
    setShippingPayer(null);
  }, [street, city, state, postalCode, country, deliveryMethod]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelledRequest = false;
    fetch(`/api/public/links/${encodeURIComponent(publicId)}`, {
      cache: "no-store",
    })
      .then((res) => {
        if (cancelledRequest) return;
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        return res.json().then((data) => {
          if (!cancelledRequest) {
            setItem(data);
            const options = (data?.product?.deliveryOptions ||
              []) as DeliveryMethod[];
            if (options.length > 0 && !options.includes("shipping"))
              setDeliveryMethod(options[0] as DeliveryMethod);
          }
        });
      })
      .catch(() => {
        if (!cancelledRequest) setNotFound(true);
      });
    fetch("/api/checkout/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelledRequest) return;
        setStripeConfigured(Boolean(data?.configured));
        setTestMode(data?.testMode !== false);
      })
      .catch(() => undefined);
    return () => {
      cancelledRequest = true;
    };
  }, [publicId]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <p>{t("checkout.notFound")}</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <p className="text-sm text-slate-500">{t("p.loading")}</p>
      </div>
    );
  }

  const { product, seller } = item;

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !name ||
      !email ||
      !phone ||
      !street ||
      !city ||
      !postalCode ||
      !state ||
      !/^[A-Za-z]{2}$/.test(country)
    ) {
      setFormError(t("checkout.errorFields"));
      return;
    }
    if (!stripeConfigured) {
      setFormError(t("checkout.stripeNotConfigured"));
      return;
    }

    if (
      deliveryMethod === "shipping" &&
      (shippingPayer === null || (shippingPayer === "buyer" && !quoteId))
    ) {
      setFormError("Consulta el costo de envío antes de pagar");
      return;
    }
    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId,
          quoteId: quoteId || undefined,
          buyerName: name,
          buyerEmail: email,
          buyerPhone: phone,
          deliveryMethod,
          address: {
            street,
            city,
            state,
            postalCode,
            country: country.toUpperCase(),
            notes,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.url) {
        const messageKey =
          data?.code && SERVER_ERROR_TO_MESSAGE[data.code as string]
            ? SERVER_ERROR_TO_MESSAGE[data.code as string]
            : "checkout.errorGeneric";
        setFormError(
          typeof data.message === "string" ? data.message : t(messageKey),
        );
        setLoading(false);
        return;
      }

      // The buyer token is issued once and never stored server-side in
      // plaintext. Park it before leaving for Stripe, so the success page can
      // authenticate with a header instead of carrying the secret in a URL.
      if (data?.orderId && data?.buyerToken) {
        storeBuyerToken(String(data.orderId), String(data.buyerToken));
      }

      // Real Stripe Checkout: the buyer enters the card on Stripe's secure page.
      window.location.assign(data.url as string);
    } catch {
      setFormError(t("checkout.errorGeneric"));
      setLoading(false);
    }
  };

  const deliveryOptions = (product.deliveryOptions || [
    "shipping",
  ]) as DeliveryMethod[];

  return (
    <div className="min-h-screen bg-brand-bg pb-16">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-sm text-[#0B1220]">
            {t("checkout.header")}
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
              <Lock className="w-3.5 h-3.5" />
              <span>{t("checkout.secure")}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6">
        <div className="mb-5"><PurchaseGuide /></div>
        {cancelled ? (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                {t("checkout.cancelledTitle")}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {t("checkout.cancelledBody")}
              </p>
            </div>
          </div>
        ) : null}

        <form
          onSubmit={handleCheckoutSubmit}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="md:col-span-2 space-y-4">
            <Card className="p-5 space-y-3">
              <h2 className="text-sm font-bold text-[#0B1220]">
                {t("checkout.buyerInfo")}
              </h2>
              <Input
                label={t("common.fullName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t("common.email")}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label={t("common.phone")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </Card>

            <Card className="p-5 space-y-3">
              <h2 className="text-sm font-bold text-[#0B1220]">
                {t("checkout.delivery")}
              </h2>
              <div className="grid grid-cols-2 gap-2 pb-2">
                {deliveryOptions.includes("shipping") ? (
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("shipping")}
                    className={`p-2.5 rounded-lg border text-xs font-semibold ${
                      deliveryMethod === "shipping"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {t("checkout.parcelShipping")}
                  </button>
                ) : null}
                {deliveryOptions.includes("local_delivery") ? (
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("local_delivery")}
                    className={`p-2.5 rounded-lg border text-xs font-semibold ${
                      deliveryMethod === "local_delivery"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {t("checkout.localDelivery")}
                  </button>
                ) : null}
              </div>
              {deliveryOptions.includes("meetup") && (
                <button
                  type="button"
                  onClick={() => setDeliveryMethod("meetup")}
                  className="border rounded-lg p-2 text-sm"
                  aria-pressed={deliveryMethod === "meetup"}
                >
                  Encuentro en punto acordado
                </button>
              )}
              <Input
                label={
                  deliveryMethod === "shipping"
                    ? t("common.streetAddress")
                    : "Dirección / punto acordado de entrega"
                }
                placeholder="Colima 142, Roma Norte"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t("common.city")}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
                <Input
                  label={t("common.postalCode")}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Código del estado"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                />
                <Input
                  label="Código del país (MX, US)"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  maxLength={2}
                  required
                />
              </div>
              {deliveryMethod === "shipping" && (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={
                      quoting || !postalCode || !state || !city || !street
                    }
                    className="border rounded-sm px-3 py-2 text-blue-700"
                    onClick={async () => {
                      setQuoting(true);
                      setFormError(null);
                      try {
                        const r = await fetch("/api/checkout/shipping-quote", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            publicId,
                            address: {
                              street,
                              city,
                              state,
                              postalCode,
                              country,
                            },
                          }),
                        });
                        const d = await r.json();
                        if (!r.ok) throw new Error(d.error);
                        setShippingPayer(d.payer);
                        setQuotes(d.quotes ?? []);
                        setQuoteId(d.quotes?.[0]?.id ?? "");
                      } catch (e) {
                        setFormError(
                          e instanceof Error ? e.message : "No se pudo cotizar",
                        );
                      } finally {
                        setQuoting(false);
                      }
                    }}
                  >
                    {quoting
                      ? "Consultando FedEx…"
                      : "Consultar costo de envío"}
                  </button>
                  {shippingPayer === "seller" && (
                    <p className="text-sm">
                      Envío incluido; la etiqueta la paga el vendedor.
                    </p>
                  )}
                  {quotes.length > 0 && (
                    <select
                      aria-label="Servicio de envío"
                      value={quoteId}
                      onChange={(e) => setQuoteId(e.target.value)}
                      className="w-full border rounded-sm p-2"
                    >
                      {quotes.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.service_code} · ${q.amount} {q.currency}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <Input
                label="Indicaciones de entrega (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Card>

            <Card className="p-5 space-y-3">
              <h2 className="text-sm font-bold text-[#0B1220]">
                {t("checkout.payment")}
              </h2>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    {t("checkout.stripeHosted")}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {testMode ? t("checkout.testMode") : t("checkout.liveMode")}
                  </span>
                </div>
                <p className="mt-1.5">{t("checkout.stripeNote")}</p>
              </div>
              {formError ? (
                <p className="text-xs text-rose-600 font-semibold">
                  {formError}
                </p>
              ) : null}
              {!stripeConfigured ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  {t("checkout.stripeNotConfigured")}
                </p>
              ) : null}
              <Button
                type="submit"
                size="lg"
                className="w-full shadow-md"
                isLoading={loading}
              >
                {t("checkout.payAmount", {
                  amount: `$${(product.price + (deliveryMethod === "shipping" ? Number(quotes.find((q) => q.id === quoteId)?.amount ?? 0) : 0)).toFixed(2)}`,
                  currency: product.currency,
                })}
              </Button>
            </Card>
          </div>

          <div>
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("checkout.orderSummary")}
              </h3>
              <p className="font-bold text-sm text-[#0B1220]">
                {product.title}
              </p>
              <p className="text-xs text-slate-500">{seller.businessName}</p>
              <div className="flex justify-between text-base font-bold text-[#0B1220] pt-2 border-t border-slate-100">
                <span>{t("common.total")}</span>
                <span>
                  $
                  {(
                    product.price +
                    (deliveryMethod === "shipping"
                      ? Number(
                          quotes.find((q) => q.id === quoteId)?.amount ?? 0,
                        )
                      : 0)
                  ).toFixed(2)}{" "}
                  {product.currency}
                </span>
              </div>
            </Card>
          </div>
        </form>
      </main>
    </div>
  );
}
