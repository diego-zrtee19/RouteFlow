# Contactos antes de la compra

Clientes (`/dashboard/customers`) incorpora «Agregar contacto interesado»: nombre y correo, sin pedido ni cuenta del comprador. La API toma el negocio y actor de la sesión. No envía correos, no verifica identidad y no obtiene consentimiento para campañas.

`seller_customer_prospects` es privada y tiene una clave única por vendedor/correo normalizado. Repetir una creación conserva el nombre original; no sobrescribe notas. Los contactos de otro vendedor nunca se consultan ni se unen a los del vendedor actual.

La lista combina prospectos y compradores por correo declarado. Antes de la compra muestra cero pedidos y fecha de última compra vacía. Cuando se registra un pedido con ese correo, aparece una sola ficha y conserva sus notas/fecha de seguimiento. El nombre más reciente del pedido tiene preferencia sobre el anotado inicialmente. Esta agrupación no acredita que dos personas sean la misma ni vincula una cuenta social.

Notas y próximo contacto siguen utilizando control de revisión para evitar sobreescrituras entre ventanas. Los contactos con fecha vencida o próxima en 24 horas aparecen en las tareas del panel; atenderlos requiere actualizar su fecha en la ficha. No hay envíos automáticos.

Migración `20261126033954_seller_customer_prospects.sql`, aplicada únicamente a desarrollo. `tests/sql/customer-prospects.sql` comprueba aislamiento, duplicados, notas antes del pedido y agrupación posterior, con todos los datos revertidos. `tests/sql/customer-followup.sql` conserva sus verificaciones anteriores. Pruebas de API y validación en `tests/customerFollowup.test.ts`.

Pendiente: contactos sin correo identificados por teléfono/canal, edición/archivo de datos básicos con auditoría, preferencias estructuradas y vinculación explícita a conversaciones. No inferir identidades de Instagram/WhatsApp por coincidencias de nombre.

Verificado en Preview el 27 de noviembre de 2026: creación sin pedido, rechazo de duplicado sin sobrescribir, persistencia de notas tras recargar, fecha rápida «Mañana a las 9:00», edición manual de fecha, aparición de contacto vencido en el panel y retirada del recordatorio. La edición conserva el valor al salir del campo; no se envió ningún mensaje. El contacto ficticio y su nota se retiraron tras confirmar que no tenían pedidos asociados.
