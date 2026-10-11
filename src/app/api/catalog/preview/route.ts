import { NextRequest, NextResponse } from "next/server";
import { loadCartProfile, publicCartProfile, validateCatalogSelection } from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
export async function POST(req: NextRequest) {
  try { const selection = validateCatalogSelection(await req.json()); return NextResponse.json(publicCartProfile(await loadCartProfile(selection.username, selection.items)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof CheckoutError ? error.message : "No se pudo cargar el carrito" }, { status: error instanceof CheckoutError ? error.status : 500 }); }
}
