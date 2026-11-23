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

## Estado verificado — 23 de noviembre de 2026

- Código funcional `f615234`: compilación, 335 pruebas y SQL transaccional de ambos canales aprobados. Los commits posteriores solo registran configuración y comprobaciones.
- Meta creó Test Messaging Account (WABA `1132194213134172`) y el número TEST `+1 (555) 192-8765`, phone ID `1532308693290006`.
- Diego aceptó Platform/Cloud API y Meta Business Tools, seleccionando únicamente esa cuenta actual. Autorizó credenciales solo en Vercel Preview y cifradas en Supabase DEV; no hay autorización LIVE.
- Las variables WhatsApp están limitadas a la rama `codex/routeflow-v2-preview`. Token de acceso y verificación son Secret. Allowlist solo del número TEST y LIVE=false.
- Meta verificó el callback de Preview `/api/webhooks/whatsapp`; `messages` está suscrito.
- La conexión `66dcf469-1c24-4013-9cce-e157afb6b033` se guardó cifrada desde Ajustes autenticados y se mostró conectada.
- Diego autorizó usar su propio teléfono como destinatario TEST y la respuesta exacta «Prueba RouteFlow: respuesta enviada desde la bandeja». Completó personalmente la verificación de Meta. Su WhatsApp personal no se convirtió ni vinculó como vendedor.
- **Recepción real confirmada:** el mensaje «hola» quedó en Meta a las 21:04:41 del 22 de noviembre (Ciudad de México) y en Supabase con sent_at `2026-11-23T03:04:38Z`, una sola fila con ID de proveedor. Esta evidencia sustituye el resultado vacío de la consulta anterior; no atribuir la demora a una causa no demostrada.
- El 23 de noviembre se comprobó que la credencial temporal había vencido. Se renovó con la misma configuración y se actualizó el Secret de Preview. Pendiente aplicar el nuevo despliegue, renovar la conexión de la tienda y verificar respuesta enviada/entregada. Todavía no afirmar ida y vuelta completa.
- La app Meta sigue sin publicar: no se validó onboarding de vendedores externos ni se activaron números/cobros reales.

### Precauciones de mantenimiento

No imprimir credenciales en salidas de herramientas ni guardarlas en Git. Transferir directamente al formulario privado de Vercel. El transporte temporal cifrado usado durante diagnóstico fue eliminado. No borrar perfiles del navegador ni ampliar permisos para resolver bloqueos de control. El control volvió a responder, pero no hay causa raíz ni solución permanente de esa desconexión confirmadas.

Las credenciales temporales de Meta requieren renovación; una integración comercial necesita su configuración duradera y revisión independiente. El modo de prueba no equivale a esa aprobación.

### Resultado del primer envío y manejo de rechazos

La credencial se renovó el 23 de noviembre con el mismo alcance TEST y se reconectó la tienda. Se intentó enviar una sola respuesta autorizada desde la bandeja, con client_id `10acb6e9-dcc7-46a9-a130-4d9a83651e6b`. Quedó `unknown`, sin ID de proveedor: no presentarlo como enviado ni cambiar ese registro a fallido sin evidencia. Se preguntó al destinatario si lo recibió antes de intentar otro envío.

Se corrigió la distinción de resultados: un HTTP 4xx (excepto 408) con error estructurado de Meta y código numérico se trata como rechazo explícito (`failed`); fallos de red, 408, 5xx y errores malformados permanecen inciertos. No se guardan ni muestran mensajes crudos del proveedor ni credenciales. La interfaz conserva el borrador y muestra el código numérico cuando Meta rechaza expresamente. Nunca hay reenvío automático. Pasaron 340 pruebas, incluidas regresiones para rechazo, timeout, 5xx y respuesta malformada.

El segundo intento controlado fue rechazado explícitamente (`failed`), sin ID de proveedor. Se corrigió la persistencia del aviso al refrescar el historial y se agregó diagnóstico numérico sin texto ni datos privados. A las 13:45 aproximadamente (Ciudad de México) se volvió a renovar la credencial temporal TEST con el mismo alcance, únicamente en Preview; pendiente aplicar y comprobar el envío.

### Corrección del destinatario TEST

El intento controlado devolvió `131030`. La lista de Meta contiene al destinatario autorizado; el evento recibido contiene tanto BSUID como teléfono. Se conserva BSUID como identidad del hilo y `sender_phone` privado desde el webhook firmado; el servidor prefiere ese teléfono para enviar y conserva el soporte BSUID si no está disponible. El cliente nunca elige ni recibe el teléfono de transporte. Migración `20261123194943_whatsapp_sender_phone.sql` aplicada solo a DEV. Se completó la asociación del único mensaje histórico contrastando el ID, fecha, conexión y BSUID con su evento en Meta, sin modificar fecha ni estados.

Pruebas: 18 de WhatsApp y SQL con ROLLBACK aprobados; tipos y ESLint sin errores. La suite completa tuvo 339 pruebas aprobadas y dos timeouts de lectura de archivos; las 20 pruebas de ese archivo pasaron al repetirlas con límite de 20 segundos. Pendiente verificar recepción de la respuesta tras desplegar este ajuste; no afirmar entrega todavía.
