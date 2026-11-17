> **Documento histórico.** Describe una etapa anterior. Sus comandos, rutas y afirmaciones pueden estar desactualizados. Empieza por [la documentación vigente](../README.md).

# Presentación comercial — 17 de octubre de 2026

Cambios locales, sin despliegue:
- Producto: galería ampliada con miniaturas, precio y entrega junto a la compra, vendedor enlazado y descripción independiente. No se usan fotos ficticias como respaldo.
- Checkout: secciones numeradas, resumen lateral fijo en escritorio, foto del artículo si existe, entrega pendiente distinguida del total final y mapa opcional desplegable.
- Componentes compartidos: botones sólidos, bordes discretos, menos redondeo y sombras; guía de compra sin tarjetas anidadas.
- Se conservan los endpoints, validaciones y flujo de pago; no se generaron pedidos ni cobros durante esta revisión.

Validación: build completado, ESLint y TypeScript; navegación producto → checkout y selección de entrega en navegador. Producto y checkout revisados a 390 px: ancho de contenido 385 px, sin desbordamiento horizontal.

Esta revisión no rediseña la landing ni todo el catálogo. Los componentes compartidos sí afectan su presentación. Google Maps sigue sin clave ni cargos activados.
