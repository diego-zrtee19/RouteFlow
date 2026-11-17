# Configurar Supabase

El modelo actual usa `sellers`, `products`, `purchase_links`, `orders`, `order_items`, `payments`, `shipments`, `disputes` y tablas operativas. Clerk autentica y las API validan identidad y propiedad antes de usar el cliente administrativo.

## Desarrollo con un proyecto existente

1. Configura las variables indicadas en `.env.example` con credenciales propias de desarrollo.
2. Revisa qué esquemas y migraciones ya están aplicados. La carpeta del repositorio por sí sola no demuestra el estado de una base remota.
3. Conserva las migraciones de `supabase/migrations` y revisa sus dependencias antes de aplicar cambios pendientes.
4. Comprueba el flujo afectado con datos de prueba. Un build o pruebas con mocks no validan una migración remota.

## Proyecto nuevo y vacío

`npm run production:prepare` genera `.routeflow-data/production-package/bootstrap.sql` y su manifiesto. Selecciona V3, V5, V6 y las migraciones incrementales, y comprueba que el proyecto esté vacío al ejecutar el paquete. El comando solo prepara archivos; no cambia la base.

Revisa el paquete, la identidad del proyecto y su configuración antes de ejecutarlo. Una base existente necesita un plan incremental; no uses el paquete de instalación vacía como actualización.

## Inventario y esquemas anteriores

Los [esquemas conservados](../../supabase/schemas/README.md) incluyen una reparación V4 que asigna existencias a filas en cero. No es seguro repetirla de forma general: cero puede representar un producto vendido o retirado. El vendedor establece sus existencias reales en el producto. El checkout reserva inventario; el webhook no debe descontarlo otra vez.

Los archivos V1/V2 no son el punto de entrada de la versión actual. No apliques todos los SQL por número de versión sin revisar el modelo y los datos existentes.

## Accesos

La clave administrativa se utiliza en servidor. El número de pedido no autoriza leer un recibo: el comprador necesita su acceso privado o correo verificado. RLS, los DTO y los filtros de propiedad de las API cumplen funciones diferentes y deben conservarse.
