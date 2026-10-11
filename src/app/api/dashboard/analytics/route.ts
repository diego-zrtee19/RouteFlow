import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { AnalyticsSummary } from "@/domain/types";

/**
 * GET /api/dashboard/analytics
 *
 * Every number below is a COUNT or a SUM over rows this seller actually owns in
 * Supabase. Nothing is fabricated, scaled by a constant, or seeded.
 *
 * Two different sources, deliberately:
 *
 *   - Funnel stages come from `events`, because a link view and a checkout start
 *     never produce an `orders` row. They are filtered by `seller_id`.
 *   - Money and order counts come from `orders`, because an order row is the
 *     authoritative record of a sale. Summing event amounts instead would let a
 *     retried or duplicated event inflate revenue.
 *
 * `count: "exact"` returns a COUNT in the response envelope. Selecting the rows
 * and taking `.length` instead would silently cap every metric at the default
 * page size (1000) and read the wrong number above that.
 */
export async function GET() {
  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  try {
    const admin = getSupabaseAdmin();
    const sellerId = auth.value.id;

    // ---- Funnel stages: events owned by this seller -------------------------
    const countEvents = (type: string) =>
      admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .eq("type", type);

    const [viewsRes, startsRes, paidEventsRes, completedRes] = await Promise.all([
      countEvents("PURCHASE_LINK_VIEWED"),
      countEvents("CHECKOUT_STARTED"),
      countEvents("PAYMENT_SUCCEEDED"),
      countEvents("ORDER_COMPLETED"),
    ]);

    // ---- Money and orders: the authoritative records ------------------------
    const { data: paidOrders, error: ordersError } = await admin
      .from("orders")
      .select("amount,refunded_amount")
      .eq("seller_id", sellerId)
      .eq("payment_status", "SUCCEEDED");

    if (ordersError) throw ordersError;

    const gmv = round2(
      (paidOrders ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.amount ?? 0) - Number(row.refunded_amount ?? 0)), 0),
    );

    const paymentSuccess = (paidOrders ?? []).length;

    const summary: AnalyticsSummary = {
      linkViews: viewsRes.count ?? 0,
      checkoutStarts: startsRes.count ?? 0,
      paymentSuccess,
      completedOrders: completedRes.count ?? 0,
      gmv,
      averageOrderValue: paymentSuccess ? round2(gmv / paymentSuccess) : 0,
      conversionRate: viewsRes.count
        ? round2((paymentSuccess / viewsRes.count) * 100)
        : 0,
    };

    return NextResponse.json({
      ...summary,
      // Surfaced so a dashboard can tell "no traffic yet" apart from "query
      // failed to scope" during an incident.
      paidEvents: paidEventsRes.count ?? 0,
    });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "Could not load analytics", 500, error);
  }
}

/** Rounds to 2 decimals, avoiding float drift on money and percentages. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
