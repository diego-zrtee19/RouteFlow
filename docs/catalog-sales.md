# RouteFlow: two sales paths

- Quick sale: `/dashboard/products/new?mode=quick` publishes one product and its `/p/[publicId]` purchase link. New quick products stay outside the catalog until the seller adds them.
- Catalog: `/dashboard/catalogo` manages the seller's name, description, public logo, product visibility and variant inventory. `/catalogo/[username]` shows only that seller's active visible products, with optional variants and a persisted cart. Checkout is `/catalogo/[username]/checkout`.

Buying requires no account. One catalog checkout produces one Stripe session, one order and multiple immutable order items. Existing receipts, private tracking, NIP, support and verified-email Mis compras use that same order. Variant products cannot bypass selection through the legacy single-item checkout. A confirmed receipt clears only the unchanged purchased cart; canceled payments retain the cart.

Prices, ownership, visibility, currency, quantity, delivery compatibility and inventory are validated on the server. Reservation locks products and variants in sorted order and creates all order items atomically. Pending stock is restored once through the existing cancellation/expiry worker; successful payment never deducts it again. Seller inventory updates require ownership.

## Shipping scope

One seller, one currency and one parcel per checkout. Shipping requires a common delivery method, configured origin and every product's weight/dimensions. The initial combined package sums weight and height per unit and uses the largest length/width. This is a conservative estimate, not a packing optimizer: validate actual packaging and carrier rates before LIVE shipping. Buyer-paid quotes bind destination and current cart configuration, expire, and must match again at reservation. Existing shipping labels use the order's combined package snapshot.

## Development verification (2026-10-11)

Migrations `20261011232351_catalog_cart_variants.sql` and `20261011233333_catalog_variant_inventory.sql` applied to development only. Production needs its own reviewed incremental migration and backup; do not replay the function rename.

- `npm test`: 179 passing tests.
- `tests/catalog-cart.integration.sql`: 17 database checks, ending in ROLLBACK. Covers authoritative variant prices, combined weight, atomic inventory, failed reservation rollback, ownership, required variants, quick links, duplicate payment, cancellation and restocking.
- Browser TEST checkout: two variant gorras (120 MXN each) plus one camisa (80 MXN), total 320 MXN, order `RF-FDE3R4`. PAID/SUCCEEDED, two item lines, one payment, automatic Stripe webhook PROCESSED.
- Buyer receipt and tracking include both lines and NIP. Catalog and tracking checked at 390 px without horizontal overflow.

No LIVE charge, shipment or actual email was activated. Fictional browser test products are clearly marked PRUEBA in the development database.
