import { randomInt, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { metaIdPattern } from "@/domain/whatsapp";
import {
  whatsappConfig,
  whatsappKeyConfigured,
  whatsappPhoneAllowed,
  whatsappCookie,
  whatsappPath,
  createWhatsAppState,
  validWhatsAppState,
  exchangeWhatsAppCode,
  verifiedWhatsAppPhone,
  encryptWhatsAppToken,
  whatsappGraph,
} from "@/services/whatsappConnection";

const headers = { "Cache-Control": "private, no-store" };
function testConfig(seller: string) {
  return process.env.WHATSAPP_TEST_SELLER_ID === seller &&
    process.env.WHATSAPP_TEST_ACCESS_TOKEN &&
    process.env.WHATSAPP_TEST_WABA_ID &&
    process.env.WHATSAPP_TEST_PHONE_NUMBER_ID &&
    whatsappPhoneAllowed(process.env.WHATSAPP_TEST_PHONE_NUMBER_ID)
    ? {
        token: process.env.WHATSAPP_TEST_ACCESS_TOKEN,
        waba: process.env.WHATSAPP_TEST_WABA_ID,
        phone: process.env.WHATSAPP_TEST_PHONE_NUMBER_ID,
      }
    : null;
}
export async function GET() {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("seller_whatsapp_connections")
      .select("display_phone_number,connected_at,token_expires_at")
      .eq("seller_id", seller.value.id)
      .maybeSingle();
    if (error) throw error;
    const config = whatsappConfig();
    return NextResponse.json(
      {
        available: Boolean(config),
        appId: config?.appId ?? null,
        configId: config?.configId ?? null,
        testAvailable: Boolean(testConfig(seller.value.id) && whatsappKeyConfigured()),
        phone: data?.connected_at ? data.display_phone_number : null,
        expiresAt: data?.token_expires_at ?? null,
        testMode: process.env.WHATSAPP_LIVE_ENABLED !== "true",
      },
      { headers },
    );
  } catch {
    return apiErrorResponse("INTERNAL_ERROR", "No se pudo consultar WhatsApp", 500);
  }
}
export async function POST(request: NextRequest) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return apiErrorResponse("FORBIDDEN", "Solicitud no permitida", 403);
  try {
    const config = whatsappConfig();
    const body = await readPublicJson(request);
    if (body.action === "begin") {
      if (!config || request.nextUrl.origin !== config.origin)
        return apiErrorResponse(
          "CONFLICT",
          "WhatsApp necesita terminar su configuración de Meta en este entorno",
          409,
        );
      const login = createWhatsAppState(seller.value.id, config.secret);
      const response = NextResponse.json({ state: login.state }, { headers });
      response.cookies.set(whatsappCookie, login.cookie, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: whatsappPath,
        maxAge: 600,
      });
      return response;
    }
    let token: string, waba: string, phone: string;
    const test = body.action === "connect-test" ? testConfig(seller.value.id) : null;
    if (test) {
      token = test.token;
      waba = test.waba;
      phone = test.phone;
    } else {
      if (
        !config ||
        request.nextUrl.origin !== config.origin ||
        !validWhatsAppState(
          body.state,
          request.cookies.get(whatsappCookie)?.value,
          seller.value.id,
          config.secret,
        )
      )
        return apiErrorResponse(
          "FORBIDDEN",
          "La autorización venció. Inicia de nuevo desde Ajustes",
          403,
        );
      if (
        typeof body.code !== "string" ||
        !body.code ||
        body.code.length > 4096 ||
        typeof body.wabaId !== "string" ||
        !metaIdPattern.test(body.wabaId) ||
        typeof body.phoneId !== "string" ||
        !metaIdPattern.test(body.phoneId) ||
        ![
          "FINISH",
          "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          "FINISH_GRANT_ONLY_API_ACCESS",
        ].includes(String(body.flow))
      )
        return apiErrorResponse(
          "VALIDATION_ERROR",
          "Completa la selección de un número en Meta",
          400,
        );
      waba = body.wabaId;
      phone = body.phoneId;
      if (!whatsappPhoneAllowed(phone))
        return apiErrorResponse(
          "FORBIDDEN",
          "Este entorno solo permite los números de prueba autorizados",
          403,
        );
      token = await exchangeWhatsAppCode(body.code, config);
    }
    if (!whatsappKeyConfigured())
      return apiErrorResponse(
        "CONFLICT",
        "Falta configurar el almacenamiento seguro de WhatsApp",
        409,
      );
    const appId =
      config?.appId || process.env.WHATSAPP_META_APP_ID || process.env.INSTAGRAM_META_APP_ID;
    const secret =
      config?.secret ||
      process.env.WHATSAPP_META_APP_SECRET ||
      process.env.INSTAGRAM_META_APP_SECRET;
    if (!appId || !secret)
      return apiErrorResponse("CONFLICT", "Falta configurar la app de Meta", 409);
    const verified = await verifiedWhatsAppPhone(token, waba, phone, appId, secret, Boolean(test));
    const db = getSupabaseAdmin();
    const existing = await db
      .from("seller_whatsapp_connections")
      .select("id,phone_number_id,waba_id")
      .eq("seller_id", seller.value.id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (
      existing.data &&
      (existing.data.phone_number_id !== phone || existing.data.waba_id !== waba)
    )
      return apiErrorResponse(
        "CONFLICT",
        "Esta tienda ya tiene otro número asociado. Contacta soporte para cambiarlo conservando sus pedidos",
        409,
      );
    const id = existing.data?.id ?? randomUUID();
    const values = {
      id,
      seller_id: seller.value.id,
      waba_id: waba,
      phone_number_id: phone,
      display_phone_number: verified.display_phone_number,
      token_ciphertext: encryptWhatsAppToken(token, id),
      token_expires_at: verified.expiresAt,
      connected_at: null,
    };
    const reserve = existing.data
      ? await db
          .from("seller_whatsapp_connections")
          .update(values)
          .eq("id", id)
          .eq("seller_id", seller.value.id)
      : await db.from("seller_whatsapp_connections").insert(values);
    if (reserve.error?.code === "23505")
      return apiErrorResponse(
        "CONFLICT",
        "Ese número ya está vinculado o hay una conexión en curso",
        409,
      );
    if (reserve.error) throw reserve.error;
    const subscribed = await whatsappGraph<{ success?: boolean }>(
      `${waba}/subscribed_apps`,
      token,
      { method: "POST" },
    );
    if (subscribed.success !== true) throw Error("WhatsApp subscription not confirmed");
    if (!test && body.flow === "FINISH") {
      const pin = randomInt(0, 1000000).toString().padStart(6, "0");
      const saved = await db
        .from("seller_whatsapp_connections")
        .update({ registration_ciphertext: encryptWhatsAppToken(pin, id + ":registration") })
        .eq("id", id)
        .eq("seller_id", seller.value.id);
      if (saved.error) throw saved.error;
      const registered = await whatsappGraph<{ success?: boolean }>(`${phone}/register`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      });
      if (registered.success !== true) throw Error("WhatsApp phone registration not confirmed");
    }
    const complete = await db
      .from("seller_whatsapp_connections")
      .update({ connected_at: new Date().toISOString() })
      .eq("id", id)
      .eq("seller_id", seller.value.id);
    if (complete.error) throw complete.error;
    const response = NextResponse.json(
      { connected: true, phone: verified.display_phone_number },
      { headers },
    );
    response.cookies.set(whatsappCookie, "", { path: whatsappPath, maxAge: 0 });
    return response;
  } catch (error) {
    const guarded = publicRequestError(error);
    if (guarded) return guarded;
    return apiErrorResponse(
      "CONFLICT",
      "Meta no pudo completar WhatsApp. Comprueba permisos, registro del número y configuración de prueba antes de reintentar",
      409,
    );
  }
}
export async function DELETE(request: NextRequest) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return apiErrorResponse("FORBIDDEN", "Solicitud no permitida", 403);
  const { error } = await getSupabaseAdmin()
    .from("seller_whatsapp_connections")
    .update({ connected_at: null, token_ciphertext: null, token_expires_at: null })
    .eq("seller_id", seller.value.id);
  if (error) return apiErrorResponse("INTERNAL_ERROR", "No se pudo desconectar WhatsApp", 500);
  return NextResponse.json({ disconnected: true }, { headers });
}
