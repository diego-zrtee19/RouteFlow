import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { recoverLegacyReservation } from "@/services/legacyReservationService";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const a = await requireSeller();
  if (!a.ok)
    return apiErrorResponse(a.code, "Seller access required", a.status);
  try {
    const b = await req.json();
    if (typeof b.restoreStock !== "boolean")
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Confirma si el pedido había descontado stock",
        400,
      );
    const { id } = await params;
    return NextResponse.json(
      await recoverLegacyReservation(id, a.value.id, b.restoreStock),
    );
  } catch (e) {
    return apiErrorResponse(
      "CONFLICT",
      e instanceof Error ? e.message : "No se pudo recuperar la reserva",
      409,
    );
  }
}
