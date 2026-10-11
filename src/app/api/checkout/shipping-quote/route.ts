import { NextRequest, NextResponse } from "next/server";
import { quoteShipping } from "@/services/shippingQuoteService";
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (typeof b.publicId !== "string" || !b.address)
      return NextResponse.json(
        { error: "Completa los datos del envío" },
        { status: 400 },
      );
    return NextResponse.json(await quoteShipping(b.publicId, b.address));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo cotizar" },
      { status: 400 },
    );
  }
}
