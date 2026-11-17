# Catálogo de scripts

Ejecuta los comandos desde la raíz. `package.json` es la fuente de los comandos npm. Los nombres `*-live.ts` describen comprobaciones contra servicios, no una autorización para usar dinero real.

## Trabajo local

- `prepare-next-cache.cjs` y `local-next-cache.cjs`: separan desarrollo y producción. En Windows con OneDrive, las carpetas generadas apuntan mediante junction a una caché fuera de OneDrive. La migración y `dev:fresh` conservan las carpetas anteriores; no cambian el código ni la sincronización.
- `prepare-production-schema.cjs`: genera SQL y manifiesto locales para revisión; no conecta a la base.
- `check-repository.cjs`: comprueba enlaces de las guías de entrada y rutas privadas/generadas en Git; está incluido en `npm run check`. No sustituye un análisis del contenido de secretos.
- `env-checker.js`: diagnóstico de configuración; revisa su salida antes de compartirla.
- `verify-backup-artifact.cjs`: comprueba un respaldo existente; no demuestra por sí mismo una restauración ni cobertura de Storage.

Los comandos `format:check`, `lint`, `typecheck`, `test`, `test:cache` y `test:scripts` son las verificaciones locales agrupadas en `npm run check`. No requieren secretos de producción.

## Desarrollo con servicios externos

- `listen-stripe-development.cjs`: listener de Stripe TEST hacia el servidor local.
- `create-test-checkout.cjs`: crea datos y una sesión de compra de prueba.
- `inspect-historical-stripe-event.cjs`: consulta eventos de la cuenta configurada.
- `verify-test-checkout-event.cjs`, `verify-webhook-development.cjs`: verifican eventos y persistencia del entorno configurado; leer sus argumentos antes de ejecutar.
- `verify-commerce-live.ts`, `verify-connect-flow-live.ts`, `verify-connect-refunds-live.ts`, `verify-delivery-live.ts`, `verify-disputes-live.ts`, `verify-partial-refunds-live.ts`: comprobaciones de integración que pueden crear o modificar productos, pedidos, casos, pagos de prueba o envíos. Inspecciona el archivo y sus controles de entorno antes de ejecutarlo.

- `minimatch-compat.cjs`: adaptador de la configuración de ESLint para que los plugins anteriores puedan llamar la versión moderna corregida de minimatch. Conserva sus exportaciones y constructor; no sustituye el algoritmo ni deshabilita reglas.

## Operación y producción

- `operations-worker.cjs`: `npm run operations:dev` carga el entorno de desarrollo y consulta localhost cada minuto. Incluye rastreo automático, reservas y notificaciones. Configura `ROUTEFLOW_OPERATIONS_ORIGIN` si usas otro puerto local. El rastreo consulta hasta tres envíos vencidos por ejecución: cada cinco minutos normalmente y diez tras un fallo. El worker puede generar efectos en proveedores según su configuración; no debe usar credenciales LIVE durante pruebas.
- `configure-dev-operations.cjs`: prepara la operación de desarrollo.
- `provision-operations-vault.cjs`: configuración de operación y secretos; requiere revisión del destino.
- `production-preflight.cjs`, `verify-production-database.cjs`, `verify-production-services.cjs`: inspecciones del entorno configurado; no equivalen a aprobación comercial.
- `backup-production.cjs`: crea respaldos privados; necesita credenciales y almacenamiento apropiados. Usa la documentación de operación y comprueba la restauración aparte.

Para archivos `.ts`, usa un ejecutor TypeScript compatible que hayas instalado conscientemente; no se descargan herramientas automáticamente como parte del arranque normal. Ningún script remoto forma parte de `npm run dev` o de `npm run check`.
