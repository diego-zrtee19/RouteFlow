"use client";
import { CheckoutRecovery } from "@/components/shared/CheckoutRecovery";
import { checkoutAttemptKey, clearCheckoutAttempt } from "@/lib/checkoutAttemptStore";
import { CommerceHeader } from "@/components/shared/CommerceHeader";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { readCatalogCart, rememberCatalogPurchase, saveCatalogCart } from "@/lib/catalogCartStore";
import { storeBuyerToken } from "@/lib/buyerTokenStore";
import type { CartLine, PublicCatalog } from "@/domain/catalogCart";
import type { DeliveryMethod } from "@/domain/types";
import { cartIssues } from "@/domain/catalogExperience";
import { useSessionDraft } from "@/components/shared/useSessionDraft";
import { checkoutDraftInitial, parseCheckoutDraft } from "@/domain/formDrafts";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { locationNotes, type LocationPoint } from "@/domain/locationPoint";
type Preview = {
  storeName: string;
  subtotal: number;
  currency: string;
  shippingPayer: string;
  deliveryOptions: DeliveryMethod[];
  items: { title: string; quantity: number; lineTotal: number }[];
};
type Quote = { id: string; service_code: string; amount: number; currency: string };
type Issue = { productId: string; variantId?: string; message: string };
export default function CatalogCheckoutPage() {
  const username = String(useParams().username);
  const [items, setItems] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [reload, setReload] = useState(0);
  const [delivery, setDelivery] = useState<DeliveryMethod>("meetup");
  const draft = useSessionDraft(
    `routeflow.checkoutDraft.${username}`,
    checkoutDraftInitial,
    parseCheckoutDraft,
  );
  const { buyer, address } = draft.value;
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteId, setQuoteId] = useState("");
  const [testMode, setTestMode] = useState<boolean | null>(null);
  const quoteRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setItems(readCatalogCart(username));
    setCartLoaded(true);
    setCatalog(null);
    fetch(`/api/public/catalog/${encodeURIComponent(username)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.message || data.error || "No se pudo iniciar el pago");
        if (!controller.signal.aborted) setCatalog(data);
      })
      .catch(() => {});
    fetch("/api/checkout/session", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (!controller.signal.aborted) setTestMode(data.testMode);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [username, reload]);
  useEffect(() => {
    if (!cartLoaded) return;
    setPreview(null);
    setIssues([]);
    setError("");
    if (!items.length) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    fetch("/api/catalog/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, items }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setIssues(data.issues ?? []);
          throw Error(data.message || data.error || "No se pudo iniciar el pago");
        }
        setPreview(data);
        setDelivery((previous) =>
          data.deliveryOptions.includes(previous) ? previous : data.deliveryOptions[0],
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [username, items, cartLoaded, reload]);
  useEffect(() => {
    quoteRequest.current?.abort();
    setQuotes([]);
    setQuoteId("");
    return () => quoteRequest.current?.abort();
  }, [address, delivery, username, items]);
  function updateCart(lines: CartLine[]) {
    if (!saveCatalogCart(username, lines)) {
      setError(
        "No se pudo guardar el carrito. Permite almacenamiento en el navegador para continuar.",
      );
      return;
    }
    setItems(lines);
  }
  async function quote() {
    if (busy) return;
    const controller = new AbortController();
    quoteRequest.current?.abort();
    quoteRequest.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/catalog/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, items, address }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (data.code === "CHECKOUT_CLOSED") clearCheckoutAttempt(username);
      if (!response.ok) throw Error(data.message || data.error || "No se pudo iniciar el pago");
      if (!controller.signal.aborted) setQuotes(data.quotes);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : "No se pudo cotizar");
    } finally {
      if (quoteRequest.current === controller) setBusy(false);
    }
  }
  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (busy || checking || !preview) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        username,
        items,
        ...buyer,
        address: { ...address, notes: locationNotes(address.notes, location) },
        deliveryMethod: delivery,
        ...(quoteId ? { quoteId } : {}),
      };
      const response = await fetch("/api/catalog/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": await checkoutAttemptKey(username, payload),
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.code === "CHECKOUT_CLOSED") clearCheckoutAttempt(username);
      if (!response.ok) throw Error(data.message || data.error || "No se pudo iniciar el pago");
      storeBuyerToken(data.orderId, data.buyerToken);
      rememberCatalogPurchase(data.orderId, username, items);
      draft.clear();
      window.location.assign(data.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo iniciar el pago");
      setBusy(false);
    }
  }
  const localIssues = catalog ? cartIssues(catalog.products, items) : [];
  const money = (amount: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: preview?.currency ?? "MXN",
    }).format(amount);
  return (
    <>
      <CommerceHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5 pb-12">
        <Link
          href={`/catalogo/${username}`}
          className="text-accent-700 underline min-h-11 inline-block"
        >
          Volver al catálogo
        </Link>
        <h1 className="text-3xl font-semibold">Completa tu compra</h1>
        <CheckoutRecovery scope={username} />
        <p>Un solo pedido y seguimiento. No necesitas registrarte.</p>
        {testMode && (
          <p className="bg-amber-50 p-3 rounded-lg">Modo de prueba: no se cobra dinero real.</p>
        )}
        {error && (
          <div role="alert" className="text-rose-700">
            <p>{error}</p>
            <button
              type="button"
              disabled={busy || checking}
              className="min-h-11 underline"
              onClick={() => setReload((value) => value + 1)}
            >
              Revisar disponibilidad de nuevo
            </button>
          </div>
        )}
        {checking && <p role="status">Comprobando precios, opciones e inventario…</p>}
        {cartLoaded && !items.length && (
          <p>Tu carrito está vacío. Vuelve al catálogo para elegir productos.</p>
        )}
        {!!items.length && (
          <section aria-label="Editar carrito" className="border bg-white rounded-lg p-4 space-y-4">
            <h2 className="font-semibold">Revisa o corrige tus artículos aquí</h2>
            {items.map((line, index) => {
              const product = catalog?.products.find((product) => product.id === line.productId);
              const variant = product?.variants.find((variant) => variant.id === line.variantId);
              const issue = [...issues, ...localIssues].find(
                (issue) => issue.productId === line.productId && issue.variantId === line.variantId,
              );
              return (
                <div
                  key={`${line.productId}:${line.variantId ?? ""}`}
                  className="border-t pt-3 space-y-2"
                >
                  <p className="font-semibold">
                    {product?.title ?? `Artículo ${index + 1}`}
                    {variant ? ` · ${variant.label}` : ""}
                  </p>
                  {issue && (
                    <p role="alert" className="text-sm text-rose-700">
                      {issue.message}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 items-end">
                    <label>
                      Cantidad
                      <input
                        aria-label={`Cantidad de ${product?.title ?? `artículo ${index + 1}`}${variant ? ` ${variant.label}` : ""}`}
                        disabled={busy}
                        className="block w-24 p-3 border rounded-lg"
                        type="number"
                        min={1}
                        max={20}
                        value={line.quantity}
                        onChange={(event) => {
                          const quantity = Number(event.target.value);
                          if (
                            Number.isInteger(quantity) &&
                            quantity >= 1 &&
                            quantity <= 20 &&
                            items.reduce(
                              (total, item, i) => total + (i === index ? quantity : item.quantity),
                              0,
                            ) <= 50
                          )
                            updateCart(
                              items.map((item, i) => (i === index ? { ...item, quantity } : item)),
                            );
                        }}
                      />
                    </label>
                    {!!product?.variants.length && (
                      <label className="flex-1 min-w-40">
                        Talla / color
                        <select
                          disabled={busy}
                          aria-label={`Opción de ${product.title}`}
                          className="block w-full p-3 border rounded-lg"
                          value={line.variantId ?? ""}
                          onChange={(event) => {
                            const selectedId = event.target.value;
                            if (
                              items.some(
                                (item, i) =>
                                  i !== index &&
                                  item.productId === line.productId &&
                                  item.variantId === selectedId,
                              )
                            ) {
                              setError(
                                "Esa opción ya está en el carrito. Ajusta su cantidad o quita la línea repetida.",
                              );
                              return;
                            }
                            updateCart(
                              items.map((item, i) =>
                                i === index
                                  ? { ...item, variantId: selectedId || undefined }
                                  : item,
                              ),
                            );
                          }}
                        >
                          <option value="">
                            {line.variantId && !variant
                              ? "Opción anterior no disponible"
                              : "Selecciona una opción"}
                          </option>
                          {product.variants.map((option) => (
                            <option key={option.id} value={option.id} disabled={!option.inStock}>
                              {option.label}
                              {!option.inStock ? " · agotada" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-11 text-rose-700 underline"
                      onClick={() => updateCart(items.filter((_, i) => i !== index))}
                    >
                      Quitar artículo {index + 1}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
        {preview && (
          <section className="bg-white border rounded-lg p-5 space-y-3">
            <h2 className="font-semibold">Compra a {preview.storeName}</h2>
            {preview.items.map((item, i) => (
              <div className="flex justify-between gap-3" key={i}>
                <p>
                  {item.title} × {item.quantity}
                </p>
                <p>{money(item.lineTotal)}</p>
              </div>
            ))}
            <p className="font-bold">Productos: {money(preview.subtotal)}</p>
          </section>
        )}
        {!!items.length && (
          <form onSubmit={pay} className="space-y-4">
            <p role="status" className="text-sm text-slate-600">
              {draft.saved
                ? "Tus datos se guardan solo en esta pestaña hasta 4 horas y se borran al iniciar el pago. Usa un dispositivo personal."
                : "Conserva esta pestaña abierta: no se pudo guardar el borrador."}
            </p>
            <button
              type="button"
              className="min-h-11 underline text-accent-700"
              disabled={busy}
              onClick={draft.discard}
            >
              Borrar mis datos de esta pestaña
            </button>
            <fieldset
              disabled={busy}
              className="space-y-4 border border-slate-200 bg-white rounded-lg p-5 sm:p-6"
            >
              <legend className="font-bold">Tus datos para el recibo</legend>
              {(["buyerName", "buyerEmail", "buyerPhone"] as const).map((key, index) => (
                <label key={key} className="block">
                  {["Nombre completo", "Correo de tu compra", "Teléfono"][index]}
                  <input
                    className="block w-full border rounded-lg p-3"
                    value={buyer[key]}
                    type={key === "buyerEmail" ? "email" : key === "buyerPhone" ? "tel" : "text"}
                    autoComplete={
                      key === "buyerEmail" ? "email" : key === "buyerPhone" ? "tel" : "name"
                    }
                    required
                    maxLength={150}
                    onChange={(event) =>
                      draft.setValue((previous) => ({
                        ...previous,
                        buyer: { ...previous.buyer, [key]: event.target.value },
                      }))
                    }
                  />
                </label>
              ))}
            </fieldset>
            <p className="text-sm">El correo te permitirá recuperar el pedido en Mis compras.</p>
            <LocationPicker
              disabled={busy}
              onPoint={setLocation}
              onAddress={(address) =>
                draft.setValue((previous) => ({
                  ...previous,
                  address: {
                    ...previous.address,
                    ...Object.fromEntries(Object.entries(address).filter(([, v]) => !!v)),
                  },
                }))
              }
            />
            {preview && (
              <label className="block font-semibold">
                Entrega
                <select
                  disabled={busy}
                  className="block w-full border rounded-lg p-3"
                  value={delivery}
                  onChange={(event) => setDelivery(event.target.value as DeliveryMethod)}
                >
                  {preview.deliveryOptions.map((method) => (
                    <option key={method} value={method}>
                      {method === "shipping"
                        ? "Envío FedEx"
                        : method === "meetup"
                          ? "Entrega coordinada con NIP"
                          : "Entrega local con NIP"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset
              disabled={busy}
              className="space-y-4 border border-slate-200 bg-white rounded-lg p-5 sm:p-6"
            >
              <legend className="font-bold">
                {delivery === "shipping" ? "Dirección de envío" : "Punto de entrega propuesto"}
              </legend>
              {(["street", "city", "state", "postalCode", "country", "notes"] as const).map(
                (key, index) => (
                  <label key={key} className="block">
                    {
                      [
                        "Calle y número / punto de encuentro",
                        "Ciudad",
                        "Estado",
                        "Código postal",
                        "País (MX)",
                        "Instrucciones o fecha propuesta",
                      ][index]
                    }
                    <input
                      className="block w-full border rounded-lg p-3"
                      value={address[key]}
                      required={key !== "notes"}
                      maxLength={key === "country" ? 2 : 200}
                      pattern={
                        key === "postalCode"
                          ? "[0-9]{5}"
                          : key === "country"
                            ? "[A-Za-z]{2}"
                            : undefined
                      }
                      onChange={(event) =>
                        draft.setValue((previous) => ({
                          ...previous,
                          address: { ...previous.address, [key]: event.target.value },
                        }))
                      }
                    />
                  </label>
                ),
              )}
            </fieldset>
            {preview &&
              (delivery === "shipping" ? (
                preview.shippingPayer === "buyer" ? (
                  <section className="space-y-3">
                    <button
                      type="button"
                      disabled={busy || checking}
                      className="min-h-11 border rounded-lg p-3"
                      onClick={quote}
                    >
                      Cotizar envío del carrito
                    </button>
                    {!!quotes.length && (
                      <label className="block">
                        Servicio FedEx
                        <select
                          className="block border rounded-lg p-3 w-full"
                          value={quoteId}
                          onChange={(event) => setQuoteId(event.target.value)}
                          required
                        >
                          <option value="">Selecciona el servicio</option>
                          {quotes.map((quote) => (
                            <option key={quote.id} value={quote.id}>
                              {quote.service_code} · {money(quote.amount)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <p className="text-sm">Cotiza de nuevo si cambias artículos o dirección.</p>
                  </section>
                ) : (
                  <p>Envío incluido por el vendedor.</p>
                )
              ) : (
                <p>
                  Confirma el lugar y fecha con el vendedor. Muestra el NIP únicamente después de
                  recibir y revisar todos los productos.
                </p>
              ))}
            {preview && (
              <p className="font-bold text-xl">
                Total:{" "}
                {money(
                  preview.subtotal +
                    (delivery === "shipping"
                      ? (quotes.find((quote) => quote.id === quoteId)?.amount ?? 0)
                      : 0),
                )}
              </p>
            )}
            <button
              disabled={
                busy ||
                checking ||
                !preview ||
                !!localIssues.length ||
                (delivery === "shipping" && preview.shippingPayer === "buyer" && !quoteId)
              }
              className="w-full rounded-lg bg-accent-700 text-white p-4 disabled:bg-slate-300 disabled:text-slate-700"
            >
              {busy
                ? "Procesando…"
                : !preview
                  ? "Corrige el carrito para continuar"
                  : "Pagar con tarjeta"}
            </button>
            <p className="text-sm">
              Los precios y el stock se validan de nuevo al iniciar el pago. Una reserva sin
              completar vence; pagar no garantiza por sí solo la entrega.
            </p>
            <Link href="/help" className="inline-block underline min-h-11">
              Ayuda, cancelaciones y reembolsos
            </Link>
          </form>
        )}
      </main>
    </>
  );
}
