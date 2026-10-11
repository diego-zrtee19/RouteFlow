CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
CREATE TABLE IF NOT EXISTS private.order_delivery_codes (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 code text NOT NULL CHECK(code ~ '^[0-9]{6}$'),
 failed_attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 verified_at timestamptz
);
ALTER TABLE private.order_delivery_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.order_delivery_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.order_delivery_codes TO service_role;
CREATE OR REPLACE FUNCTION public.ensure_delivery_pin(p_order_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders; c text; b bytea;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status!='SUCCEEDED' OR o.delivery_method='shipping'
 OR o.status NOT IN ('PAID','READY_TO_SHIP') THEN RETURN NULL; END IF;
 SELECT code INTO c FROM private.order_delivery_codes WHERE order_id=p_order_id;
 IF c IS NULL THEN
  b:=extensions.gen_random_bytes(3);
  c:=lpad(((get_byte(b,0)*65536+get_byte(b,1)*256+get_byte(b,2))%1000000)::text,6,'0');
  INSERT INTO private.order_delivery_codes(order_id,code) VALUES(p_order_id,c);
 END IF;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.ensure_delivery_pin(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_delivery_pin(uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.generate_paid_delivery_pin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.ensure_delivery_pin(NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.generate_paid_delivery_pin() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS generate_paid_delivery_pin ON public.orders;
CREATE TRIGGER generate_paid_delivery_pin AFTER INSERT OR UPDATE OF payment_status ON public.orders
FOR EACH ROW WHEN (NEW.payment_status='SUCCEEDED' AND NEW.delivery_method!='shipping')
EXECUTE FUNCTION private.generate_paid_delivery_pin();
CREATE OR REPLACE FUNCTION public.complete_coordinated_delivery(p_order_id uuid,p_seller_id uuid,p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders; c private.order_delivery_codes;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND seller_id=p_seller_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','ORDER_NOT_FOUND'); END IF;
 IF o.delivery_method='shipping' OR o.payment_status!='SUCCEEDED' THEN
  RETURN jsonb_build_object('success',false,'error','INVALID_DELIVERY_STATE'); END IF;
 IF o.status='COMPLETED' THEN RETURN jsonb_build_object('success',true,'already_completed',true); END IF;
 IF o.status NOT IN ('PAID','READY_TO_SHIP') OR EXISTS(SELECT 1 FROM public.disputes WHERE order_id=p_order_id AND status NOT IN ('RESOLVED','CLOSED')) THEN
  RETURN jsonb_build_object('success',false,'error','INVALID_DELIVERY_STATE'); END IF;
 PERFORM public.ensure_delivery_pin(p_order_id);
 SELECT * INTO c FROM private.order_delivery_codes WHERE order_id=p_order_id FOR UPDATE;
 IF c.locked_until>now() THEN RETURN jsonb_build_object('success',false,'error','PIN_LOCKED'); END IF;
 IF c.locked_until IS NOT NULL THEN
  UPDATE private.order_delivery_codes SET failed_attempts=0,locked_until=NULL WHERE order_id=p_order_id;
  c.failed_attempts:=0;
 END IF;
 IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' OR p_pin!=c.code THEN
  UPDATE private.order_delivery_codes SET failed_attempts=c.failed_attempts+1,
    locked_until=CASE WHEN c.failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE NULL END
  WHERE order_id=p_order_id;
  RETURN jsonb_build_object('success',false,'error','INVALID_PIN');
 END IF;
 UPDATE public.orders SET status='COMPLETED',completed_at=now() WHERE id=p_order_id;
 UPDATE private.order_delivery_codes SET verified_at=now() WHERE order_id=p_order_id;
 INSERT INTO public.events(type,seller_id,order_id,metadata)
 VALUES('ORDER_COMPLETED',p_seller_id,p_order_id,jsonb_build_object('method','delivery_pin'));
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.complete_coordinated_delivery(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_coordinated_delivery(uuid,uuid,text) TO service_role;
INSERT INTO storage.buckets(id,name,public,allowed_mime_types)
VALUES('shipping-labels','shipping-labels',false,ARRAY['application/pdf'])
ON CONFLICT(id) DO NOTHING;
