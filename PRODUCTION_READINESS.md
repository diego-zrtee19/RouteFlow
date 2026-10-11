# Preparación de producción

Supabase de producción: `kgoaenzfzkakndkgrwkn`, «RouteFlow Production», en la
organización RouteFlow y región us-east-1. Se confirmó vacío antes de instalar
el paquete canónico V3/V5/V6 y las migraciones en una transacción. Tiene 19 tablas
de RouteFlow (18 públicas y una privada), con RLS y acceso de datos reservado al
servidor. Se configuraron buckets privados para etiquetas/evidencias y fotos de
producto públicas de hasta 3 MB. Se retiró el acceso público a la función de RLS
que Supabase creó automáticamente.

Las cinco suites SQL (comercio, NIP, reembolsos, confiabilidad de webhooks y
reservas antiguas) pasaron usando service_role, con rollback de todos los fixtures.
Sellers, products, orders, payments y webhook_events quedaron en cero. Advisors
no reporta WARN/ERROR; los INFO sobre RLS sin políticas son intencionales para
tablas que solo usa el servidor. Esto valida la base; no valida pagos Stripe LIVE,
correo, identidad ni transporte real. No se copiaron datos TEST. No se configura
un cron LIVE hasta tener una aplicación LIVE verificada y secretos propios.

Las credenciales de Supabase Production y un secreto propio de operaciones están
en `.env.production.local`, ignorado por Git. `npm run production:verify:database`
pasó contra la API real: claves del proyecto correctas, acceso del servidor y
denegación de acceso público a sellers/orders/payments/notification_outbox. Las
variables de Stripe, Clerk, webhook, correo y transporte LIVE siguen pendientes.
Las credenciales de producción todavía no se copiaron a Vercel.

El Preview conserva Supabase desarrollo, Stripe TEST y FedEx sandbox. No se
activaron pagos reales ni correos a compradores. El bootstrap se ejecutó en una
base recién creada sin usuarios, objetos de Storage ni datos de aplicación; no
equivale a un respaldo/restauración de una base con ventas. Antes de ventas reales
falta configurar y probar respaldo y restauración. El esquema se instaló vía SQL
Editor; conservar el manifiesto local y revisar el historial antes de usar db push.

Actualización 10 de octubre: se configuró Supabase Cron en desarrollo para atender
el Preview cada cinco minutos, con el secreto en Vault y una función privada.
El worker local se detuvo. La llamada de verificación devolvió HTTP 200, sin
errores. Ver `OPERATIONS_HOSTING.md`. La automatización de Preview ya no depende
del equipo local; producción necesita su propio job y verificación. El propietario
confirmó que todavía no tiene dominio ni datos reales de origen. Resend no aparece
conectado. Inicialmente solo existía el Supabase de desarrollo; el propietario
creó después RouteFlow Production en el plan Free, tras revisar el costo en el
navegador. No se contrató un plan de pago.

1. Completar Connect en el sandbox de Stripe, usando la misma cuenta que las claves de RouteFlow. Probar alta, capacidades, transferencia, depósito y reversión. Los acuerdos y datos personales los completa el propietario.
2. Completar correo del vendedor, dirección real y peso/dimensiones de cada producto. Los datos DEMO no se consideran válidos para lanzar.
3. Crear o identificar un Supabase de producción separado. Preparar `.env.production.local`, sin subirlo a Git, con sus claves, Stripe LIVE, Clerk LIVE, FedEx LIVE, dominio HTTPS y secretos del proceso automático.
4. Configurar Resend, verificar el dominio del remitente y habilitar envío. El modo TEST conserva vistas previas y no envía a compradores reales.
5. Ejecutar `npm run production:preflight`. Solo revisa configuración y conserva un reporte sin secretos. No valida capacidades de Stripe ni conectividad de FedEx por sí solo.
6. Ejecutar `npm run production:backup` con ROUTEFLOW_PRODUCTION_PROJECT_REF y ROUTEFLOW_PRODUCTION_DATABASE_URL. El script usa la CLI oficial de Supabase para roles, esquema y datos, y registra checksums. Requiere conexión y Docker disponibles. Los archivos de Storage necesitan un respaldo aparte. Probar la restauración en un entorno separado antes de aplicar migraciones.
7. Para una base nueva y vacía, ejecutar `npm run production:prepare`: genera `.routeflow-data/production-package/bootstrap.sql` y un manifiesto de hashes para revisión. Parte del esquema canónico V3, V5, V6 y las migraciones locales. Excluye V2, que usa relaciones distintas, y la reparación V4 que cambia inventario agotado a 10. El stock por defecto permanece en cero. El paquete rechaza una base que ya contenga tablas RouteFlow y agrupa la instalación en una transacción. No se ha probado su ejecución sobre un Supabase nuevo: falta crear el entorno separado. Para una base existente, comparar su historial y aplicar únicamente migraciones incrementales faltantes después de respaldo/restauración. No ejecutar este bootstrap sobre desarrollo ni sobre producción con datos.
8. Registrar webhooks de checkout/pagos y refund.created/refund.updated/refund.failed en el entorno correspondiente. Configurar eventos Accounts v2 o mantener la consulta de capacidades antes de transferir.
9. Para producción, programar `/api/internal/operations` cada cinco minutos con CRON_SECRET en un plan/programador que permita esa frecuencia. El preview Hobby usa un cron diario a las 12:00 UTC para admitir el despliegue; no proporciona la frecuencia necesaria para lanzar. En desarrollo el worker local sigue funcionando cada minuto. `/admin/operations` muestra ejecuciones, alertas, webhooks y correos fallidos; requiere rol ADMIN. Si no hay ejecución en quince minutos, muestra advertencia.
10. Realizar una compra completa, entrega, transferencia y reembolso del entorno destino. Habilitar ROUTEFLOW_LIVE_SETTLEMENTS únicamente después de validar el recorrido. Vigilar al menos la primera hora: cero fallos acumulados, cron activo, importes conciliados y ningún pedido pagado sin registro de pago.

Los reembolsos parciales se registran individualmente con claves de idempotencia y total acumulado. El pedido mantiene su estado mientras quede saldo; solo se marca REFUNDED al devolver el total. La comisión retenida se reduce proporcionalmente al importe devuelto. Los casos de fallo bancario o reembolsos hechos fuera de RouteFlow requieren revisión, y se bloquean nuevas transferencias mientras haya una devolución en curso.

Las reservas antiguas se consultan en Stripe. Si no hay evidencia de que descontaron stock, el vendedor debe revisar inventario y elegir si devolver las unidades. Si Stripe no encuentra la sesión con las claves actuales, no se cancelan automáticamente. Las disputas vencidas generan alertas y notificaciones, sin decisiones monetarias automáticas.

## Entrega a hosting

`.env.production.example` enumera las variables necesarias, sin credenciales. La V2 está guardada en GitHub en `codex/routeflow-v2-preview`; master conserva el MVP legacy. El preview permite revisar sin comprar dominio. Los correos del producto necesitan un remitente/dominio verificado. El cron de cinco minutos no debe contratarse ni darse por disponible sin verificar el plan.

El proyecto `route-flow` existe en el equipo `diego-zarates-projects-03e0bdab`. La primera importación del commit legacy `0462ea34ee6002e61427f55a83746e6e9458f334` falló por Next 15.1.0 incompatible con Clerk 7.9.2. Se corrigieron Next y eslint-config-next a 15.5.27 y el lockfile; Vercel usa Node 24 y npm ci. La instalación limpia, 149 pruebas y build local pasaron.

El deployment Preview `dpl_7YZwXwev48nKruJYfwYf8DqJJZeY` del commit `6ce92f1` terminó READY el 10 de octubre de 2026. URL estable: https://route-flow-git-codex-rou-c78e45-diego-zarates-projects-03e0bdab.vercel.app . Con autorización del propietario, las credenciales de Supabase desarrollo, Clerk TEST, Stripe TEST y FedEx sandbox se guardaron únicamente para esa rama Preview; las privadas son Secret. NEXT_PUBLIC_APP_URL usa HTTPS. No se copiaron secretos a Git ni se modificaron las variables de Production.

El propietario autorizó hacer público únicamente el dominio estable de esta rama Preview mediante Deployment Protection Exceptions. Require Log In sigue activo para los demás dominios. Se verificó que el dominio individual del deployment aún redirige al acceso de Vercel (HTTP 302), mientras el dominio autorizado devuelve HTTP 200. Dashboard sin sesión redirige a Clerk; API de pedidos del vendedor, recibo sin token y operaciones sin CRON_SECRET devuelven HTTP 401. Firmas de webhook inválidas devuelven HTTP 400. Operaciones con su secreto propio de Preview devuelve HTTP 200, sin errores.

Stripe TEST endpoint `we_1UPBt6PveSPGbRqIb2mt59Bk` está habilitado para /api/webhooks/stripe en ese dominio. Su secreto propio está cifrado exclusivamente para la rama Preview; el secreto del listener local no se copió. Se completó Stripe Checkout de 100 MXN en el navegador: pedido `RF-A4UNAX` (`dafe8116-e768-4dbd-9823-a0c1a959e2a6`), evento `evt_1UPBwcPveSPGbRqImFNVEh1l` PROCESSED, un solo pago SUCCEEDED, stock de su producto temporal en cero y recibo PAID con NIP de seis dígitos. El listener local estaba detenido durante la compra; Stripe tenía cero entregas pendientes. Reenvío firmado del mismo evento: HTTP 200, already_processed, un solo pago y un intento procesado. Prueba sintética separada de recuperación: HTTP 500/FAILED sin pedido, luego HTTP 200/PROCESSED al restaurar su fixture; duplicado sin repetir pago ni evento de negocio. Los fixtures sintéticos se eliminaron. El pedido real TEST se conserva como evidencia.

El checkout remoto TEST está verificado. Esto no aprueba producción: falta su infraestructura separada y validación LIVE. El cron diario de Hobby no reemplaza el worker de operaciones frecuente ni implica que los cron se ejecuten automáticamente en Preview; las tareas locales siguen dependiendo del equipo encendido. La gestión del vendedor en el navegador remoto necesita iniciar sesión en ese dominio.
