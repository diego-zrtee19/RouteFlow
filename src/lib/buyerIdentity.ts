import { currentUser } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { rowToOrder } from "@/repositories/orderRepository";

export function verifiedBuyerEmails(user: { emailAddresses: { emailAddress: string; verification?: { status: string } | null }[] } | null): string[] {
  return [...new Set((user?.emailAddresses ?? []).filter(email => email.verification?.status === "verified").map(email => email.emailAddress.trim().toLowerCase()).filter(Boolean))];
}

export async function getVerifiedBuyerEmails(): Promise<string[]> {
  try { return verifiedBuyerEmails(await currentUser()); } catch { return []; }
}

// Escape LIKE metacharacters: an address containing _ or % is never a wildcard.
export function exactEmailPattern(email: string): string {
  return email.replace(/[\\%_]/g, "\\$&");
}

export function buyerEmailFilter(emails: string[]): string {
  return emails.map(email => `buyer_email.ilike."${exactEmailPattern(email).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
}

export function sameOriginBuyerAction(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin === new URL(req.url).origin;
}

export async function findOrderForBuyerIdentity(id: string) {
  const emails = await getVerifiedBuyerEmails();
  for (const email of emails) {
    const { data, error } = await getSupabaseAdmin().from("orders").select("*, order_items(*)").eq("id", id).ilike("buyer_email", exactEmailPattern(email)).maybeSingle();
    if (error) throw new Error("No se pudo consultar el pedido");
    if (data) return rowToOrder(data);
  }
  return null;
}
