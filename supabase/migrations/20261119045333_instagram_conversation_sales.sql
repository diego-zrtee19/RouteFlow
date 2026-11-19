-- A link attributes a purchase to a conversation, not a verified buyer identity.
CREATE TABLE public.instagram_conversation_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 public_id text NOT NULL UNIQUE CHECK(public_id ~ '^[a-f0-9]{64}$'),
 seller_id uuid NOT NULL REFERENCES public.sellers(id),
 connection_id uuid REFERENCES public.seller_instagram_connections(id) ON DELETE SET NULL,
 sender_id text NOT NULL,
 client_id uuid NOT NULL,
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'),
 line_snapshot jsonb NOT NULL,
 subtotal numeric(12,2) NOT NULL,
 currency text NOT NULL,
 order_id uuid UNIQUE REFERENCES public.orders(id),
 shared_at timestamptz,
 cancelled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 UNIQUE(seller_id,client_id)
);
CREATE INDEX instagram_conversation_sales_thread ON public.instagram_conversation_sales(seller_id,connection_id,sender_id,created_at DESC);
ALTER TABLE public.instagram_conversation_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_conversation_sales FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.instagram_conversation_sales TO service_role;

CREATE FUNCTION public.commerce_cart_profile(p_username text,p_items jsonb,p_delivery text DEFAULT NULL,p_allow_hidden boolean DEFAULT false,p_sale_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.sellers; p public.products; v public.product_variants; item jsonb; lines jsonb:='[]'; configs jsonb:='[]';
 qty integer; units integer:=0; subtotal numeric:=0; unit_price numeric; currency text;
 weight numeric:=0; height numeric:=0; width numeric:=0; length numeric:=0; buyer_shipping boolean:=false;
 methods text[]:=ARRAY['shipping','meetup','local_delivery']; variant uuid; package_valid boolean:=true;
BEGIN
 SELECT * INTO s FROM public.sellers WHERE store_username=p_username;
 IF NOT FOUND THEN RAISE EXCEPTION 'Catálogo no disponible'; END IF;
 IF p_sale_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.instagram_conversation_sales cs WHERE cs.id=p_sale_id AND cs.seller_id=s.id AND cs.items=p_items AND cs.cancelled_at IS NULL AND cs.expires_at>now()) THEN RAISE EXCEPTION 'Enlace no disponible'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Elige de 1 a 20 artículos'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY x->>'productId',coalesce(x->>'variantId','') HAVING count(*)>1) THEN RAISE EXCEPTION 'Artículo repetido'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'productId',value->>'variantId' LOOP
  qty:=(item->>'quantity')::integer; variant:=nullif(item->>'variantId','')::uuid;
  IF qty NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  units:=units+qty; IF units>50 THEN RAISE EXCEPTION 'Máximo 50 unidades por pedido'; END IF;
  SELECT * INTO p FROM public.products WHERE id=(item->>'productId')::uuid AND seller_id=s.id AND is_active AND (catalog_visible OR p_allow_hidden);
  IF NOT FOUND OR p.stock<qty THEN RAISE EXCEPTION 'Un producto ya no está disponible'; END IF;
  IF currency IS NOT NULL AND currency<>p.currency THEN RAISE EXCEPTION 'No se pueden mezclar monedas'; END IF;
  currency:=p.currency; unit_price:=p.price;
  IF p_sale_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.instagram_conversation_sales WHERE id=p_sale_id AND instagram_conversation_sales.currency=p.currency) THEN RAISE EXCEPTION 'La moneda cambió. Pide al vendedor un enlace nuevo'; END IF;
  v:=NULL;
  IF EXISTS(SELECT 1 FROM public.product_variants WHERE product_id=p.id AND is_active) THEN
   SELECT * INTO v FROM public.product_variants WHERE id=variant AND product_id=p.id AND is_active;
   IF NOT FOUND OR v.stock<qty THEN RAISE EXCEPTION 'Selecciona una variante disponible'; END IF;
   unit_price:=coalesce(v.price,p.price);
  ELSIF variant IS NOT NULL THEN RAISE EXCEPTION 'Variante no disponible'; END IF;
  IF p_sale_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.instagram_conversation_sales cs, jsonb_array_elements(cs.line_snapshot) x WHERE cs.id=p_sale_id AND x->>'product_id'=p.id::text AND coalesce(x->>'variant_id','')=coalesce(variant::text,'') AND (x->>'unit_price')::numeric=unit_price) THEN RAISE EXCEPTION 'El precio cambió. Pide al vendedor un enlace nuevo'; END IF;
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


CREATE OR REPLACE FUNCTION public.catalog_cart_profile(p_username text,p_items jsonb,p_delivery text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT public.commerce_cart_profile(p_username,p_items,p_delivery,false,NULL);
$$;

CREATE FUNCTION public.reserve_conversation_purchase(p_username text,p_items jsonb,p_order_number text,p_token_hash text,p_buyer_name text,p_buyer_email text,p_buyer_phone text,p_address jsonb,p_delivery text,p_quote_id uuid DEFAULT NULL,p_sale_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE profile jsonb; o public.orders; item jsonb; q public.shipping_quotes; shipping numeric:=0; stored_items jsonb;
BEGIN
 PERFORM 1 FROM public.instagram_conversation_sales WHERE id=p_sale_id AND order_id IS NULL AND cancelled_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Este enlace ya tiene un pedido o dejó de estar disponible'; END IF;
 -- Every reservation and cancellation takes product then variant locks in ID order.
 PERFORM 1 FROM public.products WHERE id IN(SELECT (value->>'productId')::uuid FROM jsonb_array_elements(p_items)) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.product_variants WHERE id IN(SELECT nullif(value->>'variantId','')::uuid FROM jsonb_array_elements(p_items)) ORDER BY id FOR UPDATE;
 profile:=public.commerce_cart_profile(p_username,p_items,p_delivery,true,p_sale_id);
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
 UPDATE public.instagram_conversation_sales SET order_id=o.id WHERE id=p_sale_id;
 RETURN to_jsonb(o)||jsonb_build_object('order_items',stored_items);
END $$;


CREATE OR REPLACE FUNCTION public.reserve_checkout_attempt(p_key_hash text,p_request_hash text,p_kind text,p_order_number text,p_token_hash text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a public.checkout_attempts; result jsonb;
BEGIN
 INSERT INTO public.checkout_attempts(key_hash,request_hash,kind) VALUES(p_key_hash,p_request_hash,p_kind) ON CONFLICT(key_hash) DO NOTHING;
 SELECT * INTO a FROM public.checkout_attempts WHERE key_hash=p_key_hash FOR UPDATE;
 IF a.request_hash IS DISTINCT FROM p_request_hash OR a.kind IS DISTINCT FROM p_kind THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_MISMATCH'; END IF;
 IF a.order_id IS NOT NULL THEN
  RETURN (SELECT to_jsonb(o)||jsonb_build_object('order_items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.order_items i WHERE i.order_id=o.id),'[]'::jsonb)) FROM public.orders o WHERE o.id=a.order_id);
 END IF;
 IF p_kind='quick' THEN
  result:=public.reserve_purchase(p_input->>'publicId',p_order_number,p_token_hash,p_input->>'buyerName',p_input->>'buyerEmail',p_input->>'buyerPhone',p_input->'address',p_input->>'deliveryMethod',nullif(p_input->>'quoteId','')::uuid);
 ELSIF p_input->>'conversationSaleId' IS NOT NULL THEN
  result:=public.reserve_conversation_purchase(p_input->>'username',p_input->'items',p_order_number,p_token_hash,p_input->>'buyerName',p_input->>'buyerEmail',p_input->>'buyerPhone',p_input->'address',p_input->>'deliveryMethod',nullif(p_input->>'quoteId','')::uuid,(p_input->>'conversationSaleId')::uuid);
 ELSE
  result:=public.reserve_catalog_purchase(p_input->>'username',p_input->'items',p_order_number,p_token_hash,p_input->>'buyerName',p_input->>'buyerEmail',p_input->>'buyerPhone',p_input->'address',p_input->>'deliveryMethod',nullif(p_input->>'quoteId','')::uuid);
 END IF;
 IF result->>'id' IS NULL THEN RAISE EXCEPTION 'RESERVATION_FAILED'; END IF;
 UPDATE public.checkout_attempts SET order_id=(result->>'id')::uuid WHERE key_hash=a.key_hash;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.commerce_cart_profile(text,jsonb,text,boolean,uuid),public.reserve_conversation_purchase(text,jsonb,text,text,text,text,text,jsonb,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_cart_profile(text,jsonb,text,boolean,uuid),public.reserve_conversation_purchase(text,jsonb,text,text,text,text,text,jsonb,text,uuid,uuid) TO service_role;

ALTER TABLE public.seller_instagram_replies ADD COLUMN sale_id uuid REFERENCES public.instagram_conversation_sales(id);
CREATE FUNCTION public.mark_instagram_sale_shared() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.status='sent' AND NEW.sale_id IS NOT NULL THEN
  UPDATE public.instagram_conversation_sales SET shared_at=coalesce(shared_at,now())
  WHERE id=NEW.sale_id AND connection_id=NEW.connection_id AND sender_id=NEW.recipient_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mark_instagram_sale_shared() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_instagram_sale_shared() TO service_role;
CREATE TRIGGER instagram_sale_shared AFTER UPDATE OF status ON public.seller_instagram_replies
FOR EACH ROW EXECUTE FUNCTION public.mark_instagram_sale_shared();
