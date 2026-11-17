# Auditoría y correcciones de RouteFlow — 1 de noviembre de 2026

> Actualización del 2 de noviembre: consulta el [cierre de rastreo, reintentos, dependencias y OneDrive](reliability-followup-2026-11-02.md). Este documento conserva el estado histórico de la auditoría anterior.

## Dictamen y alcance

Los tres fallos de prioridad alta reproducidos en la auditoría del 27 de octubre se corrigieron en el código local y se cubrieron con pruebas de regresión. Se aplicó una migración incremental exclusivamente en Supabase de desarrollo. Esto no certifica ausencia de fallos ni autoriza producción.

Se conservaron los cambios anteriores, el diseño y la cuenta de demostración. No se crearon compras en Stripe, no se compraron etiquetas y no se enviaron correos. Las pruebas SQL usan datos sintéticos y terminan con ROLLBACK. Los contadores de protección sí registran las solicitudes HTTP de comprobación.

## Evidencia de validación

- `npm run check`: correcto, incluidos formato, ESLint, TypeScript, 4 pruebas de caché y 10 de scripts. Tras ampliar los casos finales, `npm test` pasó con 259 pruebas Vitest en 31 archivos.
- `npm run build`: correcto, 35 páginas generadas; ejecución final con salida 0.
- `npm audit --omit=dev --json`: cero vulnerabilidades conocidas en dependencias de producción. No equivale a pentest ni demuestra ausencia de vulnerabilidades nuevas.
- `tests/audit-reliability.postgres.sql`: 10 comprobaciones correctas en PostgreSQL real, con ROLLBACK.
- También se ejecutaron correctamente los siete archivos SQL existentes de comercio, NIP, reservas históricas, operación, reembolsos, webhooks y catálogo.
- HTTP local sin sesión: seis rutas privadas devuelven 401; cuatro solicitudes públicas vacías devuelven 400; salud devuelve 200 con únicamente `status`.
- Base de desarrollo: 23 tablas públicas con RLS; ninguna función pública SECURITY DEFINER ejecutable por anon/authenticated; nuevas funciones internas inaccesibles para esos roles; etiquetas y evidencias en buckets privados; cero eventos Stripe FAILED en la consulta realizada.
- El asesor de seguridad de Supabase devuelve avisos informativos de RLS sin políticas en tablas cuyo acceso público está denegado deliberadamente. No se añadieron permisos para ocultar esos avisos.
- Panel autenticado revisado en navegador después del reinicio. No se repitió una compra completa con proveedor externo.

## RF-A01 — Alta — Corregido: reconciliación después de un reembolso

`reconcileCheckoutSession` ya no escribe el pago antes de validar Stripe. Pedidos cerrados y pagos reembolsados conservan sus estados. Si una cancelación, disputa o reembolso llega entre la lectura y la función atómica, se vuelve a leer el pedido y no se degrada el pago.

El enlace inicial de Checkout usa INSERT con conflicto ignorado: una escritura tardía de PENDING no sobrescribe un SUCCEEDED o REFUNDED escrito por un webhook. La lectura posterior exige que la sesión pertenezca al pedido y que importe, moneda e identificadores coincidan.

Pruebas: `tests/payment-reliability.test.ts` y comprobación SQL de pago reembolsado. No se devuelve dinero automáticamente al ignorar una sesión antigua; los pagos tardíos o incompatibles requieren conciliación operativa.

## RF-A02 — Alta — Corregido: estado antiguo sobrescribe una disputa

Las transiciones están consolidadas en `orderService.transitionOrder`. Cada escritura exige simultáneamente el pedido, propietario, estado anterior y estado de pago esperado. Si otra operación cambió alguno, devuelve conflicto 409. La confirmación usa el pedido devuelto por la primera transición para completar, en lugar de inventar su estado.

Pruebas: `tests/order-concurrency.test.ts` ejercita ambos puntos de entrada, una disputa entre confirmación/completado y un reembolso concurrente. La consulta SQL verifica que el cambio condicional no sobrescribe DISPUTED.

La operación de confirmar/completar conserva dos pasos. Una interrupción puede dejar BUYER_CONFIRMED; se puede reintentar sin saltarse una disputa. No se presenta como una única transacción de dos estados.

## RF-A03 — Alta — Corregido: etiquetas duplicadas y reintentos ambiguos

La función `claim_shipment_dispatch` bloquea el pedido y concede un único propietario persistente por pedido, antes de llamar al transportista. El resultado aceptado se conserva de forma privada antes de subir el PDF. Un fallo de Storage o del guardado del envío permite reusar ese resultado, sin llamar otra vez al transportista.

Un timeout o fallo al guardar la respuesta NO libera automáticamente el intento. La API devuelve conflicto y exige revisión. Esto evita comprar una segunda guía a cambio de que un resultado ambiguo necesite intervención humana. No hay un mecanismo de recuperación del proveedor demostrado que permita prometer exactamente una compra y recuperación automática tras cualquier interrupción de red.

Pruebas: `tests/shipment-reliability.test.ts`: solicitudes paralelas, Storage fallido, timeout, fallo al persistir respuesta y fallo posterior al guardar el envío. SQL verifica propietario único, permiso de vendedor y recuperación del resultado. La concurrencia del servicio se simuló en memoria; no se ejecutó una prueba de carga concurrente contra FedEx.

### Recuperar un intento incierto

1. Consultar `shipment_dispatch_attempts` con permisos administrativos y localizar el pedido.
2. Comprobar en la cuenta correcta del transportista si ya existe envío, usando la referencia del pedido.
3. Si existe, recuperar su identificador, rastreo y etiqueta y completar el resultado del mismo intento mediante un procedimiento revisado.
4. Si no se puede determinar el resultado, mantener el bloqueo y escalar al transportista. No borrar el registro ni vencerlo por tiempo para permitir otro cobro.
5. Solo considerar otra solicitud cuando se haya demostrado que la anterior no creó un envío y exista autorización operativa. Este turno no realizó esa operación.

## RF-A04 — Media — Corregido el refresco manual; automatización pendiente

La API de rastreo llama al servicio compartido, propaga los errores de persistencia y avanza el pedido a IN_TRANSIT/DELIVERED cuando corresponde. El botón de confirmación solo aparece con pago exitoso en DELIVERED o BUYER_CONFIRMED. Un sondeo tardío no sobrescribe un envío ya entregado. Una disputa concurrente impide que el rastreo la sobrescriba.

Se prueban entrega, fallo de guardado y respeto de disputas. Sigue pendiente añadir y validar un refresco periódico o webhook del transportista: esta corrección no promete actualizaciones automáticas si nadie solicita el refresco. Un fallo intermedio entre envío y pedido exige reintentar el mismo refresco; no se devuelve éxito falso.

## RF-A05 — Media — Mitigado; quedan ampliaciones

Los endpoints públicos de inicio de Checkout, carrito, cotización y verificación usan cuotas compartidas en PostgreSQL antes de reservar o llamar a proveedores. Se rechazan excesos con 429 y Retry-After. Ante un fallo del control se rechaza la operación, sin llamar al proveedor. Se comprueba el tamaño del cuerpo leído realmente, hasta 32 KiB, sin confiar en Content-Length.

- Checkout individual y de catálogo: 10 intentos por 10 minutos y origen.
- Cotizaciones y verificación: 30 por minuto y origen.
- Cada ámbito tiene además un techo global de 50 veces su cuota de origen.
- En Vercel se usa su cabecera de origen; en otros servidores se comparte una cuota conservadora hasta configurar un proxy confiable. No confiar en X-Forwarded-For enviado por el cliente.

Pendiente: idempotencia completa para reintentos legítimos del inicio de compra, cuotas por vendedor y pruebas de carga/firewall en el despliegue. Estas protecciones limitan abuso, no garantizan ausencia de denegación de servicio ni sustituyen esas pruebas.

## RF-A06 — Baja — Corregido: diagnóstico público

La salud pública solo devuelve disponibilidad. No publica entorno, referencia del proyecto, fragmentos de claves ni errores de proveedores. Las comprobaciones se reutilizan durante 30 segundos por proceso para limitar consultas repetidas. Los tests verifican respuestas saludables y fallidas, y la comprobación HTTP confirmó la forma mínima.

## Incidencia local adicional — Recuperada, riesgo de entorno pendiente

Durante la revisión el servidor antiguo devolvía 500 por EBUSY en manifiestos de `.next-dev` bloqueados en OneDrive. Se detuvo el proceso, se conservó su caché y se reinició con `npm run dev:fresh -- --port 3001`. Después pasaron las comprobaciones HTTP y el panel volvió a cargar.

No se afirma una solución permanente al bloqueo del sistema de archivos. Antes de una demostración conviene usar una copia fuera de OneDrive o excluir directorios generados mediante una configuración que se compruebe en este equipo. No se movió el repositorio ni se cambió su sincronización.

## RF-A08 — Media — Pendiente: dependencias de las herramientas de desarrollo

La revisión completa `npm audit --json` reportó 17 avisos moderados, sin altos ni críticos, en herramientas de desarrollo. Son avisos propagados por la cadena de ESLint y glob/minimatch; no representan 17 fallos distintos de la lógica de RouteFlow. El análisis separado de producción sigue en cero.

Las correcciones publicadas son [minimatch 11.0.1](https://github.com/advisories/GHSA-g3hv-75wg-m249) y [glob 14.0.2](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). No se aplicó `npm audit fix --force`: propone degradar ESLint y otras herramientas a versiones incompatibles. Tampoco se forzó minimatch 11 en todo el árbol: varios plugins instalados llaman la exportación CommonJS de minimatch 3 como una función; la API moderna cambia esa forma de uso y una sustitución global puede romper reglas del analizador.

Hace falta actualizar de forma compatible la cadena de lint y repetir las verificaciones. Hasta entonces, usar únicamente patrones del repositorio y no ejecutar las herramientas contra configuraciones de terceros no confiables. Esta limitación no se presenta como una corrección de los avisos ni como una prueba de que no puedan explotarse.

## Migración y despliegue

Archivo local: `supabase/migrations/20261102044948_audit_reliability_guards.sql`. Se generó con la CLI oficial y se alineó su versión con el historial aplicado por MCP. Se crearon solo `shipment_dispatch_attempts`, `public_request_limits` y dos funciones SECURITY INVOKER con acceso limitado a service_role.

La base nueva de producción sigue INACTIVE. No se publicó código ni se aplicaron cambios de producción o Preview. Al desplegar, aplicar la migración al entorno correspondiente antes del código; sin las nuevas funciones los recorridos protegidos fallan de forma cerrada. Verificar el mismo cambio publicado y reponer pruebas de proveedor TEST antes de un piloto externo.

## Lo que esta auditoría no acredita

- Una revisión independiente o pentest externo.
- Carga real, resiliencia ante toda interrupción o ausencia de errores desconocidos.
- Una nueva compra completa en Stripe TEST y entrega FedEx sandbox desde navegador tras estas correcciones.
- Restauración de respaldos de producción, dominio/correo real, habilitación LIVE o requisitos fiscales/contractuales.
- La autorización y tarifas del modelo de Stripe solicitado a soporte.

Fuentes técnicas consultadas: [filtros de Supabase](https://supabase.com/docs/reference/javascript/using-filters), [funciones de base de datos](https://supabase.com/docs/guides/database/functions) y [roles](https://supabase.com/docs/guides/database/postgres/roles). El índice de changelog en Markdown no pudo cargarse mediante la herramienta web; se contrastaron las APIs utilizadas con la documentación oficial y la biblioteca instalada.
