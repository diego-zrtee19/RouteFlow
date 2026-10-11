CREATE OR REPLACE FUNCTION public.finish_refund_request(p_request_id uuid,p_refund_id text,p_status text,p_amount_minor bigint,p_currency text)
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
 refund_started_at=CASE WHEN p_status='PENDING' OR (p_status='FAILED' AND p_refund_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.disputes WHERE order_id=o.id AND resolution_pending='refund') THEN coalesce(refund_started_at,now()) ELSE NULL END
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
CREATE OR REPLACE FUNCTION public.cancel_unpaid_purchase(p_order_id uuid,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status IN ('SUCCEEDED','REFUNDED') OR o.stock_released_at IS NOT NULL THEN RETURN false;END IF;
 IF NOT o.stock_reservation_confirmed THEN
 INSERT INTO public.operational_alerts(dedupe_key,kind,seller_id,order_id,message) VALUES('legacy:'||o.id,'LEGACY_INVENTORY_REVIEW',o.seller_id,o.id,'La sesión venció; confirma si se había descontado inventario antes de cancelar.') ON CONFLICT(dedupe_key) DO UPDATE SET kind=EXCLUDED.kind,message=EXCLUDED.message,status='OPEN',last_seen_at=now();
 RETURN false;
 END IF;
 UPDATE public.products p SET stock=p.stock+x.quantity FROM (SELECT product_id,sum(quantity)::integer quantity FROM public.order_items WHERE order_id=o.id GROUP BY product_id)x WHERE p.id=x.product_id;
 UPDATE public.orders SET status='CANCELLED',payment_status='FAILED',cancelled_at=now(),stock_released_at=now() WHERE id=o.id;
 INSERT INTO public.events(type,order_id,seller_id,metadata) VALUES('ORDER_CANCELLED',o.id,o.seller_id,jsonb_build_object('reason',p_reason));RETURN true;
END $$;
