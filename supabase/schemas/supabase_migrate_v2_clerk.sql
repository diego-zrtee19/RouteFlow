-- Apply on an existing RouteFlow V2 database (Clerk user ids + buyer token + pending_payment).

ALTER TABLE stores ALTER COLUMN user_id TYPE TEXT USING user_id::text;

DO $$ BEGIN
    ALTER TYPE escrow_status ADD VALUE IF NOT EXISTS 'pending_payment';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_access_token TEXT UNIQUE;
UPDATE orders SET buyer_access_token = encode(gen_random_bytes(24), 'hex') WHERE buyer_access_token IS NULL;
ALTER TABLE orders ALTER COLUMN buyer_access_token SET DEFAULT encode(gen_random_bytes(24), 'hex');

ALTER TABLE orders ALTER COLUMN escrow_status SET DEFAULT 'pending_payment';

CREATE UNIQUE INDEX IF NOT EXISTS stores_user_id_key ON stores(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_token ON orders(buyer_access_token);
