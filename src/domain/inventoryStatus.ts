export const lowStockLimit = 3;

export function inventoryStatus(product: { stock: number; isActive: boolean }) {
  if (!product.isActive) return "inactive";
  if (product.stock === 0) return "empty";
  if (product.stock <= lowStockLimit) return "low";
  return "available";
}
