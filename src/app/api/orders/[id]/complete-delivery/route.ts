import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse, toErrorResponse } from "@/lib/apiResponse";
import { completeCoordinatedDelivery } from "@/services/deliveryService";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const seller = await requireSeller();
  if (!seller.ok) return apiErrorResponse(seller.code, "Seller access required", seller.status);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.pin !== "string" || !/^\d{6}$/.test(body.pin)) {
    return apiErrorResponse("VALIDATION_ERROR", "Ingresa un NIP de seis dígitos.", 400);
  }
  try {
    return NextResponse.json(await completeCoordinatedDelivery(id, seller.value.id, body.pin));
  } catch (error) { return toErrorResponse(error); }
}
