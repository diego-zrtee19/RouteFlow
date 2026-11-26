CREATE TABLE public.inventory_import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
 client_id uuid NOT NULL,payload jsonb NOT NULL,content_hash text NOT NULL,created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(seller_id,client_id),UNIQUE(seller_id,content_hash)
);
CREATE TABLE public.product_business_details (
 product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
 seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
 sku text NOT NULL CHECK(char_length(sku) BETWEEN 1 AND 64),unit_cost numeric(12,2) CHECK(unit_cost>=0),
 condition text NOT NULL CHECK(condition IN ('new','used','refurbished','unspecified')),
 low_stock_threshold integer NOT NULL DEFAULT 3 CHECK(low_stock_threshold BETWEEN 0 AND 100000),
 import_batch_id uuid REFERENCES public.inventory_import_batches(id),UNIQUE(seller_id,sku)
);
CREATE INDEX product_business_import ON public.product_business_details(import_batch_id);
CREATE TABLE public.product_stock_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 before_stock integer NOT NULL,after_stock integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_stock_history_seller ON public.product_stock_history(seller_id,created_at DESC);
CREATE INDEX product_stock_history_product ON public.product_stock_history(product_id,created_at DESC);
ALTER TABLE public.inventory_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_business_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_import_batches,public.product_business_details,public.product_stock_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.inventory_import_batches,public.product_business_details,public.product_stock_history TO service_role;
GRANT USAGE ON SEQUENCE public.product_stock_history_id_seq TO service_role;
CREATE FUNCTION public.record_product_stock_history() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.product_stock_history(seller_id,product_id,before_stock,after_stock) VALUES(NEW.seller_id,NEW.id,0,NEW.stock);
 ELSIF NEW.stock IS DISTINCT FROM OLD.stock THEN
  INSERT INTO public.product_stock_history(seller_id,product_id,before_stock,after_stock) VALUES(NEW.seller_id,NEW.id,OLD.stock,NEW.stock);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER product_stock_history AFTER INSERT OR UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.record_product_stock_history();
REVOKE ALL ON FUNCTION public.record_product_stock_history() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_stock_history() TO service_role;
CREATE FUNCTION public.import_seller_inventory(p_seller uuid,p_actor text,p_client uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE batch public.inventory_import_batches; digest text; item jsonb; product uuid; count integer:=0;
BEGIN
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Import requires 1 to 200 rows'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_seller::text,1));
 digest:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 SELECT * INTO batch FROM public.inventory_import_batches WHERE seller_id=p_seller AND (client_id=p_client OR content_hash=digest) LIMIT 1;
 IF FOUND THEN
  IF batch.payload<>p_rows THEN RAISE EXCEPTION 'Import key reused with different content'; END IF;
  RETURN jsonb_build_object('batchId',batch.id,'count',jsonb_array_length(batch.payload),'duplicate',true);
 END IF;
 INSERT INTO public.inventory_import_batches(seller_id,client_id,payload,content_hash,created_by) VALUES(p_seller,p_client,p_rows,digest,p_actor) RETURNING * INTO batch;
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF char_length(item->>'title') NOT BETWEEN 1 AND 200 OR (item->>'price')::numeric<=0 OR (item->>'price')::numeric>500000 OR (item->>'stock')::integer NOT BETWEEN 0 AND 100000 OR item->>'currency' NOT IN ('MXN','USD') OR item->>'delivery' NOT IN ('meetup','shipping','local_delivery') THEN RAISE EXCEPTION 'Invalid inventory row'; END IF;
  INSERT INTO public.products(seller_id,title,description,price,currency,stock,is_active,catalog_visible,delivery_options)
  VALUES(p_seller,item->>'title',item->>'description',(item->>'price')::numeric,item->>'currency',(item->>'stock')::integer,false,false,ARRAY[item->>'delivery']) RETURNING id INTO product;
  INSERT INTO public.product_business_details(product_id,seller_id,sku,unit_cost,condition,low_stock_threshold,import_batch_id)
  VALUES(product,p_seller,item->>'sku',nullif(item->>'unitCost','')::numeric,item->>'condition',(item->>'threshold')::integer,batch.id);
  count:=count+1;
 END LOOP;
 RETURN jsonb_build_object('batchId',batch.id,'count',count,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.import_seller_inventory(uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_seller_inventory(uuid,text,uuid,jsonb) TO service_role;
CREATE FUNCTION public.publish_imported_product(p_seller uuid,p_product uuid,p_public_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.products;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=p_product AND seller_id=p_seller FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.product_business_details WHERE product_id=p.id AND seller_id=p_seller) THEN RAISE EXCEPTION 'Imported product unavailable'; END IF;
 IF p.stock<=0 OR p.price<=0 OR coalesce(jsonb_array_length(to_jsonb(p)->'images'),0)=0 THEN RAISE EXCEPTION 'Complete product photos price and stock'; END IF;
 IF 'shipping'=ANY(p.delivery_options) AND (p.weight_kg IS NULL OR p.package_dimensions IS NULL OR NOT EXISTS(SELECT 1 FROM public.sellers WHERE id=p_seller AND ship_from_address IS NOT NULL)) THEN RAISE EXCEPTION 'Complete shipping configuration'; END IF;
 UPDATE public.products SET is_active=true,catalog_visible=true WHERE id=p.id;
 IF NOT EXISTS(SELECT 1 FROM public.purchase_links WHERE product_id=p.id AND seller_id=p_seller) THEN
  INSERT INTO public.purchase_links(seller_id,product_id,public_id,status) VALUES(p_seller,p.id,p_public_id,'active');
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.publish_imported_product(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_imported_product(uuid,uuid,text) TO service_role;
