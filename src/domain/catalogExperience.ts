import type { CartLine, CatalogProduct } from "./catalogCart";

export function isTestProduct(title: string) {
  return /^(prueba(?:\s|$)|demo(?:\s|$)|test(?:\s|$))/i.test(title.trim());
}
export function catalogStartingPrice(product: CatalogProduct) {
  const available = product.variants.filter((variant) => variant.inStock);
  const options = available.length ? available : product.variants;
  return options.length ? Math.min(...options.map((variant) => variant.price)) : product.price;
}
export function inventoryCartIssues(
  products: {
    id: string;
    title: string;
    stock: number;
    product_variants: { id: string; label: string; stock: number; is_active: boolean }[];
  }[],
  lines: CartLine[],
) {
  return lines.flatMap((line) => {
    const product = products.find((product) => product.id === line.productId);
    const variant = product?.product_variants.find(
      (variant) => variant.id === line.variantId && variant.is_active,
    );
    const message = !product
      ? "Artículo fuera del catálogo. Quítalo para continuar."
      : line.variantId && !variant
        ? "La opción ya no está disponible. Elige otra o quita el artículo."
        : product.stock < line.quantity || (variant && variant.stock < line.quantity)
          ? `${product.title}${variant ? ` · ${variant.label}` : ""}: la cantidad solicitada ya no está disponible. Reduce la cantidad o quita este artículo.`
          : null;
    return message ? [{ productId: line.productId, variantId: line.variantId, message }] : [];
  });
}
export function filterCatalog(
  products: CatalogProduct[],
  query: string,
  availableOnly: boolean,
  showTests: boolean,
) {
  const search = query.trim().toLocaleLowerCase("es");
  return products
    .filter(
      (product) =>
        (!availableOnly || product.inStock) &&
        (showTests || !isTestProduct(product.title)) &&
        `${product.title} ${product.description ?? ""}`.toLocaleLowerCase("es").includes(search),
    )
    .sort((a, b) => Number(b.inStock) - Number(a.inStock));
}
export function cartIssues(products: CatalogProduct[], lines: CartLine[]) {
  return lines.flatMap((line) => {
    const product = products.find((product) => product.id === line.productId);
    const variant = product?.variants.find((variant) => variant.id === line.variantId);
    const message = !product
      ? "Este artículo ya no está en el catálogo. Quítalo para continuar."
      : !product.inStock
        ? "Artículo agotado. Quítalo o vuelve más tarde."
        : line.variantId && !variant
          ? "Esta opción ya no existe. Elige otra talla o color."
          : product.variants.length && !line.variantId
            ? "Elige una talla o color para este artículo."
            : variant && !variant.inStock
              ? "La opción elegida está agotada. Elige otra o quita el artículo."
              : null;
    return message ? [{ productId: line.productId, variantId: line.variantId, message }] : [];
  });
}
