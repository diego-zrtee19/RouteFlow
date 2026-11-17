> **Documento histórico.** Describe una etapa anterior. Sus comandos, rutas y afirmaciones pueden estar desactualizados. Empieza por [la documentación vigente](../README.md).

# RouteFlow — mejoras operativas de las ocho áreas

Implementación local y migraciones aplicadas exclusivamente a Supabase de desarrollo `xnnkcgzijlpwxnvarqng`. No se desplegó esta entrega en Vercel ni se modificó producción.

## Cambios entregados

1. **Inventario y reservas.** Se conservó la reserva atómica existente, se verificó la última unidad con dos solicitudes simultáneas y se añadieron pruebas de conservación del pedido al editar el producto. Analytics muestra reservas aún sin pago finalizado. Cancelar dos veces restaura stock una sola vez; el pago confirmado no libera una reserva por vencimiento.
2. **Variantes y fotos.** En Productos se pueden editar nombre, descripción, precio base, hasta cuatro fotos HTTPS y nombre/precio de variantes existentes. Admite subida de imagen. La edición valida propiedad y rechaza versiones antiguas; no sobrescribe cantidades de inventario. Los pedidos conservan título, precio y foto comprados. La foto principal se actualiza junto con la galería. Crear variantes y ajustar sus cantidades continúa usando los recorridos existentes; esta entrega no añade eliminación de variantes ni una nueva interfaz para agregarlas a un producto ya publicado.
3. **Entrega coordinada.** Comprador y vendedor pueden proponer lugar/horario desde el pedido. La otra parte debe confirmar la misma versión. Cambiar horario vuelve a requerir confirmación. Se registra el historial y puede reportarse una cita pasada sin entrega; esto no confirma recepción, no atribuye culpa ni libera fondos. Los pedidos cerrados, en disputa o de paquetería no admiten nuevos acuerdos. Horas se presentan en Ciudad de México y el formulario identifica que la entrada usa la hora del dispositivo.
4. **Excepciones logísticas.** Pedido y vendedor explican etiqueta creada, incidencia/cancelación del transportista y entrega registrada sin recepción del comprador. Se orienta a conservar rastreo, consultar al transportista y abrir un caso. No se implementaron devolución automática ni regeneración automática de etiquetas; se evita recomendar una segunda etiqueta sin revisar la primera.
5. **Administración.** `/admin/operations` reúne pedidos pendientes, reservas vencidas, conteo de incidencias de paquetería e historial nuevo de coordinación/edición con rol, tienda y fecha. Se conservan los controles de administrador. Las estadísticas dejan de contar todos los casos como abiertos y no convierten errores de consulta en ceros. El historial nuevo cubre estas acciones nuevas; no reconstruye retroactivamente todas las operaciones anteriores.
6. **Seguridad y privacidad.** Tablas nuevas con RLS y sin acceso `anon`/`authenticated`; RPC solo para backend `service_role`, con propiedad y versión controladas. Acuerdos por correo requieren identidad verificada y mismo origen para escritura; token por encabezado conserva acceso de invitado. Se deja de aceptar token de comprador en query del endpoint/página del pedido. Comparación del token usa verificación de tiempo constante y límite de longitud. Accesos recordados en el navegador vencen a 30 días y pueden olvidarse, incluyendo sesión Stripe. Esto borra credenciales locales, no revoca un token ya copiado en otro dispositivo. Los formatos antiguos sin vencimiento requieren recuperación con correo verificado; las sesiones de pestaña actuales siguen disponibles.
7. **Medición.** Se muestran medianas de tiempo hasta pagar y hasta crear guía, tamaño de muestra y reservas pendientes. Se explicita que las vistas e intentos pueden repetirse y no son personas únicas. Medianas usan hasta los últimos 200 pedidos pagados; no son medición de despacho físico ni de abandono individual. Errores de carga se muestran con reintento.
8. **Piloto con personas.** `/dashboard/piloto`, disponible en navegación y Analytics, incluye guía, seis tareas, registro anónimo de resultado/tiempo/obstáculo y exportación CSV. Borrador por cuenta en la pestaña con vencimiento de cuatro horas. Se probó registro/exportación con una observación identificada como técnica y se retiró; hay cero entrevistas realizadas en esta entrega. Diego debe invitar participantes que acepten probar.

## Validación realizada

- Build final exitoso con comprobación de tipos.
- ESLint sin errores ni advertencias.
- 216 pruebas Vitest aprobadas, incluidas autorización del acuerdo, vencimiento de acceso y medianas.
- 17 verificaciones SQL de catálogo/reserva y 14 de experiencia operativa aprobadas en transacciones con rollback.
- Concurrencia: dos solicitudes de reserva para una unidad en una tienda temporal TEST. Una creó pedido, otra rechazó producto no disponible; una reserva y stock cero. Se canceló el pedido y se retiró exclusivamente el fixture creado para esta prueba. Se verificó que quedó cero tiendas de ese fixture.
- RLS verificado en las dos tablas nuevas y privilegios RPC restringidos al backend.
- Navegador local: carga del editor de producto; guardar los mismos datos de una camisa TEST conservó precio 80 y stock 2, registrando una edición en el historial. No se modificaron productos comerciales del usuario.
- Pedido TEST pagado: el formulario de coordinación cargó desde el endpoint sin error; no se envió una cita ficticia a ese comprador. Confirmación bilateral y conflictos de versión se comprobaron en SQL y autorizaciones en pruebas del endpoint.
- Analytics: lectura desde API/base mostró cuatro pedidos pagados de desarrollo y mediana de pago 0.9 minutos. Son datos TEST, no tracción comercial.
- Piloto: guardar, exportar CSV y retirar la observación técnica funcionó. El CSV descargado está en `C:/Users/diego/Downloads/routeflow-piloto.csv` y está identificado como prueba, no entrevista.

## Archivos de migración

- `supabase/migrations/20261012183132_operational_experience.sql`
- `supabase/migrations/20261012184653_product_photo_snapshot.sql`

Producción necesita estas migraciones antes de desplegar este código. La aplicación local ya usa el esquema actualizado. No hay activación de pagos/envíos LIVE ni envío real de correos como parte de esta entrega.
