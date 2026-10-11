import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const auth = await requireSeller();
  if (!auth.ok) return apiErrorResponse(auth.code, "Seller access required", auth.status);
  if (Number(req.headers.get("content-length") || 0) > 4 * 1024 * 1024) return apiErrorResponse("VALIDATION_ERROR", "Foto demasiado grande", 413);
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || file.size > 3 * 1024 * 1024 || file.size === 0) return apiErrorResponse("VALIDATION_ERROR", "JPG, PNG o WebP de hasta 3 MB", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
    const type = png ? "image/png" : jpg ? "image/jpeg" : webp ? "image/webp" : "";
    if (!type || type !== file.type) return apiErrorResponse("VALIDATION_ERROR", "Formato de imagen no válido", 400);
    const storage = getSupabaseAdmin().storage;
    const bucket = "product-images";
    const { data: existing } = await storage.getBucket(bucket);
    if (!existing) {
      const { error } = await storage.createBucket(bucket, { public: true, fileSizeLimit: 3 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"] });
      if (error && !(await storage.getBucket(bucket)).data) throw error;
    }
    const path = `${auth.value.id}/${randomUUID()}.${png ? "png" : jpg ? "jpg" : "webp"}`;
    const { error } = await storage.from(bucket).upload(path, bytes, { contentType: type, upsert: false });
    if (error) throw error;
    return NextResponse.json({ url: storage.from(bucket).getPublicUrl(path).data.publicUrl });
  } catch (e) { return apiErrorResponse("INTERNAL_ERROR", "No se pudo subir la foto", 500, e); }
}
