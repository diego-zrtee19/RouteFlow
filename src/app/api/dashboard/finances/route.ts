import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
import { readPublicJson, publicRequestError } from "@/lib/publicRequestGuard";
import {
  financeUuid,
  parseFinanceEntry,
  ledgerCsv,
  type FinanceEntry,
} from "@/domain/financeLedger";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  const params = new URL(request.url).searchParams;
  const month = params.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
    return apiErrorResponse("VALIDATION_ERROR", "Mes inválido", 400);
  const start = new Date(month + "-01T00:00:00Z");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  try {
    const db = getSupabaseAdmin();
    const [ledger, orders, balances] = await Promise.all([
      db
        .from("seller_finance_entries")
        .select(
          "id,order_id,kind,method,amount,currency,description,created_at,voided_at,void_reason",
        )
        .eq("seller_id", seller.value.id)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .limit(501),
      db
        .from("orders")
        .select("id,order_number,amount,currency,payment_status,status")
        .eq("seller_id", seller.value.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(101),
      db.rpc("seller_finance_balances", { p_seller: seller.value.id }),
    ]);
    if (ledger.error || orders.error || balances.error) throw Error("Read failed");
    const entries = (ledger.data ?? []).slice(0, 500) as FinanceEntry[];
    if (params.get("format") === "csv") {
      if ((ledger.data ?? []).length > 500)
        return apiErrorResponse(
          "VALIDATION_ERROR",
          "El mes supera 500 movimientos. Exportación completa pendiente; no se descargó un archivo parcial.",
          409,
        );
      return new Response(ledgerCsv(entries), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="routeflow-movimientos-${month}.csv"`,
        },
      });
    }
    return NextResponse.json(
      {
        entries,
        hasMore: (ledger.data ?? []).length > 500,
        orders: (orders.data ?? []).slice(0, 100).map((order) => {
          const balance = (
            (balances.data as {
              order_id: string;
              manual_received: number;
              manual_remaining: number;
              provider_conflict: boolean;
            }[]) ?? []
          ).find((row) => row.order_id === order.id);
          return {
            ...order,
            manualReceived: Number(balance?.manual_received ?? 0),
            manualRemaining: balance ? Number(balance.manual_remaining) : null,
            providerConflict: balance?.provider_conflict ?? false,
          };
        }),
        moreOrders: (orders.data ?? []).length > 100,
      },
      { headers },
    );
  } catch {
    return apiErrorResponse("INTERNAL_ERROR", "No pudimos cargar los movimientos", 500);
  }
}
export async function POST(request: Request) {
  const seller = await requireSeller();
  if (!seller.ok)
    return apiErrorResponse(seller.code, "Acceso de vendedor requerido", seller.status);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return apiErrorResponse("FORBIDDEN", "Solicitud no permitida", 403);
  let body;
  try {
    body = await readPublicJson(request);
  } catch (error) {
    return (
      publicRequestError(error) ?? apiErrorResponse("VALIDATION_ERROR", "Datos inválidos", 400)
    );
  }
  try {
    const db = getSupabaseAdmin();
    if (body.action === "void") {
      if (
        typeof body.id !== "string" ||
        !financeUuid.test(body.id) ||
        typeof body.reason !== "string" ||
        body.reason.trim().length < 3 ||
        body.reason.length > 500
      )
        return apiErrorResponse(
          "VALIDATION_ERROR",
          "Indica el movimiento y el motivo de corrección",
          400,
        );
      const { data, error } = await db
        .from("seller_finance_entries")
        .update({ voided_at: new Date().toISOString(), void_reason: body.reason.trim() })
        .eq("id", body.id)
        .eq("seller_id", seller.value.id)
        .is("voided_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return apiErrorResponse("CONFLICT", "Movimiento no disponible o ya anulado", 409);
      return NextResponse.json({ voided: true }, { headers });
    }
    const entry = parseFinanceEntry(body);
    if (!entry)
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "Revisa importe, moneda, pedido y descripción",
        400,
      );
    const { data, error } = await db.rpc("record_seller_finance_entry", {
      p_seller: seller.value.id,
      p_actor: seller.value.userId,
      p_client: entry.clientId,
      p_order: entry.orderId,
      p_kind: entry.kind,
      p_method: entry.method,
      p_amount: entry.amount,
      p_currency: entry.currency,
      p_description: entry.description,
    });
    if (error)
      return apiErrorResponse(
        "CONFLICT",
        "No se registró: revisa el saldo pendiente, moneda y estado del pedido. No cambies los datos de un intento anterior; prepara otro registro.",
        409,
      );
    return NextResponse.json({ id: data }, { headers });
  } catch {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No pudimos guardar. Conserva el borrador y reintenta.",
      500,
    );
  }
}
