import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiResponse";
import { requireUserId, findSellerByUserId } from "@/lib/authz";
import { findOrderForBuyer, findOrderForSeller } from "@/services/orderService";
import {
  authorizeTrackingRead,
  authorizeTrackingRefresh,
  type TrackingCaller,
  type TrackingAccess,
} from "@/lib/trackingAuthz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ShippingRegistry } from "@/providers/shipping";
import { toBuyerShipmentView } from "@/domain/dto";
import type { Order, Shipment, ShipmentEvent, ShippingProviderType } from "@/domain/types";
import type { ErrorCode } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * TRACKING for a single order.
 *
 * SECURITY: the audit found this route had NO authorization. Anyone with a
 * valid order id could read another buyer's shipment and trigger a carrier API
 * call. Both verbs now authorize:
 *
 *   GET  - read.    Buyer (with token) or the owning seller.
 *   POST - refresh. The owning seller only; it calls the carrier and mutates
 *                  stored state, so a buyer must not be able to trigger it.
 *
 * The decision itself lives in `lib/trackingAuthz.ts` as a pure function so it
 * is unit tested without a database.
 */

/** Resolves the session and the presented buyer token into a caller. */
async function buildCaller(req: NextRequest): Promise<TrackingCaller> {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const buyerToken =
    req.headers.get("x-buyer-token") ??
    (typeof body?.token === "string" ? body.token : null);

  const user = await requireUserId();
  if (!user.ok) {
    return { buyerToken };
  }

  // A signed-in user may not have a store yet; that is not an error here, it
  // simply means they are treated as a buyer for this request.
  const seller = await findSellerByUserId(user.value).catch(() => null);

  return { buyerToken, seller, authenticated: true };
}

/**
 * Loads the order using whichever credential the caller presented.
 *
 * The seller lookup is scoped by `seller_id` in the query itself, so an order
 * belonging to another seller is simply absent rather than refused later.
 */
async function loadAuthorizedOrder(
  id: string,
  caller: TrackingCaller
): Promise<{ order: Order | null; access: TrackingAccess }> {
  if (caller.seller) {
    const order = await findOrderForSeller(id, caller.seller);
    if (order) return { order, access: authorizeTrackingRead(order, caller) };
  }

  const order = await findOrderForBuyer(id, caller.buyerToken);
  if (!order) {
    return {
      order: null,
      access: {
        ok: false,
        status: 404,
        code: "ORDER_NOT_FOUND",
        reason: "Order not found or not accessible",
      },
    };
  }

  return { order, access: authorizeTrackingRead(order, caller) };
}

/** Maps a `shipments` row to the domain type. */
function rowToShipment(row: Record<string, unknown>): Shipment {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    provider: row.provider as Shipment["provider"],
    providerShipmentId: (row.provider_shipment_id as string) ?? null,
    trackingNumber: String(row.tracking_number),
    serviceCode: String(row.service_code ?? ""),
    carrierName: String(row.carrier_name ?? ""),
    status: row.status as Shipment["status"],
    trackingUrl: (row.tracking_url as string) ?? null,
    labelUrl: (row.label_url as string) ?? null,
    estimatedDelivery: (row.estimated_delivery as string) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * GET /api/orders/[id]/tracking
 *
 * Read-only. Returns a DTO that contains no buyer PII.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const caller = await buildCaller(req);
    const { order, access } = await loadAuthorizedOrder(id, caller);

    if (!access.ok) {
      return apiErrorResponse(access.code as ErrorCode, access.reason, access.status);
    }
    if (!order) {
      return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    }

    const admin = getSupabaseAdmin();
    const { data: shipment } = await admin
      .from("shipments")
      .select("*")
      .eq("order_id", order.id)
      .maybeSingle();

    if (!shipment) {
      return NextResponse.json({ ok: true, shipment: null, events: [] });
    }

    const { data: events } = await admin
      .from("shipment_events")
      .select("*")
      .eq("shipment_id", shipment.id)
      .order("occurred_at", { ascending: false })
      .limit(20);

    const list = (events ?? []) as Record<string, unknown>[];

    return NextResponse.json({
      ok: true,
      shipment: toBuyerShipmentView(
        rowToShipment(shipment),
        list.map(
          (event): ShipmentEvent => ({
            id: String(event.id),
            shipmentId: String(event.shipment_id),
            status: event.status as ShipmentEvent["status"],
            description: String(event.description ?? ""),
            location: (event.location as string) ?? null,
            occurredAt: String(event.occurred_at),
            createdAt: String(event.created_at ?? new Date().toISOString()),
          })
        )
      ),
      events: list.map((event) => ({
        status: event.status,
        description: event.description,
        occurredAt: event.occurred_at,
      })),
    });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "Could not load tracking", 500, error);
  }
}

/**
 * POST /api/orders/[id]/tracking
 *
 * Refreshes tracking from the carrier and persists new events.
 *
 * The audit also found the old implementation returned the *stale* shipment
 * with `ok: true` when the carrier call failed, so a parcel delivered three
 * days ago could be reported as still in transit. A carrier failure is now a
 * 502, never a false success.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const caller = await buildCaller(req);
    const { order } = await loadAuthorizedOrder(id, caller);

    if (!order) {
      return apiErrorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    }

    // A buyer token alone is NOT enough to refresh.
    const access = authorizeTrackingRefresh(order, caller);
    if (!access.ok) {
      return apiErrorResponse(access.code as ErrorCode, access.reason, access.status);
    }

    const admin = getSupabaseAdmin();
    const { data: shipment } = await admin
      .from("shipments")
      .select("*")
      .eq("order_id", order.id)
      .maybeSingle();

    if (!shipment) {
      return apiErrorResponse("NOT_FOUND", "This order has no shipment yet", 404);
    }

    const provider = ShippingRegistry.getProvider(
      shipment.provider as ShippingProviderType
    );

    if (!provider.isConfigured()) {
      return apiErrorResponse(
        "NOT_CONFIGURED",
        `${provider.name} is not configured, so tracking cannot be refreshed`,
        503
      );
    }

    const tracking = await provider.getTracking(shipment.tracking_number);

    await admin.from("shipments").update({ status: tracking.status }).eq("id", shipment.id);

    if (Array.isArray(tracking.events) && tracking.events.length > 0) {
      // UNIQUE(shipment_id, status, occurred_at) makes repeated polls of the
      // same carrier scan a no-op rather than a growing duplicate list.
      //
      // The carrier interface names this field `timestamp`; the domain model
      // calls it `occurredAt`, because that is when the carrier observed the
      // event, not when we happened to poll.
      await admin.from("shipment_events").upsert(
        tracking.events.map((event) => ({
          shipment_id: shipment.id,
          status: event.status,
          description: event.description,
          location: event.location ?? null,
          occurred_at: event.timestamp,
        })),
        { onConflict: "shipment_id,status,occurred_at", ignoreDuplicates: true }
      );
    }

    return NextResponse.json({
      ok: true,
      status: tracking.status,
      carrier: tracking.carrier,
      estimatedDelivery: tracking.estimatedDelivery ?? null,
    });
  } catch (error) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "Could not refresh tracking from the carrier",
      502,
      error
    );
  }
}
