-- Synthetic contacts only; no emails, payment requests or persistent fixtures.
BEGIN;
DO $$
DECLARE a uuid; b uuid; c record;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('lead_'||gen_random_uuid(),'lead_'||replace(gen_random_uuid()::text,'-',''),'Prospect fixture') RETURNING id INTO a;
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('other_'||gen_random_uuid(),'other_'||replace(gen_random_uuid()::text,'-',''),'Other fixture') RETURNING id INTO b;
 IF NOT public.create_seller_prospect(a,'fixture',' Lead@Example.test ','Original name') THEN RAISE EXCEPTION 'Initial prospect failed'; END IF;
 IF public.create_seller_prospect(a,'fixture','lead@example.test','Overwrite') THEN RAISE EXCEPTION 'Duplicate contact created'; END IF;
 SELECT * INTO c FROM public.seller_customer_list(a,'lead@example.test');
 IF c.order_count<>0 OR c.last_order_at IS NOT NULL OR c.name<>'Original name' THEN RAISE EXCEPTION 'Prospect state incorrect'; END IF;
 IF public.save_customer_followup(a,'lead@example.test','Prefers blue',now(),0)<>1 THEN RAISE EXCEPTION 'Prospect notes failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_customer_list(b,'lead@example.test')) THEN RAISE EXCEPTION 'Cross-seller contact exposed'; END IF;
 BEGIN
  PERFORM public.save_customer_followup(b,'lead@example.test','Other seller',NULL,0);
  RAISE EXCEPTION 'wrong_owner_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='wrong_owner_accepted' THEN RAISE; END IF; END;
 INSERT INTO public.orders(order_number,seller_id,buyer_name,buyer_email,buyer_phone,shipping_address,amount,buyer_token_hash)
 VALUES('LEAD-'||gen_random_uuid(),a,'Buyer name','LEAD@example.test','0000000000','{}',100,repeat('a',64));
 SELECT * INTO c FROM public.seller_customer_list(a,'lead@example.test');
 IF c.order_count<>1 OR c.last_order_at IS NULL OR c.note<>'Prefers blue' OR c.revision<>1 THEN RAISE EXCEPTION 'Purchase did not retain contact history'; END IF;
 IF (SELECT count(*) FROM public.seller_customer_list(a,'lead@example.test'))<>1 THEN RAISE EXCEPTION 'Buyer duplicated the prospect'; END IF;
 IF has_table_privilege('authenticated','public.seller_customer_prospects','SELECT') OR has_function_privilege('anon','public.create_seller_prospect(uuid,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Prospect contacts exposed'; END IF;
END $$;
SELECT 'PASS: prospects before purchase, duplicate safety, private notes, seller isolation and purchase grouping' AS verification;
ROLLBACK;
