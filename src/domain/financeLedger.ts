export type FinanceEntry = {
  id: string;
  order_id: string | null;
  kind: "receipt" | "expense";
  method: "cash" | "transfer" | "expense";
  amount: number;
  currency: string;
  description: string;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};
export const financeUuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function parseFinanceEntry(body: Record<string, unknown>) {
  if (
    typeof body.clientId !== "string" ||
    !financeUuid.test(body.clientId) ||
    typeof body.kind !== "string" ||
    !["receipt", "expense"].includes(body.kind) ||
    typeof body.method !== "string" ||
    !["cash", "transfer", "expense"].includes(body.method) ||
    typeof body.amount !== "number" ||
    !Number.isFinite(body.amount) ||
    body.amount <= 0 ||
    body.amount > 999999999 ||
    Math.abs(body.amount * 100 - Math.round(body.amount * 100)) > 0.00001 ||
    typeof body.currency !== "string" ||
    !/^[A-Z]{3}$/.test(body.currency) ||
    typeof body.description !== "string" ||
    !body.description.trim() ||
    body.description.length > 500 ||
    body.description.includes("\0") ||
    (body.orderId !== null &&
      (typeof body.orderId !== "string" || !financeUuid.test(body.orderId))) ||
    (body.kind === "receipt" && (!body.orderId || body.method === "expense")) ||
    (body.kind === "expense" && body.method !== "expense")
  )
    return null;
  return {
    clientId: body.clientId,
    orderId: body.orderId as string | null,
    kind: body.kind as string,
    method: body.method as string,
    amount: body.amount,
    currency: body.currency,
    description: body.description.trim(),
  };
}
/** Neutralize spreadsheet formulas in untrusted labels; quote every field. */
export function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function ledgerCsv(entries: FinanceEntry[]) {
  return (
    "\ufeff" +
    [
      ["Fecha", "Tipo", "Método", "Importe", "Moneda", "Descripción", "Pedido", "Anulado"],
      ...entries.map((e) => [
        e.created_at,
        e.kind,
        e.method,
        e.amount,
        e.currency,
        e.description,
        e.order_id,
        e.voided_at ? "Sí" : "No",
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
