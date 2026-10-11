# RouteFlow: operación V2

Se mantiene el MVP y su autenticación Clerk. Las migraciones de `supabase/migrations` están aplicadas únicamente al proyecto de desarrollo. No se modificó producción. Consulta también `PRODUCTION_READINESS.md`.

## Funcionalidad

- **Stripe Connect:** Ajustes → Conectar cuenta. Se usa Accounts v2, configuración recipient y alta alojada por Stripe. RouteFlow consulta las capacidades reales, sin simular verificación de identidad. El formulario de Stripe pide al vendedor sus datos y cuenta bancaria. El regreso a RouteFlow no equivale a una verificación aprobada.
- **Transferencias:** el proceso de operaciones toma pedidos COMPLETED, pagados, sin disputa abierta ni reembolso en curso, y con cuenta habilitada. Transfiere total menos comisión de plataforma, usando el cobro de origen y una clave idempotente por pedido. TRANSFERRED significa que Stripe recibió la transferencia a la cuenta conectada; el depósito al banco depende del calendario de payouts de Stripe. Producción tiene un interruptor explícito desactivado. La comisión actual sigue siendo 5 % del producto; RouteFlow asume las comisiones de procesamiento y debe revisar su margen antes de lanzar.
- **Inventario:** reserva, pedido, partida y evento se guardan en una transacción. Checkout vence a los 30 minutos. El webhook de expiración y el proceso programado devuelven stock una sola vez. El proceso vuelve a consultar Stripe antes de liberar; un pago confirmado se reconcilia. Los pedidos antiguos sin fecha de reserva no se cancelan automáticamente.
- **FedEx:** Productos permite guardar peso, largo/ancho/alto y quién paga. Si paga el comprador, checkout obtiene tarifas reales del sandbox, guarda una cotización de 15 minutos vinculada a dirección y paquete, y suma envío a Stripe. Si paga el vendedor, el checkout muestra envío incluido y no suma cargo. La etiqueta sigue facturándose a la cuenta FedEx del vendedor/plataforma. Se conserva el paquete y origen del pedido para que editar el producto no cambie el envío ya vendido. El servicio comprado debe coincidir con la etiqueta.
- **Notificaciones:** cada cambio relevante del pedido agrega mensajes del comprador y vendedor a una cola persistente dentro de la misma transacción. Hay deduplicación, bloqueo de trabajos, reintentos y recuperación. El resumen del vendedor muestra su bandeja. En TEST los mensajes son PREVIEW y no se envían correos reales. En producción se usa Resend mediante su API, con remitente verificado.
- **Disputas:** el comprador autorizado abre una disputa atómicamente. Comprador y vendedor pueden adjuntar JPG/PNG/PDF privados, máximo 5 MB. El vendedor responde desde Disputas; se muestra el plazo de 3 días. `/admin/disputes` exige rol ADMIN y permite resolver a favor del vendedor o con reembolso completo. El plazo vencido requiere revisión humana; no provoca reembolso ni transferencia automática. Un reembolso revierte primero cualquier transferencia existente y solo marca REFUNDED después de confirmación de Stripe. Los reembolsos parciales se registran de forma acumulativa; consulta la sección de reembolsos.
- **Preparación de tienda:** el resumen comprueba contacto, origen real, producto activo, datos de paquete y Stripe habilitado. La dirección DEMO no completa el paso de origen real.

## Procesos locales

Ejecutar en terminales separadas: `npm run dev`, `npm run stripe:listen` y `npm run operations:dev`. El último procesa cada minuto. `scripts/configure-dev-operations.cjs` genera CRON_SECRET únicamente para este proyecto de desarrollo, conservando copia del archivo de entorno y sin imprimir secretos.

En producción `/api/internal/operations` exige `Authorization: Bearer <CRON_SECRET>`. `vercel.json` usa ejecución diaria compatible con Hobby para el preview. El lanzamiento requiere cambiar a una frecuencia de cinco minutos en un plan o programador que la admita. No se contrataron servicios.

## Configuración pendiente externa

Connect está activado en TEST y la cuenta conectada tiene transferencias y payouts activos, sin requisitos pendientes. Se verificó un cobro de prueba de 100 MXN, confirmación de entrega con PIN y una transferencia única de 95 MXN. Una transferencia a la cuenta conectada no confirma un depósito bancario. La activación de producción sigue pendiente.

También se completó el checkout alojado de Stripe en el navegador, con entrega automática del webhook a localhost y recibo PAID. Sobre el pedido de transferencia se probaron devoluciones de 25 y 75 MXN y reversión proporcional de 23.75 y 71.25 MXN, sin duplicados. El pedido de evidencia de esa transferencia ahora está REFUNDED y la transferencia REVERSED.

Para correo real: configurar RESEND_API_KEY, ROUTEFLOW_EMAIL_FROM con dominio verificado y ROUTEFLOW_EMAIL_DELIVERY=enabled en producción; completar correo de contacto del vendedor. Las vistas previas previas no se convierten en envíos automáticamente.

Para producción: datos reales, credenciales FedEx de producción, Connect y webhooks del entorno correspondiente, cron monitorizado, respaldo/migraciones y pruebas de compra/entrega/reembolso. El webhook `account.updated` existente se conserva para compatibilidad; Accounts v2 se consulta al regresar del alta y antes de cada transferencia. No se configuró un destino de eventos thin de Accounts v2.

## Verificación reproducible

`npm test` y `npm run build`. `tests/commerce.postgres.sql` ejecuta pruebas transaccionales con ROLLBACK: inventario, cancelación duplicada, pedido pagado, deduplicación de notificaciones, resolución de disputa, carreras transferencia/reembolso y permisos privados. `tests/refunds.postgres.sql` cubre devoluciones parciales, acumulación, límites, fallo bancario y alertas de disputas vencidas.

## Reembolsos y recuperación

El vendedor puede devolver parte del pago desde el detalle del pedido. `refunded_amount` acumula lo confirmado por Stripe; una devolución parcial conserva el pedido y el pago activos y la completa los marca REFUNDED. Cada solicitud tiene clave idempotente, bloqueo concurrente, registro persistente y recuperación. Los eventos consultan el estado actual en Stripe para evitar aplicar estados antiguos. Si hubo transferencia, se revierte únicamente la parte proporcional correspondiente. Un fallo bancario genera una alerta y conserva el bloqueo de transferencia hasta revisión. El total de ventas mostrado descuenta las devoluciones confirmadas.

Las reservas antiguas requieren verificar Stripe y confirmar si habían descontado inventario. No se devuelve stock sin esa revisión. Las disputas vencidas generan una alerta deduplicada; `/admin/operations` muestra ejecuciones, alertas y fallos y exige rol ADMIN. No se toman decisiones financieras automáticamente por vencimiento.

`scripts/verify-commerce-live.ts` se empaqueta con esbuild y ejecuta usando `@next/env`: cotización real FedEx sandbox, checkout Stripe TEST con envío, expiración, devolución de stock y notificación PREVIEW. Usa fixtures desechables y reporta el bloqueo externo de Connect. `scripts/verify-delivery-live.ts` verifica recibo, PIN y PDF FedEx sandbox con limpieza posterior.

Referencias: https://docs.stripe.com/api/v2/core/accounts/create · https://docs.stripe.com/api/v2/core/account-links/create · https://docs.stripe.com/api/transfers/create · https://resend.com/docs/api-reference/emails/send-email · https://vercel.com/docs/cron-jobs/usage-and-pricing
