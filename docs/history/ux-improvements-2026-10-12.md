> **Documento histórico.** Describe una etapa anterior. Sus comandos, rutas y afirmaciones pueden estar desactualizados. Empieza por [la documentación vigente](../README.md).

# RouteFlow: mejoras de experiencia — 12 de octubre de 2026

Se evolucionó el MVP existente. Los cambios están en la carpeta local; este trabajo no publica un despliegue ni activa cobros, correos o envíos reales.

## 1. Seguimiento del comprador

El pedido explica qué pasó, qué sigue y qué hacer ante un retraso. Muestra el último cambio registrado, diferencia la estimación del transportista de un compromiso del vendedor y aclara que el lugar o fecha escritos al comprar son una propuesta. Crear una etiqueta no significa que FedEx recibió el paquete; registrar entrega por paquetería no equivale a confirmación del comprador. Los errores de conexión permiten reintentar sin presentar la compra como desaparecida.

## 2. Venta rápida

El formulario comienza con nombre, descripción, foto, precio y entrega coordinada. La cantidad predeterminada es una unidad; cantidad adicional y URL de imagen están en secciones opcionales. Peso y dimensiones siguen siendo necesarios si se ofrece paquetería. Se recupera el borrador al recargar, separado por vendedor y modalidad, con opción de borrarlo.

## 3. Catálogo

Galería de fotos con alternativa cuando una imagen no carga. Por defecto aparecen productos disponibles y se ocultan nombres que comienzan con PRUEBA, DEMO o TEST; ambos filtros son reversibles y no cambian datos ni eliminan el carrito. Los disponibles aparecen primero. El precio inicial de variantes corresponde a una opción disponible. Esto clasifica por nombre, no añade una marca persistente de producto de prueba.

## 4. Corrección del carrito

El checkout mantiene los artículos editables aunque falle la validación. Señala productos retirados, variantes inexistentes o agotadas y cantidades insuficientes. Permite reducir cantidad, cambiar variante o quitar una línea. El diagnóstico del servidor identifica la línea sin publicar cantidades de inventario. El pago vuelve a validar precios e inventario con la lógica existente; el diagnóstico no sustituye esa validación. Cotizaciones anteriores se invalidan al cambiar artículos, entrega o dirección.

## 5. Casos de soporte

Se muestra responsable del siguiente paso, respuesta del vendedor, evidencia disponible y plazo solicitado para responder. Ese plazo no se presenta como fecha garantizada de resolución ni como reembolso automático. La respuesta del vendedor tiene borrador recuperable; los errores permiten reconsultar y distinguen guardar correctamente de fallar al recargar. El dashboard enlaza al caso correspondiente. Se conserva el proceso existente de resolución y autorizaciones.

## 6. Dashboard con tareas

Prioriza casos y pedidos por atender, indica cantidades y enlaza a cada acción. Consulta pendientes independientemente de los diez pedidos recientes para no perder pedidos antiguos. Los productos con peso o dimensiones incompletos enlazan a su tarjeta. Si falla el resumen, se muestra error y reintento, en vez de cifras cero como si fueran datos reales.

## 7. Accesibilidad y recuperación

IDs únicos y asociación entre etiquetas, campos y mensajes; avisos accesibles de carga/error; controles principales con altura táctil mínima; foco de teclado visible; respeto a movimiento reducido. Los botones de copiar tienen nombre accesible y no anuncian éxito si falla el portapapeles. Borradores en sessionStorage de la pestaña, con vencimiento de cuatro horas, validación y manejo del almacenamiento bloqueado. Checkout guarda nombre, contacto y dirección con aviso explícito; los borradores no incorporan NIP, token de acceso ni claves. Borrar borrador elimina sus datos. No constituye una auditoría completa de accesibilidad de todas las pantallas.

## Verificaciones

- Vitest: 203 pruebas aprobadas en 21 archivos, incluidas 18 nuevas de experiencia y 4 del endpoint de respuesta a casos.
- Caché Next: 2 pruebas aprobadas; desarrollo y compilación usan directorios distintos.
- ESLint: sin errores ni advertencias en la revisión.
- Compilación: producción compilada correctamente con verificación de tipos; se repitió para incluir los últimos ajustes.
- Navegador local: cantidad de gorra 2 provoca diagnóstico específico; reducir a 1 recupera resumen de 200 MXN sin perder el nombre ficticio del comprador. Recargar conserva el formulario; se borraron esos datos al terminar.
- Venta rápida: un nombre ficticio sobrevivió a una recarga; se descartó el borrador sin publicar un producto.
- Catálogo: dos productos normales por defecto y cuatro al incluir pruebas; el carrito se conserva.
- Vista móvil de aproximadamente 390 px: catálogo, venta rápida y checkout sin desbordamiento horizontal en las revisiones realizadas.
- Seguimiento: caso TEST existente muestra la respuesta previa del vendedor y siguiente paso de revisión. No se modificó esa respuesta ni se resolvió el caso. La escritura del endpoint se comprobó con mocks: vendedor propietario permitido, otro vendedor y comprador rechazados, cierre concurrente respetado.
- Dashboard local: tres pedidos por atender y dos paquetes incompletos.

## Límites pendientes

El envío real de correo, proveedores LIVE y aprobación de producción siguen fuera de esta entrega. No se han añadido fechas de entrega inventadas ni una garantía de resolución. La usabilidad con compradores y vendedores reales aún necesita observación; estas comprobaciones técnicas no reemplazan ese piloto.

Evidencia visual: `.routeflow-data/quick-sale-mobile-2026-10-12.png` y `.routeflow-data/checkout-mobile-2026-10-12.png`.
