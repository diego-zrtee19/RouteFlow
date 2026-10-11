import { NextRequest, NextResponse } from "next/server";
import { createCatalogCheckout } from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
export async function POST(req: NextRequest) {
  try { return NextResponse.json(await createCatalogCheckout(await req.json(), (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, ""))); }
  catch (error) { return NextResponse.json({ error: error instanceof CheckoutError ? error.message : "No se pudo iniciar el pago. Si ya reservaste productos, espera a que se liberen antes de reintentar." }, { status: error instanceof CheckoutError ? error.status : 500 }); }
}
