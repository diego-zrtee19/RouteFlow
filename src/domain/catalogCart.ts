export interface CartLine { productId: string; variantId?: string; quantity: number }
export interface CatalogVariant { id: string; label: string; price: number; inStock: boolean }
export interface CatalogProduct { id: string; title: string; description: string | null; price: number; currency: string; images: string[]; inStock: boolean; variants: CatalogVariant[] }
export interface PublicCatalog { seller: { username: string; name: string; description: string | null; logo: string | null }; products: CatalogProduct[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateCartLines(input: unknown): CartLine[] {
  if (!Array.isArray(input) || !input.length || input.length > 20) throw Error("Elige de 1 a 20 artículos");
  const seen = new Set<string>(); let total = 0;
  return input.map(line => {
    if (!line || typeof line !== "object" || !UUID.test(line.productId) || (line.variantId !== undefined && !UUID.test(line.variantId)) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) throw Error("Cantidad o producto inválido");
    const key = `${line.productId}:${line.variantId ?? ""}`;
    if (seen.has(key)) throw Error("Artículo repetido");
    seen.add(key); total += line.quantity;
    if (total > 50) throw Error("Máximo 50 unidades por pedido");
    return { productId: line.productId, ...(line.variantId ? { variantId: line.variantId } : {}), quantity: line.quantity };
  });
}
export function validateVariants(input: unknown) {
  if (!Array.isArray(input) || input.length > 30) throw Error("Máximo 30 variantes");
  const seen = new Set<string>();
  return input.map(variant => {
    const label = typeof variant?.label === "string" ? variant.label.trim() : "";
    const price = variant?.price === "" || variant?.price == null ? null : Number(variant.price);
    if (!label || label.length > 100 || seen.has(label.toLowerCase()) || !Number.isInteger(variant.stock) || variant.stock < 0 || variant.stock > 100000 || (price !== null && (!Number.isFinite(price) || price <= 0 || price > 500000))) throw Error("Revisa nombre, inventario y precio de cada variante");
    seen.add(label.toLowerCase());
    return { label, stock: variant.stock as number, price: price === null ? null : Math.round(price * 100) / 100 };
  });
}
