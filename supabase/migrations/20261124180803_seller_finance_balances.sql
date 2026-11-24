CREATE FUNCTION public.seller_finance_balances(p_seller uuid)
RETURNS TABLE(order_id uuid,manual_received numeric,manual_remaining numeric,provider_conflict boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH recent AS (
  SELECT o.id,o.amount,o.payment_status FROM public.orders o WHERE o.seller_id=p_seller
  ORDER BY o.created_at DESC,o.id DESC LIMIT 100
 ) SELECT o.id,coalesce(sum(e.amount),0),greatest(o.amount-coalesce(sum(e.amount),0),0),
 o.payment_status::text IN ('SUCCEEDED','REFUNDED') AND coalesce(sum(e.amount),0)>0
 FROM recent o LEFT JOIN public.seller_finance_entries e ON e.order_id=o.id AND e.seller_id=p_seller AND e.kind='receipt' AND e.voided_at IS NULL
 GROUP BY o.id,o.amount,o.payment_status;
$$;
REVOKE ALL ON FUNCTION public.seller_finance_balances(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seller_finance_balances(uuid) TO service_role;
