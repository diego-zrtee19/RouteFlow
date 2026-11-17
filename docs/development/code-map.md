# Mapa del código

## Dónde empezar

- `src/app`: páginas y rutas HTTP de Next.js App Router.
- `src/components/ui`: botones, campos, tarjetas y estados visuales reutilizables.
- `src/components/dashboard`: navegación y herramientas del vendedor.
- `src/components/shared`: recibo, seguimiento, acuerdos de entrega, soporte, fotografías y ubicación.
- `src/domain`: tipos, DTO, validaciones y reglas que pueden probarse sin servicios externos.
- `src/services`: coordinación de checkout, pago, logística, reembolsos, casos y operaciones.
- `src/repositories`: lectura/escritura de los modelos persistidos y conversiones de filas.
- `src/lib`: autenticación/autorización, clientes externos, variables de entorno y almacenamiento del navegador.
- `src/providers/shipping`: contratos e implementaciones de paquetería. Que exista un proveedor no significa que esté configurado o validado en producción.
- `src/i18n`: textos y selección de idioma existentes.
- `tests`: pruebas unitarias/de contratos con dobles de servicios y scripts de comprobación de SQL. No todos los archivos de verificación remota son pruebas unitarias.
- `scripts`: utilidades de desarrollo, operación y preparación/verificación. Leer el archivo antes de ejecutar un script remoto.
- `supabase/migrations`: cambios incrementales. Los `supabase/schemas/supabase_schema_v*.sql` son antecedentes; no deben ejecutarse indiscriminadamente sobre una base existente.

## De la interfaz al dato

Una página de cliente envía una petición a `src/app/api`. La API comprueba identidad y propiedad, valida el cuerpo y llama al servicio correspondiente. Los servicios usan repositorios, RPC o proveedores. La respuesta utiliza un DTO apropiado para su audiencia.

Algunas rutas heredadas acceden directamente al cliente administrativo: la separación aún no es absoluta. Una mejora posterior puede mover esos accesos a servicios/repositorios, con pruebas de autorización y compatibilidad. Esta preparación no mueve todo el sistema ni cambia sus contratos.

## Tres recorridos principales

### Venta rápida

`/dashboard/products/new?mode=quick` → API de catálogo → producto y enlace persistidos → `/p/[publicId]` → `/checkout/[publicId]` → servicio de checkout → sesión Stripe TEST → webhook → recibo/seguimiento.

Puntos de entrada: `src/app/api/dashboard/catalog/route.ts`, `src/services/checkoutService.ts`, `src/repositories/purchaseLinkRepository.ts` y `src/app/api/webhooks/stripe/route.ts`.

### Catálogo y carrito

`/dashboard/catalogo` prepara la marca y visibilidad. `/catalogo/[username]` obtiene el catálogo público y guarda el carrito en ese navegador. `/catalogo/[username]/checkout` permite corregir artículos y consulta precio/disponibilidad antes de iniciar pago.

Reglas: `src/domain/catalogCart.ts`, `src/domain/catalogExperience.ts`, `src/lib/catalogCartStore.ts` y `src/services/catalogCheckoutService.ts`. Un carrito pertenece a un solo vendedor; no es un marketplace de descubrimiento.

### Seguimiento y atención

`/order/[id]` carga el recibo privado mediante token o correo verificado. `/mis-compras` lista únicamente pedidos de los correos verificados de la sesión. `BuyerReceipt`, `OrderProgress`, `DeliveryArrangement` y `DisputeManager` presentan la información y las acciones disponibles.

Ver `src/lib/buyerIdentity.ts`, `src/lib/buyerToken.ts`, `src/lib/authz.ts` y `src/domain/dto.ts`. Los tokens no se deben trasladar a enlaces compartibles ni logs.

## Estados que no deben confundirse

- `OrderStatus`: recorrido comercial del pedido; consultar `orderStateMachine.ts` y las validaciones específicas de los servicios/RPC.
- `PaymentStatus`: resultado del pago. Un pedido visible en el navegador no demuestra que su pago esté confirmado.
- Estado de envío: crear una etiqueta no prueba que FedEx haya recibido el paquete.
- Estado de transferencia: completar la entrega no demuestra que el depósito bancario ya haya ocurrido. Operaciones revisa bloqueos y configuración de Connect.
- Una propuesta de cita necesita confirmación de la otra parte. Proponer/aceptar horario no completa la entrega ni libera fondos.

## Qué modificar según la tarea

- Botones o campos: componente de UI primero, después consumidores concretos.
- Texto/orden del recibo: componentes compartidos y DTO; no exponer campos administrativos.
- Stock o precios: dominio/checkout/RPC y pruebas de concurrencia o reserva.
- Cobros/webhook: servicio de idempotencia, pago y pruebas de webhook; preservar atomicidad.
- Accesos: autorización del servidor y pruebas de aislamiento entre vendedor/comprador.
- Proveedores: implementación y contrato de shipping, manteniendo TEST/sandbox durante desarrollo.

## Documentos existentes

Los informes fechados de `docs/` conservan decisiones y evidencias de sesiones anteriores, no garantizan el estado actual de una cuenta externa. Usa README y esta carpeta como entrada; consulta los informes y SQL históricos solo con ese contexto.

## Navegación del vendedor

`SellerNavigation.tsx` define Vender, Pedidos y Mi tienda, con Más para herramientas secundarias. `DashboardLayout.tsx` conserva la identidad y el shell. Productos y enlaces son pestañas de la misma zona de venta; sus URL existentes siguen válidas. Los colores y estados compartidos están en `globals.css` y `components/ui/Button.tsx`.
