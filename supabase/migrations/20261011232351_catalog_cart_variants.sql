-- Additive: legacy links/orders keep their identifiers and payment lifecycle.
ALTER TABLE public.products ADD COLUMN catalog_visible boolean NOT NULL DEFAULT true;
CREATE TABLE public.product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id),
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 100),
 price numeric(12,2) CHECK(price>0 AND price<=500000), stock integer NOT NULL CHECK(stock>=0),
 is_active boolean NOT NULL DEFAULT true, UNIQUE(product_id,label)
);
CREATE INDEX product_variants_product_idx ON public.product_variants(product_id);
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_variants FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.order_items ADD COLUMN variant_id uuid REFERENCES public.product_variants(id);
CREATE INDEX order_items_variant_idx ON public.order_items(variant_id) WHERE variant_id IS NOT NULL;
ALTER TABLE public.shipping_quotes ADD COLUMN cart_fingerprint text;

CREATE FUNCTION public.publish_catalog_product(p_seller_id uuid,p_product jsonb,p_variants jsonb,p_public_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.products; l public.purchase_links; v jsonb; total_stock integer:=0;
BEGIN
 IF jsonb_typeof(p_variants)<>'array' OR jsonb_array_length(p_variants)>30 THEN RAISE EXCEPTION 'Variantes inválidas'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
  IF length(trim(v->>'label')) NOT BETWEEN 1 AND 100 OR (v->>'stock')::integer<0 THEN RAISE EXCEPTION 'Variante inválida'; END IF;
  total_stock:=total_stock+(v->>'stock')::integer;
 END LOOP;
 INSERT INTO public.products(seller_id,title,description,price,currency,images,image_url,stock,weight_kg,package_dimensions,delivery_options,catalog_visible,is_active)
 VALUES(p_seller_id,p_product->>'title',p_product->>'description',(p_product->>'price')::numeric,p_product->>'currency',ARRAY(SELECT jsonb_array_elements_text(p_product->'images')),p_product->'images'->>0,
 CASE WHEN jsonb_array_length(p_variants)>0 THEN total_stock ELSE (p_product->>'stock')::integer END,(p_product->>'weight_kg')::numeric,p_product->'package_dimensions',ARRAY(SELECT jsonb_array_elements_text(p_product->'delivery_options')),(p_product->>'catalog_visible')::boolean,true) RETURNING * INTO p;
 FOR v IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
  INSERT INTO public.product_variants(product_id,label,price,stock) VALUES(p.id,trim(v->>'label'),nullif(v->>'price','')::numeric,(v->>'stock')::integer);
 END LOOP;
 INSERT INTO public.purchase_links(seller_id,product_id,public_id,status) VALUES(p_seller_id,p.id,p_public_id,'active') RETURNING * INTO l;
 RETURN jsonb_build_object('product',to_jsonb(p),'link',to_jsonb(l));
END $$;

CREATE FUNCTION public.catalog_cart_profile(p_username text,p_items jsonb,p_delivery text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sellers; p public.products; v public.product_variants; item jsonb; lines jsonb:='[]'; configs jsonb:='[]';
 qty integer; units integer:=0; subtotal numeric:=0; unit_price numeric; currency text;
 weight numeric:=0; height numeric:=0; width numeric:=0; length numeric:=0; buyer_shipping boolean:=false;
 methods text[]:=ARRAY['shipping','meetup','local_delivery']; variant uuid; package_valid boolean:=true;
BEGIN
 SELECT * INTO s FROM public.sellers WHERE store_username=p_username;
 IF NOT FOUND THEN RAISE EXCEPTION 'Catálogo no disponible'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Elige de 1 a 20 artículos'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY x->>'productId',coalesce(x->>'variantId','') HAVING count(*)>1) THEN RAISE EXCEPTION 'Artículo repetido'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'productId',value->>'variantId' LOOP
  qty:=(item->>'quantity')::integer; variant:=nullif(item->>'variantId','')::uuid;
  IF qty NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  units:=units+qty; IF units>50 THEN RAISE EXCEPTION 'Máximo 50 unidades por pedido'; END IF;
  SELECT * INTO p FROM public.products WHERE id=(item->>'productId')::uuid AND seller_id=s.id AND is_active AND catalog_visible;
  IF NOT FOUND OR p.stock<qty THEN RAISE EXCEPTION 'Un producto ya no está disponible'; END IF;
  IF currency IS NOT NULL AND currency<>p.currency THEN RAISE EXCEPTION 'No se pueden mezclar monedas'; END IF;
  currency:=p.currency; unit_price:=p.price;
  v:=NULL;
  IF EXISTS(SELECT 1 FROM public.product_variants WHERE product_id=p.id AND is_active) THEN
   SELECT * INTO v FROM public.product_variants WHERE id=variant AND product_id=p.id AND is_active;
   IF NOT FOUND OR v.stock<qty THEN RAISE EXCEPTION 'Selecciona una variante disponible'; END IF;
   unit_price:=coalesce(v.price,p.price);
  ELSIF variant IS NOT NULL THEN RAISE EXCEPTION 'Variante no disponible'; END IF;
  methods:=ARRAY(SELECT unnest(methods) INTERSECT SELECT unnest(p.delivery_options));
  IF p_delivery IS NOT NULL AND NOT p_delivery=ANY(p.delivery_options) THEN RAISE EXCEPTION 'Los productos no comparten esa entrega'; END IF;
  subtotal:=subtotal+unit_price*qty;
  buyer_shipping:=buyer_shipping OR p.shipping_payer='buyer';
  IF p.weight_kg IS NULL OR p.package_dimensions IS NULL THEN package_valid:=false;
  ELSE
   weight:=weight+p.weight_kg*qty;
   length:=greatest(length,(p.package_dimensions->>'length')::numeric);
   width:=greatest(width,(p.package_dimensions->>'width')::numeric);
   height:=height+(p.package_dimensions->>'height')::numeric*qty;
  END IF;
  lines:=lines||jsonb_build_array(jsonb_build_object('product_id',p.id,'variant_id',variant,'title',p.title||CASE WHEN v.id IS NULL THEN '' ELSE ' · '||v.label END,'image_url',p.image_url,'unit_price',unit_price,'quantity',qty,'line_total',unit_price*qty));
  configs:=configs||jsonb_build_array(jsonb_build_object('id',p.id,'variant',variant,'price',unit_price,'quantity',qty,'weight',p.weight_kg,'dimensions',p.package_dimensions,'payer',p.shipping_payer,'delivery',p.delivery_options));
 END LOOP;
 IF cardinality(methods)=0 THEN RAISE EXCEPTION 'Los productos requieren entregas separadas'; END IF;
 IF p_delivery='shipping' AND (NOT package_valid OR s.ship_from_address IS NULL OR weight>1000 OR height>300 OR width>300 OR length>300) THEN RAISE EXCEPTION 'El vendedor debe configurar un paquete válido para esta compra'; END IF;
 RETURN jsonb_build_object('sellerId',s.id,'storeName',s.store_name,'username',s.store_username,'items',lines,'subtotal',subtotal,'currency',currency,'deliveryOptions',methods,'shippingPayer',CASE WHEN buyer_shipping THEN 'buyer' ELSE 'seller' END,
 'shippingProfile',jsonb_build_object('origin',s.ship_from_address,'weightKg',weight,'dimensions',jsonb_build_object('length',length,'width',width,'height',height)),
 'fingerprint',md5(jsonb_build_object('config',configs,'origin',s.ship_from_address)::text));
END $$;

CREATE FUNCTION public.reserve_catalog_purchase(p_username text,p_items jsonb,p_order_number text,p_token_hash text,p_buyer_name text,p_buyer_email text,p_buyer_phone text,p_address jsonb,p_delivery text,p_quote_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE profile jsonb; o public.orders; item jsonb; q public.shipping_quotes; shipping numeric:=0; stored_items jsonb;
BEGIN
 -- Every reservation and cancellation takes product then variant locks in ID order.
 PERFORM 1 FROM public.products WHERE id IN(SELECT (value->>'productId')::uuid FROM jsonb_array_elements(p_items)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.product_variants WHERE id IN(SELECT nullif(value->>'variantId','')::uuid FROM jsonb_array_elements(p_items)) ORDER BY id FOR UPDATE;
 profile:=public.catalog_cart_profile(p_username,p_items,p_delivery);
 IF p_delivery='shipping' AND profile->>'shippingPayer'='buyer' THEN
  SELECT * INTO q FROM public.shipping_quotes WHERE id=p_quote_id AND expires_at>now() AND cart_fingerprint=profile->>'fingerprint';
  IF NOT FOUND OR upper(q.currency)<>upper(profile->>'currency') THEN RAISE EXCEPTION 'Cotiza de nuevo el envío'; END IF;
  shipping:=q.amount;
 END IF;
 INSERT INTO public.orders(order_number,seller_id,buyer_name,buyer_email,buyer_phone,shipping_address,delivery_method,amount,currency,platform_fee,status,payment_status,buyer_token_hash,reservation_expires_at,shipping_amount,shipping_service,shipping_profile,stock_reservation_confirmed)
 VALUES(p_order_number,(profile->>'sellerId')::uuid,p_buyer_name,lower(trim(p_buyer_email)),p_buyer_phone,p_address,p_delivery,(profile->>'subtotal')::numeric+shipping,profile->>'currency',round((profile->>'subtotal')::numeric*0.05,2),'PAYMENT_PENDING','PENDING',p_token_hash,now()+interval '35 minutes',shipping,q.service_code,profile->'shippingProfile',true) RETURNING * INTO o;
 FOR item IN SELECT value FROM jsonb_array_elements(profile->'items') LOOP
  UPDATE public.products SET stock=stock-(item->>'quantity')::integer WHERE id=(item->>'product_id')::uuid;
  IF item->>'variant_id' IS NOT NULL THEN UPDATE public.product_variants SET stock=stock-(item->>'quantity')::integer WHERE id=(item->>'variant_id')::uuid; END IF;
  INSERT INTO public.order_items(order_id,product_id,variant_id,title,image_url,unit_price,quantity,line_total) VALUES(o.id,(item->>'product_id')::uuid,(item->>'variant_id')::uuid,item->>'title',item->>'image_url',(item->>'unit_price')::numeric,(item->>'quantity')::integer,(item->>'line_total')::numeric);
 END LOOP;
 SELECT jsonb_agg(to_jsonb(i)) INTO stored_items FROM public.order_items i WHERE order_id=o.id;
 INSERT INTO public.events(type,order_id,seller_id,amount,currency,metadata) VALUES('ORDER_CREATED',o.id,o.seller_id,o.amount,o.currency,jsonb_build_object('source','catalog'));
 RETURN to_jsonb(o)||jsonb_build_object('order_items',stored_items);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_unpaid_purchase(p_order_id uuid,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status IN ('SUCCEEDED','REFUNDED') OR o.stock_released_at IS NOT NULL THEN RETURN false; END IF;
 IF NOT o.stock_reservation_confirmed THEN
  INSERT INTO public.operational_alerts(dedupe_key,kind,seller_id,order_id,message) VALUES('legacy:'||o.id,'LEGACY_INVENTORY_REVIEW',o.seller_id,o.id,'Confirma la reserva antes de cancelar.') ON CONFLICT(dedupe_key) DO NOTHING;
  RETURN false;
 END IF;
 PERFORM 1 FROM public.products WHERE id IN(SELECT product_id FROM public.order_items WHERE order_id=o.id) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.product_variants WHERE id IN(SELECT variant_id FROM public.order_items WHERE order_id=o.id) ORDER BY id FOR UPDATE;
 UPDATE public.products p SET stock=p.stock+x.qty FROM(SELECT product_id,sum(quantity)::integer qty FROM public.order_items WHERE order_id=o.id GROUP BY product_id)x WHERE p.id=x.product_id;
 UPDATE public.product_variants v SET stock=v.stock+x.qty FROM(SELECT variant_id,sum(quantity)::integer qty FROM public.order_items WHERE order_id=o.id AND variant_id IS NOT NULL GROUP BY variant_id)x WHERE v.id=x.variant_id;
 UPDATE public.orders SET status='CANCELLED',payment_status='FAILED',cancelled_at=now(),stock_released_at=now() WHERE id=o.id;
 INSERT INTO public.events(type,order_id,seller_id,metadata) VALUES('ORDER_CANCELLED',o.id,o.seller_id,jsonb_build_object('reason',p_reason)); RETURN true;
END $$;

-- Keep the existing single-product reservation, but block variant-less purchases.
ALTER FUNCTION public.reserve_purchase(text,text,text,text,text,text,jsonb,text,uuid) RENAME TO reserve_simple_purchase;
CREATE FUNCTION public.reserve_purchase(p_public_id text,p_order_number text,p_token_hash text,p_buyer_name text,p_buyer_email text,p_buyer_phone text,p_address jsonb,p_delivery_method text,p_quote_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE product uuid;
BEGIN
 SELECT product_id INTO product FROM public.purchase_links WHERE public_id=p_public_id;
 IF EXISTS(SELECT 1 FROM public.product_variants WHERE product_id=product AND is_active) THEN RAISE EXCEPTION 'Selecciona la variante en el catálogo'; END IF;
 RETURN public.reserve_simple_purchase(p_public_id,p_order_number,p_token_hash,p_buyer_name,p_buyer_email,p_buyer_phone,p_address,p_delivery_method,p_quote_id);
END $$;
REVOKE ALL ON FUNCTION public.reserve_simple_purchase(text,text,text,text,text,text,jsonb,text,uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.publish_catalog_product(uuid,jsonb,jsonb,text),public.catalog_cart_profile(text,jsonb,text),public.reserve_catalog_purchase(text,jsonb,text,text,text,text,text,jsonb,text,uuid),public.reserve_purchase(text,text,text,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_catalog_product(uuid,jsonb,jsonb,text),public.catalog_cart_profile(text,jsonb,text),public.reserve_catalog_purchase(text,jsonb,text,text,text,text,text,jsonb,text,uuid),public.reserve_purchase(text,text,text,text,text,text,jsonb,text,uuid) TO service_role;
