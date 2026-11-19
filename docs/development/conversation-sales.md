# De Instagram al pedido

La bandeja `/dashboard/messages` permite preparar una compra para una conversación. No relaciona perfiles con compradores por nombre, correo o similitud: la asociación se crea mediante el enlace de compra que nace en esa conversación. El enlace puede reenviarse, por lo que esta asociación **no verifica la identidad del comprador**.

## Recorrido

1. El vendedor elige productos activos, variantes y cantidades desde su inventario, incluyendo artículos de venta rápida que no aparecen en el catálogo público.
2. El servidor verifica la propiedad, las existencias, precios, moneda y opciones de entrega comunes. Si la única opción es paquetería, también exige un paquete y origen válidos. Guarda una selección inmutable con vencimiento de siete días. Preparar el enlace no modifica stock.
3. El vendedor puede copiar el enlace o colocarlo en su borrador de Instagram. No se envía automáticamente. La marca «enviado» se guarda junto con la confirmación del mensaje por Meta; copiar la URL no equivale a haberla enviado.
4. `/comprar/[publicId]` reutiliza el checkout de catálogo. La API resuelve vendedor, productos y cantidades desde el enlace guardado e ignora selecciones o identificadores internos enviados por el navegador. No revela Instagram, conversaciones ni datos de otros pedidos. Si el precio cambió, se requiere un enlace nuevo.
5. La reserva del checkout crea el pedido, aparta existencias y vincula el enlace **en la misma transacción**. Un reintento conserva el pedido; otro intento de compra no puede consumir el mismo enlace. Un enlace con pedido cancelado requiere preparar otro; recuperar un pago pendiente usa el mecanismo existente de intentos de checkout.
6. La conversación consulta el estado real del pedido: pago pendiente, confirmado, envío/entrega, cancelación, disputa o reembolso. El botón de gestión abre el panel existente de FedEx o entrega por NIP, con regreso a la conversación.

## Código y datos

- `ConversationSales.tsx`: selección de inventario, enlaces y acceso al pedido. Los borradores de selección y mensaje se mantienen separados por conversación en memoria.
- `conversationSaleService.ts`: resolución del enlace para las API públicas; nunca acepta del cliente la identidad de la conversación.
- `catalogCheckoutService.ts` y `CatalogCheckout.tsx`: checkout compartido; las compras normales conservan su carrito e intentos independientes.
- `instagram_conversation_sales`: selección, precio esperado, vendedor, conversación, enlace opaco y pedido. Tabla privada con RLS y sin acceso de `anon` ni `authenticated`.
- `commerce_cart_profile`: validación compartida. El catálogo público sigue excluyendo productos ocultos; el acceso a una selección oculta exige el enlace autorizado, salvo la preparación autenticada del propietario.
- `reserve_conversation_purchase` y `reserve_checkout_attempt`: reserva y asociación atómicas, con bloqueo del enlace para impedir pedidos duplicados.
- El disparador de respuestas confirma `shared_at` solamente cuando se registra un envío confirmado. No cambia estados de pago.

## Verificación

`tests/conversation-sale.test.ts` verifica aislamiento, manipulación de selecciones, enlaces inactivos, datos públicos mínimos y estados del recorrido. `tests/sql/conversation-sales.sql` ejecuta una prueba de desarrollo con fixtures revertidos al terminar: ocultación del catálogo, selección/precio inmutables, asociación, inventario y reintentos. No realiza cobros ni valida demanda comercial.

Después del despliegue se debe comprobar la preparación desde la bandeja, el checkout público, la confirmación de pago TEST y el acceso a despacho. Las credenciales y proveedores LIVE permanecen fuera de este cambio. La política y ventana de mensajes de Meta siguen aplicándose al compartir enlaces por Instagram.

### Revisión del 19 de noviembre de 2026

- Compilación de Preview, lint, tipos y 317 pruebas correctos. La prueba SQL en desarrollo confirmó reserva atómica, precio/selección inmutables y protección frente a reintentos; sus fixtures se revirtieron.
- En el navegador se preparó una compra desde una conversación existente con un artículo temporal, oculto del catálogo. Prepararla mantuvo tres unidades; iniciar Stripe TEST reservó una y creó un único pedido asociado, correctamente mostrado como pago pendiente.
- Se comprobó el acceso al pedido y el regreso a la conversación. Se ajustó el inventario para refrescarse junto con sus compras y la vista de chat para evitar columnas estrechas en pantallas medianas.
- **Pendiente:** completar ese pago en el formulario seguro de Stripe y comprobar la transición por webhook a pagado. El navegador automatizado no pudo escribir en los campos integrados; no se sustituyó la confirmación de Stripe por una actualización manual de la base.
- No se envió un nuevo mensaje comercial de Instagram ni se activaron proveedores LIVE. El artículo temporal y el intento TEST se conservan mientras se completa la revisión; después se debe desactivar el artículo y conservar la evidencia del pedido según su estado.
