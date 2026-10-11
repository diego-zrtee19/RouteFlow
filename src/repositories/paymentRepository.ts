import type { Payment, PaymentStatus } from "@/domain/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DatabaseError } from "@/lib/errors";

/**
 * PAYMENT REPOSITORY.
 *
 * Payments are written by the verified Stripe webhook only. `checkout_session_id`
 * and `payment_intent_id` are UNIQUE in the schema, so an upsert can never
 * create a second payment row for the same Stripe object — that constraint is
 * what makes a redelivered webhook harmless at this layer too.
 */

export interface UpsertPaymentInput {
  orderId: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
}

export async function upsertPayment(input: UpsertPaymentInput): Promise<Payment> {
  const admin = getSupabaseAdmin();

  // Match on whichever Stripe identifier we have; both are UNIQUE.
  const filter = input.paymentIntentId
    ? { payment_intent_id: input.paymentIntentId }
    : input.checkoutSessionId
      ? { checkout_session_id: input.checkoutSessionId }
      : { order_id: input.orderId };

  const { data: updated, error: updateError } = await admin
    .from("payments")
    .update({
      status: input.status,
      amount: input.amount,
      currency: input.currency,
    })
    .eq(input.paymentIntentId ? "payment_intent_id" : "checkout_session_id",
        (input.paymentIntentId ?? input.checkoutSessionId) as string)
    .select()
    .maybeSingle();

  if (updateError) {
    throw new DatabaseError(`Could not update the payment: ${updateError.message}`);
  }
  if (updated) return rowToPayment(updated as Record<string, unknown>);
  void filter;

  const { data: created, error } = await admin
    .from("payments")
    .insert({
      order_id: input.orderId,
      provider: "stripe",
      checkout_session_id: input.checkoutSessionId,
      payment_intent_id: input.paymentIntentId,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
    })
    .select()
    .single();

  if (error || !created) {
    // A concurrent webhook may have inserted the same session first; that row
    // is authoritative, so re-read rather than fail.
    const { data: raced } = await admin
      .from("payments")
      .select("*")
      .eq("order_id", input.orderId)
      .maybeSingle();
    if (raced) return rowToPayment(raced as Record<string, unknown>);
    throw new DatabaseError(`Could not create the payment: ${error?.message ?? "unknown"}`);
  }

  return rowToPayment(created as Record<string, unknown>);
}

export async function listPaymentsForOrder(orderId: string): Promise<Payment[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(`Could not list payments: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToPayment);
}

/**
 * Resolves the order a Stripe Checkout Session belongs to.
 *
 * Checkout reconciliation needs this because a session id is the only handle the
 * success page holds: it is written to `payments.checkout_session_id` at checkout
 * creation time, so the link from session -> order is durable in the database
 * rather than living in a process-local map that a cold start would lose.
 */
export async function findOrderIdByCheckoutSession(sessionId: string): Promise<string | null> {
  if (!sessionId) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("payments")
    .select("order_id")
    .eq("checkout_session_id", sessionId)
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not resolve the checkout session: ${error.message}`);
  return data ? String(data.order_id) : null;
}

/**
 * The succeeded payment for an order, if any.
 *
 * Used by the refund path, which needs the PaymentIntent to refund against.
 * Stripe ids live on `payments`, never on `orders`.
 */
export async function findSucceededPaymentForOrder(orderId: string): Promise<Payment | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .eq("status", "SUCCEEDED")
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not load the payment: ${error.message}`);
  return data ? rowToPayment(data as Record<string, unknown>) : null;
}

export function rowToPayment(row: Record<string, unknown>): Payment {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    provider: "stripe",
    checkoutSessionId: (row.checkout_session_id as string) ?? null,
    paymentIntentId: (row.payment_intent_id as string) ?? null,
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "MXN"),
    status: (row.status as PaymentStatus) ?? "PENDING",
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}