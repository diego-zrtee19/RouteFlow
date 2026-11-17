import { guardPublicRequest, readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { NextRequest, NextResponse } from "next/server";
import { quoteCatalogCart } from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
export async function POST(req: NextRequest) {
  try {
    await guardPublicRequest(req, "catalog_quote");
    return NextResponse.json(await quoteCatalogCart(await readPublicJson(req)));
  } catch (error) {
    const guarded = publicRequestError(error);
    if (guarded) return guarded;
    return NextResponse.json(
      { error: error instanceof CheckoutError ? error.message : "No se pudo cotizar el envío" },
      { status: error instanceof CheckoutError ? error.status : 500 },
    );
  }
}
