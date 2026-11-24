BEGIN;
DO $$
DECLARE seller_a uuid; seller_b uuid; purchase uuid; key uuid:=gen_random_uuid(); first_id uuid; second_id uuid;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('finance_'||gen_random_uuid(),'finance_'||replace(gen_random_uuid()::text,'-',''),'Finance fixture') RETURNING id INTO seller_a;
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('finance_'||gen_random_uuid(),'finance_'||replace(gen_random_uuid()::text,'-',''),'Other finance fixture') RETURNING id INTO seller_b;
 INSERT INTO public.orders(order_number,seller_id,buyer_name,buyer_email,buyer_phone,shipping_address,amount,buyer_token_hash)
 VALUES('FIN-'||gen_random_uuid(),seller_a,'Fixture','fixture@example.test','0000000000','{}',100,repeat('a',64)) RETURNING id INTO purchase;
 first_id:=public.record_seller_finance_entry(seller_a,'fixture',key,purchase,'receipt','cash',30,'MXN','Anticipo');
 second_id:=public.record_seller_finance_entry(seller_a,'fixture',key,purchase,'receipt','cash',30,'MXN','Anticipo');
 IF first_id<>second_id OR (SELECT count(*) FROM public.seller_finance_entries WHERE seller_id=seller_a)<>1 THEN RAISE EXCEPTION 'Duplicate receipt'; END IF;
 BEGIN
  PERFORM public.record_seller_finance_entry(seller_b,'fixture',gen_random_uuid(),purchase,'receipt','cash',10,'MXN','Not owner');
  RAISE EXCEPTION 'Cross-seller receipt';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Cross-seller receipt' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.record_seller_finance_entry(seller_a,'fixture',gen_random_uuid(),purchase,'receipt','cash',71,'MXN','Too much');
  RAISE EXCEPTION 'Overpayment accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Overpayment accepted' THEN RAISE; END IF; END;
 PERFORM public.record_seller_finance_entry(seller_a,'fixture',gen_random_uuid(),purchase,'receipt','transfer',70,'MXN','Saldo');
 IF (SELECT manual_remaining FROM public.seller_finance_balances(seller_a) WHERE order_id=purchase)<>0 THEN RAISE EXCEPTION 'Balance not settled'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_finance_balances(seller_b) WHERE order_id=purchase) THEN RAISE EXCEPTION 'Balance leak'; END IF;
 IF (SELECT payment_status::text FROM public.orders WHERE id=purchase)<>'PENDING' THEN RAISE EXCEPTION 'Provider status changed'; END IF;
 UPDATE public.orders SET payment_status='SUCCEEDED' WHERE id=purchase;
 IF NOT (SELECT provider_conflict FROM public.seller_finance_balances(seller_a) WHERE order_id=purchase) THEN RAISE EXCEPTION 'Duplicate provider receipt not flagged'; END IF;
 PERFORM public.record_seller_finance_entry(seller_a,'fixture',gen_random_uuid(),NULL,'expense','expense',25,'MXN','Empaque');
 IF has_table_privilege('authenticated','public.seller_finance_entries','SELECT') OR has_function_privilege('anon','public.record_seller_finance_entry(uuid,text,uuid,uuid,text,text,numeric,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Public finance access'; END IF;
END $$;
SELECT 'PASS: private ledger, partial receipts, duplicate retry, overpayment and provider separation' AS verification;
ROLLBACK;
