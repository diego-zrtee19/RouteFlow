import { NextRequest, NextResponse } from "next/server";
import { requireSeller, requireAdmin } from "@/lib/authz";
import { findOrderForBuyer } from "@/repositories/orderRepository";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
import { resolveDispute } from "@/services/disputeService";
async function access(req: NextRequest, id: string) {
  const db = getSupabaseAdmin();
  const { data: d, error } = await db
    .from("disputes")
    .select("*,orders(seller_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!d) return null;
  const token = req.headers.get("x-buyer-token");
  if (token) {
    if (await findOrderForBuyer(d.order_id, token))
      return { dispute: d, audience: "buyer" };
    return null;
  }
  const seller = await requireSeller();
  if (seller.ok && seller.value.id === d.orders?.seller_id)
    return { dispute: d, audience: "seller" };
  const admin = await requireAdmin();
  if (admin.ok) return { dispute: d, audience: "admin" };
  return null;
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const a = await access(req, id);
    if (!a) return apiErrorResponse("NOT_FOUND", "Disputa no encontrada", 404);
    const db = getSupabaseAdmin();
    const { data: files, error } = await db
      .from("dispute_evidence")
      .select("id,filename,storage_path,audience")
      .eq("dispute_id", id);
    if (error) throw error;
    const evidence = await Promise.all(
      (files ?? []).map(async (f) => {
        const { data, error: e } = await db.storage
          .from("dispute-evidence")
          .createSignedUrl(f.storage_path, 60);
        if (e) throw e;
        return {
          id: f.id,
          filename: f.filename,
          audience: f.audience,
          url: data.signedUrl,
        };
      }),
    );
    return NextResponse.json(
      {
        dispute: {
          id: a.dispute.id,
          orderId: a.dispute.order_id,
          status: a.dispute.status,
          reason: a.dispute.reason,
          description: a.dispute.description,
          sellerResponse: a.dispute.seller_response,
          responseDueAt: a.dispute.response_due_at,
          resolution: a.dispute.resolution,
        },
        evidence,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No se pudo consultar la disputa",
      500,
      e,
    );
  }
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const a = await access(req, id);
    if (!a) return apiErrorResponse("NOT_FOUND", "Disputa no encontrada", 404);
    const b = await req.json();
    if (a.audience !== "seller")
      return apiErrorResponse(
        "FORBIDDEN",
        "Solo el vendedor puede responder",
        403,
      );
    const response = typeof b.response === "string" ? b.response.trim() : "";
    if (response.length < 3 || response.length > 4000)
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Respuesta de 3 a 4000 caracteres",
        400,
      );
    const { error } = await getSupabaseAdmin()
      .from("disputes")
      .update({ seller_response: response, status: "UNDER_REVIEW" })
      .eq("id", id)
      .in("status", ["OPEN", "UNDER_REVIEW"])
      .select("id")
      .single();
    if (error)
      return apiErrorResponse("CONFLICT", "La disputa ya está cerrada", 409);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse("INTERNAL_ERROR", "No se pudo responder", 500, e);
  }
}
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok)
    return apiErrorResponse(auth.code, "Admin access required", auth.status);
  try {
    const { id } = await params;
    const b = await req.json();
    if (
      !["refund", "release"].includes(b.decision) ||
      typeof b.resolution !== "string" ||
      b.resolution.trim().length < 3 ||
      b.resolution.length > 4000
    )
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Indica decisión y motivo",
        400,
      );
    await resolveDispute(id, b.decision, b.resolution.trim(), auth.value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(
      "CONFLICT",
      e instanceof Error ? e.message : "No se pudo resolver",
      409,
    );
  }
}
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const a = await access(req, id);
    if (!a) return apiErrorResponse("NOT_FOUND", "Disputa no encontrada", 404);
    if (
      a.audience === "admin" ||
      !["OPEN", "UNDER_REVIEW"].includes(a.dispute.status)
    )
      return apiErrorResponse(
        "CONFLICT",
        "La disputa no admite evidencias",
        409,
      );
    const form = await req.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "application/pdf"].includes(file.type)
    )
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Sube una imagen JPG/PNG o PDF de hasta 5 MB",
        400,
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    const signature =
      file.type === "application/pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : file.type === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!signature)
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "El archivo no corresponde a su formato",
        400,
      );
    const db = getSupabaseAdmin();
    const { count, error: ce } = await db
      .from("dispute_evidence")
      .select("id", { count: "exact", head: true })
      .eq("dispute_id", id);
    if (ce) throw ce;
    if ((count ?? 0) >= 10)
      return apiErrorResponse("CONFLICT", "Máximo 10 evidencias", 409);
    const path = `${id}/${crypto.randomUUID()}`;
    const { error: e } = await db.storage
      .from("dispute-evidence")
      .upload(path, bytes, { contentType: file.type });
    if (e) throw e;
    const { error: save } = await db
      .from("dispute_evidence")
      .insert({
        dispute_id: id,
        audience: a.audience,
        storage_path: path,
        filename: file.name.slice(0, 120),
      });
    if (save) {
      await db.storage.from("dispute-evidence").remove([path]);
      throw save;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No se pudo guardar la evidencia",
      500,
      e,
    );
  }
}
