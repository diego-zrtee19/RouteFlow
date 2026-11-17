import { NextRequest, NextResponse } from "next/server";
import {
  diagnoseCatalogCart,
  loadCartProfile,
  publicCartProfile,
  validateCatalogSelection,
} from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
export async function POST(req: NextRequest) {
  let selection: ReturnType<typeof validateCatalogSelection> | null = null;
  try {
    selection = validateCatalogSelection(await req.json());
    return NextResponse.json(
      publicCartProfile(await loadCartProfile(selection.username, selection.items)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const issues =
      error instanceof CheckoutError && error.code === "cart_unavailable" && selection
        ? await diagnoseCatalogCart(selection.username, selection.items).catch(() => [])
        : [];
    return NextResponse.json(
      {
        error: error instanceof CheckoutError ? error.message : "No se pudo cargar el carrito",
        issues,
      },
      {
        status: error instanceof CheckoutError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
