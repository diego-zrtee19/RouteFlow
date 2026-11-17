# Cierre de los cuatro pendientes — 2 de noviembre de 2026

Alcance: código local y Supabase de desarrollo. Preview y producción todavía no reciben estos cambios. Continúan deshabilitados los cobros, transferencias y envíos LIVE.

## Rastreo automático

El proceso de operaciones llama a `refreshDueTracking`. Reclama hasta tres envíos pagados SHIPPED/IN_TRANSIT mediante un bloqueo de dos minutos en PostgreSQL. Consulta cada cinco minutos; ante fallo, reintenta después de diez minutos. Guarda la última consulta y un diagnóstico breve. Una ejecución caída puede recuperarse cuando vence su bloqueo. La actualización compartida conserva las entregas y respeta las disputas.

Se corrigió además la traducción de códigos reales de FedEx: DL, IT, PU, OD, DE y CA, entre otros. Una respuesta sin estado autoritativo se considera error. OAuth y rastreo tienen tiempos máximos. Se ajustó la lectura de la ventana estimada de entrega.

Verificación: FedEx sandbox respondió HTTP 200 al rastreo de ejemplo; el worker local actualizó automáticamente un pedido sintético y su envío a DELIVERED y guardó sus escaneos. No se compró una guía ni se entregó un paquete real. Los primeros escaneos de esta prueba se registraron antes de corregir la traducción; esa cuenta descartable se elimina al finalizar.

Para ejecutar: servidor local en 3001 más `npm run operations:dev`. El worker comprueba cada minuto, acepta exclusivamente destinos locales y carga explícitamente el entorno de desarrollo. Con otro puerto, usar `ROUTEFLOW_OPERATIONS_ORIGIN`. Requiere mantener ambos procesos activos. En un despliegue hace falta publicar el código y comprobar su programador; no queda activado remotamente por este trabajo local.

## Reintentos de compra

Los checkouts rápido y de catálogo envían una credencial aleatoria de 256 bits por `Idempotency-Key`, conservada en sessionStorage. La base guarda únicamente su hash, la huella de los datos y el pedido asociado. Una función transaccional reserva el inventario una sola vez. Otra conserva los mismos parámetros enviados a Stripe; el pedido proporciona la misma clave de idempotencia para Stripe.

Un reintento recupera el pedido existente antes de revisar otra vez inventario o cotizaciones. Los datos diferentes no pueden reutilizar la misma credencial. Los pagos ya exitosos llevan al recibo. Una respuesta perdida se puede recuperar mediante “Retomar mi intento de pago”, sin rellenar otra vez el formulario ni revelar datos con solo un número de pedido. Las respuestas con credenciales usan no-store. Un intento cancelado permite crear uno nuevo; una reserva pendiente o un resultado incierto no se libera automáticamente desde el navegador.

Verificación HTTP con Stripe TEST: una sesión de $100 para enlace rápido y otra de $100 para catálogo; dos reintentos paralelos posteriores conservaron pedido, sesión y credencial. Recuperar cada intento devolvió el mismo enlace. Las sesiones se expiraron sin completar cobros. Se revisó también el formulario y su acceso a Stripe TEST desde el navegador. Esta revisión detectó y corrigió que la pantalla de agotado ocultaba la recuperación del último artículo reservado. La comprobación HTTP de recuperación pasó; el navegador dejó de responder durante su última revisión, por lo que no se presenta esa comprobación visual final como completada. Las pruebas unitarias cubren pérdida de respuesta, recibo ya pagado, persistencia de la credencial y almacenamiento bloqueado.

Límite deliberado: la protección identifica un intento, no agrupa todas las compras de una persona. Otro dispositivo o una compra modificada pueden iniciar otro intento legítimo. Si el navegador impide sessionStorage, se conservan reintentos durante la página abierta; después de cerrarla, la recuperación por correo verificado sigue siendo necesaria. Los enlaces previos al cambio no adquieren retroactivamente una credencial de reintento.

## Dependencias y reglas

El análisis npm completo terminó con cero vulnerabilidades conocidas, incluidas las herramientas de desarrollo. Se reemplazó la compatibilidad antigua de ESLint por una configuración plana con versiones explícitas y el plugin Next alineado. La cadena glob vulnerable desapareció; minimatch usa la versión corregida 11.0.1, con un adaptador limitado a la configuración de lint para sus consumidores antiguos.

Las pruebas comprueban que siguen funcionando las reglas de React, hooks, accesibilidad y variables no usadas, además de las dos formas de llamar minimatch. No se utilizó audit fix --force ni se desactivó la verificación del build.

## Cachés fuera de OneDrive

En Windows, los proyectos dentro de OneDrive generan `.next` y `.next-dev` físicamente en `%TEMP%/routeflow-generated/<identificador-del-proyecto>`. Las rutas del repositorio son junctions, con una referencia a node_modules para resolver los módulos externos. Las cachés anteriores se conservan. Las comprobaciones rechazan junctions inesperadas y rutas que no pertenecen al espacio generado previsto.

Se verificaron conservación, reinicio, separación de producción/desarrollo, resolución de dependencias y compilación. Esto evita que los manifiestos y chunks activos se escriban en OneDrive; no certifica que Windows, antivirus, disco o red no puedan causar otros bloqueos. No se movió el repositorio ni se modificaron ajustes de OneDrive.

## Resultado de las comprobaciones

`npm run check` pasó: formato, lint sin advertencias, tipos, 283 pruebas de aplicación y 18 de caché/scripts (301 en total). La revisión completa de dependencias terminó con cero avisos. El build de Next generó las 36 páginas estáticas sin errores. La suite SQL nueva pasó sus diez comprobaciones y deshizo sus datos mediante ROLLBACK. La consulta final de eventos Stripe devolvió cero FAILED.

## Evidencia y mantenimiento

- Migración aplicada únicamente a desarrollo: `supabase/migrations/20261102200643_checkout_retries_and_tracking.sql`.
- SQL reproducible, diez comprobaciones con ROLLBACK: `tests/checkout-retries.postgres.sql`.
- Pruebas de reintentos: `tests/checkout-attempt.test.ts` y `tests/checkout-retry-flow.test.ts`.
- Proceso y respuestas FedEx: `tests/tracking-operations.test.ts`, `tests/fedex.label.test.ts` y pruebas existentes de estados de envíos.
- Caché y reglas: `tests/next-cache.test.cjs`.

Hubo interrupciones DNS de Supabase y pausas del equipo durante la revisión: varias ejecuciones fallaron y otras agotaron su tiempo de espera. Los ciclos posteriores volvieron a responder HTTP 200 sin intervención en los pedidos. El proceso conserva el diagnóstico y vuelve a ejecutar, sin ocultar el fallo. Las pruebas de salud cargan Next en su preparación para medir el tiempo del probe, evitando confundir importaciones frías con fallos de respuesta.

Antes de desplegar, aplicar la migración correspondiente al mismo entorno y luego publicar/verificar el código. Este cierre no sustituye un pentest, una prueba de carga ni la autorización comercial y fiscal de proveedores LIVE.

Referencia de códigos y rastreo: [documentación oficial FedEx](https://developer.fedex.com/api/en-td/guides/api-reference.html). Historial: [auditoría previa](system-audit-2026-11-01.md).
