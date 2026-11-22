CREATE TABLE public.seller_whatsapp_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id uuid NOT NULL UNIQUE REFERENCES public.sellers(id) ON DELETE CASCADE,
 waba_id text NOT NULL CHECK(waba_id ~ '^[0-9]{1,32}$'),
 phone_number_id text NOT NULL UNIQUE CHECK(phone_number_id ~ '^[0-9]{1,32}$'),
 display_phone_number text NOT NULL,
 token_ciphertext text,
 registration_ciphertext text,
 token_expires_at timestamptz,
 connected_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.seller_whatsapp_messages (
 connection_id uuid NOT NULL REFERENCES public.seller_whatsapp_connections(id) ON DELETE CASCADE,
 message_id text NOT NULL CHECK(char_length(message_id) BETWEEN 1 AND 512),
 sender_id text NOT NULL CHECK(sender_id ~ '^([0-9]{6,20}|[A-Z]{2}\.(ENT\.)?[a-zA-Z0-9]{1,128})$'),
 message_text text NOT NULL CHECK(char_length(message_text) BETWEEN 1 AND 4096),
 sent_at timestamptz NOT NULL,
 PRIMARY KEY(connection_id,message_id)
);
CREATE INDEX whatsapp_messages_thread ON public.seller_whatsapp_messages(connection_id,sender_id,sent_at DESC,message_id DESC);

-- Keep the historical table name: both channels use the same validated checkout.
ALTER TABLE public.instagram_conversation_sales
 ADD COLUMN channel text NOT NULL DEFAULT 'instagram' CHECK(channel IN ('instagram','whatsapp')),
 ADD COLUMN whatsapp_connection_id uuid REFERENCES public.seller_whatsapp_connections(id) ON DELETE SET NULL,
 ADD CONSTRAINT conversation_sale_channel_connection CHECK(
  (channel='instagram' AND whatsapp_connection_id IS NULL) OR
  (channel='whatsapp' AND connection_id IS NULL)
 );
CREATE INDEX whatsapp_sales_thread ON public.instagram_conversation_sales(seller_id,whatsapp_connection_id,sender_id,created_at DESC) WHERE channel='whatsapp';
CREATE INDEX conversation_sales_whatsapp_connection ON public.instagram_conversation_sales(whatsapp_connection_id) WHERE whatsapp_connection_id IS NOT NULL;

CREATE TABLE public.seller_whatsapp_replies (
 connection_id uuid NOT NULL REFERENCES public.seller_whatsapp_connections(id) ON DELETE CASCADE,
 client_id uuid NOT NULL,
 recipient_id text NOT NULL,
 message_text text NOT NULL CHECK(char_length(message_text) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','delivered','read','failed','unknown')),
 meta_message_id text,
 sale_id uuid REFERENCES public.instagram_conversation_sales(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,client_id)
);
CREATE INDEX whatsapp_replies_thread ON public.seller_whatsapp_replies(connection_id,recipient_id,created_at DESC);
CREATE INDEX whatsapp_replies_sale ON public.seller_whatsapp_replies(sale_id) WHERE sale_id IS NOT NULL;
CREATE UNIQUE INDEX whatsapp_reply_provider_id ON public.seller_whatsapp_replies(connection_id,meta_message_id) WHERE meta_message_id IS NOT NULL;
ALTER TABLE public.seller_whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_whatsapp_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_whatsapp_connections,public.seller_whatsapp_messages,public.seller_whatsapp_replies FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.seller_whatsapp_connections,public.seller_whatsapp_replies TO service_role;
GRANT SELECT,INSERT ON public.seller_whatsapp_messages TO service_role;

CREATE FUNCTION public.whatsapp_inbox_threads(p_connection uuid,p_before timestamptz DEFAULT NULL,p_sender text DEFAULT '')
RETURNS TABLE(sender_id text,message_text text,sent_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH latest AS (
  SELECT DISTINCT ON(m.sender_id) m.sender_id,m.message_text,m.sent_at
  FROM public.seller_whatsapp_messages m WHERE m.connection_id=p_connection
  ORDER BY m.sender_id,m.sent_at DESC,m.message_id DESC
 ) SELECT * FROM latest WHERE p_before IS NULL OR (latest.sent_at,latest.sender_id)<(p_before,p_sender)
 ORDER BY latest.sent_at DESC,latest.sender_id DESC LIMIT 31;
$$;
CREATE FUNCTION public.whatsapp_inbox_messages(p_connection uuid,p_sender text,p_before timestamptz DEFAULT NULL,p_key text DEFAULT '')
RETURNS TABLE(id text,message_text text,sent_at timestamptz,direction text,status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH messages AS (
  SELECT 'i:'||m.message_id AS id,m.message_text,m.sent_at,'incoming'::text AS direction,'received'::text AS status
  FROM public.seller_whatsapp_messages m WHERE m.connection_id=p_connection AND m.sender_id=p_sender
  UNION ALL
  SELECT 'o:'||r.client_id,r.message_text,r.created_at,'outgoing',r.status
  FROM public.seller_whatsapp_replies r WHERE r.connection_id=p_connection AND r.recipient_id=p_sender
 ) SELECT * FROM messages WHERE p_before IS NULL OR (messages.sent_at,messages.id)<(p_before,p_key)
 ORDER BY messages.sent_at DESC,messages.id DESC LIMIT 51;
$$;

CREATE FUNCTION public.mark_whatsapp_sale_shared() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.status IN ('sent','delivered','read') AND NEW.sale_id IS NOT NULL THEN
  UPDATE public.instagram_conversation_sales SET shared_at=coalesce(shared_at,now())
  WHERE id=NEW.sale_id AND channel='whatsapp' AND whatsapp_connection_id=NEW.connection_id AND sender_id=NEW.recipient_id;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER whatsapp_sale_shared AFTER UPDATE OF status ON public.seller_whatsapp_replies FOR EACH ROW EXECUTE FUNCTION public.mark_whatsapp_sale_shared();

CREATE FUNCTION public.save_seller_whatsapp_webhook(p_messages jsonb,p_statuses jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s record;
BEGIN
 INSERT INTO public.seller_whatsapp_messages(connection_id,message_id,sender_id,message_text,sent_at)
 SELECT c.id,m.message_id,m.sender_id,m.message_text,m.sent_at
 FROM jsonb_to_recordset(p_messages) AS m(waba_id text,phone_number_id text,message_id text,sender_id text,message_text text,sent_at timestamptz)
 JOIN public.seller_whatsapp_connections c ON c.phone_number_id=m.phone_number_id AND c.waba_id=m.waba_id
 WHERE c.connected_at IS NOT NULL AND m.sent_at>=c.connected_at AND m.sent_at<=now()
 ON CONFLICT(connection_id,message_id) DO NOTHING;

 FOR s IN SELECT * FROM jsonb_to_recordset(p_statuses) AS incoming(waba_id text,phone_number_id text,message_id text,client_id uuid,status text,sent_at timestamptz) LOOP
 UPDATE public.seller_whatsapp_replies r SET status=s.status,meta_message_id=coalesce(r.meta_message_id,s.message_id)
 FROM public.seller_whatsapp_connections c
 WHERE r.connection_id=c.id AND c.connected_at IS NOT NULL AND c.waba_id=s.waba_id AND c.phone_number_id=s.phone_number_id
 AND (r.meta_message_id=s.message_id OR (r.client_id=s.client_id AND r.meta_message_id IS NULL))
 AND s.sent_at>=r.created_at-interval '1 minute' AND s.sent_at<=now()
 AND ((s.status='read' AND r.status<>'read') OR
      (s.status='delivered' AND r.status NOT IN ('read','delivered')) OR
      (s.status='sent' AND r.status IN ('pending','unknown')) OR
      (s.status='failed' AND r.status IN ('pending','unknown','sent')));
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_inbox_threads(uuid,timestamptz,text),public.whatsapp_inbox_messages(uuid,text,timestamptz,text),public.mark_whatsapp_sale_shared(),public.save_seller_whatsapp_webhook(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_threads(uuid,timestamptz,text),public.whatsapp_inbox_messages(uuid,text,timestamptz,text),public.mark_whatsapp_sale_shared(),public.save_seller_whatsapp_webhook(jsonb,jsonb) TO service_role;
