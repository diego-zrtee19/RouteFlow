-- RouteFlow V2 Schema - B2B2C SaaS (Clerk + Stripe Escrow)
-- Mutations go through Next.js API routes with SUPABASE_SERVICE_ROLE_KEY.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE kyc_status AS ENUM ('unverified', 'pending', 'verified');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE escrow_status AS ENUM (
        'pending_payment',
        'payment_authorized',
        'shipped',
        'released',
        'cancelled',
        'disputed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL UNIQUE,
    store_username TEXT UNIQUE NOT NULL,
    store_name TEXT NOT NULL,
    instagram_handle TEXT,
    logo_url TEXT,
    kyc_status kyc_status DEFAULT 'unverified',
    kyc_document_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    image_url TEXT,
    category TEXT,
    stock INTEGER DEFAULT 1,
    is_express BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    buyer_phone TEXT NOT NULL,
    shipping_address JSONB NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    escrow_status escrow_status DEFAULT 'pending_payment',
    tracking_number TEXT,
    shipping_carrier TEXT,
    shipping_label_url TEXT,
    buyer_access_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_user_id ON stores(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_username ON stores(store_username);
CREATE INDEX IF NOT EXISTS idx_stores_kyc_status ON stores(kyc_status);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_express ON products(is_express);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_escrow_status ON orders(escrow_status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_email ON orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_token ON orders(buyer_access_token);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own store" ON stores;
DROP POLICY IF EXISTS "Users can insert their own store" ON stores;
DROP POLICY IF EXISTS "Users can update their own store" ON stores;
DROP POLICY IF EXISTS "Public can view stores by username" ON stores;
DROP POLICY IF EXISTS "Public can read stores" ON stores;

CREATE POLICY "Public can read stores" ON stores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Store owners can view their products" ON products;
DROP POLICY IF EXISTS "Store owners can insert products" ON products;
DROP POLICY IF EXISTS "Store owners can update their products" ON products;
DROP POLICY IF EXISTS "Store owners can delete their products" ON products;
DROP POLICY IF EXISTS "Public can view active products" ON products;

CREATE POLICY "Public can view active products" ON products FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Store owners can view their orders" ON orders;
DROP POLICY IF EXISTS "Store owners can update their orders" ON orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;
DROP POLICY IF EXISTS "No anon access to orders" ON orders;

CREATE POLICY "No anon access to orders" ON orders FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_stores_updated_at ON stores;
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', false) ON CONFLICT (id) DO NOTHING;
