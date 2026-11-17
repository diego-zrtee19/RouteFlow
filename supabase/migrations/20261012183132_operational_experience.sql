CREATE TABLE public.delivery_arrangements (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 version integer NOT NULL DEFAULT 1,
 place text NOT NULL, scheduled_at timestamptz NOT NULL,
 proposed_by text NOT NULL CHECK(proposed_by IN ('buyer','seller')),
 status text NOT NULL CHECK(status IN ('PROPOSED','CONFIRMED','MISSED')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.operational_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
 product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
 seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,
 actor_kind text NOT NULL, action text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.operational_activity(order_id,created_at);
ALTER TABLE public.delivery_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_arrangements,public.operational_activity FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.delivery_arrangements,public.operational_activity TO service_role;

CREATE FUNCTION public.change_delivery_arrangement(p_order_id uuid,p_seller_id uuid,p_actor text,p_action text,p_version integer,p_place text DEFAULT NULL,p_scheduled_at timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE o public.orders; a public.delivery_arrangements;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND seller_id=p_seller_id FOR UPDATE;
 IF NOT FOUND OR p_actor IS NULL OR p_actor NOT IN ('buyer','seller') THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF o.delivery_method='shipping' OR o.payment_status<>'SUCCEEDED' OR o.status NOT IN ('PAID','READY_TO_SHIP') THEN RAISE EXCEPTION 'Este pedido no permite coordinar entrega'; END IF;
 SELECT * INTO a FROM public.delivery_arrangements WHERE order_id=o.id;
 IF coalesce(a.version,0)<>p_version THEN RAISE EXCEPTION 'El acuerdo cambió. Vuelve a consultarlo'; END IF;
 IF p_action='propose' THEN
  IF p_place IS NULL OR length(trim(p_place)) NOT BETWEEN 3 AND 300 OR p_scheduled_at IS NULL OR p_scheduled_at<=now() OR p_scheduled_at>now()+interval '90 days' THEN RAISE EXCEPTION 'Indica lugar y fecha futura dentro de 90 días'; END IF;
  INSERT INTO public.delivery_arrangements(order_id,version,place,scheduled_at,proposed_by,status) VALUES(o.id,p_version+1,trim(p_place),p_scheduled_at,p_actor,'PROPOSED')
   ON CONFLICT(order_id) DO UPDATE SET version=excluded.version,place=excluded.place,scheduled_at=excluded.scheduled_at,proposed_by=excluded.proposed_by,status='PROPOSED',updated_at=now();
 ELSIF p_action='confirm' THEN
  IF a.status IS DISTINCT FROM 'PROPOSED' OR a.proposed_by=p_actor OR a.scheduled_at<=now() THEN RAISE EXCEPTION 'Solo la otra parte puede confirmar una propuesta vigente'; END IF;
  UPDATE public.delivery_arrangements SET status='CONFIRMED',version=version+1,updated_at=now() WHERE order_id=o.id;
 ELSIF p_action='missed' THEN
  IF a.status IS DISTINCT FROM 'CONFIRMED' OR a.scheduled_at>now() THEN RAISE EXCEPTION 'Todavía no corresponde reportar una cita sin entrega'; END IF;
  UPDATE public.delivery_arrangements SET status='MISSED',version=version+1,updated_at=now() WHERE order_id=o.id;
 ELSE RAISE EXCEPTION 'Acción inválida'; END IF;
 INSERT INTO public.operational_activity(order_id,seller_id,actor_kind,action,metadata) VALUES(o.id,o.seller_id,p_actor,'DELIVERY_'||upper(p_action),jsonb_build_object('version',p_version+1));
 UPDATE public.orders SET updated_at=now() WHERE id=o.id;
 RETURN (SELECT to_jsonb(d) FROM public.delivery_arrangements d WHERE order_id=o.id);
END $$;

CREATE FUNCTION public.edit_catalog_details(p_seller_id uuid,p_product_id uuid,p_expected_updated_at timestamptz,p_details jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE p public.products; v jsonb; current_v public.product_variants;
BEGIN
 SELECT * INTO p FROM public.products WHERE id=p_product_id AND seller_id=p_seller_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'El producto cambió. Recarga antes de editar'; END IF;
 IF length(trim(p_details->>'title')) NOT BETWEEN 1 AND 200 OR length(coalesce(p_details->>'description',''))>4000 OR (p_details->>'price')::numeric NOT BETWEEN 0.01 AND 500000 OR jsonb_typeof(p_details->'images') IS DISTINCT FROM 'array' OR jsonb_array_length(p_details->'images')>4 THEN RAISE EXCEPTION 'Datos de producto inválidos'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_details->'images') url WHERE url !~ '^https://' OR length(url)>2000) THEN RAISE EXCEPTION 'Fotos HTTPS requeridas'; END IF;
 PERFORM 1 FROM public.product_variants WHERE product_id=p.id ORDER BY id FOR UPDATE;
 FOR v IN SELECT value FROM jsonb_array_elements(coalesce(p_details->'variants','[]')) LOOP
  SELECT * INTO current_v FROM public.product_variants WHERE id=(v->>'id')::uuid AND product_id=p.id;
  IF NOT FOUND OR current_v.label IS DISTINCT FROM v->>'expectedLabel' OR current_v.price IS DISTINCT FROM (v->>'expectedPrice')::numeric THEN RAISE EXCEPTION 'La variante cambió. Recarga antes de editar'; END IF;
  IF length(trim(v->>'label')) NOT BETWEEN 1 AND 100 OR ((v->>'price') IS NOT NULL AND (v->>'price')::numeric NOT BETWEEN 0.01 AND 500000) THEN RAISE EXCEPTION 'Opción inválida'; END IF;
  UPDATE public.product_variants SET label=trim(v->>'label'),price=(v->>'price')::numeric WHERE id=current_v.id;
 END LOOP;
 UPDATE public.products SET title=trim(p_details->>'title'),description=p_details->>'description',price=(p_details->>'price')::numeric,images=ARRAY(SELECT jsonb_array_elements_text(p_details->'images')),updated_at=now() WHERE id=p.id;
 INSERT INTO public.operational_activity(product_id,seller_id,actor_kind,action) VALUES(p.id,p_seller_id,'seller','PRODUCT_DETAILS_EDITED');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.change_delivery_arrangement(uuid,uuid,text,text,integer,text,timestamptz),public.edit_catalog_details(uuid,uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.change_delivery_arrangement(uuid,uuid,text,text,integer,text,timestamptz),public.edit_catalog_details(uuid,uuid,timestamptz,jsonb) TO service_role;
