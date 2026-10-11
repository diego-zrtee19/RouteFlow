import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_ENV_VARS,
  checkSupabaseKey,
  checkSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabaseEnv";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role Supabase client for server-side, privileged operations.
 *
 * The service role bypasses RLS, so every caller must already have
 * authenticated the user and checked ownership (see `lib/authz.ts`). It is never
 * bundled to the browser: `SUPABASE_SERVICE_ROLE_KEY` is not a `NEXT_PUBLIC_`
 * variable and Next.js only inlines `NEXT_PUBLIC_*` into client bundles.
 */
export function getSupabaseAdmin(): SupabaseClient {
  // Validate before reading the keys so the operator sees the specific problem
  // (bad project URL vs. missing key) instead of a generic throw.
  const urlCheck = checkSupabaseUrl(process.env[SUPABASE_ENV_VARS.url]);
  if (!urlCheck.ok) {
    throw new Error(
      `Supabase no disponible: ${urlCheck.error}. Copia el Project URL y el service_role key desde Supabase Dashboard > Project Settings > API.`
    );
  }

  const keyCheck = checkSupabaseKey(
    process.env[SUPABASE_ENV_VARS.serviceRoleKey],
    SUPABASE_ENV_VARS.serviceRoleKey
  );
  if (!keyCheck.ok) {
    throw new Error(
      `Supabase no disponible: ${keyCheck.error}. La variable ${SUPABASE_ENV_VARS.serviceRoleKey} es obligatoria para escrituras server-side (dashboard, pedidos, webhook de Stripe).`
    );
  }

  if (!adminClient) {
    adminClient = createClient(urlCheck.preview as string, process.env[SUPABASE_ENV_VARS.serviceRoleKey] as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return adminClient;
}

/**
 * Non-throwing availability check.
 *
 * Callers that treat Supabase as optional (for example the Stripe webhook
 * mirror) must use this so a missing key degrades gracefully instead of
 * aborting a payment event that already succeeded at Stripe.
 */
export function isSupabaseAdminAvailable(): boolean {
  return isSupabaseAdminConfigured();
}
