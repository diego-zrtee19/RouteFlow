# WhatsApp junto a Instagram

## Alcance

La bandeja `/dashboard/messages` separa Instagram y WhatsApp. Ambos canales permiten preparar una selección de inventario, compartir su enlace, identificar el pedido y abrir la entrega. Comprar sigue sin exigir cuenta. No hay mensajes automáticos ni campañas.

WhatsApp conserva borradores por canal/conversación durante la visita. Los estados distinguen pendiente, enviado, entregado, leído, fallido y resultado incierto. Ante un resultado incierto no se reenvía automáticamente: revisar WhatsApp evita duplicados. La ventana de respuesta depende únicamente del último mensaje entrante y dura 24 horas. Las plantillas fuera de esa ventana no están implementadas.

## Configuración TEST

1. Aplicar `20261122010727_whatsapp_channel.sql` en desarrollo; no en producción por este trabajo.
2. Añadir el caso de uso WhatsApp a la app Meta. Para vendedores externos se requiere la revisión/permisos y habilitación de proveedor de tecnología que Meta solicite.
3. Configurar los valores privados descritos en `.env.example`. El modo normal usa una configuración independiente de Embedded Signup v4, dominio HTTPS permitido y permisos `whatsapp_business_management` y `whatsapp_business_messaging`. No modificar la configuración de Instagram.
4. Mantener `WHATSAPP_LIVE_ENABLED=false`. Añadir únicamente los IDs de números de prueba autorizados a `WHATSAPP_TEST_PHONE_NUMBER_IDS`; una lista vacía bloquea conexiones y envíos.
5. Alternativa de prueba: un token temporal de Meta, WABA y número TEST ligados por `WHATSAPP_TEST_SELLER_ID` a un solo vendedor. Se verifica emisor, permisos y pertenencia del número antes de guardarlo cifrado. Obtener autorización antes de transferir credenciales a Preview.
6. Configurar webhook HTTPS `/api/webhooks/whatsapp`, token de verificación privado y campo `messages`. Validar la verificación y una entrega real firmada antes de afirmar que está conectado.
7. El vendedor autoriza en Ajustes. Coexistencia conserva su app WhatsApp Business si Meta considera elegible el número. El flujo estándar registra el número Cloud API y guarda cifrado su NIP de plataforma. No migrar un número personal sin revisar este paso.

La autorización, suscripción y recepción reales dependen de Meta. Tener código desplegado no equivale a tener conectado un número. Esta versión representa archivos/ubicaciones/contactos con una indicación para consultarlos en WhatsApp; no descarga sus datos ni permite adjuntar medios. No importa conversaciones anteriores al alta.

## Seguridad y mapa del código

- `domain/whatsapp.ts`: eventos validados y BSUID (identificador que puede reemplazar al teléfono del comprador).
- `services/whatsappConnection.ts`: intercambio de código, verificación con Meta, cifrado por conexión/canal, ventana y envío. BSUID usa `recipient`; teléfono usa `to`.
- `api/dashboard/whatsapp`: rutas autenticadas; siempre se resuelve el vendedor desde la sesión, nunca desde un ID del navegador.
- `api/webhooks/whatsapp`: firma HMAC sobre cuerpo original, tamaño limitado, persistencia atómica y 503 para reintentar cuando falla la base.
- Tablas privadas `seller_whatsapp_*`: RLS, sin acceso directo de navegador. Funciones invoker, solo servidor.
- La tabla histórica `instagram_conversation_sales` es compartida: `channel` y `whatsapp_connection_id` separan canales. Se conserva su nombre para no romper checkout, atribución ni inventario existentes.
- Claves cifradas con AES-GCM, separadas por canal y ligadas a su conexión; no aparecen en DTOs, logs ni Git.
- Desconectar elimina el token local y detiene la recepción; conserva historial y pedidos. No revoca automáticamente permisos en Meta.
- Estados recibidos fuera de orden no degradan leído/entregado. El identificador del intento permite recuperar un envío incierto cuando llega su confirmación firmada.

## Verificación de esta entrega

En desarrollo pasaron 335 pruebas, y los scripts SQL transaccionales `tests/sql/whatsapp-channel.sql` y `tests/sql/conversation-sales.sql`. Sus datos se revierten con ROLLBACK: prueban aislamiento, duplicados, estado leído sin degradación, recuperación de envío incierto y checkout/inventario una sola vez, sin llamar Stripe ni enviar mensajes.

El asesor de seguridad solo informa RLS sin políticas en estas tablas: es intencional para acceso exclusivo del servidor; no agregar políticas públicas para silenciarlo. La prueba SQL confirma que roles anónimo/autenticado no leen el historial ni ejecutan las funciones privadas.

Pendiente para la prueba completa: número TEST autorizado, credencial privada, webhook de Meta configurado y una conversación real consentida. No activar LIVE por esta guía.

Referencias oficiales: [Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation), [v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4), [coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users), [BSUID](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids).
