# Configuración pendiente para ventas reales

El Preview permanece en Stripe TEST, FedEx sandbox y correo de vista previa.
El propietario pidió preparar lo posible sin pagos ni envíos reales. No se
compró dominio ni se contrató un plan. Supabase Production está separado y
vacío, pero aún no hay aplicación LIVE verificada.

## Correo

Para enviar a compradores hace falta un dominio propio, una cuenta de Resend
y verificar los registros DNS que Resend indique. La URL de Vercel sirve para
probar la app; no permite verificar un dominio de correo ajeno. Las variables
son RESEND_API_KEY y ROUTEFLOW_EMAIL_FROM. No enviar secretos por chat ni Git.
Mantener ROUTEFLOW_EMAIL_DELIVERY=preview hasta verificar remitente y autorizar
una prueba real a un destinatario acordado. Los correos TEST no se enviarán
aunque delivery esté enabled.

`npm run production:verify:services` consulta dominios de Resend sin enviar
correos. Requiere acceso para leer dominios; una clave limitada a envío puede
devolver 403. No ampliar permisos de una clave de envío solo para pasar este
chequeo: verificar el dominio desde el panel o una integración autorizada.
Las pruebas comprueban idempotencia, fallo/reintento y separación TEST/LIVE.

## Stripe, Clerk y FedEx

El propietario completa identidad, acuerdos y activación LIVE en Stripe, y
la instancia Production de Clerk. Las claves LIVE se configuran exclusivamente
en Production cuando se autorice su destino. Cada entorno necesita su webhook
Stripe y su secreto propio. No copiar el secreto del listener local.

FedEx necesita cuenta real, proyecto de producción, credenciales, dirección
y teléfono reales del origen, peso y dimensiones por producto. El diagnóstico
solo obtiene un token; no crea etiquetas ni valida tarifas o cobertura.
No usar la dirección DEMO de Tlajomulco como origen real.

El chequeo de servicios consulta Stripe balance/account y dominios Resend,
y autentica en FedEx. No cobra, transfiere, reembolsa, envía correo ni genera
envíos. Su resultado no valida Connect, checkout, webhooks, depósito bancario,
tarifas FedEx ni entrega de correo. Ejecutar también production:preflight y
production:verify:database, y completar el recorrido del entorno destino.

## Respaldo y restauración

`npm run production:backup:check` informa si están disponibles la referencia
Production, la conexión Postgres y Docker para el runtime pg_dump de Supabase.
Actualmente faltan conexión y Docker. La contraseña de la base la introdujo
el propietario: configurar ROUTEFLOW_PRODUCTION_DATABASE_URL únicamente en
el archivo local ignorado .env.production.local; no enviarla por chat.

Cuando esos requisitos estén disponibles, production:backup genera roles,
esquema y datos con la CLI oficial. Conservar el respaldo incompleto si falla.
`npm run production:backup:verify -- RUTA_ABSOLUTA_DE_LA_CARPETA` valida proyecto,
archivos y checksums. Los respaldos se guardan en .routeflow-data/production-backups,
ignorados por Git; deben copiarse después a almacenamiento independiente protegido.

La integridad SQL no demuestra restauración. Preparar una base aislada vacía,
restaurar con el procedimiento oficial, comprobar tablas, RPC, RLS y datos,
y ejecutar pruebas de comercio. No restaurar sobre la base activa. Storage
necesita respaldar los archivos aparte de sus metadatos. No hay objetos en
Production por ahora; antes de ventas reales verificar también esa recuperación.
El plan Free no proporciona los respaldos automáticos del plan Pro.

## Antes de lanzar

Confirmar respaldo/restauración, proveedores del entorno destino, dominio HTTPS,
cron Production con secreto propio, compra, entrega, transferencia y reembolso.
Mantener ROUTEFLOW_LIVE_SETTLEMENTS=false hasta completar la validación.
No publicar la rama legacy master como si contuviera la V2.

Referencias: [Supabase backups](https://supabase.com/docs/guides/platform/backups),
[FedEx autorización](https://developer.fedex.com/api/es-es/catalog/authorization/docs.html),
[Stripe balance](https://docs.stripe.com/api/balance/retrieve),
[Resend dominios](https://resend.com/docs/api-reference/domains/list-domains).
