> **Documento histórico.** Describe una etapa anterior. Sus comandos, rutas y afirmaciones pueden estar desactualizados. Empieza por [la documentación vigente](../README.md).

# Correcciones de recorridos — 22 de octubre de 2026

## Integrado
1. Landing con dos decisiones y ejemplos: vender un artículo o preparar catálogo.
2. Catálogo con disponibilidad y avisos al vendedor por nombres de prueba/abreviaturas, fotos faltantes y descripción vacía. Paquetería y edición quedan desplegables en Productos. No se inventaron fotos ni datos comerciales.
3. Barra fija de carrito con cantidad, subtotal y acceso a revisión/checkout. Se conservaron los dos artículos previos.
4. Producto/checkout distinguen interrupción temporal de enlace no disponible, ofrecen reintento y Mis compras. El checkout utiliza el DTO público compartido y la disponibilidad pública, sin stock privado.
5. Acuerdo de entrega muestra el siguiente paso por actor/estado; cambio de cita desplegable. Confirmación de cita, NIP y permisos no se alteraron.
6. Dashboard autenticado revisado con Diego: se corrigió el desbordamiento horizontal (ancho de página y contenido 794 px), se mantuvieron las tareas urgentes y se plegaron configuración/notificaciones. Productos muestra los avisos de calidad.
7. Piloto preparado en docs/three-journeys-pilot-2026-10-22.md y registro existente /dashboard/piloto. No se fabricaron entrevistas.

## Validación
- Build completo exitoso; TypeScript y ESLint sin errores, repetidos tras ajustes del dashboard.
- 27 pruebas pasan: errores del enlace público, experiencia del comprador y permisos de entrega.
- API mantiene 404 indistinguible para enlace inexistente/inactivo/vencido y usa 503 genérico sin detalles privados ante fallo interno.
- Navegador: ambas opciones en landing, carrito fijo con 2 artículos, enlace al carrito y paso al checkout con cantidades y subtotal de 200 MXN preservados. Dashboard y APIs autenticadas respondieron 200.

## Límites
El servidor estaba apagado y se inició. Durante su arranque en frío apareció un fallo de manifiesto y posteriormente una carga de chunk fallida; al recargar desapareció y el archivo generado pasó comprobación de sintaxis. No se asegura que un problema local de Next.js/OneDrive no reaparezca.

Faltan fotos y nombres definitivos del vendedor y pruebas con participantes reales. Todo sigue local, sin despliegue ni nuevos cobros, reembolsos o envíos.

Comprobación final autenticada: pedido RF-FDE3R4 y su acuerdo respondieron 200. Se muestran el siguiente paso para proponer cita, el formulario de lugar/fecha y la confirmación por NIP deshabilitada sin seis dígitos. Solo lectura: no se propusieron citas ni se confirmó entrega. Capturas en .routeflow-data. ESLint final de los tres archivos del vendedor correcto.
