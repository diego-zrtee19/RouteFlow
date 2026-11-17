import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AppError } from "@/lib/errors";
import { rowToOrder } from "@/services/orderService";
import { generateOrderNumber, hashBuyerToken } from "@/lib/buyerToken";
import type { Order } from "@/domain/types";

export interface CheckoutAttempt {
  keyHash: string;
  requestHash: string;
  kind: "quick" | "catalog";
  buyerToken: string;
  order: Order | null;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function checkoutAttemptIdentity(
  key: string | null,
  input: unknown,
  kind: "quick" | "catalog",
) {
  if (!key || !/^[0-9a-f]{64}$/i.test(key))
    throw new AppError("VALIDATION_ERROR", "Actualiza la página antes de iniciar el pago", 400);
  // The high-entropy attempt key is a buyer credential. Only its hash is stored.
  // Deterministic derivation permits recovery without plaintext tokens in DB.
  return {
    keyHash: hash(key.toLowerCase()),
    requestHash: hash(JSON.stringify(canonical(input))),
    kind,
    buyerToken: hash(`routeflow-buyer:${key.toLowerCase()}`),
  };
}
export async function loadCheckoutAttempt(
  key: string | null,
  input: unknown,
  kind: "quick" | "catalog",
): Promise<CheckoutAttempt> {
  const identity = checkoutAttemptIdentity(key, input, kind);
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("checkout_attempts")
    .select("request_hash,kind,order_id")
    .eq("key_hash", identity.keyHash)
    .maybeSingle();
  if (error) throw new AppError("NOT_CONFIGURED", "No se pudo recuperar el intento de compra", 503);
  if (data && (data.request_hash !== identity.requestHash || data.kind !== kind))
    throw new AppError(
      "CONFLICT",
      "Los datos del intento cambiaron. Vuelve a iniciar el pago.",
      409,
    );
  let order: Order | null = null;
  if (data?.order_id) {
    const result = await db
      .from("orders")
      .select("*,order_items(*)")
      .eq("id", data.order_id)
      .single();
    if (result.error || !result.data)
      throw new AppError("INTERNAL_ERROR", "No se pudo recuperar el pedido", 503);
    order = rowToOrder(result.data);
  }
  return { ...identity, order };
}
export async function reserveCheckoutAttempt(
  attempt: CheckoutAttempt,
  input: Record<string, unknown>,
): Promise<Order> {
  const { data, error } = await getSupabaseAdmin().rpc("reserve_checkout_attempt", {
    p_key_hash: attempt.keyHash,
    p_request_hash: attempt.requestHash,
    p_kind: attempt.kind,
    p_order_number: generateOrderNumber(),
    p_token_hash: hashBuyerToken(attempt.buyerToken),
    p_input: input,
  });
  if (error || !data)
    throw new AppError(
      "CONFLICT",
      "No se pudo reservar el pedido. Revisa disponibilidad y envío.",
      409,
    );
  return rowToOrder(data);
}
export async function bindStripeRequest(
  attempt: CheckoutAttempt,
  request: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.SessionCreateParams> {
  const { data, error } = await getSupabaseAdmin().rpc("bind_checkout_stripe_request", {
    p_key_hash: attempt.keyHash,
    p_request_hash: attempt.requestHash,
    p_request: request,
  });
  if (error || !data)
    throw new AppError("INTERNAL_ERROR", "No se pudo guardar el intento de pago", 503);
  return data as Stripe.Checkout.SessionCreateParams;
}
export function assertCheckoutResumable(order: Order) {
  if (order.paymentStatus === "SUCCEEDED") return;
  if (["CANCELLED", "REFUNDED"].includes(order.status))
    throw new AppError(
      "CHECKOUT_CLOSED",
      "Este intento terminó. Puedes iniciar una compra nueva.",
      409,
    );
  if (
    !["CREATED", "PAYMENT_PENDING"].includes(order.status) ||
    Date.parse(order.createdAt) + 30 * 60_000 <= Date.now()
  )
    throw new AppError(
      "CONFLICT",
      "El intento ya no se puede retomar. Espera a que termine la reserva o revisa Mis compras antes de iniciar otro pago.",
      409,
      "checkout_attempt_expired",
    );
}

/** The secret attempt key alone can recover a lost redirect, without the
 * original form, current inventory or an expired shipping quote. */
export async function resumeCheckoutAttempt(key: string | null) {
  const identity = checkoutAttemptIdentity(key, {}, "quick");
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("checkout_attempts")
    .select("order_id,stripe_request")
    .eq("key_hash", identity.keyHash)
    .maybeSingle();
  if (error)
    throw new AppError(
      "INTERNAL_ERROR",
      "No pudimos recuperar el intento. Reintenta en un momento.",
      503,
    );
  if (!data?.order_id)
    throw new AppError("NOT_FOUND", "Todavía no hay un pedido reservado para este intento.", 404);
  const found = await db.from("orders").select("*,order_items(*)").eq("id", data.order_id).single();
  if (found.error || !found.data)
    throw new AppError("INTERNAL_ERROR", "No pudimos recuperar el pedido", 503);
  const order = rowToOrder(found.data);
  assertCheckoutResumable(order);
  return {
    order,
    buyerToken: identity.buyerToken,
    request: data.stripe_request as Stripe.Checkout.SessionCreateParams | null,
  };
}
