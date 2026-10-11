ALTER TABLE public.disputes ADD COLUMN resolution_pending text CHECK(resolution_pending IN ('refund','release'));
CREATE FUNCTION public.claim_dispute_resolution(p_dispute_id uuid,p_decision text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.disputes; o public.orders;
BEGIN
 IF p_decision NOT IN ('refund','release') THEN RAISE EXCEPTION 'Invalid resolution'; END IF;
 SELECT * INTO d FROM public.disputes WHERE id=p_dispute_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=d.order_id FOR UPDATE;
 SELECT * INTO d FROM public.disputes WHERE id=p_dispute_id FOR UPDATE;
 IF d.status NOT IN ('OPEN','UNDER_REVIEW') THEN RAISE EXCEPTION 'Dispute already resolved'; END IF;
 IF d.resolution_pending IS NOT NULL AND d.resolution_pending<>p_decision THEN RAISE EXCEPTION 'Another resolution is in progress'; END IF;
 IF o.settlement_status='PROCESSING' THEN RAISE EXCEPTION 'Settlement in progress'; END IF;
 UPDATE public.disputes SET resolution_pending=p_decision WHERE id=d.id;
 IF p_decision='refund' THEN UPDATE public.orders SET refund_started_at=coalesce(refund_started_at,now()) WHERE id=o.id; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.resolve_order_dispute(p_dispute_id uuid,p_resolution text,p_admin_id text,p_refund boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.disputes; o public.orders;
BEGIN
 SELECT * INTO d FROM public.disputes WHERE id=p_dispute_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=d.order_id FOR UPDATE;
 SELECT * INTO d FROM public.disputes WHERE id=p_dispute_id FOR UPDATE;
 IF d.status NOT IN ('OPEN','UNDER_REVIEW') THEN RETURN false; END IF;
 IF d.resolution_pending IS NOT NULL AND d.resolution_pending<>(CASE WHEN p_refund THEN 'refund' ELSE 'release' END) THEN RAISE EXCEPTION 'Another resolution is in progress'; END IF;
 IF p_refund AND o.payment_status<>'REFUNDED' THEN RAISE EXCEPTION 'Refund not confirmed'; END IF;
 IF NOT p_refund AND (o.payment_status<>'SUCCEEDED' OR o.refund_started_at IS NOT NULL) THEN RAISE EXCEPTION 'Refund in progress'; END IF;
 UPDATE public.disputes SET status='RESOLVED',resolution=p_resolution,resolved_by=p_admin_id,updated_at=now(),resolution_pending=NULL WHERE id=d.id;
 IF NOT p_refund THEN UPDATE public.orders SET status=coalesce(d.previous_order_status,'PAID'::public.order_status) WHERE id=o.id; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_dispute_resolution(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dispute_resolution(uuid,text) TO service_role;
