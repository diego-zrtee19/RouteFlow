import type { Product, PurchaseLink, PurchaseLinkStatus, Seller } from "@/domain/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DatabaseError } from "@/lib/errors";
import { generatePublicId } from "@/lib/buyerToken";
import { rowToProduct } from "@/repositories/catalogRepository";
import { rowToSeller } from "@/lib/authz";

/**
 * PURCHASE LINK REPOSITORY.
 *
 * This is the fix for the original "link does not exist" defect: links used to
 * live only in `.routeflow-data/store.json`, so every generated `/p/{id}` died
 * on restart or redeploy. A link is now a row in `purchase_links`, where
 * `public_id` is UNIQUE, so two links can never collide silently.
 *
 * `public_id` is generated server-side (~40 bits, unambiguous alphabet). A
 * collision is retried, never handed out.
 */

const MAX_PUBLIC_ID_ATTEMPTS = 5;

export interface CreatePurchaseLinkResult {
  link: PurchaseLink;
  productId: string;
}

/**
 * Creates a purchase link for a product the seller owns.
 *
 * Ownership is verified by loading the product scoped to the seller rather
 * than trusted from the request: a seller cannot attach a link to somebody
 * else's product.
 */
export async function createPurchaseLink(
  seller: Seller,
  productId: string
): Promise<CreatePurchaseLinkResult | null> {
  const admin = getSupabaseAdmin();

  const { data: product, error: productError } = await admin
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("seller_id", seller.id)
    .maybeSingle();

  if (productError) {
    throw new DatabaseError(`Could not load the product: ${productError.message}`);
  }
  if (!product) return null;

  for (let attempt = 0; attempt < MAX_PUBLIC_ID_ATTEMPTS; attempt++) {
    const publicId = generatePublicId();

    const { data, error } = await admin
      .from("purchase_links")
      .insert({
        seller_id: seller.id,
        product_id: productId,
        public_id: publicId,
        status: "active",
      })
      .select()
      .single();

    if (!error && data) {
      return {
        link: rowToPurchaseLink(data as Record<string, unknown>),
        productId,
      };
    }

    // 23505 = unique_violation: another link took this id. Retry with a new one.
    const isCollision = (error?.message ?? "").includes("23505");
    if (error && !isCollision) {
      throw new DatabaseError(`Could not create the purchase link: ${error.message}`);
    }
  }

  throw new DatabaseError(
    `Could not allocate a unique public id after ${MAX_PUBLIC_ID_ATTEMPTS} attempts`
  );
}

/**
 * Resolves a public id for the buyer-facing page. No authentication.
 *
 * Returns null for unknown, inactive or expired links, so a caller cannot
 * distinguish "never existed" from "deactivated" — that would let anyone probe
 * which link ids a seller has used.
 */
export async function resolvePublicPurchaseLink(
  publicId: string
): Promise<{ link: PurchaseLink; product: Product; seller: Seller } | null> {
  const admin = getSupabaseAdmin();

  const { data: link, error } = await admin
    .from("purchase_links")
    .select("*")
    .eq("public_id", publicId)
    .maybeSingle();


  if (error) throw new DatabaseError(`Could not resolve the link: ${error.message}`);
  if (!link) return null;

  if ((link.status as PurchaseLinkStatus) !== "active") return null;
  if (link.expires_at && new Date(link.expires_at as string).getTime() < Date.now()) {
    return null;
  }

  const [{ data: product }, { data: seller }] = await Promise.all([
    admin.from("products").select("*").eq("id", link.product_id).maybeSingle(),
    admin.from("sellers").select("*").eq("id", link.seller_id).maybeSingle(),
  ]);

  if (!product || !seller) return null;

  /*
   * Explicit mappers, never a blind `as unknown as Product/Seller`.
   *
   * Supabase rows are snake_case (`is_active`, `delivery_options`,
   * `store_username`, ...) while the domain types are camelCase. A raw row
   * force-cast has `isActive`, `deliveryOptions`, `storeUsername`, ...
   * as undefined at runtime, which caused a real defect: checkout's
   * `resolveLink` read `!product.isActive` as true and answered every POST
   * with `product_inactive` (409) → "Producto no encontrado."
   *
   * `rowToProduct` (catalogRepository) and `rowToSeller` (authz) are the
   * canonical mappers; this file reuses them so all three layers agree.
   */
  return {
    link: rowToPurchaseLink(link as Record<string, unknown>),
    product: rowToProduct(product as Record<string, unknown>),
    seller: rowToSeller(seller as Record<string, unknown>),
  };
}

/** Increments the view counter. Never blocks rendering. */
export async function recordPurchaseLinkView(linkId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("purchase_links")
    .select("view_count")
    .eq("id", linkId)
    .maybeSingle();

  const current = Number(data?.view_count ?? 0);
  await admin.from("purchase_links").update({ view_count: current + 1 }).eq("id", linkId);
}

/** All links owned by a seller, newest first. */
export async function listPurchaseLinksForSeller(seller: Seller): Promise<PurchaseLink[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("purchase_links")
    .select("*")
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(`Could not list purchase links: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToPurchaseLink);
}

/** Activates or deactivates one of the seller's own links. */
export async function setPurchaseLinkStatus(
  seller: Seller,
  linkId: string,
  status: PurchaseLinkStatus
): Promise<PurchaseLink | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("purchase_links")
    .update({ status })
    .eq("id", linkId)
    .eq("seller_id", seller.id) // ownership enforced in the WHERE clause
    .select()
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not update the link: ${error.message}`);
  return data ? rowToPurchaseLink(data as Record<string, unknown>) : null;
}

/** Maps a `purchase_links` row to the domain type. */
export function rowToPurchaseLink(row: Record<string, unknown>): PurchaseLink {
  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    productId: String(row.product_id),
    publicId: String(row.public_id),
    status: (row.status as PurchaseLinkStatus) ?? "active",
    viewCount: Number(row.view_count ?? 0),
    expiresAt: (row.expires_at as string) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}