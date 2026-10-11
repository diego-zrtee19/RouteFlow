# RouteFlow B2B2C

## Schema

1. Ejecuta `supabase_schema_v3.sql` en un proyecto **nuevo**. Es el esquema
   canónico: tablas `sellers` / `products` / `purchase_links` / `orders` /
   `order_items` / `payments` / `shipments` / `disputes` / `events`.
2. Los archivos `supabase_schema_v2.sql` y `supabase_migrate_v2_clerk.sql`
   quedan solo como registro histórico del esquema V2 (`stores` / `store_id` /
   `escrow_status`). **Ninguna parte del código los consulta ya.** No los apliques
   a un proyecto nuevo.
3. No uses `supabase_schema.sql` (MVP V1 de Punto Route).

## Migración V4 — REQUERIDA

Ejecuta `supabase_schema_v4_stock.sql` en el SQL Editor. Es segura de re-ejecutar.

Sin ella, `products.stock` conserva el default `0` del schema V3 mientras
`createOrderFromPurchaseLink` rechaza cualquier producto con stock 0. El
resultado: todo producto creado sin stock explícito queda permanentemente
invendible — la tienda lo muestra y el checkout responde `product_out_of_stock`.

La migración (1) cambia el default a 10, (2) repara las filas ya atrapadas en 0
y (3) añade `CHECK (stock >= 0)`.

Verifícala con:

```bash
npx tsx scripts/verify-flow-live.ts
```

El check *"the DATABASE default is buyable"* debe pasar. La capa de aplicación
ya está corregida (`normaliseStock`), así que un producto creado por la API es
comprable aunque la migración no se haya aplicado; el default de la DB solo
afecta a filas insertadas sin `stock` por otras vías.

## Variables

Clerk, Stripe, `NEXT_PUBLIC_SUPABASE_*` y `SUPABASE_SERVICE_ROLE_KEY`. Las
mutaciones van por API con Clerk + service role; el cliente de Supabase del
navegador está limitado por RLS.

## Flujo

`/p/{publicId}` → `/checkout/{publicId}` → Stripe escrow → `/order/{id}` (token
de comprador o `session_id`) confirma entrega o abre disputa.
