> **Documento histórico.** Describe una etapa anterior. Sus comandos, rutas y afirmaciones pueden estar desactualizados. Empieza por [la documentación vigente](../README.md).

# Estilo global — 17 de octubre de 2026

Se extendió el estilo comercial del producto y checkout a la landing, catálogo y carrito, Mis compras, seguimiento y recibo, ayuda, acceso/registro y componentes del dashboard y administración.

- Cabecera compartida para el recorrido del comprador; fondo neutro, azul oscuro y botones sólidos.
- Landing sin degradados ni tarjeta flotante central; contenido alineado y flujo de venta completo en una fila de escritorio.
- Catálogo con precio más destacado, presentación uniforme y acceso al carrito con contador.
- Seguimiento con etapas conectadas por jerarquía y bordes, en vez de bloques coloreados separados.
- Tipografía y componentes del dashboard más sobrios; sección activa también indicada en sus subrutas.
- Se mantienen contenido, formularios, validaciones, permisos y endpoints. No se ejecutaron compras, reembolsos ni envíos.

Build completado con lint/tipos. Revisión visual de landing, catálogo y acceso. La revisión autenticada del dashboard requiere sesión: el navegador fue enviado correctamente a Clerk; no se alteró esta protección.

Cambios locales; no publicados en Vercel.

Revisión móvil adicional: landing y catálogo cargado a 390 px; ancho de contenido 385 px, sin desbordamiento horizontal. El carrito existente se mantuvo sin modificar sus artículos.
