-- =============================================================================
-- ROUTEFLOW - MIGRATION V4: PURCHASABLE STOCK
-- =============================================================================
-- Why this exists
-- ---------------
-- Schema V3 declared `products.stock INTEGER NOT NULL DEFAULT 0`, while
-- `createOrderFromPurchaseLink` refuses any product whose stock is not greater
-- than zero. Every product inserted without an explicit stock therefore landed
-- permanently unsellable: the storefront listed it, the checkout rejected it
-- with "product_out_of_stock", and the seller had no obvious way to tell why.
--
-- This migration makes the default buyable rather than unsellable, repairs the
-- rows that were already trapped, and adds a CHECK that stops a nonsensical
-- negative stock from ever being written again.
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

-- 1. Make the column default BUYABLE.
--    10 is the stock the product form has always offered by default, so this
--    matches existing seller expectations rather than inventing a new number.
ALTER TABLE products
  ALTER COLUMN stock SET DEFAULT 10;

-- 2. Repair products trapped at 0.
--    A seller who deliberately listed something as sold out cannot be
--    distinguished here from one whose insert simply omitted the column, and
--    selling out-of-stock inventory is the worse failure of the two, so ACTIVE
--    rows are made buyable.
--
--    `is_active = false` is the seller's deliberate off switch, so those rows
--    are left exactly as they are rather than having their stock invented for
--    them. `is_active` itself is never modified.
UPDATE products
   SET stock = 10
 WHERE is_active = true
   AND (stock IS NULL OR stock <= 0);

-- 3. Guarantee the column can never be null and can never go negative.
ALTER TABLE products
  ALTER COLUMN stock SET NOT NULL;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_stock_non_negative;

ALTER TABLE products
  ADD CONSTRAINT products_stock_non_negative CHECK (stock >= 0);

COMMIT;