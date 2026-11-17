"use client";
import { CheckoutRecovery } from "@/components/shared/CheckoutRecovery";
import { checkoutAttemptKey, clearCheckoutAttempt } from "@/lib/checkoutAttemptStore";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { locationNotes, type LocationPoint } from "@/domain/locationPoint";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { storeBuyerToken } from "@/lib/buyerTokenStore";
import { useI18n } from "@/i18n/LanguageProvider";
import type { PublicPurchaseLinkView } from "@/domain/dto";
import type { DeliveryMethod } from "@/domain/types";
import { PurchaseGuide } from "@/components/shared/PurchaseGuide";

type PublicLink = Omit<PublicPurchaseLinkView, "product" | "seller"> & {
  product: PublicPurchaseLinkView["product"] & { hasVariants?: boolean };
  seller: PublicPurchaseLinkView["seller"] & { businessName?: string };
};
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
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
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
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [postalCode, setPostalCode] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("shipping");
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<
    { id: string; service_code: string; amount: number; currency: string }[]
  >([]);
  const [quoteId, setQuoteId] = useState("");
  const [shippingPayer, setShippingPayer] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const quoteRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    quoteRequest.current?.abort();
    setQuotes([]);
    setQuoteId("");
    setShippingPayer(null);
    setQuoteError("");
    return () => quoteRequest.current?.abort();
  }, [publicId, street, city, state, postalCode, country, deliveryMethod]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelledRequest = false;
    setNotFound(false);
    setLoadError(false);
    fetch(`/api/public/links/${encodeURIComponent(publicId)}`, {
      cache: "no-store",
    })
      .then((res) => {
        if (cancelledRequest) return;
        if (!res.ok) {
          if (res.status === 404 || res.status === 410) setNotFound(true);
          else setLoadError(true);
          return;
        }
        return res.json().then((data) => {
          if (!cancelledRequest) {
            setItem(data);
            const options = (data?.product?.deliveryOptions || []) as DeliveryMethod[];
            if (options.length > 0 && !options.includes("shipping"))
              setDeliveryMethod(options[0] as DeliveryMethod);
          }
        });
      })
      .catch(() => {
        if (!cancelledRequest) setLoadError(true);
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
  }, [publicId, reload]);

  if (notFound || loadError) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <Card className="max-w-md space-y-4">
          <CheckoutRecovery scope={publicId} />
          <h1 className="text-xl font-semibold">
            {loadError ? "No pudimos cargar la compra" : "Este enlace no está disponible"}
          </h1>
          <p className="text-sm text-slate-600">
            {loadError
              ? "Revisa tu conexión y vuelve a intentar. Tus datos escritos se conservan mientras mantengas esta página abierta."
              : "Pide al vendedor un enlace actualizado. Si ya pagaste, consulta tu pedido desde Mis compras."}
          </p>
          {loadError && (
            <Button onClick={() => setReload((value) => value + 1)}>Volver a intentar</Button>
          )}
          <Link href="/mis-compras" className="block min-h-11 py-3 text-accent-700 underline">
            Mis compras
          </Link>
        </Card>
      </div>
    );
  }

  if (item?.product.hasVariants)
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Selecciona talla o color</h1>
        <p>Este producto se compra desde el catálogo para reservar la opción correcta.</p>
        <Link
          href={`/catalogo/${item.seller.storeUsername}`}
          className="inline-block bg-accent-700 text-white p-3 rounded-lg"
        >
          Elegir en el catálogo
        </Link>
      </main>
    );

  if (!item) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <p className="text-sm text-slate-500">{t("p.loading")}</p>
      </div>
    );
  }

  const { product, seller } = item;
  if (!product.inStock)
    return (
      <main className="max-w-lg mx-auto p-6 space-y-4">
        <CheckoutRecovery scope={publicId} />
        <h1 className="text-2xl font-semibold">Producto no disponible</h1>
        <p>
          El artículo está agotado o dejó de estar a la venta. No se puede iniciar una compra nueva.
        </p>
        <Link
          href={`/catalogo/${seller.storeUsername}`}
          className="block min-h-11 py-3 text-accent-700 underline"
        >
          Ver otros productos del vendedor
        </Link>
        <Link href="/mis-compras" className="block min-h-11 py-3 text-accent-700 underline">
          Consultar una compra anterior
        </Link>
      </main>
    );

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
      const payload = {
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
          notes: locationNotes(notes, location),
        },
      };
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": await checkoutAttemptKey(publicId, payload),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (data.code === "CHECKOUT_CLOSED") clearCheckoutAttempt(publicId);

      if (!res.ok || !data?.url) {
        const messageKey =
          data?.code && SERVER_ERROR_TO_MESSAGE[data.code as string]
            ? SERVER_ERROR_TO_MESSAGE[data.code as string]
            : "checkout.errorGeneric";
        setFormError(typeof data.message === "string" ? data.message : t(messageKey));
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

  const deliveryOptions = (product.deliveryOptions || ["shipping"]) as DeliveryMethod[];

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <header className="bg-accent-700 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-16 py-3 flex flex-wrap gap-3 items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight text-white">
            {t("checkout.header")}
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="dark" />
            <div className="flex items-center gap-1.5 text-xs text-white/80">
              <Lock className="w-3.5 h-3.5" />
              <span>{t("checkout.secure")}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        <Link
          href={`/p/${publicId}`}
          className="inline-block text-sm text-accent-700 hover:underline mb-5"
        >
          ← Volver al producto
        </Link>
        <CheckoutRecovery scope={publicId} />
        <div className="mb-7">
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-slate-900">
            Finaliza tu compra
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Completa tus datos y elige cómo recibir tu compra.
          </p>
        </div>
        {cancelled ? (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">{t("checkout.cancelledTitle")}</p>
              <p className="text-xs text-amber-700 mt-0.5">{t("checkout.cancelledBody")}</p>
            </div>
          </div>
        ) : null}

        <form
          onSubmit={handleCheckoutSubmit}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start"
        >
          <div className="lg:col-span-8 space-y-5">
            <Card className="p-5 sm:p-7 space-y-5">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="text-sm font-medium text-slate-500 border-r border-slate-300 pr-3"
                >
                  01
                </span>
                {t("checkout.buyerInfo").replace(/^\d+\.\s*/, "")}
              </h2>
              <Input
                label={t("common.fullName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={t("common.email")}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label={t("common.phone")}
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </Card>

            <Card className="p-5 sm:p-7 space-y-5">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="text-sm font-medium text-slate-500 border-r border-slate-300 pr-3"
                >
                  02
                </span>
                {t("checkout.delivery").replace(/^\d+\.\s*/, "")}
              </h2>
              <div className="grid grid-cols-2 gap-2 pb-2">
                {deliveryOptions.includes("shipping") ? (
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("shipping")}
                    aria-pressed={deliveryMethod === "shipping"}
                    className={`min-h-12 p-3 rounded-md border text-sm font-medium ${
                      deliveryMethod === "shipping"
                        ? "border-accent-600 bg-accent-50 text-accent-700"
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
                    aria-pressed={deliveryMethod === "local_delivery"}
                    className={`min-h-12 p-3 rounded-md border text-sm font-medium ${
                      deliveryMethod === "local_delivery"
                        ? "border-accent-600 bg-accent-50 text-accent-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {t("checkout.localDelivery")}
                  </button>
                ) : null}
                {deliveryOptions.includes("meetup") && (
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("meetup")}
                    className={`min-h-12 w-full border rounded-md p-3 text-sm font-medium text-left ${deliveryMethod === "meetup" ? "border-accent-600 bg-accent-50 text-accent-700" : "border-slate-200 text-slate-600"}`}
                    aria-pressed={deliveryMethod === "meetup"}
                  >
                    Encuentro en punto acordado
                  </button>
                )}
              </div>
              <details className="border-b border-slate-200 pb-3">
                <summary className="cursor-pointer min-h-11 py-3 text-sm font-medium text-accent-700">
                  Añadir un punto en el mapa (opcional)
                </summary>
                <LocationPicker
                  disabled={loading || quoting}
                  onPoint={setLocation}
                  onAddress={(address) => {
                    if (address.street) setStreet(address.street);
                    if (address.city) setCity(address.city);
                    if (address.state) setState(address.state);
                    if (address.postalCode) setPostalCode(address.postalCode);
                    if (address.country) setCountry(address.country);
                  }}
                />
              </details>
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
                  <Button
                    type="button"
                    disabled={loading}
                    isLoading={quoting}
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      if (
                        !street.trim() ||
                        !city.trim() ||
                        !state.trim() ||
                        !postalCode.trim() ||
                        !/[A-Za-z]{2}/.test(country.trim()) ||
                        (country.trim().toUpperCase() === "MX" &&
                          !/^\d{5}$/.test(postalCode.trim()))
                      ) {
                        setQuoteError(
                          "Completa calle, ciudad, estado, país y código postal. En México, el código postal debe tener 5 dígitos.",
                        );
                        return;
                      }
                      const controller = new AbortController();
                      quoteRequest.current?.abort();
                      quoteRequest.current = controller;
                      const timeout = setTimeout(() => {
                        if (!controller.signal.aborted) {
                          setQuoteError(
                            "La consulta tardó demasiado. Intenta de nuevo; todavía no se ha cobrado ni generado un envío.",
                          );
                          controller.abort();
                        }
                      }, 30000);
                      setQuoting(true);
                      setQuoteError("");
                      setFormError(null);
                      try {
                        const r = await fetch("/api/checkout/shipping-quote", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          signal: controller.signal,
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
                        if (controller.signal.aborted) return;
                        if (!r.ok) throw new Error(d.error);
                        setShippingPayer(d.payer);
                        if (d.payer !== "seller" && !d.quotes?.length)
                          throw Error(
                            "FedEx no devolvió servicios para esta dirección. Revisa los datos o contacta al vendedor.",
                          );
                        setQuotes(d.quotes ?? []);
                        setQuoteId(d.quotes?.[0]?.id ?? "");
                      } catch (e) {
                        if (!controller.signal.aborted)
                          setQuoteError(e instanceof Error ? e.message : "No se pudo cotizar");
                      } finally {
                        clearTimeout(timeout);
                        if (quoteRequest.current === controller) setQuoting(false);
                      }
                    }}
                  >
                    {quoting ? "Consultando FedEx…" : "Consultar costo de envío"}
                  </Button>
                  {quoteError && (
                    <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                      {quoteError}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    La tarifa se calcula con el código postal y los datos del paquete. Si cambias la
                    dirección, consulta de nuevo.
                  </p>
                  {shippingPayer === "seller" && (
                    <p
                      role="status"
                      className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800"
                    >
                      Envío incluido; la etiqueta la paga el vendedor.
                    </p>
                  )}
                  {quotes.length > 0 && (
                    <select
                      aria-label="Servicio de envío"
                      value={quoteId}
                      onChange={(e) => setQuoteId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-3 text-sm"
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

            <Card className="p-5 sm:p-7 space-y-5">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="text-sm font-medium text-slate-500 border-r border-slate-300 pr-3"
                >
                  03
                </span>
                {t("checkout.payment").replace(/^\d+\.\s*/, "")}
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
                <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  {formError}
                </p>
              ) : null}
              {!stripeConfigured ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  {t("checkout.stripeNotConfigured")}
                </p>
              ) : null}
              <Button type="submit" size="lg" className="w-full" isLoading={loading}>
                {t("checkout.payAmount", {
                  amount: `$${(product.price + (deliveryMethod === "shipping" ? Number(quotes.find((q) => q.id === quoteId)?.amount ?? 0) : 0)).toFixed(2)}`,
                  currency: product.currency,
                })}
              </Button>
            </Card>
          </div>

          <aside className="lg:col-span-4 lg:sticky lg:top-6">
            <Card className="p-5 sm:p-6 space-y-5">
              <h2 className="text-lg font-medium text-slate-900">{t("checkout.orderSummary")}</h2>
              {product.images[0] && (
                <Image
                  src={product.images[0]}
                  alt={product.title}
                  width={160}
                  height={160}
                  unoptimized
                  className="size-28 object-contain bg-white"
                />
              )}
              <p className="font-bold text-sm text-ink">{product.title}</p>
              <p className="text-sm text-slate-500">
                {seller.businessName || seller.storeName || seller.storeUsername}
              </p>
              <div className="flex justify-between gap-3 text-sm text-slate-600 border-t border-slate-200 pt-4">
                <span>Producto</span>
                <span>
                  ${product.price.toFixed(2)} {product.currency}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-sm text-slate-600">
                <span>Entrega</span>
                <span className="text-right">
                  {deliveryMethod !== "shipping"
                    ? "Coordinada"
                    : shippingPayer === "seller"
                      ? "Incluida"
                      : quoteId
                        ? `$${Number(quotes.find((q) => q.id === quoteId)?.amount ?? 0).toFixed(2)} ${product.currency}`
                        : "Por calcular"}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-ink pt-2 border-t border-slate-100">
                <span>
                  {deliveryMethod === "shipping" && shippingPayer !== "seller" && !quoteId
                    ? "Total sin envío"
                    : t("common.total")}
                </span>
                <span>
                  $
                  {(
                    product.price +
                    (deliveryMethod === "shipping"
                      ? Number(quotes.find((q) => q.id === quoteId)?.amount ?? 0)
                      : 0)
                  ).toFixed(2)}{" "}
                  {product.currency}
                </span>
              </div>
            </Card>
          </aside>
        </form>
        <div className="mt-8">
          <PurchaseGuide />
        </div>
      </main>
    </div>
  );
}
