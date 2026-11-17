-- Durable dispatch claims have no automatic lease expiry: a carrier timeout
-- is ambiguous and must never trigger a second purchase. Only service_role
-- can read provider responses/PDFs or perform these operations.
CREATE TABLE public.shipment_dispatch_attempts (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 owner_token uuid NOT NULL,
 provider text NOT NULL CHECK (provider IN ('FEDEX','DHL','UBER','MOCK')),
 service_code text NOT NULL,
 status text NOT NULL DEFAULT 'CLAIMED' CHECK (status IN ('CLAIMED','CREATED')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status <> 'CREATED' OR (result->>'success')::boolean IS TRUE)
);
ALTER TABLE public.shipment_dispatch_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipment_dispatch_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.shipment_dispatch_attempts TO service_role;
CREATE FUNCTION public.claim_shipment_dispatch(p_order_id uuid,p_seller_id uuid,p_owner uuid,p_provider text,p_service text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE o public.orders; a public.shipment_dispatch_attempts;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND seller_id=p_seller_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'SUCCEEDED' OR o.status NOT IN ('PAID','READY_TO_SHIP') OR o.delivery_method<>'shipping' THEN
   RAISE EXCEPTION 'Order cannot be dispatched';
 END IF;
 IF p_owner IS NULL OR p_service IS NULL OR length(p_service) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid dispatch'; END IF;
 INSERT INTO public.shipment_dispatch_attempts(order_id,owner_token,provider,service_code)
 VALUES(o.id,p_owner,p_provider,p_service) ON CONFLICT(order_id) DO NOTHING;
 SELECT * INTO a FROM public.shipment_dispatch_attempts WHERE order_id=o.id;
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.claim_shipment_dispatch(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shipment_dispatch(uuid,uuid,uuid,text,text) TO service_role;

-- Shared counters across server processes; no plaintext IP addresses stored.
CREATE TABLE public.public_request_limits (
 key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX public_request_limits_expiry ON public.public_request_limits(expires_at);
ALTER TABLE public.public_request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_request_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.public_request_limits TO service_role;
CREATE FUNCTION public.consume_public_request_limit(p_scope text,p_identity text,p_limit integer,p_window_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE k text; n integer; cap integer; allowed boolean:=true; expiry timestamptz;
BEGIN
 IF p_scope NOT IN ('checkout','catalog_checkout','quote','catalog_quote','verify') OR p_identity !~ '^[0-9a-f]{64}$' OR
   p_limit NOT BETWEEN 1 AND 60 OR p_window_seconds NOT BETWEEN 10 AND 3600 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
 expiry:=to_timestamp((floor(extract(epoch from clock_timestamp())/p_window_seconds)+1)*p_window_seconds);
 -- Always lock the global counter first, then the identity counter.
 FOREACH k IN ARRAY ARRAY[p_scope||':global',p_scope||':'||p_identity] LOOP
   cap:=CASE WHEN k=p_scope||':global' THEN p_limit*50 ELSE p_limit END;
   INSERT INTO public.public_request_limits(key,hits,expires_at) VALUES(k,1,expiry)
   ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN public_request_limits.expires_at<=clock_timestamp() THEN 1 ELSE public_request_limits.hits+1 END,
     expires_at=expiry RETURNING hits INTO n;
   IF n>cap THEN allowed:=false; END IF;
 END LOOP;
 IF random()<0.01 THEN DELETE FROM public.public_request_limits WHERE expires_at<now()-interval '1 day'; END IF;
 RETURN jsonb_build_object('allowed',allowed,'retry_after',greatest(1,ceil(extract(epoch from expiry-clock_timestamp()))::integer));
END $$;
REVOKE ALL ON FUNCTION public.consume_public_request_limit(text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_request_limit(text,text,integer,integer) TO service_role;
