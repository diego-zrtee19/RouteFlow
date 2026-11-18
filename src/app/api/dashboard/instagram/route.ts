import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiResponse";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { instagramReplyKey } from "@/services/instagramMessaging";
import {
  createInstagramLogin,
  instagramConfig,
  instagramCookie,
  instagramPath,
} from "@/services/instagramConnection";

export async function GET() {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("seller_instagram_connections")
      .select("username, token_config_id")
      .eq("seller_id", seller.value.id)
      .not("connected_at", "is", null)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      available: Boolean(instagramConfig()),
      username: data?.username ?? null,
      repliesEnabled: Boolean(data?.token_config_id && instagramReplyKey()),
    });
  } catch {
    return apiErrorResponse("INTERNAL_ERROR", "No se pudo consultar Instagram", 500);
  }
}

export async function POST(request: NextRequest) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  const config = instagramConfig();
  if (!config)
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "La conexión con Instagram aún no está habilitada",
      503,
    );
  if (request.headers.get("origin") !== config.redirect.origin) {
    return apiErrorResponse(
      "VALIDATION_ERROR",
      "Abre RouteFlow desde su dirección de conexión",
      403,
    );
  }

  const login = createInstagramLogin(config, seller.value.id);
  const response = NextResponse.json({ url: login.url.href });
  response.cookies.set(instagramCookie, login.cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: instagramPath,
    maxAge: 600,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return apiErrorResponse("VALIDATION_ERROR", "Solicitud inválida", 403);
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from("seller_instagram_connections")
      .delete()
      .eq("seller_id", seller.value.id)
      .not("connected_at", "is", null);
    if (error) throw error;
    const response = NextResponse.json({ username: null });
    response.cookies.set(instagramCookie, "", { path: instagramPath, maxAge: 0 });
    return response;
  } catch {
    return apiErrorResponse("INTERNAL_ERROR", "No se pudo desconectar Instagram", 500);
  }
}
