BEGIN;
CREATE FUNCTION pg_temp.routeflow_verify_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.orders WHERE id=NEW.order_id AND order_number='RFV6-FAIL-VERIFY') THEN
 RAISE EXCEPTION 'RFV6_SIMULATED_FAILURE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER routeflow_verify_failure BEFORE INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION pg_temp.routeflow_verify_failure();
DO $$
DECLARE s uuid; o uuid; f uuid; r jsonb; c jsonb;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES ('rfv6_verify_'||gen_random_uuid(), 'rfv6_verify_'||substr(gen_random_uuid()::text,1,8), 'V6 Verification') RETURNING id INTO s;
 INSERT INTO public.orders(order_number,seller_id,buyer_name,buyer_email,buyer_phone,shipping_address,amount,status,buyer_token_hash)
 VALUES('RFV6-OK-VERIFY',s,'Test','test@example.invalid','000','{}',100,'PAYMENT_PENDING','test') RETURNING id INTO o;
 INSERT INTO public.payments(order_id,checkout_session_id,amount,currency,status) VALUES(o,'cs_test_rfv6_verify',100,'MXN','PENDING');
 r:=public.complete_payment_and_mark_order_paid(o,'cs_test_rfv6_verify', 'pi_test_rfv6_verify',100,'MXN',NULL);
 IF r->>'success'!='true' THEN RAISE EXCEPTION 'completion failed: %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE order_id=o AND payment_intent_id='pi_test_rfv6_verify' AND status='SUCCEEDED') THEN RAISE EXCEPTION 'payment intent missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=o AND status='PAID' AND payment_status='SUCCEEDED') THEN RAISE EXCEPTION 'order not updated'; END IF;
 r:=public.complete_payment_and_mark_order_paid(o,'cs_test_rfv6_verify','pi_test_rfv6_verify',100,'MXN',NULL);
 IF r->>'already_paid'!='true' OR (SELECT count(*) FROM public.payments WHERE order_id=o)!=1 OR (SELECT count(*) FROM public.events WHERE order_id=o AND type='PAYMENT_SUCCEEDED')!=1 THEN RAISE EXCEPTION 'duplicate side effects'; END IF;
 INSERT INTO public.orders(order_number,seller_id,buyer_name,buyer_email,buyer_phone,shipping_address,amount,status,buyer_token_hash)
 VALUES('RFV6-FAIL-VERIFY',s,'Test','test@example.invalid','000','{}',100,'PAYMENT_PENDING','test') RETURNING id INTO f;
 r:=public.complete_payment_and_mark_order_paid(f,'cs_test_rfv6_failure','pi_test_rfv6_failure',100,'MXN',NULL);
 IF r->>'success'!='false' OR r->>'error'!='RFV6_SIMULATED_FAILURE' THEN RAISE EXCEPTION 'failure not simulated: %',r; END IF;
 IF EXISTS(SELECT 1 FROM public.payments WHERE order_id=f) OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=f AND status='PAYMENT_PENDING' AND payment_status='PENDING') THEN RAISE EXCEPTION 'partial write after failure'; END IF;
 c:=public.claim_stripe_event('evt_rfv6_verify_recovery','verification','{}',300);
 IF c->>'outcome'!='claimed' THEN RAISE EXCEPTION 'claim failed'; END IF;
 r:=public.mark_webhook_event_failed('evt_rfv6_verify_recovery',1,'simulated failure');
 IF r->>'success'!='true' THEN RAISE EXCEPTION 'mark failed failed'; END IF;
 c:=public.claim_stripe_event('evt_rfv6_verify_recovery','verification','{}',300);
 IF c->>'outcome'!='reclaimed' OR c->>'attempt_count'!='2' THEN RAISE EXCEPTION 'recovery failed'; END IF;
 r:=public.mark_webhook_event_processed('evt_rfv6_verify_recovery',1);
 IF r->>'success'!='false' THEN RAISE EXCEPTION 'stale worker accepted'; END IF;
 r:=public.mark_webhook_event_processed('evt_rfv6_verify_recovery',2);
 IF r->>'success'!='true' THEN RAISE EXCEPTION 'processing failed'; END IF;
 c:=public.claim_stripe_event('evt_rfv6_verify_recovery','verification','{}',300);
 IF c->>'outcome'!='already_processed' THEN RAISE EXCEPTION 'duplicate accepted'; END IF;
END $$;
ROLLBACK;
