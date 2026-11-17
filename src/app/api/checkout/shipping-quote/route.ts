import { guardPublicRequest, readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { NextRequest, NextResponse } from "next/server";
import { quoteShipping } from "@/services/shippingQuoteService";
export async function POST(req: NextRequest) {
  try {
    await guardPublicRequest(req, "quote");
    const b = (await readPublicJson(req)) as { publicId?: unknown; address?: unknown };
    if (typeof b.publicId !== "string" || !b.address)
      return NextResponse.json({ error: "Completa los datos del envío" }, { status: 400 });
    return NextResponse.json(
      await quoteShipping(b.publicId, b.address as Parameters<typeof quoteShipping>[1]),
    );
  } catch (e) {
    const guarded = publicRequestError(e);
    if (guarded) return guarded;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo cotizar" },
      { status: 400 },
    );
  }
}
