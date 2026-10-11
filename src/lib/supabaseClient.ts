import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_ENV_VARS,
  checkSupabaseKey,
  checkSupabaseUrl,
} from "@/lib/supabaseEnv";

/**
 * Browser/anon Supabase client.
 *
 * NOTE: this client only exposes the anon key, so it is bound by RLS. The V3
 * schema grants the anon role read access only to what a storefront genuinely
 * needs; `orders`, `payments` and `disputes` are deny-all. Any seller mutation
 * must go through an API route backed by the service role (see
 * `lib/supabaseAdmin.ts`), never straight from the browser.
 *
 * The instance is created lazily. `createClient("", "")` throws on import, which
 * turns a missing variable into a blank-screen module-load crash for every page
 * that transitively imports this file — including pages that never call Supabase.
 */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const urlCheck = checkSupabaseUrl(process.env[SUPABASE_ENV_VARS.url]);
  if (!urlCheck.ok) {
    throw new Error(`Supabase no disponible: ${urlCheck.error}`);
  }

  const keyCheck = checkSupabaseKey(
    process.env[SUPABASE_ENV_VARS.anonKey],
    SUPABASE_ENV_VARS.anonKey
  );
  if (!keyCheck.ok) {
    throw new Error(`Supabase no disponible: ${keyCheck.error}`);
  }

  browserClient = createClient(urlCheck.preview as string, process.env[SUPABASE_ENV_VARS.anonKey] as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  return browserClient;
}

/**
 * Backwards-compatible accessor.
 *
 * Kept as a lazy proxy so existing `import { supabase } from ...` call sites keep
 * working without forcing client construction at module-evaluation time.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const real = getSupabaseBrowserClient() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
