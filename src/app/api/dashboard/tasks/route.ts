import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
import { readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import { parseTask } from "@/domain/sellerTasks";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const seller = await requireSeller();
  if (!seller.ok) return apiErrorResponse(seller.code, "Acceso requerido", seller.status);
  try {
    const db = getSupabaseAdmin();
    const columns = "id,title,detail,due_at,done,revision,updated_at";
    const [open, completed, activity] = await Promise.all([
      db
        .from("seller_tasks")
        .select(columns, { count: "exact" })
        .eq("seller_id", seller.value.id)
        .eq("done", false)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .order("id")
        .limit(50),
      db
        .from("seller_tasks")
        .select(columns)
        .eq("seller_id", seller.value.id)
        .eq("done", true)
        .order("updated_at", { ascending: false })
        .order("id")
        .limit(10),
      db
        .from("seller_task_activity")
        .select("id,task_id,action,revision,created_at")
        .eq("seller_id", seller.value.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(20),
    ]);
    if (open.error || completed.error || activity.error) throw Error("Task storage unavailable");
    return NextResponse.json(
      {
        tasks: open.data ?? [],
        completed: completed.data ?? [],
        openCount: open.count ?? 0,
        activity: activity.data ?? [],
      },
      { headers },
    );
  } catch {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No pudimos actualizar tus tareas. Intenta de nuevo.",
      500,
    );
  }
}
export async function POST(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok) return apiErrorResponse(seller.code, "Acceso requerido", seller.status);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return apiErrorResponse("FORBIDDEN", "Solicitud no permitida", 403);
  let body;
  try {
    body = parseTask(await readPublicJson(request));
  } catch (e) {
    return publicRequestError(e) ?? apiErrorResponse("VALIDATION_ERROR", "Datos inválidos", 400);
  }
  if (!body)
    return apiErrorResponse("VALIDATION_ERROR", "Revisa la tarea, su fecha y el intento", 400);
  try {
    const db = getSupabaseAdmin();
    if (body.action === "state") {
      const { data, error } = await db.rpc("set_seller_task_done", {
        p_seller: seller.value.id,
        p_actor: seller.value.userId,
        p_task: body.taskId,
        p_revision: body.revision,
        p_done: body.done,
      });
      if (error) throw error;
      if (data === null)
        return apiErrorResponse(
          "CONFLICT",
          "La tarea cambió o ya no está disponible. Actualiza antes de reintentar.",
          409,
        );
      return NextResponse.json({ revision: data }, { headers });
    }
    const { data, error } = await db.rpc("create_seller_task", {
      p_seller: seller.value.id,
      p_actor: seller.value.userId,
      p_client: body.clientId,
      p_title: body.title,
      p_detail: body.detail,
      p_due: body.dueAt,
    });
    if (error)
      return apiErrorResponse(
        "CONFLICT",
        "No se creó la tarea. Reintenta con los mismos datos o completa pendientes si llegaste a 500 tareas abiertas.",
        409,
      );
    return NextResponse.json(data, { headers });
  } catch {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No pudimos guardar el cambio. Actualiza antes de reintentar; conservamos tu borrador.",
      500,
    );
  }
}
