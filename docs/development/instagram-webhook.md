# Prueba de mensajes entrantes de Instagram

## Conexión desde Ajustes del vendedor

Aplica la migración `seller_instagram_and_inventory` en el entorno de pruebas. Crea en Meta una configuración de inicio de sesión unificado con una cuenta profesional de Instagram como único activo obligatorio y los permisos `instagram_basic` e `instagram_manage_messages`.

Configura `INSTAGRAM_META_APP_ID`, `INSTAGRAM_META_CONFIG_ID` e `INSTAGRAM_META_APP_SECRET` en el servidor. Guarda en Meta el mismo valor HTTPS que configures en `INSTAGRAM_OAUTH_REDIRECT_URI`, con la ruta `/api/dashboard/instagram/callback`. Abre Ajustes desde ese mismo dominio. Configura además el webhook de aplicación con el campo `messages` según las instrucciones de abajo.

En **Ajustes → Instagram**, conecta una sola cuenta profesional. RouteFlow la suscribe a mensajes y guarda los textos entrantes nuevos en la tabla privada `seller_instagram_messages`. La desconexión detiene la recepción en RouteFlow y borra la copia local de mensajes, respuestas y credencial. Para retirar también los permisos otorgados en Meta, elimina la integración desde la configuración del negocio en Meta.

Para probar el flujo sin abrir la app a vendedores externos, usa una cuenta de prueba con rol en Meta. Los vendedores externos requieren modo Live y el acceso avanzado que concede Meta al aprobar la revisión. Deja `INSTAGRAM_TEST_ACCOUNT_ID` vacío si solo usas la conexión desde Ajustes. Consulta el [procedimiento de Meta](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started).

## Bandeja y respuestas desde RouteFlow

Aplica también `instagram_inbox`. La bandeja está en `/dashboard/messages` y en **Más → Mensajes de Instagram**. Las consultas pasan por `requireSeller()` y resuelven la conexión del vendedor en el servidor. Las tablas y RPC no están autorizadas para `anon` ni `authenticated`; el navegador solo recibe los mensajes de su vendedor a través de la API.

Para responder, configura `INSTAGRAM_TOKEN_ENCRYPTION_KEY` como un secreto de servidor independiente: 32 bytes aleatorios en hexadecimal (64 caracteres). Al autorizar de nuevo, RouteFlow cifra el token mediante AES-256-GCM y lo vincula al identificador de conexión. No se expone al cliente ni se escribe en logs. Las conexiones antiguas deben usar **Habilitar respuestas**; eso conserva los mensajes existentes. Cambiar la clave requiere volver a autorizar las cuentas. Un token revocado requiere reconexión; no hay renovación automática de credenciales en esta versión.

La bandeja pagina conversaciones e historial, conserva borradores en memoria al cambiar de conversación y actualiza cada 15 segundos mientras la pestaña está visible. No importa historial anterior, fotos ni audios y no conoce el nombre del interlocutor: lo distingue mediante los últimos dígitos de su identificador de Instagram.

Las respuestas son de texto, hasta 1,000 caracteres, solo a un remitente que ya escribió a esa cuenta y dentro de las 24 horas posteriores al último mensaje entrante. No se usan etiquetas para ampliar la ventana. Cada envío se reserva con un UUID único por conexión. Un reintento con el mismo identificador no vuelve a llamar a Meta. Si Meta o la red no confirman el resultado, se marca como incierto y se solicita revisar Instagram antes de iniciar otro envío; un registro pendiente tras una interrupción tampoco se reenvía automáticamente. La interfaz no muestra el estado «Enviado» hasta recibir `message_id` de Meta y guardar el resultado.

La recepción real se verificó con @beto_glez.z en Preview. La lectura de bandeja y el envío desde esta nueva interfaz deben verificarse tras desplegar y volver a autorizar. Producción y vendedores externos siguen sujetos a la revisión de Meta. Referencias: [autenticación y almacenamiento de tokens](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication), [política de mensajería](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/changelog/).

## Prueba directa con una sola cuenta

1. Aplica la migración de `instagram_test_messages` a la base de desarrollo.
2. Configura en el servidor de pruebas `INSTAGRAM_TEST_ACCOUNT_ID` con el identificador numérico de la cuenta profesional de prueba, `INSTAGRAM_META_APP_SECRET` con la clave secreta de la app de Meta y `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` con un secreto aleatorio. La clave de la app y el token de verificación van en variables privadas.
3. En Meta, abre **API de Instagram → Configurar webhooks**. Usa la URL HTTPS del entorno de pruebas seguida de `/api/webhooks/instagram` y el mismo token de verificación. El callback debe poder recibir solicitudes de Meta sin iniciar sesión.
4. Suscribe el campo `messages` y habilita **Suscripción al webhook** en la fila de la cuenta de prueba.
5. Envía un mensaje de texto desde una cuenta habilitada para probar la app. Confirma que aparece una sola fila para ese mensaje en la base de desarrollo.

```sql
SELECT message_id, received_at
FROM public.instagram_test_messages
WHERE message_text = 'Prueba de RouteFlow'
ORDER BY received_at DESC;
```

Usa conversaciones de prueba. La tabla es privada y conserva el texto entrante de la cuenta configurada. Al terminar, deshabilita la suscripción y elimina las filas de prueba que ya no necesites. El token de acceso de Instagram que muestra Meta es distinto del token de verificación y el receptor HTTP no lo usa.
