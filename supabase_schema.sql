-- SUPABASE SCHEMA FOR ROUTEFLOW MVP
-- Paste this script into the Supabase SQL Editor (https://database.new)

-- 1. STORES TABLE
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    zone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    price NUMERIC NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    image_url TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    sold BOOLEAN DEFAULT FALSE NOT NULL,
    zone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. EXTERNAL ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.external_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code TEXT NOT NULL UNIQUE,
    buyer_name TEXT NOT NULL,
    product_name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    origin_address TEXT,
    destination_address TEXT,
    seller_name TEXT NOT NULL,
    paid BOOLEAN DEFAULT FALSE NOT NULL,
    qr_seed TEXT NOT NULL,
    zone TEXT NOT NULL,
    origin_zone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL, -- 'marketplace' or 'external'
    status TEXT NOT NULL, -- 'escrow', 'in_transit', 'at_store', 'delivered'
    buyer_name TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_image TEXT,
    price NUMERIC NOT NULL,
    destination_address TEXT NOT NULL,
    origin_address TEXT,
    assigned_store TEXT NOT NULL,
    qr_seed TEXT NOT NULL,
    zone TEXT NOT NULL,
    origin_zone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on all tables as requested
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create Policies to allow public (anon) read/write access for simplicity in MVP testing,
-- but showing proper RLS setup.

-- Stores Policies
CREATE POLICY "Allow public read of stores" ON public.stores
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert of stores" ON public.stores
    FOR INSERT WITH CHECK (true);

-- Products Policies
CREATE POLICY "Allow public read of products" ON public.products
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert of products" ON public.products
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update of products" ON public.products
    FOR UPDATE USING (true) WITH CHECK (true);

-- External Orders Policies
CREATE POLICY "Allow public read of external_orders" ON public.external_orders
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert of external_orders" ON public.external_orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update of external_orders" ON public.external_orders
    FOR UPDATE USING (true) WITH CHECK (true);

-- Orders Policies
CREATE POLICY "Allow public read of orders" ON public.orders
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert of orders" ON public.orders
    FOR INSERT WITH CHECK (true);

-- Allow public updates (to advance orders / deliver orders / etc.)
CREATE POLICY "Allow public update of orders" ON public.orders
    FOR UPDATE USING (true) WITH CHECK (true);

-- Optional: Insert seed data for the stores/Nano-Hubs based on types.ts
INSERT INTO public.stores (name, zone) VALUES
('Papelería Lupita - Zapopan Centro', 'Zapopan Centro'),
('Farmacias Similares - Av. Hidalgo', 'Zapopan Centro'),
('Oxxo Centro - Frente al IMSS', 'Zapopan Centro'),
('Tiendita Doña Mary - Bugambilias', 'Bugambilias'),
('Oxxo Bugambilias - Entrada 3', 'Bugambilias'),
('Mini Super El Sol - Circuito Bugambilias', 'Bugambilias'),
('Super 7 La Esmeralda - Paseos del Sol', 'Paseos del Sol'),
('Mini Super El Sol - Blvd. Paseos', 'Paseos del Sol'),
('Abarrotes Lupita - Esquina Cerezos', 'Paseos del Sol'),
('Abarrotes Don Pepe - Santa Anita', 'Santa Anita'),
('Oxxo Las Flores - Santa Anita', 'Santa Anita'),
('Papelería El Lápiz - Santa Anita', 'Santa Anita'),
('Mini Super El Sol - Tlajomulco Centro', 'Tlajomulco Centro'),
('Farmacias Guadalajara - Tlajomulco', 'Tlajomulco Centro'),
('Oxxo Tlajomulco - Glorieta Central', 'Tlajomulco Centro'),
('Super 7 La Esmeralda - La Estancia', 'La Estancia'),
('Papelería Lupita 2 - Sector La Estancia', 'La Estancia'),
('Tiendita Doña Mary - La Estancia', 'La Estancia')
ON CONFLICT (name) DO NOTHING;
