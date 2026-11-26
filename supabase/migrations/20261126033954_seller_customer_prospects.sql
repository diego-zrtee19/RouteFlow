-- Private contacts recorded before a first purchase; no social identity is inferred.
CREATE TABLE public.seller_customer_prospects (
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  email text NOT NULL CHECK(email=lower(trim(email)) AND char_length(email) BETWEEN 3 AND 254),
  name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 200),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(seller_id,email)
);
ALTER TABLE public.seller_customer_prospects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_customer_prospects FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.seller_customer_prospects TO service_role;

CREATE FUNCTION public.create_seller_prospect(p_seller uuid,p_actor text,p_email text,p_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inserted integer;
BEGIN
  INSERT INTO public.seller_customer_prospects(seller_id,email,name,created_by)
  VALUES(p_seller,lower(trim(p_email)),trim(p_name),p_actor)
  ON CONFLICT(seller_id,email) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  RETURN inserted=1;
END $$;
REVOKE ALL ON FUNCTION public.create_seller_prospect(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_seller_prospect(uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.seller_customer_list(p_seller uuid,p_search text DEFAULT '',p_offset integer DEFAULT 0)
RETURNS TABLE(email text,name text,order_count bigint,last_order_at timestamptz,note text,followup_at timestamptz,revision integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH purchases AS (
    SELECT lower(trim(o.buyer_email)) AS email,
      (array_agg(o.buyer_name ORDER BY o.created_at DESC,o.id DESC))[1] AS name,
      count(*) AS order_count,max(o.created_at) AS last_order_at
    FROM public.orders o
    WHERE o.seller_id=p_seller AND nullif(trim(o.buyer_email),'') IS NOT NULL
    GROUP BY lower(trim(o.buyer_email))
  ), customers AS (
    SELECT coalesce(c.email,p.email) AS email,
      coalesce(nullif(c.name,''),p.name) AS name,
      coalesce(c.order_count,0::bigint) AS order_count,c.last_order_at,
      coalesce(c.last_order_at,p.created_at) AS activity_at
    FROM purchases c FULL JOIN
      (SELECT * FROM public.seller_customer_prospects WHERE seller_id=p_seller) p
      ON p.email=c.email
  )
  SELECT c.email,c.name,c.order_count,c.last_order_at,coalesce(f.note,''),f.followup_at,coalesce(f.revision,0)
  FROM customers c LEFT JOIN public.seller_customer_followup f ON f.seller_id=p_seller AND f.email=c.email
  WHERE position(lower(left(p_search,100)) in lower(c.email||' '||coalesce(c.name,'')))>0
  ORDER BY f.followup_at ASC NULLS LAST,c.activity_at DESC,c.email
  LIMIT 51 OFFSET greatest(0,least(p_offset,50000));
$$;

CREATE OR REPLACE FUNCTION public.save_customer_followup(p_seller uuid,p_email text,p_note text,p_followup timestamptz,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result integer; normalized text:=lower(trim(p_email));
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE seller_id=p_seller AND lower(trim(buyer_email))=normalized)
    AND NOT EXISTS(SELECT 1 FROM public.seller_customer_prospects WHERE seller_id=p_seller AND email=normalized)
  THEN RAISE EXCEPTION 'Contact does not belong to seller'; END IF;
  IF p_revision=0 THEN
    INSERT INTO public.seller_customer_followup(seller_id,email,note,followup_at)
    VALUES(p_seller,normalized,p_note,p_followup) ON CONFLICT DO NOTHING RETURNING revision INTO result;
  ELSE
    UPDATE public.seller_customer_followup SET note=p_note,followup_at=p_followup,revision=revision+1,updated_at=now()
    WHERE seller_id=p_seller AND email=normalized AND revision=p_revision RETURNING revision INTO result;
  END IF;
  RETURN result;
END $$;
