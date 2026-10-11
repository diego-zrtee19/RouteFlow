import { auth, currentUser } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { retryOnTransientSupabaseError, isTransientSupabaseError } from "@/lib/supabaseRetry";
import { slugifyUsername } from "@/lib/reserved";
import type { ErrorCode } from "@/lib/errors";
import type { Seller } from "@/domain/types";

/**
 * AUTHORIZATION — the single place that decides "may this caller do this?".
 *
 * The audit found three critical defects, all caused by authorization being
 * decided implicitly instead of explicitly:
 *
 *   1. `resolveSellerFromSession()` ended with `|| dataStore.sellers[0]`, so
 *      ANY authenticated user was silently mapped onto the demo seller and
 *      could then act on that seller's orders.
 *   2. `/api/orders/[id]/{confirm,dispute,tracking}` trusted the order id alone,
 *      which is an IDOR: knowing an id was enough to release funds.
 *   3. `/admin` was listed as a *public* route in the middleware, so any signed
 *      in user could read every seller's orders, including buyer PII.
 *
 * The fix is to make "no seller" and "not the owner" explicit, typed failures
 * instead of silent fallbacks.
 */

/**
 * Result of an authorization check. Never throws; callers branch on it.
 *
 * `status` includes 500 because an unreachable database is neither "not
 * authenticated" nor "not permitted", and forcing it into one of those two made
 * the dashboard try to onboard a seller against a database it could not reach.
 */
export type AuthzResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 401 | 403 | 500; code: ErrorCode };

const unauthorized = (): AuthzResult<never> => ({
  ok: false,
  status: 401,
  code: "UNAUTHENTICATED",
});

const forbidden = (code: ErrorCode = "FORBIDDEN"): AuthzResult<never> => ({
  ok: false,
  status: 403,
  code,
});

/**
 * Clerk subject ids that have the admin role.
 *
 * Clerk is already the identity provider, so this reuses it instead of
 * inventing a parallel role table. `ADMIN_USER_IDS` is the escape hatch for
 * local development; production should also set Clerk
 * `publicMetadata.role = "ADMIN"`, which is checked below.
 */
function adminUserIdsFromEnv(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** True when the given Clerk subject id has the admin role. */
export async function isAdminUser(userId: string): Promise<boolean> {
  if (adminUserIdsFromEnv().includes(userId)) return true;

  try {
    const user = await currentUser();
    return user?.publicMetadata?.role === "ADMIN";
  } catch {
    return false;
  }
}

/** Requires a signed-in user. Returns the Clerk subject id. */
export async function requireUserId(): Promise<AuthzResult<string>> {
  try {
    const { userId } = await auth();
    if (!userId) return unauthorized();
    return { ok: true, value: userId };
  } catch {
    return unauthorized();
  }
}

/** Requires a signed-in user with the ADMIN role. */

/**
 * Resolves the seller that EXACTLY belongs to the signed-in user.
 *
 * There is deliberately no fallback to "the first seller". A user without a
 * seller account gets a typed 403 so the UI can offer onboarding, instead of
 * silently inheriting someone else's store.
 */
export async function requireSeller(): Promise<AuthzResult<Seller>> {
  const user = await requireUserId();
  if (!user.ok) return user;

  let seller: Seller | null;

  try {
    seller = await findSellerByUserId(user.value);
  } catch (error) {
    /*
     * This function must never throw.
     *
     * It previously let a Supabase failure escape, which surfaced as an
     * unhandled 500. The dashboard's onboarding branch triggers on 403, so a
     * transient database blip stranded the user on a permanent loader with no
     * store and no way forward.
     *
     * A failure to REACH the database is not the same as "you have no store",
     * and the two must not be conflated: reporting SELLER_NOT_FOUND here would
     * make the client try to create a seller against a database it cannot
     * reach. So the distinction is preserved in the status code:
     *
     *   - token/clock problems -> 401, the session could not be validated
     *   - anything else       -> 500, a real backend fault worth alerting on
     */
    if (isTransientSupabaseError(error)) {
      console.error("[routeflow] seller lookup failed on a transient Supabase error:", error);
      return { ok: false, status: 401, code: "UNAUTHENTICATED" };
    }

    console.error("[routeflow] seller lookup failed:", error);
    return { ok: false, status: 500, code: "INTERNAL_ERROR" };
  }

  if (!seller) {
    // 403, not 404: the caller is authenticated, they simply have no store yet.
    return forbidden("SELLER_NOT_FOUND");
  }

  return { ok: true, value: seller };
}

/** Looks up the seller row for a Clerk user id. Returns null when absent. */
export async function findSellerByUserId(userId: string): Promise<Seller | null> {
  // Retries edge-clock drift ("JWT issued at future") before giving up, so a
  // couple of seconds of Supabase node drift does not become a user-visible
  // failure. See lib/supabaseRetry.ts for the full rationale.
  return retryOnTransientSupabaseError(async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("sellers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(`Could not resolve seller: ${error.message}`);
    if (!data) return null;
    return rowToSeller(data);
  });
}

/**
 * Seller ownership check for an arbitrary resource.
 *
 * Used by every seller-scoped route so that "Seller A acting on Seller B's
 * order" is impossible by construction, rather than by remembering to add a
 * comparison at each call site.
 */
export function assertSellerOwns(
  seller: Seller,
  resourceSellerId: string | null | undefined
): AuthzResult<Seller> {
  if (!resourceSellerId || resourceSellerId !== seller.id) {
    return { ok: false, status: 403, code: "NOT_RESOURCE_OWNER" };
  }
  return { ok: true, value: seller };
}

/** Maps a `sellers` row to the domain type. */
export function rowToSeller(row: Record<string, unknown>): Seller {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    storeUsername: String(row.store_username),
    storeName: String(row.store_name),
    instagramHandle: (row.instagram_handle as string) ?? null,
    logoUrl: (row.logo_url as string) ?? null,
    kycStatus: (row.kyc_status as Seller["kycStatus"]) ?? "unverified",
    kycDocumentUrl: (row.kyc_document_url as string) ?? null,
    description: (row.description as string) ?? null,
    shipFromAddress: (row.ship_from_address as Seller["shipFromAddress"]) ?? null,
    contactEmail: (row.contact_email as string) ?? null,
    contactPhone: (row.contact_phone as string) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * Creates the seller's storefront on first use.
 *
 * Kept separate from `requireSeller` so reading never has a side effect: a GET
 * cannot silently provision a store.
 */
export async function ensureSellerForUser(userId: string): Promise<Seller> {
  const existing = await findSellerByUserId(userId);
  if (existing) return existing;

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";
  const base = user?.username || email.split("@")[0] || `user_${userId.slice(0, 8)}`;
  let username = slugifyUsername(base, userId);

  const admin = getSupabaseAdmin();
  const { data: taken } = await admin
    .from("sellers")
    .select("id")
    .eq("store_username", username)
    .maybeSingle();

  if (taken) username = slugifyUsername(`${base}${userId.slice(-4)}`, userId);

  const { data: created, error } = await admin
    .from("sellers")
    .insert({
      user_id: userId,
      store_username: username,
      store_name: `Tienda de ${user?.firstName || "Usuario"}`,
      instagram_handle: "",
      description: "",
    })
    .select()
    .single();

  if (error || !created) {
    throw new Error(`Could not create seller: ${error?.message ?? "unknown"}`);
  }

  return rowToSeller(created as Record<string, unknown>);
}
export async function requireAdmin(): Promise<AuthzResult<string>> {
  const user = await requireUserId();
  if (!user.ok) return user;

  const admin = await isAdminUser(user.value);
  if (!admin) return forbidden("FORBIDDEN_ADMIN");

  return user;
}