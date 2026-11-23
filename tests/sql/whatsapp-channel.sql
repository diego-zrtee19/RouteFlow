-- Development smoke test. All fixtures are reverted; no Stripe requests are made.
BEGIN;
DO $$
DECLARE c public.seller_whatsapp_connections; s public.sellers; p public.products;
 profile jsonb; sale uuid; result jsonb; again jsonb; items jsonb; request jsonb; remaining integer;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name)
 VALUES('wa_fixture_'||gen_random_uuid(),'wa_'||replace(gen_random_uuid()::text,'-',''),'WhatsApp SQL fixture') RETURNING * INTO s;
 INSERT INTO public.seller_whatsapp_connections(seller_id,waba_id,phone_number_id,display_phone_number,connected_at)
 VALUES(s.id,'90000000000000001','90000000000000002','TEST',now()-interval '5 minutes') RETURNING * INTO c;
 INSERT INTO public.products(seller_id,title,price,currency,stock,is_active,catalog_visible,delivery_options)
 VALUES(s.id,'RouteFlow SQL fixture',100,'MXN',5,true,false,ARRAY['meetup']) RETURNING * INTO p;
 items:=jsonb_build_array(jsonb_build_object('productId',p.id,'quantity',2));
 BEGIN
  PERFORM public.catalog_cart_profile(s.store_username,items);
  RAISE EXCEPTION 'hidden_product_was_exposed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='hidden_product_was_exposed' THEN RAISE; END IF; END;
 profile:=public.commerce_cart_profile(s.store_username,items,NULL,true,NULL);
 INSERT INTO public.instagram_conversation_sales(public_id,seller_id,whatsapp_connection_id,channel,sender_id,client_id,items,line_snapshot,subtotal,currency)
 VALUES(repeat('b',64),s.id,c.id,'whatsapp','MX.fixture',gen_random_uuid(),items,profile->'items',200,'MXN') RETURNING id INTO sale;
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
 PERFORM public.save_seller_whatsapp_webhook(jsonb_build_array(jsonb_build_object('waba_id',c.waba_id,'phone_number_id',c.phone_number_id,'message_id','wamid.incoming','sender_id','MX.fixture','message_text','Hola','sent_at',now()-interval '30 seconds')), '[]'::jsonb);
 PERFORM public.save_seller_whatsapp_webhook(jsonb_build_array(jsonb_build_object('waba_id',c.waba_id,'phone_number_id',c.phone_number_id,'message_id','wamid.incoming','sender_id','MX.fixture','message_text','Hola','sent_at',now()-interval '30 seconds')), '[]'::jsonb);
 IF (SELECT count(*) FROM public.seller_whatsapp_messages WHERE connection_id=c.id)<>1 THEN RAISE EXCEPTION 'Duplicate incoming message'; END IF;
 PERFORM public.save_seller_whatsapp_webhook(jsonb_build_array(jsonb_build_object('waba_id',c.waba_id,'phone_number_id',c.phone_number_id,'message_id','wamid.phone','sender_id','MX.phone','sender_phone','523300000000','message_text','Phone fixture','sent_at',now())), '[]'::jsonb);
 IF NOT EXISTS(SELECT 1 FROM public.seller_whatsapp_messages WHERE connection_id=c.id AND sender_id='MX.phone' AND sender_phone='523300000000') THEN RAISE EXCEPTION 'Signed phone association missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.whatsapp_inbox_messages(c.id,'MX.fixture') WHERE message_text='Phone fixture') THEN RAISE EXCEPTION 'Cross-thread phone message leak'; END IF;
 PERFORM public.save_seller_whatsapp_webhook(jsonb_build_array(jsonb_build_object('waba_id','999','phone_number_id',c.phone_number_id,'message_id','wamid.wrong','sender_id','MX.fixture','message_text','Ignore','sent_at',now())), '[]'::jsonb);
 IF (SELECT count(*) FROM public.seller_whatsapp_messages WHERE connection_id=c.id)<>2 THEN RAISE EXCEPTION 'Wrong WABA accepted'; END IF;
 IF (SELECT count(*) FROM public.whatsapp_inbox_threads(gen_random_uuid()))<>0 THEN RAISE EXCEPTION 'Cross-connection leak'; END IF;
 INSERT INTO public.seller_whatsapp_replies(connection_id,client_id,recipient_id,message_text,status,sale_id)
 VALUES(c.id,'00000000-0000-4000-8000-000000000001','MX.fixture','Test link','unknown',sale);
 PERFORM public.save_seller_whatsapp_webhook('[]'::jsonb, jsonb_build_array(jsonb_build_object('waba_id',c.waba_id,'phone_number_id',c.phone_number_id,'message_id','wamid.outgoing','client_id','00000000-0000-4000-8000-000000000001','status','read','sent_at',now()),jsonb_build_object('waba_id',c.waba_id,'phone_number_id',c.phone_number_id,'message_id','wamid.outgoing','status','sent','sent_at',now())));
 IF (SELECT status FROM public.seller_whatsapp_replies WHERE connection_id=c.id)<>'read' THEN RAISE EXCEPTION 'Status recovery or monotonicity failed'; END IF;
 IF (SELECT shared_at FROM public.instagram_conversation_sales WHERE id=sale) IS NULL THEN RAISE EXCEPTION 'Sale shared attribution missing'; END IF;
 IF (SELECT count(*) FROM public.whatsapp_inbox_messages(c.id,'MX.fixture'))<>2 THEN RAISE EXCEPTION 'History merge failed'; END IF;
 UPDATE public.seller_whatsapp_connections SET connected_at=NULL WHERE id=c.id;
 PERFORM public.save_seller_whatsapp_webhook(jsonb_build_array(jsonb_build_object('waba_id',c.waba_id,'phone_number_id',c.phone_number_id,'message_id','wamid.after-disconnect','sender_id','MX.fixture','message_text','Ignore','sent_at',now())), '[]'::jsonb);
 IF (SELECT count(*) FROM public.seller_whatsapp_messages WHERE connection_id=c.id)<>2 THEN RAISE EXCEPTION 'Disconnected ingestion accepted'; END IF;
 IF has_table_privilege('authenticated','public.seller_whatsapp_messages','SELECT') OR has_function_privilege('anon','public.whatsapp_inbox_threads(uuid,timestamp with time zone,text)','EXECUTE') THEN RAISE EXCEPTION 'Private WhatsApp data publicly accessible'; END IF;
END $$;
SELECT 'PASS: WhatsApp isolation, duplicate delivery, status recovery, private history and atomic checkout' AS verification;
ROLLBACK;

