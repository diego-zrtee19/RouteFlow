export const RESERVED_USERNAMES = new Set([
  "dashboard",
  "checkout",
  "pedido",
  "api",
  "sign-in",
  "sign-up",
  "login",
  "admin",
  "analytics",
  "orders",
  "kyc",
  "express",
  "success",
  "webhook",
  "webhooks",
]);

export function slugifyUsername(raw: string, fallbackId: string): string {
  const slug = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);

  if (!slug || RESERVED_USERNAMES.has(slug) || /^\d+$/.test(slug)) {
    return `shop_${fallbackId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase()}`;
  }

  return slug;
}
