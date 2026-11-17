CREATE TABLE public.instagram_test_messages (
  instagram_account_id text NOT NULL,
  message_id text NOT NULL,
  sender_id text NOT NULL,
  message_text text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instagram_account_id, message_id)
);

ALTER TABLE public.instagram_test_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_test_messages FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT, DELETE ON public.instagram_test_messages TO service_role;
