# Registro manual de cobros y gastos

Ruta: `/dashboard/finances`. Acceso del vendedor resuelto desde Clerk en servidor; el navegador no decide seller_id ni actor. Tablas y RPC privadas, RLS sin acceso anónimo/autenticado directo, siguiendo el patrón existente.

## Alcance

- Anticipos y cobros declarados en efectivo/transferencia sobre pedidos existentes, con moneda igual al pedido y límite del saldo manual pendiente.
- Gastos por moneda, corte mensual de registros en UTC (indicado en pantalla), exportación CSV compatible con Excel y neutralización de fórmulas en campos de texto.
- Corrección por anulación con motivo. No se borran movimientos. El actor original y la fecha quedan registrados; aún no hay colaboradores ni contabilidad certificada.
- Saldos manuales calculados desde todos los movimientos vigentes de cada pedido, independientes del mes. Al coexistir cobros manuales y éxito/reembolso del proveedor se solicita conciliación.
- Clave de idempotencia y bloqueo transaccional por negocio. Un reintento idéntico devuelve el mismo registro; reutilizar la clave con otros datos falla. El navegador conserva el cuerpo del intento incierto en memoria y bloquea editarlo hasta comprobarlo. No se garantiza recuperación del intento si se cierra/recarga el navegador; revisar historial antes de otro registro.

Registrar manualmente NO cambia payment_status, estado de entrega, inventario, Stripe ni transferencias al vendedor. Tampoco verifica un comprobante bancario. Estos registros no permiten prometer protección de pago ni utilidad neta. Una futura venta completamente manual requiere un recorrido específico de pedido, reservas y despacho; no activarlo cambiando estados a mano.

La pantalla muestra hasta 500 movimientos del mes y los últimos 100 pedidos. Los límites se indican; si se superan 500 movimientos, los totales se marcan parciales y la exportación se bloquea para evitar un archivo incompleto. Pendiente paginación/exportación masiva y filtros por fecha local/operación. No mezclar monedas.

## Verificación

`tests/financeLedger.test.ts`: importes, centavos, fórmulas CSV, acceso, origen y propiedad tomada de sesión.
`tests/sql/finance-ledger.sql`: fixtures sintéticos con ROLLBACK, anticipos, reintento, saldo, aislamiento, exceso, conflicto proveedor/manual y ausencia de acceso público. No llama pagos ni envía mensajes.

Migraciones DEV: `20261124024826_seller_finance_ledger.sql` y `20261124180803_seller_finance_balances.sql`. No se aplicaron en Production.

## Recorrido verificado en Preview — 24 de noviembre de 2026

Commit funcional `7694c9b`, despliegue `dpl_AoK4SSipCUeBu4ZF4qHfaV3qnBHn` READY en Preview. Compilación, tipos y ESLint aprobados; 350 pruebas y SQL con ROLLBACK aprobados. Desde el navegador autenticado se registró un gasto ficticio de 25 MXN etiquetado QA, se anuló con motivo y se descargó CSV. Se verificó el archivo descargado: contiene el registro marcado Anulado=Sí. No se hicieron pagos ni movimientos bancarios reales. La prueba de anticipos/saldos/aislamiento se realizó con fixtures SQL, porque los pedidos de esta tienda ya estaban pagados o cancelados. No afirmar un anticipo real probado en navegador.
