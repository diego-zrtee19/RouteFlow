import { NextResponse, NextRequest } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { FedExShippingProvider } from "@/providers/shipping/FedExProvider";

/**
 * GET /api/dashboard/me
 *
 * Returns the authenticated seller + quick stats.
 *
 * Read-only and side-effect free: a user with no `sellers` row gets a typed 403
 * `SELLER_NOT_FOUND`, which the dashboard uses to trigger the onboarding POST
 * below. A GET never creates anything.
 */
export async function GET() {
  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  try {
    const admin = getSupabaseAdmin();
    const sellerId = auth.value.id;

    const [{ data: seller }, { data: orders }] = await Promise.all([
      admin
        .from("sellers")
        .select("id, store_username, store_name, description, logo_url, instagram_handle, contact_email, contact_phone, kyc_status, ship_from_address")
        .eq("id", sellerId)
        .maybeSingle(),
      admin
        .from("orders")
        .select("amount, refunded_amount, payment_status, status, created_at")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false }),
    ]);

    if (!seller) {
      return apiErrorResponse("SELLER_NOT_FOUND", "Seller profile not found", 404);
    }

    const list = orders || [];
    const captured = list.filter((o) => o.payment_status === "SUCCEEDED");
    const totalSales = captured.reduce((sum, o) => sum + Math.max(0, Number(o.amount || 0) - Number(o.refunded_amount || 0)), 0);

    return NextResponse.json({
      fedex: { configured: new FedExShippingProvider().isConfigured(), testMode: new FedExShippingProvider().isTestMode() },
      seller: {
        id: seller.id,
        businessName: seller.store_name,
        storeUsername: seller.store_username,
        logoUrl: seller.logo_url ?? null,
        bio: seller.description ?? null,
        contactEmail: seller.contact_email ?? null,
        contactPhone: seller.contact_phone ?? null,
        shippingAddress: seller.ship_from_address ?? null,
        kycStatus: seller.kyc_status,
        instagramHandle: seller.instagram_handle ?? null,
      },
      stats: {
        totalSales,
        totalOrders: list.length,
        pendingOrders: list.filter((o) => o.payment_status === "PENDING").length,
        paidOrders: captured.length,
        shippedOrders: list.filter((o) => o.status === "SHIPPED" || o.status === "DELIVERED").length,
        completedOrders: list.filter((o) => o.status === "COMPLETED").length,
      },
    });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "Could not load dashboard data", 500, error);
  }
}

/**
 * PATCH /api/dashboard/me
 *
 * Updates the seller's own profile. Fields are validated and never trusted
 * from the client for anything except display data (store name, bio, contact).
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      businessName?: string;
      bio?: string;
      contactEmail?: string;
      contactPhone?: string;
      logoUrl?: string;
      instagramHandle?: string;
      shippingAddress?: Record<string, unknown>;
    };

    const updates: Record<string, unknown> = {};
    if (body.shippingAddress !== undefined) {
      const address = body.shippingAddress;
      const keys = ["fullName", "phone", "street", "city", "state", "postalCode", "country"];
      if (!address || keys.some((key) => typeof address[key] !== "string" || !String(address[key]).trim()) || !/^[A-Za-z]{2}$/.test(String(address.country))) {
        return apiErrorResponse("VALIDATION_ERROR", "Complete the origin address, including a two-letter country code", 400);
      }
      updates.ship_from_address = Object.fromEntries(keys.map((key) => [key, String(address[key]).trim()]));
      (updates.ship_from_address as Record<string, string>).country = String(address.country).toUpperCase();
    }

    if (body.businessName !== undefined) {
      const storeName = String(body.businessName).trim();
      if (!storeName) {
        return apiErrorResponse("VALIDATION_ERROR", "Store name cannot be empty", 400);
      }
      updates.store_name = storeName;
    }
    if (body.bio !== undefined) updates.description = String(body.bio).trim();
    if (body.contactEmail !== undefined) updates.contact_email = body.contactEmail;
    if (body.contactPhone !== undefined) updates.contact_phone = body.contactPhone;
    if (body.logoUrl !== undefined) {
      if (typeof body.logoUrl !== "string" || (body.logoUrl && !body.logoUrl.startsWith("https://"))) return apiErrorResponse("VALIDATION_ERROR", "El logo debe usar una URL HTTPS", 400);
      updates.logo_url = body.logoUrl || null;
    }
    if (body.instagramHandle !== undefined) updates.instagram_handle = String(body.instagramHandle).trim();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: "No fields to update" });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("sellers")
      .update(updates)
      .eq("id", auth.value.id)
      .select("id, store_name, description, contact_email, contact_phone, logo_url, instagram_handle, ship_from_address")
      .single();

    if (error) throw error;

    return NextResponse.json({
      seller: {
        id: data.id,
        businessName: data.store_name,
        bio: data.description,
        contactEmail: data.contact_email,
        contactPhone: data.contact_phone,
        logoUrl: data.logo_url,
        instagramHandle: data.instagram_handle,
        shippingAddress: data.ship_from_address,
      },
    });
  } catch (error) {
    return apiErrorResponse("INTERNAL_ERROR", "Could not update seller profile", 500, error);
  }
}
