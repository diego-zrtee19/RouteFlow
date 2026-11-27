# Tareas propias del negocio

El bloque «Mis tareas» vive en el panel existente, después de «Tu siguiente paso». No añade una sección a la navegación ni reemplaza avisos de pedidos, contactos o stock.

- Título obligatorio, detalle y fecha opcionales (hora del dispositivo). Crear no envía mensajes ni cambia pedidos, inventario o pagos.
- Completar y reabrir son reversibles. No hay eliminación ni edición destructiva de contenido en esta versión.
- UUID del intento estable hasta recibir confirmación. Si la respuesta es incierta, el formulario conserva los datos y reintenta el mismo cuerpo. Un rechazo conocido permite corregir el borrador.
- El servidor determina vendedor y actor desde Clerk; tablas y funciones privadas, RLS habilitado, sin acceso directo de usuarios anónimos/autenticados.
- Creación y movimiento de historial ocurren en la misma transacción. Reintentar no añade otra tarea ni otro movimiento. Completar/reabrir usa revisión y bloqueo de fila para impedir sobreescrituras entre ventanas.
- Lista: primeras 50 pendientes ordenadas por fecha/creación, total exacto; 10 completadas recientes; 20 movimientos recientes. Hasta 500 pendientes al crear nuevas tareas. Reabrir conserva la tarea original y su historial.
- «Actualizar tareas» permite ver cambios de otra ventana. Un conflicto pide actualizar; no se fuerza el cambio con una revisión antigua.

API: `/api/dashboard/tasks`. Migración de desarrollo: `20261127151619_seller_tasks.sql`. Pruebas: `tests/sellerTasks.test.ts` (datos, sesión, origen, propiedad, conflictos) y `tests/sql/seller-tasks.sql` (transacciones, reintentos, aislamiento e historial; fixtures revertidos).

Pendiente: asignación a colaboradores cuando se implemente el acceso por equipo; relación explícita de tareas manuales con conversaciones/pedidos; edición versionada del contenido y avisos programados. No presentar este bloque como automatización o notificación externa.

Verificado en Preview el 27 de noviembre de 2026: crear tarea con detalle, completar, reabrir, completar de nuevo y consultar los cuatro movimientos del historial. La tarea ficticia «QA · verificar tareas de RouteFlow» permanece completada para conservar evidencia; no deja pendientes abiertos. Compilación Preview aprobada, TypeScript/ESLint sin errores y 368 pruebas aprobadas en 49 archivos. Las pruebas SQL revierten sus fixtures.
