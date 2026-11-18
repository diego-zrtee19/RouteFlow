ALTER TABLE public.seller_instagram_connections
  ADD COLUMN token_ciphertext text,
  ADD COLUMN token_config_id text;

CREATE INDEX seller_instagram_messages_thread_idx ON public.seller_instagram_messages
  (connection_id, sender_id, sent_at DESC, message_id DESC);

CREATE TABLE public.seller_instagram_replies (
  connection_id uuid NOT NULL REFERENCES public.seller_instagram_connections(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  recipient_id text NOT NULL,
  message_text text NOT NULL CHECK (char_length(message_text) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'unknown')),
  meta_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, client_id)
);
CREATE INDEX seller_instagram_replies_thread_idx ON public.seller_instagram_replies
  (connection_id, recipient_id, created_at DESC);
ALTER TABLE public.seller_instagram_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_instagram_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.seller_instagram_replies TO service_role;

CREATE FUNCTION public.instagram_inbox_threads(
  p_connection uuid, p_before timestamptz DEFAULT NULL, p_sender text DEFAULT ''
) RETURNS TABLE(sender_id text, message_text text, sent_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH latest AS (
    SELECT DISTINCT ON (m.sender_id) m.sender_id, m.message_text, m.sent_at
    FROM public.seller_instagram_messages m WHERE m.connection_id = p_connection
    ORDER BY m.sender_id, m.sent_at DESC, m.message_id DESC
  ) SELECT * FROM latest
  WHERE p_before IS NULL OR (latest.sent_at, latest.sender_id) < (p_before, p_sender)
  ORDER BY latest.sent_at DESC, latest.sender_id DESC LIMIT 31;
$$;

CREATE FUNCTION public.instagram_inbox_messages(
  p_connection uuid, p_sender text, p_before timestamptz DEFAULT NULL, p_key text DEFAULT ''
) RETURNS TABLE(id text, message_text text, sent_at timestamptz, direction text, status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH messages AS (
    SELECT 'i:' || m.message_id AS id, m.message_text, m.sent_at,
      'incoming'::text AS direction, 'received'::text AS status
    FROM public.seller_instagram_messages m
    WHERE m.connection_id = p_connection AND m.sender_id = p_sender
    UNION ALL
    SELECT 'o:' || r.client_id, r.message_text, r.created_at, 'outgoing', r.status
    FROM public.seller_instagram_replies r
    WHERE r.connection_id = p_connection AND r.recipient_id = p_sender
  ) SELECT * FROM messages
  WHERE p_before IS NULL OR (messages.sent_at, messages.id) < (p_before, p_key)
  ORDER BY messages.sent_at DESC, messages.id DESC LIMIT 51;
$$;
REVOKE ALL ON FUNCTION public.instagram_inbox_threads(uuid, timestamptz, text),
  public.instagram_inbox_messages(uuid, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_inbox_threads(uuid, timestamptz, text),
  public.instagram_inbox_messages(uuid, text, timestamptz, text) TO service_role;
