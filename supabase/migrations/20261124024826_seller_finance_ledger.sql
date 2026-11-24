-- Private, append-only declarations; never impersonate a payment provider.
CREATE TABLE public.seller_finance_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
 client_id uuid NOT NULL,
 order_id uuid REFERENCES public.orders(id),
 kind text NOT NULL CHECK(kind IN ('receipt','expense')),
 method text NOT NULL CHECK(method IN ('cash','transfer','expense')),
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 description text NOT NULL CHECK(char_length(description) BETWEEN 1 AND 500),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text CHECK(char_length(void_reason) BETWEEN 3 AND 500),
 CHECK((kind='receipt' AND order_id IS NOT NULL AND method IN ('cash','transfer')) OR (kind='expense' AND method='expense')),
 UNIQUE(seller_id,client_id)
);
ALTER TABLE public.seller_finance_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_finance_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.seller_finance_entries TO service_role;
CREATE INDEX finance_entries_period ON public.seller_finance_entries(seller_id,created_at DESC,id);
CREATE INDEX finance_entries_order ON public.seller_finance_entries(order_id) WHERE order_id IS NOT NULL;

CREATE FUNCTION public.record_seller_finance_entry(p_seller uuid,p_actor text,p_client uuid,p_order uuid,p_kind text,p_method text,p_amount numeric,p_currency text,p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE existing public.seller_finance_entries; purchase public.orders; received numeric; result uuid;
BEGIN
 -- Serialize idempotency keys and amounts before checking balances.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_seller::text,0));
 SELECT * INTO existing FROM public.seller_finance_entries WHERE seller_id=p_seller AND client_id=p_client;
 IF FOUND THEN
  IF existing.order_id IS DISTINCT FROM p_order OR existing.kind<>p_kind OR existing.method<>p_method OR existing.amount<>p_amount OR existing.currency<>p_currency OR existing.description<>p_description THEN RAISE EXCEPTION 'Request conflict'; END IF;
  RETURN existing.id;
 END IF;
 IF p_amount<=0 OR p_amount<>round(p_amount,2) THEN RAISE EXCEPTION 'Invalid amount'; END IF;
 IF p_order IS NOT NULL THEN
  SELECT * INTO purchase FROM public.orders WHERE id=p_order AND seller_id=p_seller FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order unavailable'; END IF;
  IF purchase.currency<>p_currency THEN RAISE EXCEPTION 'Currency mismatch'; END IF;
 END IF;
 IF p_kind='receipt' THEN
  IF p_order IS NULL OR purchase.payment_status::text IN ('SUCCEEDED','REFUNDED') OR purchase.status::text IN ('CANCELLED','REFUNDED') THEN RAISE EXCEPTION 'Order cannot receive manual payment'; END IF;
  SELECT coalesce(sum(amount),0) INTO received FROM public.seller_finance_entries WHERE seller_id=p_seller AND order_id=p_order AND kind='receipt' AND voided_at IS NULL;
  IF received+p_amount>purchase.amount THEN RAISE EXCEPTION 'Receipt exceeds remaining amount'; END IF;
 END IF;
 INSERT INTO public.seller_finance_entries(seller_id,client_id,order_id,kind,method,amount,currency,description,created_by)
 VALUES(p_seller,p_client,p_order,p_kind,p_method,p_amount,p_currency,p_description,p_actor) RETURNING id INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_seller_finance_entry(uuid,text,uuid,uuid,text,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_seller_finance_entry(uuid,text,uuid,uuid,text,text,numeric,text,text) TO service_role;
