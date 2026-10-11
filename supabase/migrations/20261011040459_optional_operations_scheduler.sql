-- Optional hosting configuration. Installing this migration does not schedule work.
-- An administrator must provision this environment's URL and secret in Vault first.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS routeflow_operations;
REVOKE ALL ON SCHEMA routeflow_operations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION routeflow_operations.enqueue()
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE target_url text; bearer text; request_id bigint;
BEGIN
  SELECT decrypted_secret INTO target_url FROM vault.decrypted_secrets
    WHERE name = 'routeflow_operations_url';
  SELECT decrypted_secret INTO bearer FROM vault.decrypted_secrets
    WHERE name = 'routeflow_operations_secret';
  IF target_url IS NULL OR target_url !~ '^https://[^/]+/api/internal/operations$'
     OR bearer IS NULL OR length(bearer) < 32 THEN
    RAISE EXCEPTION 'Provision a valid HTTPS operations URL and secret in Vault';
  END IF;
  SELECT net.http_get(url := target_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || bearer),
    timeout_milliseconds := 120000) INTO request_id;
  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION routeflow_operations.enqueue() FROM PUBLIC, anon, authenticated, service_role;
