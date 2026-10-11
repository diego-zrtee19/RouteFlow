CREATE FUNCTION public.set_catalog_variant_stock(p_seller_id uuid,p_variant_id uuid,p_stock integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.products; v public.product_variants; total integer;
BEGIN
 IF p_stock IS NULL OR p_stock NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Inventario inválido'; END IF;
 SELECT products.* INTO p FROM public.products products JOIN public.product_variants variants ON variants.product_id=products.id WHERE variants.id=p_variant_id AND products.seller_id=p_seller_id FOR UPDATE OF products;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO v FROM public.product_variants WHERE id=p_variant_id FOR UPDATE;
 UPDATE public.product_variants SET stock=p_stock WHERE id=v.id;
 UPDATE public.products SET stock=stock+p_stock-v.stock WHERE id=p.id RETURNING stock INTO total;
 RETURN jsonb_build_object('stock',p_stock,'productStock',total);
END $$;
REVOKE ALL ON FUNCTION public.set_catalog_variant_stock(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_variant_stock(uuid,uuid,integer) TO service_role;
