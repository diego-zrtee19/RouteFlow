# Esquemas conservados

Estos archivos se movieron desde la raíz sin modificar su SQL. No son una lista de migraciones que deban aplicarse en orden a cualquier proyecto.

- `supabase_schema.sql`: MVP V1, antecedente.
- `supabase_schema_v2.sql` y `supabase_migrate_v2_clerk.sql`: V2, incompatible con el modelo canónico de vendedor V3.
- `supabase_schema_v3.sql`: base canónica de V3.
- `supabase_schema_v4_stock.sql`: reparación histórica que modifica stock existente. **No volver a ejecutar como instalación general**: podría reponer productos agotados intencionalmente.
- `supabase_schema_v5_sellers_pii.sql`: cierre de lectura pública de datos del vendedor.
- `supabase_schema_v6_webhook_reliability.sql`: confiabilidad y actualización atómica de pagos/webhooks.

Para una base nueva y vacía, `npm run production:prepare` prepara un paquete local revisable con los archivos seleccionados y las migraciones incrementales. No ejecuta SQL ni sustituye la revisión del proyecto de destino. Excluye V2 y la reparación V4.

Para una base existente, revisa sus cambios aplicados y utiliza migraciones incrementales apropiadas. Lee [la guía vigente](../../docs/operations/supabase-setup.md).
