-- One-time, administrator-only bridge for scripts/provision-operations-vault.cjs.
-- Install, run the script, then DROP this function. Never leave it as an app API.
BEGIN;
CREATE OR REPLACE FUNCTION public.routeflow_provision_preview_operations(p_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE secret_id uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RAISE EXCEPTION 'Invalid operations secret';
  END IF;
  SELECT id INTO secret_id FROM vault.secrets WHERE name = 'routeflow_operations_secret';
  IF secret_id IS NULL THEN
    PERFORM vault.create_secret(p_secret, 'routeflow_operations_secret', 'RouteFlow Preview operations bearer');
  ELSE
    PERFORM vault.update_secret(secret_id, p_secret);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.routeflow_provision_preview_operations(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.routeflow_provision_preview_operations(text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
-- After provisioning: DROP FUNCTION public.routeflow_provision_preview_operations(text);
