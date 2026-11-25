-- Reuse the existing transactional reservation and payment flow.
ALTER TABLE public.instagram_conversation_sales ADD COLUMN sale_source text NOT NULL DEFAULT 'conversation' CHECK(sale_source IN ('conversation','quote'));
CREATE INDEX seller_quote_list ON public.instagram_conversation_sales(seller_id,created_at DESC) WHERE sale_source='quote';
