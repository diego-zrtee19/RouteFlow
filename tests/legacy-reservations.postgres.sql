BEGIN;
DO $$
DECLARE s uuid;p uuid;o uuid;j jsonb;v integer;c text:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name)VALUES('legacy-test-'||c,'legacy-'||c,'Legacy fixture')RETURNING id INTO s;
 INSERT INTO public.products(seller_id,title,price,stock,delivery_options)VALUES(s,'Legacy fixture',100,3,ARRAY['meetup'])RETURNING id INTO p;
 INSERT INTO public.purchase_links(seller_id,product_id,public_id)VALUES(s,p,c);
 j:=public.reserve_purchase(c,'RF-'||c,'token','Buyer','buyer@example.com','0000000000','{}','meetup');o:=(j->>'id')::uuid;
 UPDATE public.orders SET stock_reservation_confirmed=false,reservation_expires_at=NULL WHERE id=o;
 IF public.cancel_unpaid_purchase(o,'expiry') THEN RAISE EXCEPTION 'Legacy auto-cancel accepted';END IF;
 SELECT stock INTO v FROM public.products WHERE id=p;IF v<>2 THEN RAISE EXCEPTION 'Stock inflated';END IF;
 BEGIN PERFORM public.cancel_legacy_reservation(o,gen_random_uuid(),true);RAISE EXCEPTION 'Wrong seller accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Unpaid order required' THEN RAISE;END IF;END;
 IF NOT public.cancel_legacy_reservation(o,s,true) THEN RAISE EXCEPTION 'Recovery failed';END IF;
 IF public.cancel_legacy_reservation(o,s,true) THEN RAISE EXCEPTION 'Recovery repeated';END IF;
 SELECT stock INTO v FROM public.products WHERE id=p;IF v<>3 THEN RAISE EXCEPTION 'Restoration not exactly once';END IF;
 j:=public.reserve_purchase(c,'RF-B'||c,'token','Buyer','buyer@example.com','0000000000','{}','meetup');o:=(j->>'id')::uuid;
 UPDATE public.orders SET stock_reservation_confirmed=false,reservation_expires_at=NULL WHERE id=o;
 PERFORM public.cancel_legacy_reservation(o,s,false);
 SELECT stock INTO v FROM public.products WHERE id=p;IF v<>2 THEN RAISE EXCEPTION 'Explicit no-restock ignored';END IF;
 j:=public.reserve_purchase(c,'RF-C'||c,'token','Buyer','buyer@example.com','0000000000','{}','meetup');o:=(j->>'id')::uuid;
 UPDATE public.orders SET status='PAID',payment_status='SUCCEEDED' WHERE id=o;
 BEGIN PERFORM public.cancel_legacy_reservation(o,s,true);RAISE EXCEPTION 'Paid cancellation accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Unpaid order required' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.cancel_legacy_reservation(uuid,uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Legacy RPC exposed';END IF;
END $$;
SELECT 'PASS: legacy auto-cancel protection, ownership, explicit stock review, duplicate recovery, paid-order protection, private RPC' AS verification;
ROLLBACK;
