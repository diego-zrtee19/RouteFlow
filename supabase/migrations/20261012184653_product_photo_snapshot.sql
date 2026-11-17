CREATE OR REPLACE FUNCTION public.edit_catalog_details(p_seller_id uuid,p_product_id uuid,p_expected_updated_at timestamptz,p_details jsonb) RETURNS boolean
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
 UPDATE public.products SET title=trim(p_details->>'title'),description=p_details->>'description',price=(p_details->>'price')::numeric,images=ARRAY(SELECT jsonb_array_elements_text(p_details->'images')),image_url=p_details->'images'->>0,updated_at=now() WHERE id=p.id;
 INSERT INTO public.operational_activity(product_id,seller_id,actor_kind,action) VALUES(p.id,p_seller_id,'seller','PRODUCT_DETAILS_EDITED');
 RETURN true;
END $$;

