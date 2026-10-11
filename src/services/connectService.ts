import type Stripe from "stripe";
import { getStripe, isStripeTestMode } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ValidationError } from "@/lib/errors";

export async function saveConnectAccount(account: Stripe.Account) {
  const { error } = await getSupabaseAdmin()
    .from("sellers")
    .update({
      stripe_transfers_enabled: account.capabilities?.transfers === "active",
      stripe_payouts_enabled: account.payouts_enabled,
      stripe_requirements: account.requirements?.currently_due ?? [],
      kyc_status:
        account.details_submitted &&
        account.capabilities?.transfers === "active"
          ? "verified"
          : "pending",
    })
    .eq("stripe_account_id", account.id);
  if (error) throw error;
}
export async function connectStatus(sellerId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("sellers")
    .select(
      "stripe_account_id,stripe_transfers_enabled,stripe_payouts_enabled,stripe_requirements",
    )
    .eq("id", sellerId)
    .single();
  if (error) throw error;
  if (data.stripe_account_id) {
    const status = await refreshRecipient(data.stripe_account_id);
    return { connected: true, ...status, testMode: isStripeTestMode() };
  }
  return {
    connected: false,
    transfersEnabled: false,
    payoutsEnabled: false,
    requirements: [],
    testMode: isStripeTestMode(),
  };
}
async function refreshRecipient(accountId: string) {
  const account = await getStripe().v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient", "requirements"],
  });
  const balance =
    account.configuration?.recipient?.capabilities?.stripe_balance;
  const transfersEnabled = balance?.stripe_transfers?.status === "active";
  const payoutsEnabled = balance?.payouts?.status === "active";
  const requirements =
    account.requirements?.entries?.map((e) => e.description) ?? [];
  const { error } = await getSupabaseAdmin()
    .from("sellers")
    .update({
      stripe_transfers_enabled: transfersEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_requirements: requirements,
      kyc_status: transfersEnabled && payoutsEnabled ? "verified" : "pending",
    })
    .eq("stripe_account_id", accountId);
  if (error) throw error;
  return { transfersEnabled, payoutsEnabled, requirements };
}
export async function startConnect(sellerId: string, origin: string, verifiedEmail?: string) {
  const db = getSupabaseAdmin();
  const { data: s, error } = await db
    .from("sellers")
    .select("stripe_account_id,contact_email")
    .eq("id", sellerId)
    .single();
  if (error) throw error;
  let accountId = s.stripe_account_id;
  if (!accountId) {
    const contactEmail = s.contact_email?.trim() || verifiedEmail?.trim();
    if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new ValidationError("Guarda un correo de contacto válido en Ajustes antes de conectar Stripe.");
    }
    const account = await getStripe().v2.core.accounts.create(
      {
        identity: { country: "MX" },
        contact_email: contactEmail,
        dashboard: "express",
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        metadata: { routeflow_seller_id: sellerId },
      },
      { idempotencyKey: `rf_connect_${sellerId}` },
    );
    accountId = account.id;
    const { error: writeError } = await db
      .from("sellers")
      .update({ stripe_account_id: accountId })
      .eq("id", sellerId);
    if (writeError) throw writeError;
  }
  const link = await getStripe().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        return_url: `${origin}/dashboard/settings?connect=return`,
        refresh_url: `${origin}/dashboard/settings?connect=expired`,
      },
    },
  });
  return link.url;
}
// The stable Stripe key also protects recovery after a transfer succeeds but DB persistence fails.
export async function settleCompletedOrder(orderId: string) {
  if (!isStripeTestMode() && process.env.ROUTEFLOW_LIVE_SETTLEMENTS !== "true")
    return { pending: true };
  const db = getSupabaseAdmin();
  const { data: claim, error } = await db.rpc("claim_settlement", {
    p_order_id: orderId,
  });
  if (error) throw error;
  if (!claim) return { pending: true };
  try {
    const { data: p, error: pError } = await db
      .from("payments")
      .select("payment_intent_id")
      .eq("order_id", orderId)
      .eq("status", "SUCCEEDED")
      .single();
    if (pError || !p?.payment_intent_id)
      throw new Error("No hay un pago confirmado para transferir");
    const intent = await getStripe().paymentIntents.retrieve(
      p.payment_intent_id,
    );
    const charge =
      typeof intent.latest_charge === "string"
        ? intent.latest_charge
        : intent.latest_charge?.id;
    if (intent.status !== "succeeded" || !charge)
      throw new Error("Stripe no confirma el cobro");
    const account = await refreshRecipient(claim.account_id);
    if (!account.transfersEnabled || !account.payoutsEnabled)
      throw new Error("La cuenta necesita completar su verificación");
    const previous = await getStripe().transfers.list({
      transfer_group: `rf_order_${orderId}`,
      limit: 100,
    });
    if (previous.has_more || previous.data.length > 1)
      throw new Error("La transferencia necesita reconciliación manual");
    const existing = previous.data[0];
    if (
      existing &&
      (existing.metadata.order_id !== orderId ||
        existing.destination !== claim.account_id ||
        existing.amount !== Math.round(Number(claim.amount) * 100) ||
        existing.currency !== claim.currency.toLowerCase() ||
        existing.reversed)
    )
      throw new Error("La transferencia previa no coincide con este pedido");
    const transfer =
      existing ??
      (await getStripe().transfers.create(
        {
          amount: Math.round(Number(claim.amount) * 100),
          currency: claim.currency.toLowerCase(),
          destination: claim.account_id,
          source_transaction: charge,
          transfer_group: `rf_order_${orderId}`,
          metadata: { order_id: orderId },
        },
        { idempotencyKey: `rf_settle_${orderId}` },
      ));
    const { error: saveError } = await db
      .from("orders")
      .update({
        transfer_id: transfer.id,
        settlement_status: "TRANSFERRED",
        settlement_error: null,
      })
      .eq("id", orderId);
    if (saveError) throw saveError;
    return { transferId: transfer.id };
  } catch (error) {
    await db
      .from("orders")
      .update({
        settlement_status: "FAILED",
        settlement_error:
          error instanceof Error ? error.message : "Transferencia pendiente",
      })
      .eq("id", orderId);
    throw error;
  }
}
export async function prepareRefund(orderId: string) {
  const db = getSupabaseAdmin();
  const { data: o, error } = await db.rpc("begin_order_refund", {
    p_order_id: orderId,
  });
  if (error) throw error;
  if (o.settlement_status === "PROCESSING")
    throw new Error("Hay una transferencia en curso; reintenta después");
  if (o.settlement_status === "REVERSED") return;
  let transferId = o.transfer_id as string | null;
  // Recover a transfer that succeeded before its DB write failed.
  if (!transferId) {
    const history = await getStripe().transfers.list({
      transfer_group: `rf_order_${orderId}`,
      limit: 100,
    });
    if (history.has_more || history.data.length > 1)
      throw new Error(
        "Reconciliación de transferencias requerida antes del reembolso",
      );
    const transfer = history.data[0];
    if (transfer && transfer.metadata.order_id !== orderId)
      throw new Error("La transferencia no coincide con el pedido");
    transferId = transfer?.id ?? null;
  }
  if (transferId) {
    const transfer = await getStripe().transfers.retrieve(transferId);
    if (!transfer.reversed)
      await getStripe().transfers.createReversal(
        transferId,
        {},
        { idempotencyKey: `rf_reverse_${orderId}` },
      );
    const { error: saveError } = await db
      .from("orders")
      .update({ transfer_id: transferId, settlement_status: "REVERSED" })
      .eq("id", orderId);
    if (saveError) throw saveError;
  }
}
