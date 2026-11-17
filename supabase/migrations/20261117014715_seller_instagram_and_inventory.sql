CREATE TABLE public.seller_instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL UNIQUE REFERENCES public.sellers(id) ON DELETE CASCADE,
  instagram_account_id text NOT NULL UNIQUE,
  username text NOT NULL,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.seller_instagram_messages (
  connection_id uuid NOT NULL REFERENCES public.seller_instagram_connections(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  sender_id text NOT NULL,
  message_text text NOT NULL,
  sent_at timestamptz NOT NULL,
  PRIMARY KEY (connection_id, message_id)
);

ALTER TABLE public.seller_instagram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_instagram_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_instagram_connections, public.seller_instagram_messages
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_instagram_connections TO service_role;
GRANT SELECT, INSERT ON public.seller_instagram_messages TO service_role;

CREATE FUNCTION public.save_seller_instagram_messages(p_messages jsonb)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.seller_instagram_messages
    (connection_id, message_id, sender_id, message_text, sent_at)
  SELECT connection.id, incoming.message_id, incoming.sender_id, incoming.message_text, incoming.sent_at
  FROM jsonb_to_recordset(p_messages) AS incoming(
    instagram_account_id text, message_id text, sender_id text, message_text text, sent_at timestamptz
  )
  JOIN public.seller_instagram_connections AS connection
    ON connection.instagram_account_id = incoming.instagram_account_id
  WHERE connection.connected_at IS NOT NULL AND incoming.sent_at >= connection.created_at
  ON CONFLICT (connection_id, message_id) DO NOTHING;
$$;

CREATE FUNCTION public.adjust_catalog_stock(
  p_seller_id uuid, p_item_id uuid, p_is_variant boolean, p_stock integer, p_expected integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE product public.products; current_stock integer;
BEGIN
  IF p_stock IS NULL OR p_expected IS NULL OR p_stock NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Inventario inválido';
  END IF;

  SELECT p.* INTO product FROM public.products AS p
  WHERE p.seller_id = p_seller_id
    AND p.id = CASE WHEN p_is_variant THEN (
      SELECT product_id FROM public.product_variants WHERE id = p_item_id AND is_active
    ) ELSE p_item_id END
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_is_variant THEN
    SELECT stock INTO current_stock FROM public.product_variants
    WHERE id = p_item_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = product.id) THEN
      RETURN jsonb_build_object('variants', true);
    END IF;
    current_stock := product.stock;
  END IF;

  IF current_stock IS DISTINCT FROM p_expected THEN
    RETURN jsonb_build_object('conflict', true, 'stock', current_stock, 'productStock', product.stock);
  END IF;
  IF p_is_variant THEN
    RETURN public.set_catalog_variant_stock(p_seller_id, p_item_id, p_stock);
  END IF;

  UPDATE public.products SET stock = p_stock WHERE id = product.id;
  RETURN jsonb_build_object('stock', p_stock, 'productStock', p_stock);
END;
$$;

REVOKE ALL ON FUNCTION public.save_seller_instagram_messages(jsonb),
  public.adjust_catalog_stock(uuid, uuid, boolean, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_seller_instagram_messages(jsonb),
  public.adjust_catalog_stock(uuid, uuid, boolean, integer, integer) TO service_role;
