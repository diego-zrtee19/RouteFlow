import { guardPublicRequest, readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { NextRequest, NextResponse } from "next/server";
import { createCatalogCheckout } from "@/services/catalogCheckoutService";
import { CheckoutError } from "@/services/checkoutService";
export async function POST(req: NextRequest) {
  try {
    await guardPublicRequest(req, "catalog_checkout");
    return NextResponse.json(
      await createCatalogCheckout(
        await readPublicJson(req),
        (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, ""),
        req.headers.get("Idempotency-Key"),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const guarded = publicRequestError(error);
    if (guarded) return guarded;
    return NextResponse.json(
      {
        error:
          error instanceof CheckoutError
            ? error.message
            : "No se pudo iniciar el pago. Si ya reservaste productos, espera a que se liberen antes de reintentar.",
      },
      { status: error instanceof CheckoutError ? error.status : 500 },
    );
  }
}
