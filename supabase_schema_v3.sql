-- =============================================================================
-- ROUTEFLOW — CANONICAL SCHEMA V3
-- =============================================================================
-- Statement order is load-bearing and must not be rearranged:
--   1. enums + helper function   2. ALL tables   3. ENABLE RLS
--   4. policies                 5. indexes + triggers
-- Every table is created before any ALTER/POLICY/INDEX that names it, so a
-- newly added table cannot fail with 42P01.
--
-- Safe to re-run: CREATE TYPE/OBJECT use IF NOT EXISTS or an exception guard,
-- policies are DROPped first, and triggers are DROPped before CREATE.
-- This script never drops a table, truncates, or deletes data.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------

-- =============================================================================
-- 1. ENUMS + HELPER
-- =============================================================================
-- Enumerated domains
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('unverified', 'pending', 'verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'CREATED', 'PAYMENT_PENDING', 'PAID', 'READY_TO_SHIP', 'SHIPPED',
    'IN_TRANSIT', 'DELIVERED', 'BUYER_CONFIRMED', 'COMPLETED',
    'CANCELLED', 'REFUNDED', 'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('PENDING', 'AUTHORIZED', 'SUCCEEDED', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE purchase_link_status AS ENUM ('active', 'inactive', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shipment_status AS ENUM (
    'LABEL_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY',
    'DELIVERED', 'FAILED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shipping_provider AS ENUM ('DHL', 'FEDEX', 'UBER', 'MOCK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dispute_status AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dispute_reason AS ENUM (
    'product_not_received', 'wrong_product', 'damaged_product', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM (
    'PURCHASE_LINK_VIEWED', 'CHECKOUT_STARTED', 'PAYMENT_STARTED',
    'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'ORDER_CREATED', 'ORDER_SHIPPED',
    'ORDER_DELIVERED', 'BUYER_CONFIRMED', 'ORDER_COMPLETED', 'ORDER_CANCELLED',
    'DISPUTE_CREATED', 'REFUND_CREATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- =============================================================================
-- 2. TABLES (all 12, before any RLS/policy/index references them)
-- =============================================================================
-- SELLERS ---------------------------------------------------------------------
-- `user_id` is the Clerk subject id and is the ONLY trusted link between a
-- session and a seller account. UNIQUE prevents one Clerk user owning two
-- stores, which would make ownership checks ambiguous.
CREATE TABLE IF NOT EXISTS sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  store_username TEXT NOT NULL UNIQUE,
  store_name TEXT NOT NULL,
  instagram_handle TEXT,
  logo_url TEXT,
  kyc_status kyc_status NOT NULL DEFAULT 'unverified',
  kyc_document_url TEXT,
  description TEXT,
  -- Required before a real shipment can be created. Nullable because a seller
  -- may publish products before configuring where they ship from; the shipping
  -- layer refuses to dispatch until this is populated.
  ship_from_address JSONB,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PRODUCTS --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT,
  price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'MXN' CHECK (char_length(currency) = 3),
  image_url TEXT,
  images TEXT[] NOT NULL DEFAULT '{}',
  category TEXT,
  -- DEFAULT 10, not 0: `createOrderFromPurchaseLink` refuses a product at zero,
  -- so a 0 default made every product inserted without an explicit stock
  -- permanently unsellable. 10 matches the product form's own default.
  -- See `supabase_schema_v4_stock.sql`.
  stock INTEGER NOT NULL DEFAULT 10 CHECK (stock >= 0),
  is_express BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  delivery_options TEXT[] NOT NULL DEFAULT '{shipping}',
  -- Needed to build a real label. NULL means "cannot ship yet", which the
  -- shipping layer treats as a configuration error, never as 1kg.
  weight_kg NUMERIC(8, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PURCHASE LINKS --------------------------------------------------------------
-- This table did not exist in V2, which is why every generated /p/{id} link
-- was stored only in .routeflow-data/store.json and died on redeploy.
CREATE TABLE IF NOT EXISTS purchase_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- URL-safe, unguessable, and the public identifier buyers share in WhatsApp.
  public_id TEXT NOT NULL UNIQUE CHECK (public_id ~ '^[A-Z0-9]{6,16}$'),
  status purchase_link_status NOT NULL DEFAULT 'active',
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ORDERS ----------------------------------------------------------------------
-- Note: there is no `product_id` column. Line items live in `order_items`, so
-- a single order can hold several products without a schema change.
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  purchase_link_id UUID REFERENCES purchase_links(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  shipping_address JSONB NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'shipping',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'MXN',
  platform_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status order_status NOT NULL DEFAULT 'CREATED',
  payment_status payment_status NOT NULL DEFAULT 'PENDING',
  -- SHA-256 hash of the buyer's access token. The plaintext is shown to the
  -- buyer once and never stored, so a database leak cannot be replayed.
  buyer_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- ORDER ITEMS -----------------------------------------------------------------
-- Captures title and unit price at purchase time, so editing a product later
-- can never rewrite the history of an order that already happened.
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  image_url TEXT,
  -- Price captured at purchase time: later price edits cannot rewrite history.
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

-- PAYMENTS -------------------------------------------------------------------
-- Declared before `refunds` because refunds.payment_id references it.
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  -- UNIQUE so a Stripe session or intent can be attached to exactly one order.
  checkout_session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REFUNDS --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  provider_refund_id TEXT UNIQUE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'requested_by_customer',
  status refund_status NOT NULL DEFAULT 'REQUESTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SHIPMENTS ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider shipping_provider NOT NULL,
  provider_shipment_id TEXT,
  tracking_number TEXT NOT NULL,
  service_code TEXT NOT NULL,
  carrier_name TEXT NOT NULL,
  status shipment_status NOT NULL DEFAULT 'LABEL_CREATED',
  tracking_url TEXT,
  label_url TEXT,
  estimated_delivery TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SHIPMENT EVENTS -------------------------------------------------------------
-- Carrier scan history. `occurred_at` is when the carrier reported the event,
-- distinct from when we happened to poll and store it.
CREATE TABLE IF NOT EXISTS shipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status shipment_status NOT NULL,
  description TEXT NOT NULL,
  location TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Deduplicates repeated polls of the same carrier scan.
  UNIQUE (shipment_id, status, occurred_at)
);

-- DISPUTES --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reason dispute_reason NOT NULL,
  description TEXT NOT NULL,
  status dispute_status NOT NULL DEFAULT 'OPEN',
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A buyer can only open one dispute per order.
  UNIQUE (order_id)
);

-- EVENTS ----------------------------------------------------------------------
-- The single source of truth for analytics. Every dashboard metric is a
-- COUNT/SUM over this table, so metrics can never disagree with reality.
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type event_type NOT NULL,
  seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  purchase_link_id UUID REFERENCES purchase_links(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2),
  currency TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- STRIPE WEBHOOK EVENTS -------------------------------------------------------
-- Idempotency is enforced by the PRIMARY KEY, not by an in-process Set.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  -- Stripe's own event id. The uniqueness constraint is what makes the INSERT
  -- fail on a redelivery, giving a real happens-once guarantee.
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. ROW LEVEL SECURITY — enable (all 12 tables)
-- =============================================================================
-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Every table has RLS enabled. Anonymous access is read-only and narrow.
--
-- Note the deliberate absence of "seller can update their own store" policies
-- from V2: sellers are identified by Clerk, not by a Postgres role, so RLS
-- cannot verify ownership. Authorisation therefore lives in lib/authz.ts where
-- it is unit tested. Enabling RLS with no write policy means a leaked anon key
-- cannot write anything at all, which is the safer failure mode.

ALTER TABLE sellers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Public storefront: a purchase link renders the store and its active
-- products. Buyer PII lives on `orders`, which is denied below.
-- `sellers` has NO public SELECT policy, on purpose.
--
-- An earlier revision of this file granted it with `USING (true)`, which
-- exposed the whole row to the public anon key: contact_email, contact_phone,
-- ship_from_address and kyc_document_url. Those columns must never be
-- readable by a visitor.
--
-- The storefront does not need them. `GET /api/public/links/[publicId]`
-- resolves the seller on the server with the service role and returns only
-- `toPublicPurchaseLinkView()` (store name, username, logo, description).
-- Nothing in `src/` imports the browser anon client. See
-- `supabase_schema_v5_sellers_pii.sql`.
--
-- RLS with no SELECT policy denies every read to anon and authenticated roles.
DROP POLICY IF EXISTS "public read sellers" ON sellers;

DROP POLICY IF EXISTS "public read active products" ON products;
CREATE POLICY "public read active products" ON products FOR SELECT USING (is_active);

-- =============================================================================
-- 4. ROW LEVEL SECURITY — policies
-- =============================================================================
-- Buyers resolve their own order via a hashed token that the API verifies, so
-- RLS must allow NO direct anon read of orders. Explicit deny, not an omission.
DROP POLICY IF EXISTS "deny anon orders" ON orders;
CREATE POLICY "deny anon orders" ON orders FOR SELECT USING (false);

DROP POLICY IF EXISTS "deny anon order_items" ON order_items;
CREATE POLICY "deny anon order_items" ON order_items FOR SELECT USING (false);

DROP POLICY IF EXISTS "deny anon payments" ON payments;
CREATE POLICY "deny anon payments" ON payments FOR SELECT USING (false);

DROP POLICY IF EXISTS "deny anon refunds" ON refunds;
CREATE POLICY "deny anon refunds" ON refunds FOR SELECT USING (false);

DROP POLICY IF EXISTS "deny anon disputes" ON disputes;
CREATE POLICY "deny anon disputes" ON disputes FOR SELECT USING (false);

DROP POLICY IF EXISTS "deny anon shipments" ON shipments;
CREATE POLICY "deny anon shipments" ON shipments FOR SELECT USING (false);

DROP POLICY IF EXISTS "deny anon shipment_events" ON shipment_events;
CREATE POLICY "deny anon shipment_events" ON shipment_events FOR SELECT USING (false);

-- Analytics and webhook receipts are server-only.
DROP POLICY IF EXISTS "deny anon events" ON events;
CREATE POLICY "deny anon events" ON events FOR SELECT USING (false);

DROP POLICY IF EXISTS "deny anon stripe_webhook_events" ON stripe_webhook_events;
CREATE POLICY "deny anon stripe_webhook_events" ON stripe_webhook_events FOR SELECT USING (false);

-- Public purchase links are readable so /p/{id} can render. The public API
-- returns a purpose-built DTO (see domain/dto.ts) regardless of this policy.
DROP POLICY IF EXISTS "public read active links" ON purchase_links;
CREATE POLICY "public read active links" ON purchase_links
  FOR SELECT USING (status = 'active' AND (expires_at IS NULL OR expires_at > NOW()));

-- =============================================================================
-- 5. TRIGGERS
-- =============================================================================
-- =============================================================================
-- updated_at TRIGGERS
-- =============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sellers','products','purchase_links','orders','payments',
    'refunds','shipments','disputes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- =============================================================================
-- 6. INDEXES
-- =============================================================================
-- =============================================================================
-- INDEXES
-- =============================================================================
-- Only indexes that back a real query path. V2 shipped `idx_products_express`
-- and `idx_orders_buyer_email` which nothing ever filtered by; those are gone.

CREATE INDEX IF NOT EXISTS idx_sellers_user_id       ON sellers(user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_store_username ON sellers(store_username);
CREATE INDEX IF NOT EXISTS idx_sellers_kyc_status    ON sellers(kyc_status);

-- UNIQUE already indexes public_id, so /p/{public_id} lookups use that.
CREATE INDEX IF NOT EXISTS idx_purchase_links_seller  ON purchase_links(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_links_product ON purchase_links(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_links_active  ON purchase_links(public_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active;

-- Seller dashboards list orders newest-first, scoped to one seller.
CREATE INDEX IF NOT EXISTS idx_orders_seller_created ON orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);

-- Every buyer-facing request resolves the order by its hashed token.
CREATE INDEX IF NOT EXISTS idx_orders_token_hash ON orders(buyer_token_hash);
CREATE INDEX IF NOT EXISTS idx_orders_number    ON orders(order_number);

CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_payments_order   ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order    ON refunds(order_id);

CREATE INDEX IF NOT EXISTS idx_shipments_order        ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking     ON shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events(shipment_id, occurred_at DESC);

-- =============================================================================
-- EVENTS INDEXES
-- =============================================================================
-- Analytics always reads "one seller's events, newest first".
CREATE INDEX IF NOT EXISTS idx_events_seller_created ON events(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_created   ON events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_order          ON events(order_id);
CREATE INDEX IF NOT EXISTS idx_events_link           ON events(purchase_link_id);
