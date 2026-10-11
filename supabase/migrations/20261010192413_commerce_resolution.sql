ALTER TABLE public.orders ADD COLUMN refund_started_at timestamptz;
CREATE FUNCTION public.begin_order_refund(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'SUCCEEDED' THEN RAISE EXCEPTION 'Order is not paid'; END IF;
 IF o.settlement_status='PROCESSING' THEN RAISE EXCEPTION 'Settlement in progress'; END IF;
 UPDATE public.orders SET refund_started_at=coalesce(refund_started_at,now()) WHERE id=o.id;
 RETURN jsonb_build_object('transfer_id',o.transfer_id,'settlement_status',o.settlement_status);
END $$;
CREATE FUNCTION public.resolve_order_dispute(p_dispute_id uuid,p_resolution text,p_admin_id text,p_refund boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.disputes; o public.orders;
BEGIN
 -- Lock order before dispute, matching the settlement and buyer-dispute lock order.
 SELECT * INTO d FROM public.disputes WHERE id=p_dispute_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dispute not found'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=d.order_id FOR UPDATE;
 SELECT * INTO d FROM public.disputes WHERE id=p_dispute_id FOR UPDATE;
 IF d.status NOT IN ('OPEN','UNDER_REVIEW') THEN RETURN false; END IF;
 IF p_refund AND o.payment_status<>'REFUNDED' THEN RAISE EXCEPTION 'Refund not confirmed'; END IF;
 IF NOT p_refund AND (o.payment_status<>'SUCCEEDED' OR o.refund_started_at IS NOT NULL) THEN RAISE EXCEPTION 'Refund in progress'; END IF;
 UPDATE public.disputes SET status='RESOLVED',resolution=p_resolution,resolved_by=p_admin_id,updated_at=now() WHERE id=d.id;
 IF NOT p_refund THEN UPDATE public.orders SET status=coalesce(d.previous_order_status,'PAID'::public.order_status) WHERE id=o.id; END IF;
 RETURN true;
END $$;
-- Prevent a refund and settlement from racing after separate HTTP requests.
CREATE OR REPLACE FUNCTION public.claim_settlement(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders; s public.sellers;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'SUCCEEDED' OR o.status<>'COMPLETED' OR o.transfer_id IS NOT NULL OR o.refund_started_at IS NOT NULL THEN RETURN NULL; END IF;
 IF o.settlement_status='PROCESSING' AND o.settlement_started_at>now()-interval '5 minutes' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.disputes WHERE order_id=o.id AND status IN ('OPEN','UNDER_REVIEW')) THEN RETURN NULL; END IF;
 SELECT * INTO s FROM public.sellers WHERE id=o.seller_id;
 IF s.stripe_account_id IS NULL OR NOT s.stripe_transfers_enabled OR NOT s.stripe_payouts_enabled THEN RETURN NULL; END IF;
 UPDATE public.orders SET settlement_status='PROCESSING',settlement_started_at=now(),settlement_error=NULL WHERE id=o.id;
 RETURN jsonb_build_object('order_id',o.id,'account_id',s.stripe_account_id,'amount',o.amount-o.platform_fee,'currency',o.currency);
END $$;
REVOKE ALL ON FUNCTION public.begin_order_refund(uuid),public.resolve_order_dispute(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_order_refund(uuid),public.resolve_order_dispute(uuid,text,text,boolean) TO service_role;
