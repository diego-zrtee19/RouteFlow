# Inventario privado e importación

Entrada: Inventario → Importar y exportar (`/dashboard/products/import`). API: `/api/dashboard/inventory/import`. Migración: `20261126032135_inventory_import_audit.sql`, solo desarrollo.

## Recorrido

1. Descargar plantilla, editar en Excel y guardar **CSV UTF-8**. No admite archivos XLSX directamente.
2. Revisar vista previa local; el servidor vuelve a validar todas las filas. Máximo 200 artículos / 1 MB; precios con punto decimal, MXN o USD; un método de entrega por artículo.
3. Importar crea productos nuevos **inactivos y ocultos**, sin descontar existencias anteriores. SKU único por vendedor. No modifica artículos existentes. Cada lote es una transacción: una fila inválida o SKU repetido revierte todo.
4. Completar fotos y datos del paquete desde el editor existente. Publicar revisa propiedad, foto, precio y stock; paquetería exige peso, dimensiones y origen. Crea el enlace de compra existente. La configuración final de logística sigue validándose en el checkout.

## Seguridad y reintentos

- `requireSeller` determina negocio y actor; se ignoran identidades suministradas por el cliente. Escrituras del mismo origen, cuerpo limitado.
- Tablas nuevas y funciones solo accesibles al servidor; RLS habilitado sin políticas públicas. Costos separados de `products`, porque los recorridos públicos consultan esa tabla.
- UUID de intento y hash del contenido normalizado evitan duplicados incluso después de recargar o perder una respuesta. El mismo SKU con otro contenido se rechaza; no sobrescribe stock. Cada lote tiene bloqueo transaccional por vendedor.
- Exportación privada CSV con BOM, escape de comillas y neutralización de fórmulas. Se rechaza si supera 500 productos para no entregar un archivo parcial. Productos antiguos sin SKU o con varias entregas requieren completar esas columnas antes de importarlos en otro negocio.

## Historial y tareas

El trigger registra altas y cambios del stock **total por producto** desde la instalación; incluye movimientos hechos por reservas y ajustes existentes. No reconstruye historia anterior ni identifica aún actor, motivo o variante. La eliminación de un producto elimina también sus filas por cascada; no es un libro contable inmutable.

El panel existente incorpora contactos vencidos/próximas 24 h, stock bajo y borradores importados. Usa el umbral del CSV cuando existe y 3 para productos anteriores. No envía mensajes automáticamente. Los avisos desaparecen al actualizar la fuente (fecha de contacto, existencias o publicación). Listas acotadas: 12 contactos, 12 productos por tipo; resumen de hasta 1000 productos con advertencia si puede ser parcial.

Pendiente: edición de metadatos privados para productos anteriores, motivo/actor por movimiento y variante, importación de actualizaciones con comparación, XLSX nativo y costos de mercancía congelados por pedido para utilidad histórica. El costo actual no debe interpretarse como utilidad neta.

## Verificación

`tests/inventoryImport.test.ts`: CSV, BOM, comillas, saltos, límites, SKU duplicado y decimales.
`tests/inventoryImportApi.test.ts`: sesión, origen, propiedad y validación en servidor.
`tests/sql/inventory-import.sql`: rollback completo de fixtures; deduplicación, publicación segura, aislamiento y privacidad. Ejecutar exclusivamente en desarrollo. `tests/sql/standalone-quotes.sql` verifica que el trigger conserva la reserva única del checkout.

Verificado en Preview el 25 de noviembre de 2026: carga CSV → vista previa → creación de un borrador → bloqueo al publicar sin foto → recarga → reimportación sin duplicados → tarea del borrador en el panel. El artículo ficticio, su historial y su lote se retiraron después de comprobar que no tenían enlaces ni pedidos. No se efectuó ningún cobro. Compilación local completa y 361 pruebas aprobadas (48 archivos).
