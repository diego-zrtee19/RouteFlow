BEGIN;
CREATE TEMP TABLE audit_checks(name text,passed boolean NOT NULL);
DO $$
DECLARE s uuid; other_s uuid; p uuid; l uuid; o uuid; marker text:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 a jsonb; b jsonb; own_a uuid:=gen_random_uuid(); own_b uuid:=gen_random_uuid(); rejected boolean:=false; n integer;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('audit-'||marker,'audit-'||lower(marker),'Disposable audit fixture') RETURNING id INTO s;
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('audit-other-'||marker,'other-'||lower(marker),'Other fixture') RETURNING id INTO other_s;
 INSERT INTO public.products(seller_id,title,price,currency,stock,is_active,delivery_options,weight_kg,package_dimensions)
 VALUES(s,'Audit fixture',100,'MXN',2,true,ARRAY['shipping'],1,'{"length":10,"width":10,"height":10}') RETURNING id INTO p;
 INSERT INTO public.purchase_links(seller_id,product_id,public_id,status) VALUES(s,p,marker,'active') RETURNING id INTO l;
 a:=public.reserve_purchase(marker,'RF-AUDIT-'||marker,repeat('a',64),'Fixture buyer','fixture@example.invalid','555','{"street":"TEST","city":"TEST","postalCode":"44100","country":"MX"}','shipping');
 o:=(a->>'id')::uuid;
 UPDATE public.orders SET status='PAID',payment_status='SUCCEEDED' WHERE id=o;
 a:=public.claim_shipment_dispatch(o,s,own_a,'FEDEX','TEST');
 b:=public.claim_shipment_dispatch(o,s,own_b,'FEDEX','TEST');
 INSERT INTO audit_checks VALUES('only one owner can create the carrier shipment',a->>'owner_token'=own_a::text AND b->>'owner_token'=own_a::text AND (SELECT count(*) FROM public.shipment_dispatch_attempts WHERE order_id=o)=1);
 BEGIN PERFORM public.claim_shipment_dispatch(o,other_s,own_b,'FEDEX','TEST'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 INSERT INTO audit_checks VALUES('foreign seller cannot claim shipment',rejected);
 UPDATE public.shipment_dispatch_attempts SET status='CREATED',result='{"success":true,"trackingNumber":"TEST"}' WHERE order_id=o;
 b:=public.claim_shipment_dispatch(o,s,own_b,'FEDEX','TEST');
 INSERT INTO audit_checks VALUES('retry recovers durable provider response',b->>'status'='CREATED' AND b->'result'->>'trackingNumber'='TEST');
 UPDATE public.orders SET status='DISPUTED' WHERE id=o;
 rejected:=false; BEGIN PERFORM public.claim_shipment_dispatch(o,s,own_b,'FEDEX','TEST'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 INSERT INTO audit_checks VALUES('disputed order cannot claim a new dispatch',rejected);
 -- This is the same conditional write used by both order transition entrypoints.
 UPDATE public.orders SET status='BUYER_CONFIRMED' WHERE id=o AND seller_id=s AND status='DELIVERED' AND payment_status='SUCCEEDED';
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO audit_checks VALUES('conditional transition preserves concurrent dispute',n=0 AND (SELECT status='DISPUTED' FROM public.orders WHERE id=o));
 INSERT INTO public.payments(order_id,provider,checkout_session_id,payment_intent_id,amount,currency,status)
 VALUES(o,'stripe','cs_audit_'||marker,'pi_audit_'||marker,100,'MXN','REFUNDED');
 INSERT INTO public.payments(order_id,provider,checkout_session_id,payment_intent_id,amount,currency,status)
 VALUES(o,'stripe','cs_audit_'||marker,'pi_audit_'||marker,100,'MXN','PENDING') ON CONFLICT(checkout_session_id) DO NOTHING;
 INSERT INTO audit_checks VALUES('late binding preserves refunded payment',(SELECT status='REFUNDED' FROM public.payments WHERE order_id=o));
 a:=public.consume_public_request_limit('verify',encode(extensions.digest(marker,'sha256'),'hex'),2,60);
 b:=public.consume_public_request_limit('verify',encode(extensions.digest(marker,'sha256'),'hex'),2,60);
 b:=public.consume_public_request_limit('verify',encode(extensions.digest(marker,'sha256'),'hex'),2,60);
 INSERT INTO audit_checks VALUES('shared quota rejects third request',(a->>'allowed')::boolean AND NOT (b->>'allowed')::boolean AND (b->>'retry_after')::int BETWEEN 1 AND 60);
 INSERT INTO audit_checks VALUES('public roles cannot call claim or quota RPCs',
 NOT has_function_privilege('anon','public.claim_shipment_dispatch(uuid,uuid,uuid,text,text)','EXECUTE') AND
 NOT has_function_privilege('authenticated','public.consume_public_request_limit(text,text,integer,integer)','EXECUTE'));
 INSERT INTO audit_checks VALUES('private dispatch results and counters inaccessible to public roles',
 NOT has_table_privilege('anon','public.shipment_dispatch_attempts','SELECT') AND
 NOT has_table_privilege('authenticated','public.shipment_dispatch_attempts','SELECT') AND
 NOT has_table_privilege('anon','public.public_request_limits','INSERT'));
 INSERT INTO audit_checks VALUES('service role can execute guards',has_function_privilege('service_role','public.claim_shipment_dispatch(uuid,uuid,uuid,text,text)','EXECUTE') AND has_function_privilege('service_role','public.consume_public_request_limit(text,text,integer,integer)','EXECUTE'));
 IF EXISTS(SELECT 1 FROM audit_checks WHERE NOT passed) THEN RAISE EXCEPTION 'Reliability regression'; END IF;
END $$;
SELECT jsonb_build_object('checks',jsonb_agg(to_jsonb(audit_checks)),'passed',bool_and(passed),'count',count(*)) AS result FROM audit_checks;
ROLLBACK;
