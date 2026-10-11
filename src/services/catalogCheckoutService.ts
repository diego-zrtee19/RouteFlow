import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe, isStripeConfigured, isStripeTestMode } from "@/lib/stripe";
import { generateBuyerToken, generateOrderNumber, hashBuyerToken } from "@/lib/buyerToken";
import { CheckoutError, validateCheckoutInput, toStripeAmount } from "@/services/checkoutService";
import { validateCartLines, type CartLine } from "@/domain/catalogCart";
import { quoteFingerprint } from "@/services/shippingQuoteService";
import { rowToOrder, cancelOrder } from "@/repositories/orderRepository";
import { upsertPayment } from "@/repositories/paymentRepository";
import { recordEvent } from "@/services/orderService";
import { FedExShippingProvider } from "@/providers/shipping/FedExProvider";
import type { Address, DeliveryMethod } from "@/domain/types";

export interface CartProfile {
 sellerId: string; storeName: string; username: string; subtotal: number; currency: string; deliveryOptions: DeliveryMethod[]; shippingPayer: "buyer" | "seller"; fingerprint: string;
 shippingProfile: { origin: Address; weightKg: number; dimensions: { length: number; width: number; height: number } };
 items: { product_id: string; variant_id: string | null; title: string; image_url: string | null; quantity: number; unit_price: number; line_total: number }[];
}
export function validateCatalogSelection(body: Record<string, unknown>) {
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!/^[a-z0-9_]{1,24}$/.test(username)) throw new CheckoutError("invalid_catalog", 400, "Catálogo inválido");
  try { return { username, items: validateCartLines(body.items) }; } catch (error) { throw new CheckoutError("invalid_cart", 400, error instanceof Error ? error.message : "Carrito inválido"); }
}
export async function loadCartProfile(username: string, items: CartLine[], delivery?: DeliveryMethod): Promise<CartProfile> {
  const { data, error } = await getSupabaseAdmin().rpc("catalog_cart_profile", { p_username: username, p_items: items, p_delivery: delivery ?? null });
  if (error || !data) throw new CheckoutError("cart_unavailable", 409, error?.message ?? "Actualiza el carrito");
  return data as CartProfile;
}
export function publicCartProfile(profile: CartProfile) {
  return { storeName: profile.storeName, subtotal: profile.subtotal, currency: profile.currency, deliveryOptions: profile.deliveryOptions, shippingPayer: profile.shippingPayer, items: profile.items.map(item => ({ title: item.title, quantity: item.quantity, unitPrice: item.unit_price, lineTotal: item.line_total })) };
}
export async function quoteCatalogCart(body: Record<string, unknown>) {
  const { username, items } = validateCatalogSelection(body);
  const address = body.address as { postalCode?: string; country?: string; city?: string; street?: string; state?: string };
  if (!address || !/^\d{5}$/.test(address.postalCode ?? "") || !/^[A-Za-z]{2}$/.test(address.country ?? "")) throw new CheckoutError("invalid_address", 400, "Completa el código postal y país");
  const profile = await loadCartProfile(username, items, "shipping");
  if (profile.shippingPayer === "seller") return { payer: "seller", quotes: [] };
  const rates = await new FedExShippingProvider().getRates({ origin: profile.shippingProfile.origin, destination: { postalCode: address.postalCode!, country: address.country!.toUpperCase(), city: address.city ?? "" }, weightKg: profile.shippingProfile.weightKg, dimensions: profile.shippingProfile.dimensions });
  const valid = rates.filter(rate => Number.isFinite(rate.rate) && rate.rate > 0 && rate.currency.toUpperCase() === profile.currency.toUpperCase());
  if (!valid.length) throw new CheckoutError("shipping_unavailable", 409, "No hay tarifas disponibles");
  const { data, error } = await getSupabaseAdmin().from("shipping_quotes").insert(valid.map(rate => ({ product_id: items[0].productId, fingerprint: quoteFingerprint(address as Parameters<typeof quoteFingerprint>[0], profile.shippingProfile.origin, profile.shippingProfile.weightKg, profile.shippingProfile.dimensions), cart_fingerprint: profile.fingerprint, service_code: rate.serviceCode, amount: rate.rate, currency: rate.currency }))).select("id,service_code,amount,currency");
  if (error) throw new CheckoutError("shipping_unavailable", 503, "No se pudo guardar la cotización");
  return { payer: "buyer", quotes: data };
}
export async function createCatalogCheckout(body: Record<string, unknown>, origin: string) {
  if (!isStripeConfigured()) throw new CheckoutError("stripe_not_configured", 503);
  const selection = validateCatalogSelection(body);
  const input = validateCheckoutInput({ ...body, publicId: "CATALOG" });
  const profile = await loadCartProfile(selection.username, selection.items, input.deliveryMethod);
  if (input.deliveryMethod === "shipping" && profile.shippingPayer === "buyer") {
    const { data: quote, error } = await getSupabaseAdmin().from("shipping_quotes").select("*").eq("id", input.quoteId ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
    if (error || !quote || Date.parse(quote.expires_at) <= Date.now() || quote.cart_fingerprint !== profile.fingerprint || quote.fingerprint !== quoteFingerprint(input.address, profile.shippingProfile.origin, profile.shippingProfile.weightKg, profile.shippingProfile.dimensions)) throw new CheckoutError("invalid_quote", 409, "Cotiza de nuevo el envío: el carrito o la dirección cambió");
  }
  const buyerToken = generateBuyerToken();
  const { data, error } = await getSupabaseAdmin().rpc("reserve_catalog_purchase", { p_username: selection.username, p_items: selection.items, p_order_number: generateOrderNumber(), p_token_hash: hashBuyerToken(buyerToken), p_buyer_name: input.buyerName, p_buyer_email: input.buyerEmail, p_buyer_phone: input.buyerPhone, p_address: { ...input.address, fullName: input.buyerName, phone: input.buyerPhone }, p_delivery: input.deliveryMethod, p_quote_id: input.quoteId ?? null });
  if (error || !data) throw new CheckoutError("cart_unavailable", 409, error?.message ?? "Actualiza el carrito");
  const order = rowToOrder(data);
  const shipping = Math.round((order.amount - order.items.reduce((sum, item) => sum + item.lineTotal, 0)) * 100) / 100;
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({ mode: "payment", expires_at: Math.floor(Date.now() / 1000) + 1800, payment_method_types: ["card"], client_reference_id: order.id, customer_email: input.buyerEmail, metadata: { order_id: order.id, source: "catalog", seller_id: order.sellerId }, payment_intent_data: { transfer_group: `rf_order_${order.id}`, metadata: { order_id: order.id } },
      line_items: [...order.items.map(item => ({ quantity: item.quantity, price_data: { currency: order.currency.toLowerCase(), unit_amount: toStripeAmount(item.unitPrice), product_data: { name: item.title } } })), ...(shipping > 0 ? [{ quantity: 1, price_data: { currency: order.currency.toLowerCase(), unit_amount: toStripeAmount(shipping), product_data: { name: "Envío FedEx" } } }] : [])],
      success_url: `${origin}/checkout/success?order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/catalogo/${selection.username}/checkout?payment=cancelled&order_id=${order.id}` }, { idempotencyKey: `rf_checkout_${order.id}` });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 400) await cancelOrder(order.id, "stripe_session_creation_rejected");
    throw error;
  }
  if (!session.url) { await getStripe().checkout.sessions.expire(session.id); await cancelOrder(order.id, "stripe_session_without_url"); throw new CheckoutError("stripe_session_failed", 502); }
  await upsertPayment({ orderId: order.id, checkoutSessionId: session.id, paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null, amount: order.amount, currency: order.currency, status: "PENDING" });
  await Promise.all(["CHECKOUT_STARTED", "PAYMENT_STARTED"].map(type => recordEvent({ type: type as "CHECKOUT_STARTED" | "PAYMENT_STARTED", orderId: order.id, sellerId: order.sellerId, amount: order.amount, currency: order.currency, metadata: { source: "catalog", stripe_session_id: session.id } })));
  return { orderId: order.id, orderNumber: order.orderNumber, buyerToken, sessionId: session.id, url: session.url, testMode: isStripeTestMode() };
}
