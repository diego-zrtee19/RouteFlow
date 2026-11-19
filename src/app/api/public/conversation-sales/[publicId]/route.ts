import { NextResponse } from "next/server";
import { readConversationSale } from "@/services/conversationSaleService";
import { CheckoutError } from "@/services/checkoutService";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const sale = await readConversationSale((await params).publicId);
    // The link never reveals Instagram identifiers, other messages, buyer data or order IDs.
    return NextResponse.json(
      {
        username: sale.username,
        storeName: sale.storeName,
        items: sale.items,
        summary: {
          subtotal: Number(sale.subtotal),
          currency: sale.currency,
          items: sale.line_snapshot.map(
            (line: { title: string; quantity: number; line_total: number }) => ({
              title: line.title,
              quantity: line.quantity,
              lineTotal: line.line_total,
            }),
          ),
        },
      },
      { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof CheckoutError ? error.message : "No se pudo cargar la compra" },
      {
        status: error instanceof CheckoutError ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
