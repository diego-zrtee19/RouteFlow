import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { isStripeConfigured, isStripeWebhookConfigured, isStripeTestMode } from "@/lib/stripe";
import AdminConsole from "./AdminConsole";
import { getAdminDashboardData } from "./adminData";
import { canRenderIntegrationStatus } from "./adminData";

export const dynamic = "force-dynamic";

/**
 * Server component: the admin console.
 *
 * SECURITY: the audit found `/admin` listed in the middleware's PUBLIC routes,
 * so any signed-in Clerk user could open it and read every seller's orders,
 * including buyer email, phone and address.
 *
 * Authorization is now enforced server-side with `requireAdmin()`, which checks
 * the ADMIN_USER_IDS allowlist and Clerk `publicMetadata.role`. This is a server
 * component, so the check cannot be bypassed by navigating directly; the route
 * never renders for a non-admin.
 *
 * Only booleans cross to the client: secrets are never serialised into the RSC
 * payload or the browser bundle.
 */
export default async function AdminConsolePage() {
  const admin = await requireAdmin();

  if (!admin.ok) {
    // Not a redirect to /sign-in: the user IS authenticated, they just lack
    // the role. 403 semantics, expressed by refusing to render.
    redirect("/dashboard?error=forbidden_admin");
  }

  // Counts and per-seller aggregates only — no buyer PII in the admin payload.
  const data = await getAdminDashboardData();

  return (
    <AdminConsole
      stripe={{
        configured: isStripeConfigured(),
        webhookConfigured: isStripeWebhookConfigured(),
        testMode: isStripeTestMode(),
      }}
      stats={data.stats}
      integrationStates={canRenderIntegrationStatus()}
    />
  );
}

