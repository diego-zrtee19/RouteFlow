import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findOrderByIdForWebhook } from "@/repositories/orderRepository";
import { refreshTracking } from "@/services/shipmentService";

/** Bounded background polling shares the same persistence and state rules as
 * manual refresh. A database lease avoids polling twice from multiple workers. */
export async function refreshDueTracking() {
  const db = getSupabaseAdmin();
  const owner = randomUUID();
  const { data: jobs, error } = await db.rpc("claim_tracking_refresh", {
    p_owner: owner,
    p_limit: 3,
  });
  if (error) throw error;
  let refreshed = 0;
  const errors: string[] = [];
  for (const job of jobs ?? []) {
    let failed = false;
    try {
      const order = await findOrderByIdForWebhook(String(job.order_id));
      if (
        order &&
        order.paymentStatus === "SUCCEEDED" &&
        ["SHIPPED", "IN_TRANSIT"].includes(order.status)
      ) {
        await refreshTracking(order);
        refreshed++;
      }
    } catch {
      failed = true;
      errors.push(`tracking:${job.order_id}:refresh_failed`);
    }
    const { error: releaseError } = await db
      .from("shipments")
      .update({
        tracking_poll_owner: null,
        tracking_poll_until: null,
        tracking_polled_at: new Date().toISOString(),
        next_tracking_poll_at: new Date(Date.now() + (failed ? 600_000 : 300_000)).toISOString(),
        tracking_poll_error: failed ? "refresh_failed" : null,
      })
      .eq("id", job.id)
      .eq("tracking_poll_owner", owner);
    if (releaseError) errors.push(`tracking:${job.order_id}:lease_release_failed`);
  }
  return { refreshed, errors };
}
