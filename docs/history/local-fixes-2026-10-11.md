> **Documento histórico.** Describe una etapa anterior. Sus comandos, rutas y afirmaciones pueden estar desactualizados. Empieza por [la documentación vigente](../README.md).

# Revisión local de RouteFlow — 11 octubre 2026

## Correcciones

- Checkout de catálogo: aborta la petición de cotización al cambiar dirección, entrega o catálogo, y al desmontar la página. No aplica respuestas ni errores de peticiones canceladas.
- Carrito: actualiza la selección visible únicamente después de guardar correctamente; un error de almacenamiento ya no queda sustituido por un falso mensaje de éxito.
- Restauración del carrito: rechaza JSON que no sea un array, aunque imite una colección mediante `length`.
- Mis compras: reinicia resultados y paginación al cambiar el usuario o sus correos verificados. Las peticiones anteriores siguen cancelándose.
- Caché Next: desarrollo usa `.next-dev`; build y `next start` usan `.next`. El script de preparación inspecciona únicamente la carpeta del modo elegido. Las carpetas generadas y sus respaldos están excluidos de Git y los respaldos de TypeScript.

## Comprobaciones ejecutadas

- `npm test`: 181 pruebas pasando en 19 archivos, incluyendo dos regresiones nuevas de almacenamiento.
- `node --test tests/next-cache.test.cjs`: dos pruebas pasando sobre separación de salidas y conservación del build durante predev.
- `npm run lint`: éxito sin advertencias.
- `npm run build`: éxito, incluyendo tipos y ESLint; también se completó con el servidor de desarrollo activo usando la caché separada.
- HTTP: `/`, `/catalogo/dz192009`, `/catalogo/dz192009/checkout` y `/mis-compras` devolvieron 200. `/api/buyer/purchases` y `/api/dashboard/orders` devolvieron 401 sin sesión.
- Navegador local: catálogo visible; checkout bloqueó una selección sin stock. Ajustando la gorra ficticia de dos a una unidad, cargó el resumen de gorra y camisa por 200 MXN, con aviso TEST. No se inició checkout Stripe, no se reservó inventario ni se realizó pago o envío.

## Límites

- Cambios locales; no desplegados en Vercel en esta revisión.
- No se simularon cambios de cuenta Clerk ni respuestas FedEx demoradas en el navegador; esas correcciones se revisaron en código y compilación.
- Clerk muestra el aviso esperado de claves de desarrollo; no se ocultó ni se reemplazó por claves LIVE.
- No se cambiaron esquema, datos de producción, credenciales ni servicios reales. Esta revisión no certifica que no existan otros defectos.

Captura local: `.routeflow-data/checkout-audit-2026-10-11.png`.
