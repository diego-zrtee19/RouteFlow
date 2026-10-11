-- Additive development migration. All mutations run through server-only RPCs.
ALTER TABLE public.sellers ADD COLUMN stripe_account_id text UNIQUE;
ALTER TABLE public.sellers ADD COLUMN stripe_transfers_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.sellers ADD COLUMN stripe_payouts_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.sellers ADD COLUMN stripe_requirements jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.products ADD COLUMN package_dimensions jsonb;
ALTER TABLE public.products ADD COLUMN shipping_payer text NOT NULL DEFAULT 'seller' CHECK (shipping_payer IN ('seller','buyer'));
ALTER TABLE public.orders ADD COLUMN reservation_expires_at timestamptz;
ALTER TABLE public.orders ADD COLUMN stock_released_at timestamptz;
ALTER TABLE public.orders ADD COLUMN shipping_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0);
ALTER TABLE public.orders ADD COLUMN shipping_service text;
ALTER TABLE public.orders ADD COLUMN transfer_id text UNIQUE;
ALTER TABLE public.orders ADD COLUMN settlement_status text NOT NULL DEFAULT 'PENDING' CHECK (settlement_status IN ('PENDING','PROCESSING','TRANSFERRED','FAILED','REVERSED'));
ALTER TABLE public.orders ADD COLUMN settlement_error text;
ALTER TABLE public.orders ADD COLUMN settlement_started_at timestamptz;
ALTER TABLE public.disputes ADD COLUMN seller_response text;
ALTER TABLE public.disputes ADD COLUMN response_due_at timestamptz NOT NULL DEFAULT (now() + interval '3 days');
ALTER TABLE public.disputes ADD COLUMN previous_order_status public.order_status;
ALTER TABLE public.disputes ADD COLUMN resolved_by text;
CREATE TABLE public.shipping_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 fingerprint text NOT NULL, service_code text NOT NULL, amount numeric(12,2) NOT NULL CHECK(amount>0), currency text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '15 minutes'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE, audience text NOT NULL CHECK(audience IN ('buyer','seller')),
 kind text NOT NULL, recipient text, subject text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','FAILED','PREVIEW')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, UNIQUE(order_id,audience,kind)
);
CREATE TABLE public.dispute_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
 audience text NOT NULL CHECK(audience IN ('buyer','seller')), storage_path text NOT NULL UNIQUE,
 filename text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_pending_idx ON public.notification_outbox(available_at) WHERE status IN ('PENDING','FAILED','SENDING');
CREATE INDEX orders_expiry_idx ON public.orders(reservation_expires_at) WHERE stock_released_at IS NULL AND payment_status <> 'SUCCEEDED';
CREATE INDEX disputes_due_idx ON public.disputes(response_due_at) WHERE status IN ('OPEN','UNDER_REVIEW');
ALTER TABLE public.shipping_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipping_quotes,public.notification_outbox,public.dispute_evidence FROM anon,authenticated;
GRANT ALL ON public.shipping_quotes,public.notification_outbox,public.dispute_evidence TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('dispute-evidence','dispute-evidence',false,5242880,ARRAY['image/jpeg','image/png','application/pdf']) ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION public.reserve_purchase(p_public_id text,p_order_number text,p_token_hash text,p_buyer_name text,p_buyer_email text,p_buyer_phone text,p_address jsonb,p_delivery_method text,p_quote_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.purchase_links; p public.products; o public.orders; i public.order_items; q public.shipping_quotes; shipping numeric := 0;
BEGIN
 SELECT * INTO l FROM public.purchase_links WHERE public_id=p_public_id AND status='active' AND (expires_at IS NULL OR expires_at>now());
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.products WHERE id=l.product_id AND seller_id=l.seller_id FOR UPDATE;
 IF NOT FOUND OR NOT p.is_active THEN RETURN NULL; END IF;
 IF p.stock<1 OR p.price<=0 THEN RAISE EXCEPTION 'Product unavailable'; END IF;
 IF NOT p_delivery_method = ANY(p.delivery_options) THEN RAISE EXCEPTION 'Delivery unavailable'; END IF;
 IF p_delivery_method='shipping' AND p.shipping_payer='buyer' THEN
  SELECT * INTO q FROM public.shipping_quotes WHERE id=p_quote_id AND product_id=p.id AND expires_at>now();
  IF NOT FOUND OR upper(q.currency)<>upper(p.currency) THEN RAISE EXCEPTION 'Valid shipping quote required'; END IF;
  shipping := q.amount;
 END IF;
 UPDATE public.products SET stock=stock-1 WHERE id=p.id;
 INSERT INTO public.orders(order_number,seller_id,purchase_link_id,buyer_name,buyer_email,buyer_phone,shipping_address,delivery_method,amount,currency,platform_fee,status,payment_status,buyer_token_hash,reservation_expires_at,shipping_amount,shipping_service)
 VALUES(p_order_number,l.seller_id,l.id,p_buyer_name,p_buyer_email,p_buyer_phone,p_address,p_delivery_method,p.price+shipping,p.currency,round(p.price*0.05,2),'PAYMENT_PENDING','PENDING',p_token_hash,now()+interval '35 minutes',shipping,q.service_code) RETURNING * INTO o;
 INSERT INTO public.order_items(order_id,product_id,title,image_url,unit_price,quantity,line_total) VALUES(o.id,p.id,p.title,p.image_url,p.price,1,p.price) RETURNING * INTO i;
 INSERT INTO public.events(type,seller_id,order_id,purchase_link_id,product_id,amount,currency,metadata) VALUES('ORDER_CREATED',l.seller_id,o.id,l.id,p.id,o.amount,p.currency,'{}');
 RETURN to_jsonb(o)||jsonb_build_object('order_items',jsonb_build_array(to_jsonb(i)));
END $$;
CREATE FUNCTION public.cancel_unpaid_purchase(p_order_id uuid,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status IN ('SUCCEEDED','REFUNDED') OR o.stock_released_at IS NOT NULL THEN RETURN false; END IF;
 -- A legacy unpaid order is also a reservation: previous checkout decremented stock.
 UPDATE public.products p SET stock=p.stock+x.quantity FROM (SELECT product_id,sum(quantity)::integer AS quantity FROM public.order_items WHERE order_id=o.id GROUP BY product_id) x WHERE p.id=x.product_id;
 UPDATE public.orders SET status='CANCELLED',payment_status='FAILED',cancelled_at=now(),stock_released_at=now() WHERE id=o.id;
 INSERT INTO public.events(type,order_id,seller_id,metadata) VALUES('ORDER_CANCELLED',o.id,o.seller_id,jsonb_build_object('reason',p_reason));
 RETURN true;
END $$;
CREATE FUNCTION public.queue_order_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE contact text; message text; topic text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN RETURN NEW; END IF;
 IF NEW.payment_status<>'SUCCEEDED' AND NEW.status<>'REFUNDED' THEN RETURN NEW; END IF;
 topic:=NEW.status::text;
 SELECT contact_email INTO contact FROM public.sellers WHERE id=NEW.seller_id;
 message:='Pedido '||NEW.order_number||': '||topic||'. Total '||NEW.amount||' '||NEW.currency||'. Abre RouteFlow para consultar los detalles.';
 INSERT INTO public.notification_outbox(order_id,seller_id,audience,kind,recipient,subject,body) VALUES
 (NEW.id,NEW.seller_id,'buyer',topic,NEW.buyer_email,'RouteFlow · '||NEW.order_number,message),
 (NEW.id,NEW.seller_id,'seller',topic,contact,'RouteFlow · '||NEW.order_number,message)
 ON CONFLICT(order_id,audience,kind) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER order_notification_changes AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.queue_order_notifications();
CREATE FUNCTION public.open_order_dispute(p_order_id uuid,p_reason public.dispute_reason,p_description text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders; d uuid;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'SUCCEEDED' OR o.status IN ('CANCELLED','REFUNDED') OR o.settlement_status='PROCESSING' THEN RAISE EXCEPTION 'Order cannot be disputed'; END IF;
 INSERT INTO public.disputes(order_id,reason,description,status,previous_order_status) VALUES(o.id,p_reason,p_description,'OPEN',o.status) RETURNING id INTO d;
 UPDATE public.orders SET status='DISPUTED' WHERE id=o.id;
 INSERT INTO public.events(type,order_id,seller_id,metadata) VALUES('DISPUTE_CREATED',o.id,o.seller_id,jsonb_build_object('reason',p_reason));
 RETURN d;
END $$;
CREATE FUNCTION public.claim_settlement(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders; s public.sellers;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'SUCCEEDED' OR o.status<>'COMPLETED' OR o.transfer_id IS NOT NULL THEN RETURN NULL; END IF;
 IF o.settlement_status='PROCESSING' AND o.settlement_started_at>now()-interval '5 minutes' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.disputes WHERE order_id=o.id AND status IN ('OPEN','UNDER_REVIEW')) THEN RETURN NULL; END IF;
 SELECT * INTO s FROM public.sellers WHERE id=o.seller_id;
 IF s.stripe_account_id IS NULL OR NOT s.stripe_transfers_enabled OR NOT s.stripe_payouts_enabled THEN RETURN NULL; END IF;
 UPDATE public.orders SET settlement_status='PROCESSING',settlement_started_at=now(),settlement_error=NULL WHERE id=o.id;
 RETURN jsonb_build_object('order_id',o.id,'account_id',s.stripe_account_id,'amount',o.amount-o.platform_fee,'currency',o.currency);
END $$;
CREATE FUNCTION public.claim_notifications(p_limit integer DEFAULT 20) RETURNS SETOF public.notification_outbox LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.notification_outbox SET status='SENDING',locked_at=now(),attempts=attempts+1 WHERE id IN (
 SELECT id FROM public.notification_outbox WHERE ((status IN ('PENDING','FAILED') AND available_at<=now()) OR (status='SENDING' AND locked_at<now()-interval '5 minutes')) AND attempts<8 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT least(p_limit,100)) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.reserve_purchase(text,text,text,text,text,text,jsonb,text,uuid),public.cancel_unpaid_purchase(uuid,text),public.queue_order_notifications(),public.open_order_dispute(uuid,public.dispute_reason,text),public.claim_settlement(uuid),public.claim_notifications(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_purchase(text,text,text,text,text,text,jsonb,text,uuid),public.cancel_unpaid_purchase(uuid,text),public.open_order_dispute(uuid,public.dispute_reason,text),public.claim_settlement(uuid),public.claim_notifications(integer) TO service_role;
