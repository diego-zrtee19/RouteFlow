BEGIN;
DO $$
DECLARE seller uuid; product uuid; link uuid; publicid text := upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 a jsonb; b jsonb; orderid uuid; disputeid uuid; n integer; result jsonb;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name,contact_email) VALUES('commerce-test-'||publicid,'commerce-'||lower(publicid),'Disposable commerce fixture','seller@example.com') RETURNING id INTO seller;
 INSERT INTO public.products(seller_id,title,price,currency,stock,is_active,delivery_options,weight_kg,package_dimensions) VALUES(seller,'Fixture',100,'MXN',2,true,ARRAY['meetup','shipping'],3,'{"length":30,"width":20,"height":10}') RETURNING id INTO product;
 INSERT INTO public.purchase_links(seller_id,product_id,public_id,status) VALUES(seller,product,publicid,'active') RETURNING id INTO link;
 a:=public.reserve_purchase(publicid,'RF-'||publicid,'test-token','Buyer','buyer@example.com','3300000000','{"street":"Demo","city":"Demo","state":"JAL","postalCode":"45640","country":"MX"}','meetup');
 orderid:=(a->>'id')::uuid;
 SELECT stock INTO n FROM public.products WHERE id=product;IF n<>1 THEN RAISE EXCEPTION 'Reservation did not decrement stock';END IF;
 BEGIN
  b:=public.reserve_purchase(publicid,'RF-'||publicid,'test-token','Buyer','buyer@example.com','3300000000','{}','meetup');
  RAISE EXCEPTION 'Duplicate order accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 SELECT stock INTO n FROM public.products WHERE id=product;IF n<>1 THEN RAISE EXCEPTION 'Failed reservation leaked stock';END IF;
 IF NOT public.cancel_unpaid_purchase(orderid,'test-expiry') THEN RAISE EXCEPTION 'Cancellation failed';END IF;
 IF public.cancel_unpaid_purchase(orderid,'duplicate') THEN RAISE EXCEPTION 'Duplicate cancellation changed stock';END IF;
 SELECT stock INTO n FROM public.products WHERE id=product;IF n<>2 THEN RAISE EXCEPTION 'Stock not restored exactly once';END IF;
 a:=public.reserve_purchase(publicid,'RF-B'||publicid,'test-token','Buyer','buyer@example.com','3300000000','{}','meetup');orderid:=(a->>'id')::uuid;
 UPDATE public.orders SET payment_status='SUCCEEDED',status='PAID' WHERE id=orderid;
 IF public.cancel_unpaid_purchase(orderid,'late-expiry') THEN RAISE EXCEPTION 'Paid order cancelled';END IF;
 SELECT count(*) INTO n FROM public.notification_outbox WHERE order_id=orderid AND kind='PAID';IF n<>2 THEN RAISE EXCEPTION 'Payment notifications missing';END IF;
 UPDATE public.orders SET status='PAID' WHERE id=orderid;
 SELECT count(*) INTO n FROM public.notification_outbox WHERE order_id=orderid AND kind='PAID';IF n<>2 THEN RAISE EXCEPTION 'Duplicate notifications';END IF;
 disputeid:=public.open_order_dispute(orderid,'other','Test dispute');
 SELECT count(*) INTO n FROM public.orders WHERE id=orderid AND status='DISPUTED';IF n<>1 THEN RAISE EXCEPTION 'Dispute state missing';END IF;
 BEGIN
  PERFORM public.resolve_order_dispute(disputeid,'Refund requested','fixture-admin',true);RAISE EXCEPTION 'Unconfirmed refund accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Refund not confirmed' THEN RAISE; END IF;END;
 PERFORM public.resolve_order_dispute(disputeid,'Seller provided evidence','fixture-admin',false);
 SELECT count(*) INTO n FROM public.orders WHERE id=orderid AND status='PAID';IF n<>1 THEN RAISE EXCEPTION 'Resolved status not restored';END IF;
 BEGIN PERFORM public.claim_dispute_resolution(disputeid,'refund');RAISE EXCEPTION 'Closed dispute claimed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Dispute already resolved' THEN RAISE;END IF;END;
 UPDATE public.orders SET status='COMPLETED' WHERE id=orderid;
 IF public.claim_settlement(orderid) IS NOT NULL THEN RAISE EXCEPTION 'Unverified account accepted';END IF;
 UPDATE public.sellers SET stripe_account_id='acct_fixture_'||publicid,stripe_transfers_enabled=true,stripe_payouts_enabled=true WHERE id=seller;
 result:=public.claim_settlement(orderid);IF result IS NULL OR (result->>'amount')::numeric<>95 THEN RAISE EXCEPTION 'Settlement amount invalid';END IF;
 IF public.claim_settlement(orderid) IS NOT NULL THEN RAISE EXCEPTION 'Concurrent settlement claimed';END IF;
 BEGIN PERFORM public.begin_order_refund(orderid);RAISE EXCEPTION 'Refund raced settlement';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Settlement in progress' THEN RAISE;END IF;END;
 UPDATE public.orders SET settlement_status='FAILED' WHERE id=orderid;
 PERFORM public.begin_order_refund(orderid);
 IF public.claim_settlement(orderid) IS NOT NULL THEN RAISE EXCEPTION 'Settlement raced refund';END IF;
 IF has_function_privilege('anon','public.reserve_purchase(text,text,text,text,text,text,jsonb,text,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.notification_outbox','SELECT') THEN RAISE EXCEPTION 'Private operations exposed';END IF;
END $$;
SELECT 'PASS: atomic inventory, duplicate cancellation, paid protection, notification deduplication, dispute resolution, settlement/refund locks, private access' AS verification;
ROLLBACK;
