-- Keep canonical BSUID thread IDs, with an optional phone from the signed webhook.
-- Existing RLS and server-only grants also protect this column; never return it in inbox DTOs.
ALTER TABLE public.seller_whatsapp_messages ADD COLUMN sender_phone text
 CHECK (sender_phone IS NULL OR sender_phone ~ '^[0-9]{6,20}$');
CREATE OR REPLACE FUNCTION public.save_seller_whatsapp_webhook(p_messages jsonb,p_statuses jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s record;
BEGIN
 INSERT INTO public.seller_whatsapp_messages(connection_id,message_id,sender_id,sender_phone,message_text,sent_at)
 SELECT c.id,m.message_id,m.sender_id,m.sender_phone,m.message_text,m.sent_at
 FROM jsonb_to_recordset(p_messages) AS m(waba_id text,phone_number_id text,message_id text,sender_id text,sender_phone text,message_text text,sent_at timestamptz)
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

