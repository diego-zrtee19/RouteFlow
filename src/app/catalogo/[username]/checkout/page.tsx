"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { readCatalogCart, rememberCatalogPurchase } from "@/lib/catalogCartStore";
import { storeBuyerToken } from "@/lib/buyerTokenStore";
import type { CartLine } from "@/domain/catalogCart";
import type { DeliveryMethod } from "@/domain/types";
type Preview = { storeName: string; subtotal: number; currency: string; shippingPayer: string; deliveryOptions: DeliveryMethod[]; items: { title: string; quantity: number; lineTotal: number }[] };
type Quote = { id: string; service_code: string; amount: number; currency: string };
export default function CatalogCheckoutPage() {
  const username = String(useParams().username);
  const [items, setItems] = useState<CartLine[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryMethod>("meetup");
  const [buyer, setBuyer] = useState({ buyerName: "", buyerEmail: "", buyerPhone: "" });
  const [address, setAddress] = useState({ street: "", city: "", state: "", postalCode: "", country: "MX", notes: "" });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteId, setQuoteId] = useState("");
  const [testMode, setTestMode] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController(); const cart = readCatalogCart(username); setItems(cart); setPreview(null);
    if (!cart.length) { setError("Tu carrito está vacío. Regresa al catálogo."); return; }
    fetch("/api/catalog/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, items: cart }), signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); setPreview(data); setDelivery(data.deliveryOptions.includes("meetup") ? "meetup" : data.deliveryOptions[0]); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    fetch("/api/checkout/session", { signal: controller.signal }).then(response => response.json()).then(data => setTestMode(data.testMode)).catch(() => {});
    return () => controller.abort();
  }, [username]);
  useEffect(() => { setQuotes([]); setQuoteId(""); }, [address, delivery]);
  async function quote() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/catalog/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, items, address }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); setQuotes(data.quotes); } catch (error) { setError(error instanceof Error ? error.message : "No se pudo cotizar"); } finally { setBusy(false); }
  }
  async function pay(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { const response = await fetch("/api/catalog/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, items, ...buyer, address, deliveryMethod: delivery, ...(quoteId ? { quoteId } : {}) }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); storeBuyerToken(data.orderId, data.buyerToken); rememberCatalogPurchase(data.orderId, username, items); window.location.assign(data.url); } catch (error) { setError(error instanceof Error ? error.message : "No se pudo iniciar el pago"); setBusy(false); }
  }
  const money = (amount: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: preview?.currency ?? "MXN" }).format(amount);
  return <main className="max-w-2xl mx-auto p-4 space-y-5 pb-12"><Link href={`/catalogo/${username}`} className="text-blue-700 underline min-h-11 inline-block">Volver al catálogo / editar carrito</Link><h1 className="text-3xl font-bold">Completa tu compra</h1><p>Un solo pago, pedido y seguimiento. No necesitas registrarte.</p>{testMode && <p className="bg-amber-50 p-3 rounded-lg">Modo de prueba: no se cobra dinero real.</p>}{error && <p role="alert" className="text-rose-700">{error}</p>}
    {preview && <><section className="bg-white border rounded-xl p-5 space-y-3"><h2 className="font-bold">Compra a {preview.storeName}</h2>{preview.items.map((item, i) => <div className="flex justify-between gap-3" key={i}><p>{item.title} × {item.quantity}</p><p>{money(item.lineTotal)}</p></div>)}<p className="font-bold">Productos: {money(preview.subtotal)}</p></section>
    <form onSubmit={pay} className="space-y-4"><fieldset className="space-y-3"><legend className="font-bold">Tus datos para el recibo</legend>{(["buyerName", "buyerEmail", "buyerPhone"] as const).map((key, index) => <label key={key} className="block">{["Nombre completo", "Correo de tu compra", "Teléfono"][index]}<input className="block w-full border rounded-lg p-3" value={buyer[key]} type={key === "buyerEmail" ? "email" : key === "buyerPhone" ? "tel" : "text"} autoComplete={key === "buyerEmail" ? "email" : key === "buyerPhone" ? "tel" : "name"} required maxLength={150} onChange={event => setBuyer({ ...buyer, [key]: event.target.value })} /></label>)}</fieldset><p className="text-sm">Escribe un correo al que tengas acceso: te permitirá recuperar tu pedido en Mis compras.</p>
      <label className="block font-semibold">Entrega<select className="block w-full border rounded-lg p-3" value={delivery} onChange={event => setDelivery(event.target.value as DeliveryMethod)}>{preview.deliveryOptions.map(method => <option key={method} value={method}>{method === "shipping" ? "Envío FedEx" : method === "meetup" ? "Entrega coordinada con NIP" : "Entrega local con NIP"}</option>)}</select></label>
      <fieldset className="space-y-3"><legend className="font-bold">{delivery === "shipping" ? "Dirección de envío" : "Punto de entrega propuesto"}</legend>{(["street", "city", "state", "postalCode", "country", "notes"] as const).map((key, index) => <label key={key} className="block">{["Calle y número / punto de encuentro", "Ciudad", "Estado", "Código postal", "País (MX)", "Instrucciones o fecha propuesta"][index]}<input className="block w-full border rounded-lg p-3" value={address[key]} required={key !== "notes"} maxLength={key === "country" ? 2 : 200} pattern={key === "postalCode" ? "[0-9]{5}" : key === "country" ? "[A-Za-z]{2}" : undefined} onChange={event => setAddress({ ...address, [key]: event.target.value })} /></label>)}</fieldset>
      {delivery === "shipping" ? preview.shippingPayer === "buyer" ? <section className="space-y-3"><button type="button" disabled={busy} className="min-h-11 border rounded-lg p-3" onClick={quote}>Cotizar envío del carrito</button>{!!quotes.length && <label className="block">Servicio FedEx<select className="block border rounded-lg p-3 w-full" value={quoteId} onChange={event => setQuoteId(event.target.value)} required><option value="">Selecciona el servicio</option>{quotes.map(quote => <option key={quote.id} value={quote.id}>{quote.service_code} · {money(quote.amount)}</option>)}</select></label>}<p className="text-sm">Se calcula un paquete agrupado según los datos publicados por el vendedor.</p></section> : <p>Envío incluido por el vendedor. Debe tener origen y paquete configurados.</p> : <p>Acuerda el lugar y fecha con el vendedor. Muestra el NIP únicamente después de recibir y revisar todos los productos.</p>}
      <p className="font-bold text-xl">Total: {money(preview.subtotal + (delivery === "shipping" ? quotes.find(quote => quote.id === quoteId)?.amount ?? 0 : 0))}</p><p className="text-sm">Los productos se reservan al iniciar el pago. Si no completas la compra, la reserva se libera al vencer. El pago no garantiza por sí solo la entrega.</p><button disabled={busy || (delivery === "shipping" && preview.shippingPayer === "buyer" && !quoteId)} className="w-full rounded-lg bg-blue-600 text-white p-4 disabled:bg-slate-300">{busy ? "Procesando…" : "Pagar con tarjeta"}</button><Link href="/help" className="inline-block underline min-h-11">Ayuda, cancelaciones y reembolsos</Link>
    </form></>}
  </main>;
}
