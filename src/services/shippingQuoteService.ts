import { ValidationError } from "@/lib/errors";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { FedExShippingProvider } from "@/providers/shipping/FedExProvider";
import type { CheckoutInput } from "@/services/checkoutService";

export function quoteFingerprint(
  address: CheckoutInput["address"],
  origin: unknown,
  weight: unknown,
  dimensions: unknown,
) {
  const destination = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].map((v) =>
    String(v ?? "")
      .trim()
      .toUpperCase(),
  );
  return createHash("sha256")
    .update(JSON.stringify([destination, origin, weight, dimensions]))
    .digest("hex");
}
async function shippingProfile(productId: string) {
  const db = getSupabaseAdmin();
  const { data: product, error } = await db
    .from("products")
    .select("*, sellers(ship_from_address)")
    .eq("id", productId)
    .single();
  if (error || !product) throw new ValidationError("Producto no disponible");
  return { product, origin: product.sellers?.ship_from_address };
}
export async function quoteShipping(
  publicId: string,
  address: CheckoutInput["address"],
) {
  if (!address.postalCode || !/^[A-Za-z]{2}$/.test(address.country ?? ""))
    throw new ValidationError("Completa el país y código postal");
  const { data: link, error } = await getSupabaseAdmin()
    .from("purchase_links")
    .select("product_id")
    .eq("public_id", publicId.toUpperCase())
    .eq("status", "active")
    .maybeSingle();
  if (error || !link) throw new ValidationError("Enlace no disponible");
  const { product, origin } = await shippingProfile(link.product_id);
  if (product.shipping_payer === "seller")
    return { payer: "seller", quotes: [], amount: 0 };
  if (!origin || !product.weight_kg || !product.package_dimensions)
    throw new ValidationError(
      "El vendedor debe configurar origen, peso y dimensiones",
    );
  const rates = await new FedExShippingProvider().getRates({
    origin,
    destination: {
      postalCode: address.postalCode,
      country: address.country!.toUpperCase(),
      city: address.city,
    },
    weightKg: Number(product.weight_kg),
    dimensions: product.package_dimensions,
  });
  const valid = rates.filter(
    (r) =>
      Number.isFinite(r.rate) &&
      r.rate > 0 &&
      r.currency.toUpperCase() === product.currency.toUpperCase(),
  );
  if (!valid.length)
    throw new ValidationError(
      "No hay tarifas disponibles en la moneda de este producto",
    );
  const fingerprint = quoteFingerprint(
    address,
    origin,
    product.weight_kg,
    product.package_dimensions,
  );
  const { data, error: writeError } = await getSupabaseAdmin()
    .from("shipping_quotes")
    .insert(
      valid.map((r) => ({
        product_id: product.id,
        fingerprint,
        service_code: r.serviceCode,
        amount: r.rate,
        currency: r.currency,
      })),
    )
    .select("id,service_code,amount,currency,expires_at");
  if (writeError) throw new ValidationError("No se pudo guardar la cotización");
  return { payer: "buyer", quotes: data };
}
export async function validateShippingQuote(
  input: CheckoutInput,
  productId: string,
) {
  if (input.deliveryMethod !== "shipping") return;
  const { product, origin } = await shippingProfile(productId);
  if (product.shipping_payer === "seller") return;
  if (!input.quoteId)
    throw new ValidationError("Cotiza el envío antes de pagar");
  const { data, error } = await getSupabaseAdmin()
    .from("shipping_quotes")
    .select("*")
    .eq("id", input.quoteId)
    .eq("product_id", productId)
    .maybeSingle();
  if (
    error ||
    !data ||
    new Date(data.expires_at).getTime() <= Date.now() ||
    data.fingerprint !==
      quoteFingerprint(
        input.address,
        origin,
        product.weight_kg,
        product.package_dimensions,
      )
  )
    throw new ValidationError(
      "La cotización venció o cambió la dirección; vuelve a cotizar",
    );
}
