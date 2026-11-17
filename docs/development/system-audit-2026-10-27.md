# Auditoría del sistema RouteFlow — 27 de octubre de 2026

Seguimiento posterior: [correcciones y validación del 1 de noviembre](system-audit-2026-11-01.md). Este archivo conserva el dictamen histórico.

## Dictamen

**La autorización de Vercel quedó renovada y comprobada. La aplicación sigue sin aprobación para operar con dinero o envíos reales.** Esta revisión encontró seis asuntos abiertos: tres de prioridad alta, dos media y uno bajo. Tres fallos fueron reproducidos ejecutando los módulos TypeScript actuales con dobles en memoria. No se hicieron compras, envíos ni modificaciones de datos remotos.

Este informe es una revisión técnica del código y de configuraciones accesibles, no una certificación de seguridad ni una auditoría contable/legal. Una compilación o una batería de pruebas exitosa no demuestra que todos los recorridos sean correctos.

## Alcance y evidencia

- Código local sobre el commit `a3b10c473f7c6f57b562d0a48d65c61a80932208`, con cambios locales sin publicar. Se revisaron los límites de autorización, acceso del comprador, pagos, reservas, despacho, rastreo, disputas, operaciones y almacenamiento.
- `npm run check` terminó con código 0: estructura del repositorio, formato, ESLint sin advertencias, tipos, 225 pruebas Vitest, cuatro de caché y diez de scripts; **239 pruebas** en total. Evidencia local: `.routeflow-data/audit-system-check.log`.
- `npm audit --json`: **cero vulnerabilidades conocidas reportadas**. Esto cubre avisos del registro, no errores de lógica ni secretos. Evidencia local: `.routeflow-data/audit-dependencies.json`.
- Tres reproducciones aisladas: `.routeflow-data/system-audit-proofs.cjs` y `.routeflow-data/system-audit-proofs.json`. El ejecutor no carga credenciales y sustituye las dependencias externas; FedEx y Supabase fueron simulados.
- Supabase desarrollo: proyecto activo; 22 tablas de negocio inspeccionadas con RLS habilitado; funciones críticas sin permiso de ejecución para `anon` y `authenticated`; políticas denegatorias en tablas privadas. Las once recomendaciones informativas de RLS sin política no equivalen a once vulnerabilidades: esas tablas se atienden desde el servidor.
- Storage: imágenes de productos públicas por diseño, límite 3 MB y tipos restringidos; evidencias privadas, límite 5 MB; etiquetas privadas PDF.
- Desarrollo tiene un trabajo programado activo cada cinco minutos y tres ejecuciones recientes de operaciones `SUCCEEDED`. La programación diaria de `vercel.json` no describe por sí sola la frecuencia real de desarrollo. No se comprobó el mecanismo remoto completo de invocación ni su configuración en producción.
- Vercel: acceso renovado; proyecto `route-flow` consultado correctamente. Último preview consultado `READY`, commit `a3b10c4`, alias de la rama `codex/routeflow-v2-preview`. **READY indica despliegue construido, no salud completa de la aplicación ni actualización con los cambios locales.**
- Supabase Production: estado `INACTIVE`; no se pudo consultar su base. No se reactivó ni se modificó. No se acredita su esquema, políticas o respaldos actuales.

## RF-A01 — Alta: reconciliar un checkout reembolsado degrada el pago a PENDING

**Ubicación:** `src/services/checkoutService.ts`, `reconcileCheckoutSession`; `src/repositories/paymentRepository.ts`, `upsertPayment`.

La reconciliación actualiza el pago antes de comprobar estados terminales. Para cualquier estado distinto de `SUCCEEDED` escribe `PENDING`. Una sesión original de Stripe puede seguir figurando como pagada tras un reembolso. La función de finalización rechaza después el pedido reembolsado, pero el cambio previo del registro de pago ya ocurrió.

**Reproducción local:** pedido y pago `REFUNDED`; sesión original `paid`; resultado: pedido permanece `REFUNDED`, pago pasa a `PENDING` y la reconciliación falla con `payment_reconciliation_failed`. No se modificó un pago real.

**Corrección propuesta:** preservar estados terminales antes de cualquier escritura; separar asociación de sesión de cambio de estado; impedir regresiones y realizar la reconciliación en una transacción. Añadir prueba de reembolso seguido de revisita a confirmación y de eventos fuera de orden.

**Aceptación:** las revisitas y reintentos conservan pedido y pago reembolsados y devuelven una respuesta consistente.

## RF-A02 — Alta: una actualización antigua puede sobrescribir una disputa

**Ubicación:** `src/services/orderService.ts:105`, `src/repositories/orderRepository.ts:170`, `src/app/api/orders/[id]/confirm/route.ts`.

Las dos implementaciones de `transitionOrder` validan una copia del pedido recibida como argumento. La escritura filtra por identificador y vendedor, pero no por estado actual o versión. La confirmación del comprador además realiza dos cambios separados.

**Reproducción local:** la base simulada contiene `DISPUTED`; una solicitud conserva una copia `DELIVERED`; la transición escribe `BUYER_CONFIRMED`, sobrescribiendo la disputa.

**Límite:** se probó corrupción de estado, **no una transferencia indebida**. La función SQL de liquidación contiene comprobaciones adicionales de disputas y reembolsos que deben preservarse.

**Corrección propuesta:** validar y actualizar bajo bloqueo de fila o comparación de versión/estado en base de datos; consolidar las implementaciones duplicadas; confirmar y completar en una operación atómica que respete disputas y reembolsos.

**Aceptación:** si cambió el estado desde la lectura, la operación devuelve conflicto y conserva el estado más reciente; probar confirmación concurrente con disputa y reembolso.

## RF-A03 — Alta: dos despachos simultáneos pueden crear dos etiquetas

**Ubicación:** `src/services/shipmentService.ts:144`, `src/repositories/shipmentRepository.ts:40`.

Se comprueba si existe envío antes de llamar al transportista, pero no se reclama exclusivamente el despacho. Dos solicitudes pueden pasar esa comprobación. La protección de persistencia llega después de `provider.createShipment`. También queda una ventana si el proveedor crea el envío y falla guardar la etiqueta o el registro.

**Reproducción local:** dos solicitudes concurrentes ejecutaron dos creaciones en el transportista simulado. No se llamó a FedEx ni se generaron cargos reales.

**Corrección propuesta:** reclamar el despacho con una operación atómica antes de llamar al proveedor; conservar identificador del intento y su resultado; reconciliar intentos inciertos antes de repetir, utilizando las garantías de idempotencia realmente disponibles en el proveedor.

**Aceptación:** concurrencia y fallos posteriores a la respuesta del transportista producen un único envío y una recuperación verificable.

## RF-A04 — Media: rastreo y estado del pedido pueden divergir

**Ubicación:** `src/app/api/orders/[id]/tracking/route.ts:211`, `src/services/shipmentService.ts:207`, `src/domain/dto.ts:200`, `src/domain/orderStateMachine.ts`.

El endpoint de actualización guarda estado y eventos del envío, pero no avanza el pedido a `DELIVERED`; tampoco comprueba los errores devueltos por esas escrituras. El servicio `refreshTracking` sí contempla la transición, pero no se encontró un invocador de producción en el código revisado. Las tareas de operaciones revisadas tampoco refrescan el transportista. El DTO ofrece confirmar en `IN_TRANSIT`, mientras la máquina de estados exige `DELIVERED` para pasar a `BUYER_CONFIRMED`.

**Evidencia:** revisión estática de los caminos indicados; no se afirmó una entrega real ni se realizó un recorrido FedEx de extremo a extremo.

**Corrección propuesta:** unificar el refresco en un servicio; comprobar errores de persistencia; enlazar actualizaciones del transportista con transiciones válidas del pedido y con un proceso periódico o webhook. Alinear la disponibilidad del botón con las reglas del servidor.

**Aceptación:** un escaneo de entrega actualiza envío y pedido de forma consistente; el comprador puede confirmar en los estados permitidos; si falla guardar, no se devuelve éxito.

## RF-A05 — Media: faltan límites de abuso en operaciones públicas costosas

**Ubicación:** `src/app/api/checkout/session/route.ts:35`, `src/app/api/catalog/checkout/route.ts`, `src/services/shippingQuoteService.ts`, `src/app/api/checkout/verify/route.ts`.

Los recorridos públicos crean reservas/sesiones o consultan servicios externos. No se encontraron cuotas de aplicación o límites distribuidos de frecuencia para estos caminos. Muchos intentos válidos abandonados pueden inmovilizar stock temporalmente o consumir recursos. Las validaciones de campos y el stock transaccional no sustituyen esos límites.

**Límite:** hallazgo estático; no se hizo una prueba de carga ni se agotó inventario. La revisión no acredita todas las reglas de firewall efectivas del despliegue.

**Corrección propuesta:** límites distribuidos por origen y tienda, cuotas para llamadas externas, tamaño máximo de solicitud e idempotencia de reintentos legítimos. Conservar la compra sin registro; evitar bloquear indiscriminadamente compradores detrás de una misma red.

**Aceptación:** los excesos reciben una respuesta controlada antes de reservar stock o llamar al proveedor; un reintento de la misma compra no crea reservas adicionales.

## RF-A06 — Baja: diagnóstico público demasiado detallado

**Ubicación:** `src/app/api/health/supabase/route.ts:75`.

El diagnóstico no exige sesión y devuelve referencia del proyecto, entorno, vistas enmascaradas de claves y detalles de comprobaciones internas. Usa privilegios de servidor para consultar la base. No se encontró una clave completa expuesta en este recorrido; la observación es minimizar información y coste de sondeo. Además, una consulta con `service_role` no prueba las restricciones RLS de un usuario normal.

**Corrección propuesta:** salud pública mínima y diagnóstico detallado restringido a administradores/monitor autorizado; quitar vistas de claves; probar permisos de datos por separado usando los roles correspondientes.

**Aceptación:** la respuesta pública solo indica disponibilidad, sin detalles de credenciales o errores internos; el diagnóstico restringido mantiene su utilidad operativa.

## Controles favorables observados

- Asociación del vendedor a la identidad de Clerk y filtros de propiedad en operaciones privadas; autorización de administrador separada.
- Acceso a compras por correo verificado o token aleatorio almacenado como hash; conocer solo el número de pedido no concede acceso privado.
- Recibos privados con prohibición de caché y política de referencia restrictiva; etiquetas y evidencias con acceso privado.
- Webhooks con validación de firma, reclamación y recuperación; finalización de pago/pedido mediante función atómica.
- Validación del NIP en base de datos, bloqueo tras intentos fallidos, comprobación de propiedad y de disputas; no se muestran NIP en este informe.
- Reservas de inventario y liquidaciones con protecciones transaccionales. Estos controles no invalidan los fallos de concurrencia encontrados en otros caminos.

## Orden de trabajo y límites pendientes

1. Corregir RF-A01, RF-A02 y RF-A03 con pruebas de regresión y concurrencia.
2. Unificar rastreo, estados y confirmación; añadir límites a endpoints públicos; reducir el diagnóstico público.
3. Repetir pruebas y compilación; después publicar y comprobar el mismo commit en Preview con un recorrido autorizado de vendedor/comprador.
4. Comprobar configuración y restauración de respaldos en un entorno aislado antes de aprobar producción. La existencia de una copia local de pruebas no demuestra restauración de producción.
5. Activar y validar correo/dominio, identidad y proveedores LIVE, datos reales de envío y aspectos fiscales/contractuales con apoyo adecuado. No se inventarán ni se activarán cobros para cerrar esta auditoría.

No se realizó una nueva auditoría visual completa, pentest externo, prueba de carga, restauración ni simulación remota de pagos/entregas. La cuenta de demostración vacía se conservó. Los hallazgos quedan **abiertos**: este turno documenta y comprueba, no aplica sus correcciones.
