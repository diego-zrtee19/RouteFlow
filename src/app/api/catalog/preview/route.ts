import { NextRequest, NextResponse } from "next/server";
import {
  diagnoseCatalogCart,
  loadCartProfile,
  publicCartProfile,
  validateCatalogSelection,
} from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
import { resolveConversationSelection } from "@/services/conversationSaleService";
export async function POST(req: NextRequest) {
  let selection: ReturnType<typeof validateCatalogSelection> | null = null;
  try {
    const body = await req.json();
    const resolved = (await resolveConversationSelection(body)) ?? validateCatalogSelection(body);
    selection = resolved;
    return NextResponse.json(
      publicCartProfile(
        await loadCartProfile(
          selection.username,
          selection.items,
          undefined,
          "conversationSaleId" in resolved ? resolved.conversationSaleId : undefined,
        ),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const issues =
      error instanceof CheckoutError &&
      error.code === "cart_unavailable" &&
      selection &&
      !selection.conversationSaleId
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
