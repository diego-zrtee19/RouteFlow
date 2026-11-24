-- Synthetic data only, always rolled back. No payments or messages.
BEGIN;
DO $$
DECLARE seller_a uuid; seller_b uuid; next_revision integer; row_count bigint;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('crm_'||gen_random_uuid(),'crm_'||replace(gen_random_uuid()::text,'-',''),'CRM fixture') RETURNING id INTO seller_a;
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('crm_'||gen_random_uuid(),'crm_'||replace(gen_random_uuid()::text,'-',''),'Other CRM fixture') RETURNING id INTO seller_b;
 INSERT INTO public.orders(order_number,seller_id,buyer_name,buyer_email,buyer_phone,shipping_address,amount,buyer_token_hash)
 VALUES('CRM-'||gen_random_uuid(),seller_a,'Fixture customer',' Buyer@Example.test ','0000000000','{}',100,repeat('a',64)),
 ('CRM-'||gen_random_uuid(),seller_a,'Fixture customer','buyer@example.test','0000000000','{}',200,repeat('b',64));
 SELECT order_count INTO row_count FROM public.seller_customer_list(seller_a);
 IF row_count<>2 THEN RAISE EXCEPTION 'Customer aggregation failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_customer_orders(seller_b,'buyer@example.test')) THEN RAISE EXCEPTION 'Cross-seller purchase leak'; END IF;
 next_revision:=public.save_customer_followup(seller_a,'BUYER@example.test','Preference',now(),0);
 IF next_revision<>1 THEN RAISE EXCEPTION 'Initial note failed'; END IF;
 IF public.save_customer_followup(seller_a,'buyer@example.test','Overwrite',NULL,0) IS NOT NULL THEN RAISE EXCEPTION 'Duplicate edit overwritten'; END IF;
 next_revision:=public.save_customer_followup(seller_a,'buyer@example.test','Updated',NULL,1);
 IF next_revision<>2 THEN RAISE EXCEPTION 'Revision failed'; END IF;
 IF public.save_customer_followup(seller_a,'buyer@example.test','Stale',NULL,1) IS NOT NULL THEN RAISE EXCEPTION 'Stale edit overwritten'; END IF;
 BEGIN
  PERFORM public.save_customer_followup(seller_b,'buyer@example.test','Not owner',NULL,0);
  RAISE EXCEPTION 'Wrong seller accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Wrong seller accepted' THEN RAISE; END IF; END;
 IF has_table_privilege('authenticated','public.seller_customer_followup','SELECT') OR has_function_privilege('anon','public.seller_customer_orders(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'CRM data public'; END IF;
END $$;
SELECT 'PASS: customer grouping, seller isolation, edit conflicts and private notes' AS verification;
ROLLBACK;
