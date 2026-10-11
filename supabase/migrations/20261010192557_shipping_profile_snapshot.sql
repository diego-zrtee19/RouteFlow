ALTER TABLE public.orders ADD COLUMN shipping_profile jsonb;
CREATE FUNCTION public.capture_shipping_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.products; origin jsonb;
BEGIN
 IF NEW.delivery_method='shipping' THEN
 SELECT products.* INTO p FROM public.products JOIN public.purchase_links l ON l.product_id=products.id WHERE l.id=NEW.purchase_link_id;
 SELECT ship_from_address INTO origin FROM public.sellers WHERE id=NEW.seller_id;
 NEW.shipping_profile:=jsonb_build_object('weightKg',p.weight_kg,'dimensions',p.package_dimensions,'origin',origin);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_shipping_snapshot BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.capture_shipping_profile();
REVOKE ALL ON FUNCTION public.capture_shipping_profile() FROM PUBLIC,anon,authenticated;
