# Experiencia del comprador

Implementada en el MVP existente el 11 de octubre de 2026.

- Comprar sigue sin exigir sesión ni crear una tienda.
- `/mis-compras` permite entrar con Clerk y recuperar pedidos del correo usado
  en checkout. Solo los correos verificados por Clerk en el servidor autorizan
  búsquedas; se pueden agregar y verificar otros correos en los ajustes de acceso.
- La lista incluye producto, cantidad, vendedor, fecha, número, importe y estado;
  se pagina de 20 en 20 y no devuelve tokens, claves ni datos de contacto.
- La página individual conserva recibo, línea de tiempo, estimación del
  transportista, guía, enlace de rastreo y detalles de entrega coordinada.
- El NIP se muestra solo para el comprador autorizado y se comparte únicamente
  al recibir y revisar el producto. Se mantiene suspendido cuando hay disputa.
- El acceso recuperado permite abrir un caso, aportar evidencia y leer estado,
  respuesta y resolución. Ayuda explica solicitudes de cancelación y reembolso.
- La confirmación del checkout enlaza a seguimiento y recuperación. Los correos
  preparados incluyen enlaces sin secretos y requieren autenticar al comprador
  si no conserva su token. El envío real de correo continúa deshabilitado en TEST.

## Seguridad

La API usa el correo verificado que devuelve Clerk, nunca un correo enviado por
el cliente ni metadata editable. Los filtros comparan correos completos y escapan
comodines. Un ID de pedido no autoriza lectura, confirmación ni disputa.
Los tokens existentes y las sesiones Stripe vinculadas conservan su acceso;
un token explícitamente incorrecto no se reemplaza silenciosamente por sesión.
Las acciones del comprador basadas en cookies exigen origen coincidente. Las
respuestas privadas no se almacenan en caché y se cancelan peticiones al cambiar
de sesión. La recuperación no gira tokens ni desactiva recibos existentes.

## Validación local

- Build de Next.js completado; lint y tipos sin errores.
- 170 pruebas de Vitest aprobadas, incluidas identidad, aislamiento, filtros,
  acciones de origen y enlaces de correo.
- APIs de compras y pedido conocido respondieron 401 sin autenticación.
- Se asoció temporalmente un pedido TEST al correo verificado de la sesión:
  apareció en Mis compras y abrió recibo, avisos y caso sin token ni session_id.
  Otro pedido permaneció inaccesible. Se restauró el correo original al terminar.
- Pantalla Mis compras comprobada a 390 px sin desbordamiento horizontal.
- No se realizaron cobros, transferencias, correos ni envíos reales.

No se modifica esquema de Supabase ni se activa producción con este cambio.
