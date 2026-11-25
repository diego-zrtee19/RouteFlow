-- Development smoke test. All fixtures are reverted; no Stripe requests are made.
BEGIN;
DO $$
DECLARE s public.sellers; p public.products;
 profile jsonb; sale uuid; result jsonb; again jsonb; items jsonb; request jsonb; remaining integer;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('quote_'||gen_random_uuid(),'quote_'||replace(gen_random_uuid()::text,'-',''),'Quote fixture') RETURNING * INTO s;
 INSERT INTO public.products(seller_id,title,price,currency,stock,is_active,catalog_visible,delivery_options)
 VALUES(s.id,'RouteFlow SQL fixture',100,'MXN',5,true,false,ARRAY['meetup']) RETURNING * INTO p;
 items:=jsonb_build_array(jsonb_build_object('productId',p.id,'quantity',2));
 BEGIN
  PERFORM public.catalog_cart_profile(s.store_username,items);
  RAISE EXCEPTION 'hidden_product_was_exposed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='hidden_product_was_exposed' THEN RAISE; END IF; END;
 profile:=public.commerce_cart_profile(s.store_username,items,NULL,true,NULL);
 INSERT INTO public.instagram_conversation_sales(public_id,seller_id,sale_source,sender_id,client_id,items,line_snapshot,subtotal,currency)
 VALUES(repeat('b',64),s.id,'quote','standalone-quote',gen_random_uuid(),items,profile->'items',200,'MXN') RETURNING id INTO sale;
 BEGIN
  PERFORM public.commerce_cart_profile(s.store_username,jsonb_build_array(jsonb_build_object('productId',p.id,'quantity',3)),NULL,true,sale);
  RAISE EXCEPTION 'changed_selection_was_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='changed_selection_was_accepted' THEN RAISE; END IF; END;
 UPDATE public.products SET price=101 WHERE id=p.id;
 BEGIN
  PERFORM public.commerce_cart_profile(s.store_username,items,NULL,true,sale);
  RAISE EXCEPTION 'changed_price_was_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='changed_price_was_accepted' THEN RAISE; END IF; END;
 UPDATE public.products SET price=100 WHERE id=p.id;
 request:=jsonb_build_object('username',s.store_username,'items',items,'conversationSaleId',sale,'buyerName','SQL fixture','buyerEmail','fixture@example.test','buyerPhone','0000000000','address','{}'::jsonb,'deliveryMethod','meetup');
 result:=public.reserve_checkout_attempt(repeat('e',64),repeat('f',64),'catalog','RF-CONVERSATION-SQL-FIXTURE',repeat('c',64),request);
 again:=public.reserve_checkout_attempt(repeat('e',64),repeat('f',64),'catalog','RF-CONVERSATION-SQL-RETRY',repeat('c',64),request);
 IF result->>'id' IS DISTINCT FROM again->>'id' THEN RAISE EXCEPTION 'Checkout retry duplicated the order'; END IF;
 IF (SELECT order_id::text FROM public.instagram_conversation_sales WHERE id=sale) IS DISTINCT FROM result->>'id' THEN RAISE EXCEPTION 'Order attribution missing'; END IF;
 SELECT stock INTO remaining FROM public.products WHERE id=p.id;
 IF remaining<>3 THEN RAISE EXCEPTION 'Inventory was not reserved exactly once'; END IF;
 BEGIN
  PERFORM public.reserve_conversation_purchase(s.store_username,items,'RF-CONVERSATION-SQL-SECOND',repeat('d',64),'SQL fixture','fixture@example.test','0000000000','{}'::jsonb,'meetup',NULL,sale);
  RAISE EXCEPTION 'second_order_was_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='second_order_was_accepted' THEN RAISE; END IF; END;
END $$;
SELECT 'PASS: hidden inventory, immutable selection/prices, atomic attribution, retry safety and single-use link' AS verification;
ROLLBACK;

