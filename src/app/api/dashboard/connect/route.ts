import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { connectStatus, startConnect } from "@/services/connectService";
import { apiErrorResponse } from "@/lib/apiResponse";
import { currentUser } from "@clerk/nextjs/server";
import { isAppError } from "@/lib/errors";
export async function GET() {
  const auth = await requireSeller();
  if (!auth.ok)
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  try {
    return NextResponse.json(await connectStatus(auth.value.id));
  } catch (e) {
    return apiErrorResponse(
      "NOT_CONFIGURED",
      "No se pudo consultar Stripe Connect",
      503,
      e,
    );
  }
}
export async function POST(req: NextRequest) {
  const auth = await requireSeller();
  if (!auth.ok)
    return apiErrorResponse(auth.code, "Seller access required", auth.status);
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const user = auth.value.contactEmail ? null : await currentUser();
    const primaryEmail = user?.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId && email.verification?.status === "verified",
    )?.emailAddress;
    return NextResponse.json({
      url: await startConnect(auth.value.id, origin, primaryEmail),
    });
  } catch (e) {
    if (isAppError(e)) return apiErrorResponse(e.code, e.message, e.status);
    const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
    const needsActivation = code === "account_create_activation_required";
    return apiErrorResponse(
      "NOT_CONFIGURED",
      needsActivation
        ? "Activa Connect en la cuenta de Stripe de RouteFlow para conectar vendedores"
        : "Stripe no pudo completar la conexión. Revisa los datos de tu cuenta o vuelve a intentarlo.",
      503,
      e,
    );
  }
}
