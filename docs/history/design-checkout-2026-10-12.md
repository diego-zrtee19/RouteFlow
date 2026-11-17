> **Documento histórico.** Describe una etapa anterior. Sus comandos, rutas y afirmaciones pueden estar desactualizados. Empieza por [la documentación vigente](../README.md).

# Diseño y checkout — 12 de octubre de 2026

## Entregado

- Selector de foto con zona de arrastre, botón accesible, validación JPG/PNG/WebP hasta 3 MB, estados de carga/error, vista previa y cambio/eliminación. Se usa en creación de producto, edición y logo del catálogo. No se activó generación de logos con IA.
- Botones principales con mayor contraste y volumen, modalidades con estado seleccionado claro, campos con etiquetas más legibles y tarjetas redondeadas.
- Checkout con título, jerarquía y guía breve de tres pasos. Detalles de condiciones se conservan en una sección expandible.
- Cotización de envío: mensaje visible si faltan datos, carga visible, resultado de envío incluido, errores junto al botón, cancelación de solicitudes al cambiar dirección y plazo de consulta de 30 segundos. Una respuesta antigua no se aplica después de cambiar la dirección.
- Ubicación opcional en checkout individual y de carrito. Sin clave permite usar coordenadas o enlace completo de un punto de Google Maps. No acepta enlaces cortos ni confunde el centro del mapa con un punto seleccionado. La referencia se adjunta a las instrucciones; calle, número y código postal siguen siendo necesarios.
- Google Maps integrado preparado para seleccionar marcador y proponer dirección mediante geocodificación, condicionado a una clave restringida. Diego pidió no activar cargos: no se creó cuenta, clave ni facturación. La selección dentro del mapa requiere configuración y validación posterior.

## Validación

- 222 pruebas Vitest aprobadas, incluidas coordenadas, enlaces válidos, límites geográficos y referencias de entrega.
- ESLint sin errores ni advertencias.
- Compilación con verificación de tipos.
- Navegador en el checkout `GQBH5PNA`: el botón con dirección incompleta muestra instrucciones; con dirección ficticia válida responde que el envío está incluido y lo paga el vendedor. No se realizó un pago ni se creó una etiqueta.
- El servidor local dejó de responder durante una suspensión de red del equipo. Se verificó y reinició únicamente el proceso de RouteFlow, recuperando respuestas HTTP 200.
- Vista móvil: formulario de producto y checkout cargado sin desbordamiento horizontal a unos 390 px. Se restauró el tamaño normal al finalizar.
- Referencia de ubicación: coordenadas ficticias seleccionadas correctamente y retiradas al finalizar, junto con la dirección de prueba. No se envió ubicación real a Google ni se cargó el SDK sin clave.
- Evidencia visual del formulario: `.routeflow-data/product-form-design-2026-10-12.png`.

Los cambios son locales, no publicados en Vercel. Configuración futura de Google: `docs/google-maps-setup.md`.
