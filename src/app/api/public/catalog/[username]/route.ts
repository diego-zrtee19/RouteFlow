import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!/^[a-z0-9_]{1,24}$/.test(username)) return NextResponse.json({ error: "Catálogo no disponible" }, { status: 404 });
  try {
    const db = getSupabaseAdmin();
    const { data: seller, error } = await db.from("sellers").select("id,store_username,store_name,description,logo_url").eq("store_username", username).maybeSingle();
    if (error) throw error;
    if (!seller) return NextResponse.json({ error: "Catálogo no disponible" }, { status: 404 });
    const result = await db.from("products").select("id,title,description,price,currency,images,image_url,stock,product_variants(id,label,price,stock,is_active)").eq("seller_id", seller.id).eq("is_active", true).eq("catalog_visible", true).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return NextResponse.json({ seller: { username: seller.store_username, name: seller.store_name, description: seller.description, logo: seller.logo_url }, products: result.data.map(product => ({ id: product.id, title: product.title, description: product.description, price: Number(product.price), currency: product.currency, images: product.images?.length ? product.images : product.image_url ? [product.image_url] : [], inStock: product.stock > 0, variants: product.product_variants.filter(variant => variant.is_active).map(variant => ({ id: variant.id, label: variant.label, price: Number(variant.price ?? product.price), inStock: variant.stock > 0 })) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "No se pudo cargar el catálogo" }, { status: 503 }); }
}
