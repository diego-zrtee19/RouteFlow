-- Supabase may provision this event-trigger function when automatic RLS is enabled.
-- Event triggers still execute for administrators; it is not an application RPC.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$$;
