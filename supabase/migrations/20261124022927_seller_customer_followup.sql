-- Seller-only CRM annotations. Checkout remains the source of purchase history.
CREATE TABLE public.seller_customer_followup (
 seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
 email text NOT NULL CHECK(email=lower(trim(email)) AND char_length(email) BETWEEN 3 AND 254),
 note text NOT NULL DEFAULT '' CHECK(char_length(note)<=4000),
 followup_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(seller_id,email)
);
ALTER TABLE public.seller_customer_followup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_customer_followup FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.seller_customer_followup TO service_role;
CREATE INDEX customer_followup_due ON public.seller_customer_followup(seller_id,followup_at) WHERE followup_at IS NOT NULL;

CREATE FUNCTION public.seller_customer_list(p_seller uuid,p_search text DEFAULT '',p_offset integer DEFAULT 0)
RETURNS TABLE(email text,name text,order_count bigint,last_order_at timestamptz,note text,followup_at timestamptz,revision integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH customers AS (
 SELECT lower(trim(o.buyer_email)) AS email,
 (array_agg(o.buyer_name ORDER BY o.created_at DESC,o.id DESC))[1] AS name,
 count(*) AS order_count,max(o.created_at) AS last_order_at
 FROM public.orders o WHERE o.seller_id=p_seller AND nullif(trim(o.buyer_email),'') IS NOT NULL
 GROUP BY lower(trim(o.buyer_email))
 ) SELECT c.*,coalesce(f.note,''),f.followup_at,coalesce(f.revision,0)
 FROM customers c LEFT JOIN public.seller_customer_followup f ON f.seller_id=p_seller AND f.email=c.email
 WHERE position(lower(left(p_search,100)) in lower(c.email||' '||coalesce(c.name,'')))>0
 ORDER BY f.followup_at ASC NULLS LAST,c.last_order_at DESC,c.email
 LIMIT 51 OFFSET greatest(0,least(p_offset,50000));
$$;
CREATE FUNCTION public.seller_customer_orders(p_seller uuid,p_email text)
RETURNS TABLE(id uuid,order_number text,buyer_name text,amount numeric,currency text,status text,payment_status text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT o.id,o.order_number::text,o.buyer_name::text,o.amount::numeric,o.currency::text,o.status::text,o.payment_status::text,o.created_at
 FROM public.orders o WHERE o.seller_id=p_seller AND lower(trim(o.buyer_email))=lower(trim(p_email))
 ORDER BY o.created_at DESC,o.id DESC LIMIT 101;
$$;
CREATE FUNCTION public.save_customer_followup(p_seller uuid,p_email text,p_note text,p_followup timestamptz,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result integer; normalized text:=lower(trim(p_email));
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE seller_id=p_seller AND lower(trim(buyer_email))=normalized) THEN
  RAISE EXCEPTION 'Customer does not belong to seller';
 END IF;
 IF p_revision=0 THEN
  INSERT INTO public.seller_customer_followup(seller_id,email,note,followup_at)
  VALUES(p_seller,normalized,p_note,p_followup) ON CONFLICT DO NOTHING RETURNING revision INTO result;
 ELSE
  UPDATE public.seller_customer_followup SET note=p_note,followup_at=p_followup,revision=revision+1,updated_at=now()
  WHERE seller_id=p_seller AND email=normalized AND revision=p_revision RETURNING revision INTO result;
 END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.seller_customer_list(uuid,text,integer),public.seller_customer_orders(uuid,text),public.save_customer_followup(uuid,text,text,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seller_customer_list(uuid,text,integer),public.seller_customer_orders(uuid,text),public.save_customer_followup(uuid,text,text,timestamptz,integer) TO service_role;
