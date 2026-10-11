import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/dashboard/disputes
 *
 * Returns disputes for the authenticated seller's orders only.
 *
 * SECURITY: previously this page read `dataStore.disputes` directly, which is
 * an in-memory array shared by every seller. Now disputes are scoped to the
 * seller's own orders via a join, so seller A cannot see seller B's disputes.
 */
export async function GET() {
  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  try {
    const admin = getSupabaseAdmin();

    // Resolve the seller's order ids first: PostgREST's `.in()` takes literal
    // values, not a nested query, so a sub-select cannot be passed to it.
    const { data: orderRows, error: orderError } = await admin
      .from("orders")
      .select("id")
      .eq("seller_id", auth.value.id);

    if (orderError) throw orderError;

    const orderIds = (orderRows ?? []).map((row) => String(row.id));

    if (orderIds.length === 0) {
      return NextResponse.json({ disputes: [] });
    }

    const { data, error } = await admin
      .from("disputes")
      .select("id, order_id, reason, description, status, resolution, created_at, updated_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      disputes: (data ?? []).map((d) => ({
        id: d.id,
        orderId: d.order_id,
        reason: d.reason,
        description: d.description,
        status: d.status,
        resolution: d.resolution ?? null,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
    });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "Could not load disputes", 500, error);
  }
}