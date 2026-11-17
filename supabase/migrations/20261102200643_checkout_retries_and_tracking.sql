CREATE TABLE public.checkout_attempts (
 key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
 request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 kind text NOT NULL CHECK (kind IN ('quick','catalog')),
 order_id uuid UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
 stripe_request jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.checkout_attempts TO service_role;
CREATE FUNCTION public.reserve_checkout_attempt(p_key_hash text,p_request_hash text,p_kind text,p_order_number text,p_token_hash text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a public.checkout_attempts; result jsonb;
BEGIN
 INSERT INTO public.checkout_attempts(key_hash,request_hash,kind) VALUES(p_key_hash,p_request_hash,p_kind) ON CONFLICT(key_hash) DO NOTHING;
 SELECT * INTO a FROM public.checkout_attempts WHERE key_hash=p_key_hash FOR UPDATE;
 IF a.request_hash IS DISTINCT FROM p_request_hash OR a.kind IS DISTINCT FROM p_kind THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_MISMATCH'; END IF;
 IF a.order_id IS NOT NULL THEN
  RETURN (SELECT to_jsonb(o)||jsonb_build_object('order_items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.order_items i WHERE i.order_id=o.id),'[]'::jsonb)) FROM public.orders o WHERE o.id=a.order_id);
 END IF;
 IF p_kind='quick' THEN
  result:=public.reserve_purchase(p_input->>'publicId',p_order_number,p_token_hash,p_input->>'buyerName',p_input->>'buyerEmail',p_input->>'buyerPhone',p_input->'address',p_input->>'deliveryMethod',nullif(p_input->>'quoteId','')::uuid);
 ELSE
  result:=public.reserve_catalog_purchase(p_input->>'username',p_input->'items',p_order_number,p_token_hash,p_input->>'buyerName',p_input->>'buyerEmail',p_input->>'buyerPhone',p_input->'address',p_input->>'deliveryMethod',nullif(p_input->>'quoteId','')::uuid);
 END IF;
 IF result->>'id' IS NULL THEN RAISE EXCEPTION 'RESERVATION_FAILED'; END IF;
 UPDATE public.checkout_attempts SET order_id=(result->>'id')::uuid WHERE key_hash=a.key_hash;
 RETURN result;
END $$;
CREATE FUNCTION public.bind_checkout_stripe_request(p_key_hash text,p_request_hash text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a public.checkout_attempts;
BEGIN
 SELECT * INTO a FROM public.checkout_attempts WHERE key_hash=p_key_hash FOR UPDATE;
 IF NOT FOUND OR a.request_hash IS DISTINCT FROM p_request_hash OR a.order_id IS NULL THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_MISMATCH'; END IF;
 IF a.stripe_request IS NULL THEN
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR p_request->>'client_reference_id' IS DISTINCT FROM a.order_id::text THEN RAISE EXCEPTION 'CHECKOUT_ORDER_MISMATCH'; END IF;
  UPDATE public.checkout_attempts SET stripe_request=p_request WHERE key_hash=a.key_hash;
  RETURN p_request;
 END IF;
 RETURN a.stripe_request;
END $$;
REVOKE ALL ON FUNCTION public.reserve_checkout_attempt(text,text,text,text,text,jsonb),public.bind_checkout_stripe_request(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_attempt(text,text,text,text,text,jsonb),public.bind_checkout_stripe_request(text,text,jsonb) TO service_role;

ALTER TABLE public.shipments ADD COLUMN tracking_poll_owner uuid;
ALTER TABLE public.shipments ADD COLUMN tracking_poll_until timestamptz;
ALTER TABLE public.shipments ADD COLUMN tracking_polled_at timestamptz;
ALTER TABLE public.shipments ADD COLUMN next_tracking_poll_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.shipments ADD COLUMN tracking_poll_error text;
CREATE INDEX shipment_tracking_due ON public.shipments(next_tracking_poll_at,tracking_poll_until);
CREATE FUNCTION public.claim_tracking_refresh(p_owner uuid,p_limit integer DEFAULT 20)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_owner IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid tracking claim'; END IF;
 RETURN QUERY WITH due AS (
  SELECT s.id FROM public.shipments s JOIN public.orders o ON o.id=s.order_id
  WHERE o.status IN ('SHIPPED','IN_TRANSIT') AND o.payment_status='SUCCEEDED'
   AND s.status<>'CANCELLED' AND s.next_tracking_poll_at<=now() AND (s.tracking_poll_until IS NULL OR s.tracking_poll_until<now())
  ORDER BY s.next_tracking_poll_at FOR UPDATE OF s SKIP LOCKED LIMIT p_limit
 ), claimed AS (
  UPDATE public.shipments s SET tracking_poll_owner=p_owner,tracking_poll_until=now()+interval '2 minutes'
  FROM due WHERE s.id=due.id RETURNING s.*
 ) SELECT to_jsonb(claimed) FROM claimed;
END $$;
REVOKE ALL ON FUNCTION public.claim_tracking_refresh(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tracking_refresh(uuid,integer) TO service_role;
