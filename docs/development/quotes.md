# Cotizaciones por enlace

`/dashboard/quotes` prepara una selección de productos/variantes a precios vigentes, con snapshot privado, enlace de 256 bits, vencimiento de siete días y desactivación antes de generar pedido. No necesita una cuenta de Instagram o WhatsApp conectada; compartir es manual.

Reutiliza `instagram_conversation_sales`, nombre histórico del almacenamiento de propuestas, con `sale_source='quote'`, sin connection_id de Meta y sin identidad social de comprador. Para atribución y reportes revisar sale_source antes de channel, cuyo valor histórico predeterminado se conserva por compatibilidad. No presentar estas propuestas como conversaciones de Instagram.

El enlace abre el checkout existente `/comprar/[publicId]`. El comprador proporciona sus datos y el servidor resuelve productos, cantidades y vendedor desde la selección guardada. El stock no se aparta al cotizar: se reserva transaccionalmente al iniciar checkout. El enlace admite un pedido; reintentar el mismo checkout devuelve ese pedido. Si cambian precio, moneda, variante o stock, debe prepararse otra propuesta. Desactivar no cancela ni reembolsa un pedido ya creado.

Este bloque no incluye descuentos personalizados, envío fijo negociado, edición de una propuesta publicada, datos privados de prospectos, PDF ni impuestos de cotización. La interfaz indica precios vigentes y envío en checkout. No modificar el cálculo de tarifas para implementar un descuento. Se muestran las 30 cotizaciones más recientes.

Pruebas: `tests/quotes.test.ts` para autenticación/origen y `tests/sql/standalone-quotes.sql` para selección y precios inmutables, pedido único e inventario reservado una vez, con fixtures independientes de Meta y ROLLBACK. La migración standalone_quotes solo se aplicó a desarrollo.
