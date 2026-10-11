import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { refundOrderWithStripe } from "@/services/checkoutService";
export async function resolveDispute(
  id: string,
  decision: "refund" | "release",
  resolution: string,
  adminId: string,
) {
  const db = getSupabaseAdmin();
  const { data: d, error } = await db
    .from("disputes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!["OPEN", "UNDER_REVIEW"].includes(d.status))
    throw new Error("La disputa ya está resuelta");
  const { error: claimError } = await db.rpc("claim_dispute_resolution", {
    p_dispute_id: id,
    p_decision: decision,
  });
  if (claimError) throw claimError;
  if (decision === "refund") await refundOrderWithStripe(d.order_id);
  const { error: resolveError } = await db.rpc("resolve_order_dispute", {
    p_dispute_id: id,
    p_resolution: resolution,
    p_admin_id: adminId,
    p_refund: decision === "refund",
  });
  if (resolveError) throw resolveError;
}
