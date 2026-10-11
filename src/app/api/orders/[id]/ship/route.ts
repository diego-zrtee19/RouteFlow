import { NextRequest, NextResponse } from "next/server";
import { requireSeller, assertSellerOwns } from "@/lib/authz";
import { apiErrorResponse, toErrorResponse } from "@/lib/apiResponse";
import { findOrderForSeller } from "@/repositories/orderRepository";
import { dispatchOrder } from "@/services/shipmentService";
import type { ShippingProviderType } from "@/domain/types";

export const runtime = "nodejs";

const ALLOWED_PROVIDERS: readonly string[] = ["DHL", "FEDEX", "UBER", "MOCK"];

/**
 * POST /api/orders/[id]/ship  { provider, serviceCode }
 *
 * Seller-only. Only a PAID order can be dispatched, so an unpaid order can never
 * generate a shipment or a tracking number.
 *
 * SECURITY: uses `requireSeller()` + `assertSellerOwns()`, replacing the old
 * `resolveSellerFromSession()` that fell back to the demo seller.
 *
 * The dispatch path now refuses to invent data: the seller must have a real
 * origin address and the product a real weight, otherwise the caller gets a
 * typed validation error instead of a label the carrier will reject.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  const body = (await req.json().catch(() => ({}))) as {
    provider?: unknown;
    serviceCode?: unknown;
  };

  /*
   * FedEx is the default because it is the only provider with carrier
   * credentials available in this environment (see FEDEX_* in .env.local).
   * DHL/Uber vars are absent, so defaulting to them guarantees a
   * NotConfiguredError. Callers may still pass any ALLOWED_PROVIDERS entry.
   */
  const DEFAULT_PROVIDER = "FEDEX";
  const provider = (typeof body.provider === "string" ? body.provider : DEFAULT_PROVIDER).toUpperCase();
  const serviceCode =
    typeof body.serviceCode === "string" ? body.serviceCode : `${provider}_EXPRESS`;

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return apiErrorResponse("VALIDATION_ERROR", "Unknown shipping provider", 400);
  }

  // MOCK exists for tests and local development only. It is refused here even
  // when registered, unless an allowlist names it, so a stray UI selection can
  // never produce a fake label in production.
  if (provider === "MOCK" && !mockAllowed()) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "The mock carrier is not enabled for this environment",
      400
    );
  }

  try {
    const order = await findOrderForSeller(id, auth.value);
    if (!order) {
      return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    }

    const owns = assertSellerOwns(auth.value, order.sellerId);
    if (!owns.ok) {
      return apiErrorResponse(owns.code, "Not your order", owns.status);
    }

    const shipment = await dispatchOrder(order, auth.value, {
      provider: provider as ShippingProviderType,
      serviceCode,
    });

    return NextResponse.json({ ok: true, shipment }, { status: 201 });
  } catch (error) {
    // A ValidationError/NotConfiguredError carries its own deliberate status
    // (400/503); anything else is an unexpected failure.
    return toErrorResponse(error);
  }
}

/**
 * Whether the mock carrier may be used over HTTP.
 *
 * Off by default. It is enabled only outside production, or when an operator
 * explicitly allowlists it via `MOCK_SHIPPING_ALLOWLIST`.
 */
function mockAllowed(): boolean {
  if (process.env.MOCK_SHIPPING_ALLOWLIST === "true") return true;
  return process.env.NODE_ENV !== "production";
}
