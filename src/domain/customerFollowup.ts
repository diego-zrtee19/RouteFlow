export type CustomerSummary = {
  email: string;
  name: string | null;
  order_count: number;
  last_order_at: string | null;
  note: string;
  followup_at: string | null;
  revision: number;
};
export type CustomerOrder = {
  id: string;
  order_number: string;
  buyer_name: string;
  amount: number;
  currency: string;
  status: string;
  payment_status: string;
  created_at: string;
};
export function parseCustomerFollowup(body: Record<string, unknown>) {
  if (
    typeof body.email !== "string" ||
    body.email.length > 254 ||
    !body.email.trim().includes("@") ||
    typeof body.note !== "string" ||
    body.note.length > 4000 ||
    body.note.includes("\0") ||
    !Number.isSafeInteger(body.revision) ||
    Number(body.revision) < 0 ||
    (body.followupAt !== null &&
      (typeof body.followupAt !== "string" || !Number.isFinite(Date.parse(body.followupAt))))
  )
    return null;
  return {
    email: body.email.trim().toLowerCase(),
    note: body.note,
    revision: Number(body.revision),
    followupAt: body.followupAt === null ? null : new Date(body.followupAt as string).toISOString(),
  };
}

export function parseProspect(body: Record<string, unknown>) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 200 ||
    body.name.includes("\0") ||
    typeof body.email !== "string" ||
    body.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
    body.email.includes("\0")
  )
    return null;
  return { name: body.name.trim(), email: body.email.trim().toLowerCase() };
}
