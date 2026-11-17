# Centro de control de RouteFlow

La administración reutiliza el backend de RouteFlow y tiene navegación propia, separada de las herramientas de vendedores. Secciones: Resumen, Pedidos, Vendedores, Casos de ayuda y Operación.

## Entrada local

Con el servidor en puerto 3001: http://admin.localhost:3001 abre el centro. Si el navegador no resuelve ese nombre, http://localhost:3001/admin conserva el acceso directo. La reescritura solo cambia la presentación de la raíz del host; no concede permisos.

Requiere sesión Clerk y autorización mediante requireAdmin (rol ADMIN o lista administrativa ya configurada). No se asignan permisos por ser el primer usuario ni por visitar el dominio. Las páginas de pedidos/vendedores verifican permisos antes de consultar datos. El layout limita toda la sección y solicita no indexación.

## Dominio público

No se ha comprado ni conectado routeflow.mx/admin.routeflow.mx como parte de este cambio. Para usar admin.routeflow.mx hay que verificar titularidad, agregar DNS y dominio a Vercel, configurar Clerk para ese origen y establecer ROUTEFLOW_ADMIN_HOSTNAME=admin.routeflow.mx en el entorno adecuado, después desplegar. Configurar el dominio no activa servicios LIVE.

## Lectura de cifras

Vendedores registrados cuenta filas de tiendas, no usuarios totales de Clerk ni usuarios activos. Pedidos creados incluye pagos pendientes y cancelados. Las listas muestran los últimos 50 registros; no son exportaciones completas. No se muestran datos de tarjeta ni contactos de compradores en estas listas.

El resumen no presenta ganancia neta: falta confirmar costos completos del modelo. Servicios configurados significa presencia de variables, no conexión comprobada. Operación muestra fallos y ejecuciones existentes; Casos permite utilizar el proceso de soporte ya implementado.

No incluye suspensión de vendedores ni cambios destructivos de cuentas. Esas acciones necesitan reglas, auditoría y pruebas específicas antes de habilitarse.

Verificación del 8 de noviembre de 2026: lint y TypeScript aprobados; dos pruebas de aislamiento administrativo aprobadas. Consultas de columnas comprobadas con HEAD/count en la base de desarrollo, sin mostrar filas ni datos personales. La revisión visual quedó pendiente por desconexión del navegador de control. El dominio público no se verificó ni se configuró durante esta implementación.
