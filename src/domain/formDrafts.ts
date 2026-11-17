export const productDraftInitial = {
  title: "",
  description: "",
  price: "",
  stock: "1",
  weightKg: "",
  shipping: false,
  imageUrl: "",
  dimensions: { length: "", width: "", height: "" },
  variants: [] as { label: string; stock: string; price: string }[],
};
export type ProductDraft = typeof productDraftInitial;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const shortString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
export function parseProductDraft(value: unknown): ProductDraft | null {
  if (
    !record(value) ||
    !["title", "description", "price", "stock", "weightKg", "imageUrl"].every((key) =>
      shortString(value[key], key === "description" ? 4000 : key === "imageUrl" ? 2000 : 200),
    ) ||
    typeof value.shipping !== "boolean" ||
    !record(value.dimensions) ||
    !["length", "width", "height"].every((key) =>
      shortString((value.dimensions as Record<string, unknown>)[key], 20),
    ) ||
    !Array.isArray(value.variants) ||
    value.variants.length > 30 ||
    !value.variants.every(
      (variant) =>
        record(variant) &&
        shortString(variant.label, 100) &&
        shortString(variant.stock, 20) &&
        shortString(variant.price, 20),
    )
  )
    return null;
  return {
    title: value.title as string,
    description: value.description as string,
    price: value.price as string,
    stock: value.stock as string,
    weightKg: value.weightKg as string,
    imageUrl: value.imageUrl as string,
    shipping: value.shipping,
    dimensions: {
      length: value.dimensions.length as string,
      width: value.dimensions.width as string,
      height: value.dimensions.height as string,
    },
    variants: value.variants.map((variant) => ({
      label: variant.label,
      stock: variant.stock,
      price: variant.price,
    })),
  };
}
export const checkoutDraftInitial = {
  buyer: { buyerName: "", buyerEmail: "", buyerPhone: "" },
  address: { street: "", city: "", state: "", postalCode: "", country: "MX", notes: "" },
};
export function parseCheckoutDraft(value: unknown): typeof checkoutDraftInitial | null {
  if (!record(value) || !record(value.buyer) || !record(value.address)) return null;
  if (
    !Object.keys(checkoutDraftInitial.buyer).every((key) =>
      shortString((value.buyer as Record<string, unknown>)[key], 150),
    ) ||
    !Object.keys(checkoutDraftInitial.address).every((key) =>
      shortString((value.address as Record<string, unknown>)[key], 200),
    )
  )
    return null;
  const buyer = value.buyer;
  const address = value.address;
  return {
    buyer: {
      buyerName: buyer.buyerName as string,
      buyerEmail: buyer.buyerEmail as string,
      buyerPhone: buyer.buyerPhone as string,
    },
    address: {
      street: address.street as string,
      city: address.city as string,
      state: address.state as string,
      postalCode: address.postalCode as string,
      country: address.country as string,
      notes: address.notes as string,
    },
  };
}
export const parseResponseDraft = (value: unknown) => (shortString(value, 4000) ? value : null);
