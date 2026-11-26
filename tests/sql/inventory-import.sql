-- Only run in development. All fixtures roll back; no provider calls.
BEGIN;
DO $$
DECLARE s public.sellers; other public.sellers; rows jsonb; first jsonb; again jsonb; p uuid; n integer;
BEGIN
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('inventory_'||gen_random_uuid(),'inventory_'||replace(gen_random_uuid()::text,'-',''),'Inventory fixture') RETURNING * INTO s;
 INSERT INTO public.sellers(user_id,store_username,store_name) VALUES('other_'||gen_random_uuid(),'other_'||replace(gen_random_uuid()::text,'-',''),'Other fixture') RETURNING * INTO other;
 rows:=jsonb_build_array(jsonb_build_object('sku','A','title','Fixture','description','Test','price',100,'stock',5,'currency','MXN','unitCost',20,'condition','new','threshold',3,'delivery','meetup'));
 first:=public.import_seller_inventory(s.id,s.user_id,gen_random_uuid(),rows);
 again:=public.import_seller_inventory(s.id,s.user_id,gen_random_uuid(),rows);
 IF first->>'batchId' IS DISTINCT FROM again->>'batchId' OR NOT (again->>'duplicate')::boolean THEN RAISE EXCEPTION 'Same content duplicated'; END IF;
 SELECT id INTO p FROM public.products WHERE seller_id=s.id;
 IF (SELECT is_active OR catalog_visible FROM public.products WHERE id=p) THEN RAISE EXCEPTION 'Import published prematurely'; END IF;
 BEGIN
  PERFORM public.publish_imported_product(other.id,p,'WRONG-OWNER'); RAISE EXCEPTION 'owner_check_failed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='owner_check_failed' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.publish_imported_product(s.id,p,'NO-PHOTOS'); RAISE EXCEPTION 'photo_check_failed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='photo_check_failed' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.import_seller_inventory(s.id,s.user_id,gen_random_uuid(),jsonb_build_array((rows->0)||'{"sku":"B"}'::jsonb,rows->0)); RAISE EXCEPTION 'duplicate_sku_accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.product_business_details WHERE seller_id=s.id AND sku='B') THEN RAISE EXCEPTION 'Partial import persisted'; END IF;
 UPDATE public.products SET images=ARRAY['https://example.test/product.jpg'] WHERE id=p;
 PERFORM public.publish_imported_product(s.id,p,'QAINV123');
 IF NOT (SELECT is_active AND catalog_visible FROM public.products WHERE id=p) THEN RAISE EXCEPTION 'Publish failed'; END IF;
 UPDATE public.products SET stock=4 WHERE id=p;
 SELECT count(*) INTO n FROM public.product_stock_history WHERE product_id=p;
 IF n<>2 OR NOT EXISTS(SELECT 1 FROM public.product_stock_history WHERE product_id=p AND before_stock=5 AND after_stock=4) THEN RAISE EXCEPTION 'Stock history missing'; END IF;
 IF has_table_privilege('anon','public.product_business_details','SELECT') OR has_function_privilege('authenticated','public.import_seller_inventory(uuid,text,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Private inventory exposed'; END IF;
END $$;
SELECT 'PASS: atomic import, deduplication, private costs, ownership, draft review and stock history' AS verification;
ROLLBACK;
