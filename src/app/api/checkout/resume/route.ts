import { NextRequest, NextResponse } from "next/server";
import { guardPublicRequest, publicRequestError } from "@/lib/publicRequestGuard";
import { resumeCheckoutAttempt } from "@/services/checkoutAttemptService";
import { getStripe } from "@/lib/stripe";
import { upsertPayment } from "@/repositories/paymentRepository";
export async function POST(req: NextRequest) {
  try {
    await guardPublicRequest(req, "checkout");
    const { order, buyerToken, request } = await resumeCheckoutAttempt(
      req.headers.get("Idempotency-Key"),
    );
    let url = `/order/${order.id}`;
    if (order.paymentStatus !== "SUCCEEDED") {
      if (!request)
        return NextResponse.json(
          { error: "Completa los mismos datos de compra para retomar la reserva." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      const session = await getStripe().checkout.sessions.create(request, {
        idempotencyKey: `rf_checkout_${order.id}`,
      });
      if (!session.url || session.status === "expired")
        return NextResponse.json(
          {
            error:
              "El intento de pago expiró. Espera a que se libere la reserva antes de iniciar otra compra.",
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      await upsertPayment({
        orderId: order.id,
        checkoutSessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
        amount: order.amount,
        currency: order.currency,
        status: "PENDING",
      });
      url = session.url;
    }
    return NextResponse.json(
      { orderId: order.id, buyerToken, url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return (
      publicRequestError(error) ??
      NextResponse.json(
        {
          error: "No se pudo recuperar el pago. No inicies otra compra todavía; vuelve a intentar.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    );
  }
}
