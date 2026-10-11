import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generatePublicId } from "@/lib/buyerToken";
import { DatabaseError } from "@/lib/errors";
import {
  normaliseStock,
  DEFAULT_STOCK,
} from "@/repositories/catalogRepository";
import type { DeliveryMethod } from "@/domain/types";

export const runtime = "nodejs";

const ALLOWED_DELIVERY: readonly string[] = [
  "shipping",
  "local_delivery",
  "meetup",
];

interface CreateProductBody {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  stock?: unknown;
  weightKg?: unknown;
  currency?: unknown;
  images?: unknown;
  deliveryOptions?: unknown;
  publicId?: unknown;
}

/**
 * GET /api/dashboard/catalog
 *
 * Reads the seller's products and purchase links from Supabase.
 *
 * SECURITY: previously used `resolveSellerFromSession()` (fallback to
 * `sellers[0]`), so any authenticated user saw the demo seller's catalog.
 */
export async function GET() {
  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  try {
    const admin = getSupabaseAdmin();

    const [{ data: products }, { data: links }] = await Promise.all([
      admin
        .from("products")
        .select("*")
        .eq("seller_id", auth.value.id)
        .order("created_at", { ascending: false }),
      admin
        .from("purchase_links")
        .select("*")
        .eq("seller_id", auth.value.id)
        .order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      links: (links ?? []).map((link) => ({
        id: link.id,
        publicId: link.public_id,
        productId: link.product_id,
        views: link.view_count,
        active: link.status === "active",
        createdAt: link.created_at,
      })),
      products: (products ?? []).map((product) => ({
        id: product.id,
        title: product.title,
        price: Number(product.price),
        currency: product.currency,
        images: product.images ?? [],
        stock: product.stock,
        weightKg: product.weight_kg === null ? null : Number(product.weight_kg),
        dimensions: product.package_dimensions,
        shippingPayer: product.shipping_payer,
        isActive: product.is_active,
        deliveryOptions: product.delivery_options ?? [],
      })),
    });
  } catch (error) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "Could not load the catalog",
      500,
      error,
    );
  }
}

/**
 * POST /api/dashboard/catalog
 *
 * Publishes a product and its purchase link to Supabase.
 *
 * The link is now a real row in `purchase_links`, so `/p/{publicId}` keeps
 * resolving after a restart, a redeploy, or from a different browser. The audit
 * found this data lived only in `.routeflow-data/store.json`, which does not
 * survive a serverless cold start.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  const body = (await req.json().catch(() => ({}))) as CreateProductBody;

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const price = Number(body.price);
  // `normaliseStock` is shared with the repository so the route and the data
  // layer can never disagree about what "no stock given" means. The old inline
  // fallback used 1, and treated an explicit `null` as 0 — which silently
  // produced an unsellable product.
  const stock = normaliseStock(body.stock);
  const weightKg = body.weightKg === undefined ? null : Number(body.weightKg);
  if (
    weightKg !== null &&
    (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 1000)
  ) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "Provide a valid package weight in kilograms",
      400,
    );
  }
  const currency =
    typeof body.currency === "string"
      ? body.currency.toUpperCase().slice(0, 3)
      : "MXN";
  const images = Array.isArray(body.images)
    ? body.images
        .filter(
          (src: unknown): src is string =>
            typeof src === "string" && src.length > 0,
        )
        .slice(0, 4)
    : [];
  const requestedDelivery = Array.isArray(body.deliveryOptions)
    ? body.deliveryOptions.filter((option: unknown): option is DeliveryMethod =>
        ALLOWED_DELIVERY.includes(option as string),
      )
    : [];
  const deliveryOptions = requestedDelivery.length
    ? requestedDelivery
    : ["shipping"];

  if (!title) {
    return apiErrorResponse("VALIDATION_ERROR", "A title is required", 400);
  }
  if (!Number.isFinite(price) || price <= 0) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "A positive price is required",
      400,
    );
  }
  if (price > 500000) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "Price is above the allowed maximum",
      400,
    );
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: product, error: productError } = await admin
      .from("products")
      .insert({
        seller_id: auth.value.id,
        title,
        description: description || null,
        price: Math.round(price * 100) / 100,
        currency,
        images,
        image_url: images[0] ?? null,
        stock,
        weight_kg: weightKg,
        is_active: true,
        delivery_options: deliveryOptions,
      })
      .select()
      .single();

    if (productError || !product) {
      throw new DatabaseError(
        `Could not create product: ${productError?.message}`,
      );
    }

    // UNIQUE(public_id) in the schema: a collision is a DB error, and we retry
    // rather than silently handing the seller someone else's link.
    let publicId = generatePublicId();
    let link: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < 5 && !link; attempt++) {
      const result = await admin
        .from("purchase_links")
        .insert({
          seller_id: auth.value.id,
          product_id: product.id,
          public_id: publicId,
          status: "active",
        })
        .select()
        .single();

      if (!result.error) {
        link = result.data as Record<string, unknown>;
        break;
      }
      // 23505 = unique_violation. Anything else is a real failure.
      if (!result.error.message.includes("23505")) {
        throw new DatabaseError(
          `Could not create purchase link: ${result.error.message}`,
        );
      }
      publicId = generatePublicId();
    }

    if (!link) {
      throw new DatabaseError("Could not allocate a unique public link id");
    }

    return NextResponse.json(
      {
        link: {
          id: link.id,
          publicId: link.public_id,
          active: link.status === "active",
          productId: link.product_id,
        },
        product: {
          id: product.id,
          title: product.title,
          price: Number(product.price),
          currency: product.currency,
          stock: Number(product.stock ?? DEFAULT_STOCK),
          defaultStock: DEFAULT_STOCK,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "Could not publish the product",
      500,
      error,
    );
  }
}

/**
 * PATCH /api/dashboard/catalog
 *
 * Activates/deactivates one of the seller's own purchase links.
 *
 * Ownership is enforced in the WHERE clause itself (`.eq("seller_id", ...)`), so
 * a link id belonging to another seller simply does not match.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireSeller();
  if (!auth.ok) {
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  }

  const body = (await req.json().catch(() => ({}))) as {
    linkId?: unknown;
    active?: unknown;
    productId?: unknown;
    weightKg?: unknown;
    dimensions?: unknown;
    shippingPayer?: unknown;
  };

  if (body.productId !== undefined) {
    const productId = typeof body.productId === "string" ? body.productId : "";
    const weightKg = Number(body.weightKg);
    if (
      body.dimensions !== undefined &&
      (!body.dimensions ||
        typeof body.dimensions !== "object" ||
        ["length", "width", "height"].some(
          (k) =>
            !Number.isInteger(
              (body.dimensions as Record<string, unknown>)[k],
            ) ||
            Number((body.dimensions as Record<string, unknown>)[k]) <= 0 ||
            Number((body.dimensions as Record<string, unknown>)[k]) > 300,
        ))
    )
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Dimensiones enteras de 1 a 300 cm",
        400,
      );
    if (
      body.shippingPayer !== undefined &&
      !["buyer", "seller"].includes(String(body.shippingPayer))
    )
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Indica quién paga el envío",
        400,
      );
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        productId,
      ) ||
      !Number.isFinite(weightKg) ||
      weightKg <= 0 ||
      weightKg > 1000 ||
      body.linkId !== undefined
    ) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Indica el producto y un peso válido en kg",
        400,
      );
    }
    try {
      const { data, error } = await getSupabaseAdmin()
        .from("products")
        .update({
          weight_kg: weightKg,
          ...(body.dimensions !== undefined
            ? { package_dimensions: body.dimensions }
            : {}),
          ...(body.shippingPayer !== undefined
            ? { shipping_payer: body.shippingPayer }
            : {}),
        })
        .eq("id", productId)
        .eq("seller_id", auth.value.id)
        .select("id, weight_kg")
        .maybeSingle();
      if (error) throw new DatabaseError("Could not save package weight");
      if (!data)
        return apiErrorResponse("NOT_FOUND", "Producto no encontrado", 404);
      return NextResponse.json({
        product: { id: data.id, weightKg: Number(data.weight_kg) },
      });
    } catch (error) {
      return apiErrorResponse(
        "INTERNAL_ERROR",
        "Could not save package weight",
        500,
        error,
      );
    }
  }

  const linkId = typeof body.linkId === "string" ? body.linkId.trim() : "";
  const active = Boolean(body.active);

  if (!linkId) {
    return apiErrorResponse("VALIDATION_ERROR", "A linkId is required", 400);
  }

  try {
    const admin = getSupabaseAdmin();

    // Accept either the uuid or the public id, but always scoped to this seller.
    const { data: link, error } = await admin
      .from("purchase_links")
      .update({ status: active ? "active" : "inactive" })
      .eq("seller_id", auth.value.id)
      .or(`id.eq.${linkId},public_id.eq.${linkId.toUpperCase()}`)
      .select()
      .maybeSingle();

    if (error) {
      throw new DatabaseError(`Could not update the link: ${error.message}`);
    }
    if (!link) {
      return apiErrorResponse("NOT_FOUND", "Link not found", 404);
    }

    return NextResponse.json({
      link: {
        id: link.id,
        publicId: link.public_id,
        active: link.status === "active",
      },
    });
  } catch (error) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "Could not update the link",
      500,
      error,
    );
  }
}
