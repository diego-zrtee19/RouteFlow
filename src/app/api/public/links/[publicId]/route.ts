import { NextResponse } from "next/server";
import {
  resolvePublicPurchaseLink,
  recordPurchaseLinkView,
} from "@/repositories/purchaseLinkRepository";
import { recordEvent } from "@/services/orderService";
import { toPublicPurchaseLinkView } from "@/domain/dto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/public/links/[publicId]
 * Public, read-only product + seller payload for the buyer facing pages.
 * Only the intended public information is exposed (no buyer or Stripe data).
 *
 * Reads straight from Supabase: no session is required and nothing is read from
 * `.routeflow-data/store.json`, so a link resolves identically in a fresh
 * browser, on another device, and after a serverless cold start.
 *
 * Unknown, deactivated and expired links are all indistinguishable (404), so
 * nobody can probe which link ids a seller has used.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params;

  if (!publicId) {
    return NextResponse.json({ error: "link_not_found" }, { status: 404 });
  }

  try {
    const resolved = await resolvePublicPurchaseLink(publicId);

    if (!resolved) {
      return NextResponse.json({ error: "link_not_found" }, { status: 404 });
    }

    const { link, product, seller } = resolved;

    // A public page open is a real link view, recorded as a real event so the
    // analytics funnel is a COUNT over stored rows rather than a fabricated
    // constant. Never blocks rendering: a failure here must not 404 the page.
    await Promise.all([
      recordPurchaseLinkView(link.id),
      recordEvent({
        type: "PURCHASE_LINK_VIEWED",
        sellerId: seller.id,
        purchaseLinkId: link.id,
        productId: link.productId,
        metadata: { public_id: link.publicId },
      }),
    ]).catch(() => undefined);

    const { data: variants, error: variantError } = await getSupabaseAdmin().from("product_variants").select("id").eq("product_id", product.id).eq("is_active", true).limit(1);
    if (variantError) throw variantError;
    const view = toPublicPurchaseLinkView(link, product, seller);
    return NextResponse.json({ ...view, product: { ...view.product, hasVariants: !!variants?.length } }, {
      // Buyer pages are public and shareable: never let a CDN or the browser
      // cache a stale (e.g. freshly created) link lookup.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[routeflow] could not resolve the public link:", error);
    return NextResponse.json({ error: "link_not_found" }, { status: 404 });
  }
}
