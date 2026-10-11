import { NextResponse } from "next/server";
import { requireUserId, ensureSellerForUser } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";

/**
 * POST /api/dashboard/seller — seller registration (the onboarding step).
 *
 * WHY A POST AND NOT A GET
 *
 * The architecture has one deliberate invariant, in `lib/authz.ts`:
 *
 *     "Kept separate from `requireSeller` so reading never has a side effect:
 *      a GET cannot silently provision a store."
 *
 * The audit removed a `getOrCreateStoreForUser()` helper that created a store on
 * any read. Reinstating that would regress a deliberate decision, so
 * `requireSeller()` still refuses and every read endpoint still answers a typed
 * 403 `SELLER_NOT_FOUND`.
 *
 * Provisioning happens here, on an explicit POST. A buyer who merely navigates
 * can never cause a row to be written; only a deliberate "set up my store" can,
 * and only for the user who made it.
 *
 * WHY IT IS ITS OWN FILE
 *
 * Because the client addresses it as `/api/dashboard/seller`. Next.js App Router
 * routes on the file path, so a POST handler living inside `me/route.ts` is
 * never reachable at that URL and the dashboard silently 404s. This file is the
 * route.
 *
 * WHO CAN CALL IT
 *
 * Any authenticated Clerk user, and only for THEMSELVES: the seller id derives
 * from the session's user id, never from the request body, so there is no
 * parameter through which one user could provision or claim another's store.
 *
 * IDEMPOTENT
 *
 * Calling it twice returns the same seller instead of failing or duplicating,
 * so a double-click, a refresh, or a retry after a network blip is safe.
 * `sellers.user_id` is UNIQUE, so even a genuine race cannot produce two stores
 * for one account.
 */
export async function POST() {
  const user = await requireUserId();

  if (!user.ok) {
    return apiErrorResponse(user.code, "Sign in to create your store", user.status);
  }

  try {
    const seller = await ensureSellerForUser(user.value);

    return NextResponse.json(
      {
        seller: {
          id: seller.id,
          businessName: seller.storeName,
          storeUsername: seller.storeUsername,
          logoUrl: seller.logoUrl,
          bio: seller.description,
          contactEmail: seller.contactEmail,
          contactPhone: seller.contactPhone,
          kycStatus: seller.kycStatus,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "Could not create the seller profile",
      500,
      error
    );
  }
}