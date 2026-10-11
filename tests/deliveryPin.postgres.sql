BEGIN;
DO $$
DECLARE s uuid; o uuid; u uuid; pin text; result jsonb;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name)
 VALUES('pin_verify_'||gen_random_uuid(),'pin_verify_'||substr(gen_random_uuid()::text,1,8),'PIN Verification') RETURNING id INTO s;
 INSERT INTO public.orders(order_number,seller_id,buyer_name,buyer_email,buyer_phone,shipping_address,amount,status,payment_status,delivery_method,buyer_token_hash)
 VALUES('PIN-VERIFY-'||gen_random_uuid(),s,'Test','test@example.invalid','000','{}',100,'PAYMENT_PENDING','PENDING','meetup','test') RETURNING id INTO o;
 IF public.ensure_delivery_pin(o) IS NOT NULL THEN RAISE EXCEPTION 'unpaid PIN leak'; END IF;
 result:=public.complete_payment_and_mark_order_paid(o,'cs_pin_verify_'||o,'pi_pin_verify_'||o,100,'MXN',NULL);
 IF result->>'success'!='true' THEN RAISE EXCEPTION 'payment failed: %',result; END IF;
 pin:=public.ensure_delivery_pin(o);
 IF pin IS NULL OR pin!~'^[0-9]{6}$' THEN RAISE EXCEPTION 'missing PIN'; END IF;
 IF public.ensure_delivery_pin(o)!=pin THEN RAISE EXCEPTION 'PIN changed'; END IF;
 result:=public.complete_coordinated_delivery(o,gen_random_uuid(),pin);
 IF result->>'success'!='false' THEN RAISE EXCEPTION 'foreign seller accepted'; END IF;
 result:=public.complete_coordinated_delivery(o,s,CASE WHEN pin='000000' THEN '111111' ELSE '000000' END);
 IF result->>'error'!='INVALID_PIN' OR (SELECT status FROM public.orders WHERE id=o)!='PAID' THEN RAISE EXCEPTION 'wrong PIN completed'; END IF;
 result:=public.complete_coordinated_delivery(o,s,pin);
 IF result->>'success'!='true' OR (SELECT status FROM public.orders WHERE id=o)!='COMPLETED' THEN RAISE EXCEPTION 'correct PIN failed'; END IF;
 result:=public.complete_coordinated_delivery(o,s,pin);
 IF result->>'already_completed'!='true' OR (SELECT count(*) FROM public.events WHERE order_id=o AND type='ORDER_COMPLETED')!=1 THEN RAISE EXCEPTION 'duplicate completion'; END IF;
 IF public.ensure_delivery_pin(o) IS NOT NULL THEN RAISE EXCEPTION 'used PIN visible'; END IF;
 INSERT INTO public.orders(order_number,seller_id,buyer_name,buyer_email,buyer_phone,shipping_address,amount,status,payment_status,delivery_method,buyer_token_hash)
 VALUES('PIN-RATE-'||gen_random_uuid(),s,'Test','test@example.invalid','000','{}',100,'PAID','SUCCEEDED','local_delivery','test') RETURNING id INTO u;
 pin:=public.ensure_delivery_pin(u);
 FOR i IN 1..5 LOOP
 result:=public.complete_coordinated_delivery(u,s,CASE WHEN pin='000000' THEN '111111' ELSE '000000' END);
 END LOOP;
 result:=public.complete_coordinated_delivery(u,s,pin);
 IF result->>'error'!='PIN_LOCKED' THEN RAISE EXCEPTION 'bruteforce not limited'; END IF;
 IF has_function_privilege('anon','public.ensure_delivery_pin(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.complete_coordinated_delivery(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'public PIN access'; END IF;
END $$;
ROLLBACK;
