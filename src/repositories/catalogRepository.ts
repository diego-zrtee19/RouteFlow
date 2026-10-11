import type { Product, Seller } from "@/domain/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DatabaseError } from "@/lib/errors";

/**
 * CATALOG REPOSITORY — the only place that talks to Supabase for the catalog.
 *
 * Layering enforced by this file's position:
 *
 *   UI (client components)  ->  API routes  ->  services  ->  THIS  ->  Supabase
 *
 * The UI never imports `supabaseAdmin`, never builds a query, and never sees a
 * snake_case column name. Routes call the service functions below; services
 * call these functions. That is what keeps RLS and ownership decisions in one
 * place instead of being re-derived at every call site.
 *
 * Every read is scoped by `seller_id` in the query itself, so a seller cannot
 * reach another seller's rows even if a caller forgets to check ownership.
 */

/**
 * The stock a new product starts with when the caller does not say.
 *
 * Schema V3 shipped `stock INTEGER NOT NULL DEFAULT 0`, which silently made
 * every product created without an explicit stock permanently unsellable:
 * `createOrderFromPurchaseLink` refuses a product at zero, so the storefront
 * listed it while checkout rejected it. The database default is corrected by
 * `supabase_schema_v4_stock.sql`; this constant keeps the application in step
 * with it, so a missing value means "buyable", never "not for sale".
 */
export const DEFAULT_STOCK = 10;

/**
 * Normalises a caller-supplied stock level.
 *
 * A seller who omits it, sends `null`, `NaN` or a negative number gets the
 * default rather than a product that can never be bought. `0` is preserved:
 * that is a deliberate "sold out", and silently turning it into 10 would
 * resurrect inventory the seller meant to withhold.
 */
export function normaliseStock(value: unknown): number {
  // `null`, `undefined` and `""` are all "not supplied", but JavaScript's
  // `Number()` maps the first two (and an empty string) to 0 — which would
  // silently create an unsellable product, the exact bug this function exists
  // to prevent. They are therefore rejected before the numeric coercion.
  if (value === null || value === undefined || value === "") return DEFAULT_STOCK;
  if (typeof value === "boolean") return DEFAULT_STOCK;

  const parsed = Math.trunc(Number(value));

  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_STOCK;
  return parsed;
}

export interface CreateProductInput {
  title: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  stock: number;
  category: string | null;
  isExpress: boolean;
  deliveryOptions: Product["deliveryOptions"];
  weightKg: number | null;
}

/** Creates a product owned by `seller`. */
export async function insertProduct(
  seller: Seller,
  input: CreateProductInput
): Promise<Product> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("products")
    .insert({
      seller_id: seller.id,
      title: input.title,
      description: input.description,
      price: input.price,
      currency: input.currency,
      images: input.images,
      image_url: input.images[0] ?? null,
      category: input.category,
      // Never trust the caller's arithmetic; the DB CHECK is the last line.
      stock: normaliseStock(input.stock),
      is_express: input.isExpress,
      is_active: true,
      delivery_options: input.deliveryOptions,
      weight_kg: input.weightKg,
    })
    .select()
    .single();

  if (error || !data) {
    throw new DatabaseError(`Could not create the product: ${error?.message ?? "unknown"}`);
  }

  return rowToProduct(data as Record<string, unknown>);
}

/** All products owned by `seller`, newest first. */
export async function listProductsForSeller(seller: Seller): Promise<Product[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select("*")
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(`Could not list products: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct);
}

/** A single product, scoped to its owner. Returns null if it is not theirs. */
export async function findProductForSeller(
  productId: string,
  seller: Seller
): Promise<Product | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("seller_id", seller.id)
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not load the product: ${error.message}`);
  return data ? rowToProduct(data as Record<string, unknown>) : null;
}

/** Partial update, restricted to the owner. */
export async function updateProduct(
  productId: string,
  seller: Seller,
  patch: Partial<CreateProductInput> & { isActive?: boolean }
): Promise<Product | null> {
  const admin = getSupabaseAdmin();

  const columns: Record<string, unknown> = {};
  if (patch.title !== undefined) columns.title = patch.title;
  if (patch.description !== undefined) columns.description = patch.description;
  if (patch.price !== undefined) columns.price = patch.price;
  if (patch.currency !== undefined) columns.currency = patch.currency;
  if (patch.images !== undefined) {
    columns.images = patch.images;
    columns.image_url = patch.images[0] ?? null;
  }
  if (patch.stock !== undefined) columns.stock = patch.stock;
  if (patch.category !== undefined) columns.category = patch.category;
  if (patch.isExpress !== undefined) columns.is_express = patch.isExpress;
  if (patch.deliveryOptions !== undefined) columns.delivery_options = patch.deliveryOptions;
  if (patch.weightKg !== undefined) columns.weight_kg = patch.weightKg;
  if (patch.isActive !== undefined) columns.is_active = patch.isActive;
  if (patch.stock !== undefined) columns.stock = normaliseStock(patch.stock);

  if (Object.keys(columns).length === 0) return findProductForSeller(productId, seller);

  const { data, error } = await admin
    .from("products")
    .update(columns)
    .eq("id", productId)
    .eq("seller_id", seller.id) // ownership enforced in the WHERE clause
    .select()
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not update the product: ${error.message}`);
  return data ? rowToProduct(data as Record<string, unknown>) : null;
}

/** Maps a `products` row to the domain type. */
export function rowToProduct(row: Record<string, unknown>): Product {
  const images = Array.isArray(row.images) ? (row.images as string[]) : [];
  const imageUrl = (row.image_url as string) ?? null;

  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    title: String(row.title),
    description: (row.description as string) ?? null,
    price: Number(row.price ?? 0),
    currency: String(row.currency ?? "MXN"),
    imageUrl,
    images: images.length ? images : imageUrl ? [imageUrl] : [],
    category: (row.category as string) ?? null,
    stock: Number(row.stock ?? 0),
    isExpress: Boolean(row.is_express),
    isActive: Boolean(row.is_active),
    deliveryOptions: (Array.isArray(row.delivery_options)
      ? row.delivery_options
      : ["shipping"]) as Product["deliveryOptions"],
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}