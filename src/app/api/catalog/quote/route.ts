import { NextRequest, NextResponse } from "next/server";
import { quoteCatalogCart } from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
export async function POST(req: NextRequest) {
  try { return NextResponse.json(await quoteCatalogCart(await req.json())); }
  catch (error) { return NextResponse.json({ error: error instanceof CheckoutError ? error.message : "No se pudo cotizar el envío" }, { status: error instanceof CheckoutError ? error.status : 500 }); }
}
