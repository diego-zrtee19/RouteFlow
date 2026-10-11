import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * ADMIN DATA — server-only.
 *
 * The audit found `AdminConsole.tsx` was a client component importing the whole
 * data store, which shipped every seller's orders (with buyer email, phone and
 * address) into the browser bundle. Counts are now aggregated in SQL and the
 * client receives only numbers.
 */

export interface AdminStats {
  activeSellers: number;
  totalProducts: number;
  totalOrders: number;
  openDisputes: number;
}

export interface IntegrationStates {
  DHL: string;
  FEDEX: string;
  UBER: string;
}

/**
 * Integration states, derived from configuration only.
 *
 * These are honest labels, not live health checks: a configured credential is
 * `CONFIGURED`, never `CONNECTED`, because we have not called the carrier.
 * The audit flagged documentation that claimed carriers were "connected" on the
 * strength of environment variables alone.
 */
export function canRenderIntegrationStatus(): IntegrationStates {
  const state = (configured: boolean) => (configured ? "CONFIGURED" : "NOT_CONFIGURED");

  return {
    DHL: state(Boolean(process.env.DHL_API_KEY && process.env.DHL_API_SECRET)),
    FEDEX: state(Boolean(process.env.FEDEX_CLIENT_ID && process.env.FEDEX_CLIENT_SECRET)),
    UBER: state(Boolean(process.env.UBER_CLIENT_ID && process.env.UBER_CLIENT_SECRET)),
  };
}

/** Aggregate counts across the platform. No buyer PII leaves the server. */
export async function getAdminDashboardData(): Promise<{ stats: AdminStats }> {
  const admin = getSupabaseAdmin();

  // head:true with count:"exact" makes PostgREST return a count without rows.
  const [sellers, products, orders, disputes] = await Promise.all([
    admin.from("sellers").select("id", { count: "exact", head: true }),
    admin.from("products").select("id", { count: "exact", head: true }),
    admin.from("orders").select("id", { count: "exact", head: true }),
    admin.from("disputes").select("id", { count: "exact", head: true }),
  ]);

  return {
    stats: {
      activeSellers: sellers.count ?? 0,
      totalProducts: products.count ?? 0,
      totalOrders: orders.count ?? 0,
      openDisputes: disputes.count ?? 0,
    },
  };
}