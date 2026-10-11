import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { AppError } from "@/lib/errors";
import { findOrderByIdForWebhook } from "@/repositories/orderRepository";
export function refundMinorUnits(amount: number) {
  const minor = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(minor) ||
    Math.abs(amount * 100 - minor) > 0.000001
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "El importe debe ser positivo y tener máximo dos decimales",
      400,
    );
  return minor;
}
export function sellerRemainingMinor(
  totalMinor: number,
  feeMinor: number,
  refundedMinor: number,
) {
  return Math.max(
    0,
    Math.round(
      ((totalMinor - feeMinor) * (totalMinor - refundedMinor)) / totalMinor,
    ),
  );
}
export async function syncRefund(refund: Stripe.Refund) {
  refund = await getStripe().refunds.retrieve(refund.id);
  const requestId = refund.metadata?.refund_request_id;
  if (!requestId) return false;
  const db = getSupabaseAdmin();
  const { data: r, error } = await db
    .from("refund_requests")
    .select("*,orders(payments(payment_intent_id))")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!r) return false;
  const intent =
    typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : refund.payment_intent?.id;
  if (
    !intent ||
    !r.orders?.payments?.some(
      (p: { payment_intent_id: string }) => p.payment_intent_id === intent,
    )
  )
    throw new Error("Refund payment binding mismatch");
  const status =
    refund.status === "succeeded"
      ? "SUCCEEDED"
      : refund.status === "failed" || refund.status === "canceled"
        ? "FAILED"
        : "PENDING";
  const { error: finishError } = await db.rpc("finish_refund_request", {
    p_request_id: requestId,
    p_refund_id: refund.id,
    p_status: status,
    p_amount_minor: refund.amount,
    p_currency: refund.currency,
  });
  if (finishError) throw finishError;
  return true;
}
async function reverseRefundShare(
  orderId: string,
  amountMinor: number,
  requestId: string,
) {
  const db = getSupabaseAdmin();
  const { data: o, error } = await db
    .from("orders")
    .select("amount,platform_fee,refunded_amount,transfer_id")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  let transferId = o.transfer_id;
  if (!transferId) {
    const history = await getStripe().transfers.list({
      transfer_group: `rf_order_${orderId}`,
      limit: 100,
    });
    if (history.has_more || history.data.length > 1)
      throw new Error("Revisa las transferencias de este pedido");
    const t = history.data[0];
    if (t && t.metadata.order_id !== orderId)
      throw new Error("Transferencia no relacionada con el pedido");
    transferId = t?.id;
  }
  if (!transferId) return;
  const transfer = await getStripe().transfers.retrieve(transferId);
  const target = sellerRemainingMinor(
    Math.round(Number(o.amount) * 100),
    Math.round(Number(o.platform_fee) * 100),
    Math.round(Number(o.refunded_amount) * 100) + amountMinor,
  );
  const existing = await getStripe().transfers.listReversals(transferId, {
    limit: 100,
  });
  if (existing.has_more)
    throw new Error("Reconciliación de reversiones requerida");
  const recovered = existing.data.find(
    (r) => r.metadata?.refund_request_id === requestId,
  );
  const reversalAmount = Math.max(
    0,
    transfer.amount - transfer.amount_reversed - target,
  );
  if (!recovered && reversalAmount > 0)
    await getStripe().transfers.createReversal(
      transferId,
      {
        amount: reversalAmount,
        metadata: { refund_request_id: requestId, order_id: orderId },
      },
      { idempotencyKey: `rf_partial_reverse_${requestId}` },
    );
  const latest = await getStripe().transfers.retrieve(transferId);
  const { error: saveError } = await db
    .from("orders")
    .update({
      transfer_id: transferId,
      settlement_status: latest.reversed ? "REVERSED" : "TRANSFERRED",
    })
    .eq("id", orderId);
  if (saveError) throw saveError;
}
export async function requestRefund(
  orderId: string,
  amount?: number,
  requestKey?: string,
) {
  const db = getSupabaseAdmin();
  const existingOrder = await findOrderByIdForWebhook(orderId);
  if (!existingOrder)
    throw new AppError("ORDER_NOT_FOUND", "Pedido no encontrado", 404);
  if (existingOrder.paymentStatus === "REFUNDED")
    return {
      order: existingOrder,
      refundId: null,
      alreadyRefunded: true,
      pending: false,
    };
  if (amount !== undefined && !requestKey)
    throw new AppError(
      "VALIDATION_ERROR",
      "Incluye una clave de idempotencia para el reembolso parcial",
      400,
    );
  const minor = amount === undefined ? null : refundMinorUnits(amount);
  const { data: r, error } = await db.rpc("claim_refund_request", {
    p_order_id: orderId,
    p_request_key: requestKey ?? `full:${orderId}`,
    p_amount_minor: minor,
    p_lease_token: randomUUID(),
  });
  if (error) throw new AppError("CONFLICT", error.message, 409);
  if (r.already_refunded || r.busy)
    return {
      order: existingOrder,
      refundId: r.provider_refund_id,
      alreadyRefunded: Boolean(r.already_refunded),
      pending: Boolean(r.busy),
    };
  try {
    const { data: payment, error: pe } = await db
      .from("payments")
      .select("payment_intent_id")
      .eq("order_id", orderId)
      .not("payment_intent_id", "is", null)
      .single();
    if (pe || !payment?.payment_intent_id)
      throw new Error("El pedido no tiene un pago de Stripe asociado");
    const history = await getStripe().refunds.list({
      payment_intent: payment.payment_intent_id,
      limit: 100,
    });
    if (history.has_more)
      throw new Error("Reconciliación de reembolsos requerida");
    let refund = history.data.find(
      (f) => f.metadata?.refund_request_id === r.id,
    );
    if (!refund) {
      if (
        history.data.some(
          (f) =>
            !["failed", "canceled"].includes(f.status ?? "") &&
            !f.metadata?.refund_request_id,
        )
      )
        throw new Error(
          "Hay un reembolso externo que debe reconciliarse antes de continuar",
        );
      await reverseRefundShare(orderId, Number(r.amount_minor), r.id);
      refund = await getStripe().refunds.create(
        {
          payment_intent: payment.payment_intent_id,
          amount: Number(r.amount_minor),
          reason: "requested_by_customer",
          metadata: { order_id: orderId, refund_request_id: r.id },
        },
        { idempotencyKey: `rf_partial_refund_${r.id}` },
      );
    }
    await syncRefund(refund);
    const order = await findOrderByIdForWebhook(orderId);
    if (!order) throw new Error("No se pudo cargar el recibo actualizado");
    return {
      order,
      refundId: refund.id,
      alreadyRefunded: false,
      pending: refund.status !== "succeeded",
    };
  } catch (e) {
    if (
      e instanceof Error &&
      e.name === "StripeInvalidRequestError" &&
      (e as { statusCode?: number }).statusCode === 400
    ) {
      await db.rpc("finish_refund_request", {
        p_request_id: r.id,
        p_refund_id: null,
        p_status: "FAILED",
        p_amount_minor: r.amount_minor,
        p_currency: r.currency,
      });
    }
    await db
      .from("refund_requests")
      .update({
        last_error: e instanceof Error ? e.message : "Refund processing error",
      })
      .eq("id", r.id);
    throw e;
  }
}
export async function recoverRefunds() {
  const db = getSupabaseAdmin();
  const { data: requests, error } = await db
    .from("refund_requests")
    .select("id,order_id,request_key,amount_minor")
    .in("status", ["PROCESSING", "PENDING"])
    .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
    .limit(20);
  if (error) throw error;
  let recovered = 0;
  const errors: string[] = [];
  for (const r of requests ?? [])
    try {
      const result = await requestRefund(
        r.order_id,
        Number(r.amount_minor) / 100,
        r.request_key,
      );
      if (!result.pending) recovered++;
    } catch (e) {
      errors.push(
        `refund:${r.order_id}:${e instanceof Error ? e.message : "error"}`,
      );
    }
  return { recovered, errors };
}
