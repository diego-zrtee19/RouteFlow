ALTER TABLE public.orders ADD COLUMN refunded_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN legacy_refunded_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN pre_refund_status public.order_status;
UPDATE public.orders SET refunded_amount=amount,legacy_refunded_amount=amount WHERE payment_status='REFUNDED';
ALTER TABLE public.orders ADD COLUMN stock_reservation_confirmed boolean NOT NULL DEFAULT false;
UPDATE public.orders SET stock_reservation_confirmed=true WHERE reservation_expires_at IS NOT NULL;
ALTER TABLE public.orders ALTER COLUMN stock_reservation_confirmed SET DEFAULT true;
CREATE TABLE public.refund_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 request_key text NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>0),currency text NOT NULL,
 status text NOT NULL DEFAULT 'PROCESSING' CHECK(status IN ('PROCESSING','PENDING','SUCCEEDED','FAILED')),
 provider_refund_id text UNIQUE,lease_until timestamptz,lease_token uuid,last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(order_id,request_key)
);
ALTER TABLE public.refunds ADD COLUMN refund_request_id uuid UNIQUE REFERENCES public.refund_requests(id) ON DELETE CASCADE;
CREATE TABLE public.operational_alerts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dedupe_key text NOT NULL UNIQUE,kind text NOT NULL,
 seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
 message text NOT NULL,status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')),
 created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz
);
CREATE TABLE public.operation_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text NOT NULL CHECK(status IN ('SUCCEEDED','FAILED')),summary jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refund_requests,public.operational_alerts,public.operation_runs FROM anon,authenticated;
GRANT ALL ON public.refund_requests,public.operational_alerts,public.operation_runs TO service_role;
CREATE INDEX refund_requests_order_idx ON public.refund_requests(order_id);
CREATE INDEX refund_requests_recovery_idx ON public.refund_requests(lease_until) WHERE status IN ('PROCESSING','PENDING');
CREATE INDEX operational_alerts_seller_idx ON public.operational_alerts(seller_id,status);
CREATE INDEX operational_alerts_order_idx ON public.operational_alerts(order_id);
CREATE INDEX operation_runs_created_idx ON public.operation_runs(created_at DESC);
CREATE INDEX shipping_quotes_product_idx ON public.shipping_quotes(product_id);
CREATE INDEX dispute_evidence_dispute_idx ON public.dispute_evidence(dispute_id);

CREATE FUNCTION public.claim_refund_request(p_order_id uuid,p_request_key text,p_amount_minor bigint,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders; r public.refund_requests; value bigint;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found';END IF;
 SELECT * INTO r FROM public.refund_requests WHERE order_id=o.id AND request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
  IF p_amount_minor IS NOT NULL AND p_amount_minor<>r.amount_minor THEN RAISE EXCEPTION 'Idempotency key amount mismatch';END IF;
  IF r.status='SUCCEEDED' THEN RETURN to_jsonb(r)||jsonb_build_object('already_refunded',true);END IF;
  IF r.status='FAILED' THEN RAISE EXCEPTION 'Refund failed: use a new request after reviewing the failure';END IF;
  IF r.lease_until>now() THEN RETURN to_jsonb(r)||jsonb_build_object('busy',true);END IF;
 ELSE
  IF o.payment_status<>'SUCCEEDED' THEN RAISE EXCEPTION 'Order is not paid';END IF;
  value:=coalesce(p_amount_minor,round((o.amount-o.refunded_amount)*100)::bigint);
  IF value<=0 OR value>round((o.amount-o.refunded_amount)*100) THEN RAISE EXCEPTION 'Amount exceeds remaining payment';END IF;
  IF EXISTS(SELECT 1 FROM public.refund_requests WHERE order_id=o.id AND status IN ('PROCESSING','PENDING')) THEN RAISE EXCEPTION 'Another refund is in progress';END IF;
  INSERT INTO public.refund_requests(order_id,request_key,amount_minor,currency) VALUES(o.id,p_request_key,value,o.currency) RETURNING * INTO r;
 END IF;
 IF o.settlement_status='PROCESSING' THEN RAISE EXCEPTION 'Settlement in progress';END IF;
 UPDATE public.orders SET refund_started_at=coalesce(refund_started_at,now()),pre_refund_status=coalesce(pre_refund_status,status) WHERE id=o.id;
 UPDATE public.refund_requests SET lease_until=now()+interval '5 minutes',lease_token=p_lease_token,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r)||jsonb_build_object('already_refunded',false);
END $$;
CREATE FUNCTION public.finish_refund_request(p_request_id uuid,p_refund_id text,p_status text,p_amount_minor bigint,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.refund_requests; o public.orders; total numeric; payment uuid; was_success boolean; contact text;
BEGIN
 SELECT * INTO r FROM public.refund_requests WHERE id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refund request not found';END IF;
 SELECT * INTO o FROM public.orders WHERE id=r.order_id FOR UPDATE;
 SELECT * INTO r FROM public.refund_requests WHERE id=p_request_id FOR UPDATE;
 IF p_status NOT IN ('SUCCEEDED','PENDING','FAILED') OR p_amount_minor<>r.amount_minor OR upper(p_currency)<>upper(r.currency) THEN RAISE EXCEPTION 'Refund details mismatch';END IF;
 IF r.provider_refund_id IS NOT NULL AND r.provider_refund_id<>p_refund_id THEN RAISE EXCEPTION 'Refund identifier mismatch';END IF;
 was_success:=r.status='SUCCEEDED';
 IF was_success AND p_status<>'FAILED' THEN RETURN jsonb_build_object('refunded_amount',o.refunded_amount,'already_refunded',true);END IF;
 UPDATE public.refund_requests SET status=p_status,provider_refund_id=p_refund_id,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=r.id;
 IF p_refund_id IS NOT NULL THEN
 SELECT id INTO payment FROM public.payments WHERE order_id=o.id AND payment_intent_id IS NOT NULL ORDER BY created_at LIMIT 1;
 IF payment IS NULL THEN RAISE EXCEPTION 'Payment binding missing';END IF;
 INSERT INTO public.refunds(order_id,payment_id,provider_refund_id,amount,currency,status,refund_request_id)
 VALUES(o.id,payment,p_refund_id,r.amount_minor/100.0,r.currency,CASE p_status WHEN 'SUCCEEDED' THEN 'SUCCEEDED'::public.refund_status WHEN 'FAILED' THEN 'FAILED'::public.refund_status ELSE 'PROCESSING'::public.refund_status END,r.id)
 ON CONFLICT(provider_refund_id) DO UPDATE SET status=EXCLUDED.status,updated_at=now();
 END IF;
 SELECT o.legacy_refunded_amount+coalesce(sum(amount_minor),0)/100.0 INTO total FROM public.refund_requests WHERE order_id=o.id AND status='SUCCEEDED';
 IF total>o.amount THEN RAISE EXCEPTION 'Refund total exceeds order';END IF;
 UPDATE public.orders SET refunded_amount=total,
 status=CASE WHEN total>=amount THEN 'REFUNDED'::public.order_status WHEN status='REFUNDED' THEN coalesce(pre_refund_status,'PAID'::public.order_status) ELSE status END,
 payment_status=CASE WHEN total>=amount THEN 'REFUNDED'::public.payment_status ELSE 'SUCCEEDED'::public.payment_status END,
 refund_started_at=CASE WHEN p_status='PENDING' OR (p_status='FAILED' AND p_refund_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.disputes WHERE order_id=o.id AND resolution_pending='refund') THEN refund_started_at ELSE NULL END
 WHERE id=o.id;
 UPDATE public.payments SET status=CASE WHEN total>=o.amount THEN 'REFUNDED'::public.payment_status ELSE 'SUCCEEDED'::public.payment_status END WHERE id=payment;
 IF p_status='SUCCEEDED' AND NOT was_success THEN
 INSERT INTO public.events(type,order_id,seller_id,amount,currency,metadata) VALUES('REFUND_CREATED',o.id,o.seller_id,r.amount_minor/100.0,r.currency,jsonb_build_object('refund_id',p_refund_id,'refund_request_id',r.id));
 SELECT contact_email INTO contact FROM public.sellers WHERE id=o.seller_id;
 INSERT INTO public.notification_outbox(order_id,seller_id,audience,kind,recipient,subject,body) VALUES
 (o.id,o.seller_id,'buyer','REFUND_'||r.id,o.buyer_email,'Reembolso · '||o.order_number,'Reembolso confirmado de '||(r.amount_minor/100.0)||' '||r.currency||'. Acumulado: '||total),
 (o.id,o.seller_id,'seller','REFUND_'||r.id,contact,'Reembolso · '||o.order_number,'Reembolso confirmado de '||(r.amount_minor/100.0)||' '||r.currency||'. Acumulado: '||total)
 ON CONFLICT(order_id,audience,kind) DO NOTHING;
 END IF;
 IF p_status='FAILED' THEN
 INSERT INTO public.operational_alerts(dedupe_key,kind,seller_id,order_id,message) VALUES('refund:'||r.id,'REFUND_FAILED',o.seller_id,o.id,'Un reembolso falló; revisa el pago en Stripe antes de reintentar.') ON CONFLICT(dedupe_key) DO UPDATE SET status='OPEN',last_seen_at=now(),resolved_at=NULL;
 END IF;
 RETURN jsonb_build_object('refunded_amount',total,'already_refunded',false);
END $$;
CREATE OR REPLACE FUNCTION public.claim_settlement(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders; s public.sellers;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'SUCCEEDED' OR o.status<>'COMPLETED' OR o.transfer_id IS NOT NULL OR o.refund_started_at IS NOT NULL THEN RETURN NULL;END IF;
 IF o.settlement_status='PROCESSING' AND o.settlement_started_at>now()-interval '5 minutes' THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM public.disputes WHERE order_id=o.id AND status IN ('OPEN','UNDER_REVIEW')) THEN RETURN NULL;END IF;
 SELECT * INTO s FROM public.sellers WHERE id=o.seller_id;
 IF s.stripe_account_id IS NULL OR NOT s.stripe_transfers_enabled OR NOT s.stripe_payouts_enabled THEN RETURN NULL;END IF;
 UPDATE public.orders SET settlement_status='PROCESSING',settlement_started_at=now(),settlement_error=NULL WHERE id=o.id;
 RETURN jsonb_build_object('order_id',o.id,'account_id',s.stripe_account_id,'amount',round((o.amount-o.platform_fee)*(1-o.refunded_amount/o.amount),2),'currency',o.currency);
END $$;
CREATE FUNCTION public.queue_overdue_disputes() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 INSERT INTO public.operational_alerts(dedupe_key,kind,seller_id,order_id,message)
 SELECT 'dispute:'||d.id,'DISPUTE_OVERDUE',o.seller_id,o.id,'El plazo de respuesta de una disputa venció. Se requiere revisión administrativa.' FROM public.disputes d JOIN public.orders o ON o.id=d.order_id WHERE d.status IN ('OPEN','UNDER_REVIEW') AND d.response_due_at<now()
 ON CONFLICT(dedupe_key) DO UPDATE SET last_seen_at=now();GET DIAGNOSTICS changed=ROW_COUNT;
 INSERT INTO public.notification_outbox(order_id,seller_id,audience,kind,recipient,subject,body)
 SELECT o.id,o.seller_id,'seller','DISPUTE_OVERDUE',s.contact_email,'Disputa vencida · '||o.order_number,'El plazo de respuesta venció. Abre Disputas para agregar tu respuesta y evidencias.' FROM public.disputes d JOIN public.orders o ON o.id=d.order_id JOIN public.sellers s ON s.id=o.seller_id WHERE d.status IN ('OPEN','UNDER_REVIEW') AND d.response_due_at<now()
 ON CONFLICT(order_id,audience,kind) DO NOTHING;
 UPDATE public.operational_alerts a SET status='RESOLVED',resolved_at=now() FROM public.disputes d WHERE a.dedupe_key='dispute:'||d.id AND d.status IN ('RESOLVED','CLOSED') AND a.status='OPEN';
 RETURN changed;
END $$;
CREATE FUNCTION public.cancel_legacy_reservation(p_order_id uuid,p_seller_id uuid,p_restore_stock boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND seller_id=p_seller_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status IN ('SUCCEEDED','REFUNDED') THEN RAISE EXCEPTION 'Unpaid order required';END IF;
 IF o.stock_released_at IS NOT NULL THEN RETURN false;END IF;
 IF p_restore_stock THEN UPDATE public.products p SET stock=p.stock+x.quantity FROM (SELECT product_id,sum(quantity)::integer quantity FROM public.order_items WHERE order_id=o.id GROUP BY product_id)x WHERE p.id=x.product_id;END IF;
 UPDATE public.orders SET status='CANCELLED',payment_status='FAILED',stock_released_at=now(),cancelled_at=now() WHERE id=o.id;
 INSERT INTO public.events(type,order_id,seller_id,metadata) VALUES('ORDER_CANCELLED',o.id,o.seller_id,jsonb_build_object('reason','legacy_reservation_review','restore_stock',p_restore_stock));
 UPDATE public.operational_alerts SET status='RESOLVED',resolved_at=now() WHERE order_id=o.id AND kind LIKE 'LEGACY_%';
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_refund_request(uuid,text,bigint,uuid),public.finish_refund_request(uuid,text,text,bigint,text),public.queue_overdue_disputes(),public.cancel_legacy_reservation(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_refund_request(uuid,text,bigint,uuid),public.finish_refund_request(uuid,text,text,bigint,text),public.queue_overdue_disputes(),public.cancel_legacy_reservation(uuid,uuid,boolean) TO service_role;
