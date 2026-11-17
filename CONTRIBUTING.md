# Trabajar en RouteFlow

Este repositorio contiene el MVP existente. Empieza por [README.md](README.md) y [el mapa del código](docs/development/code-map.md); conserva sus recorridos de venta rápida, catálogo y seguimiento.

## Antes de cambiar código

1. Usa una rama y revisa `git status`. No descartes cambios ajenos ni regeneres datos para resolver un problema visual.
2. Instala con `npm ci`. Copia `.env.example` a `.env.local` y configura exclusivamente tus servicios de desarrollo.
3. Ejecuta `npm run check` para conocer el punto de partida. Las pruebas automatizadas no necesitan credenciales reales.
4. Busca con `rg` la ruta, su servicio y sus pruebas. Reutiliza los tipos de `src/domain`, los DTO públicos y los componentes compartidos.

## Convenciones

- TypeScript estricto; evita `any` y conversiones que oculten incompatibilidades. Valida entradas externas antes de usarlas.
- Nombres descriptivos y componentes pequeños. Separa transformaciones o reglas de negocio del JSX cuando realmente aporten claridad; no crees abstracciones para una sola línea.
- Prettier define el formato: dos espacios, punto y coma, comillas dobles y líneas de hasta 100 caracteres cuando sea posible. Usa `npm run format` y no comprimas formularios en una línea.
- Usa `Button`, `Input` y los componentes de `src/components` para mantener accesibilidad, estados de carga y estilo.
- Los comentarios deben explicar una decisión, un riesgo real o una condición del negocio; evita narrar lo que el código ya expresa.
- Interfaz para personas en español; reutiliza `src/i18n` donde corresponda. No prometas garantías, verificación o entrega que el sistema no comprueba.
- No cambies un esquema público inventando interfaces duplicadas: actualiza el DTO y sus consumidores.

## Límites importantes

- Una página no decide quién es propietario: conserva las comprobaciones del servidor en cada API.
- Un número de pedido no autoriza su lectura. Mantén token de comprador o identidad con correo verificado y el filtro de propiedad del vendedor.
- No importes Supabase administrativo, Stripe ni credenciales privadas en componentes de cliente.
- Los pagos se confirman en servidor; el retorno del navegador no equivale a pago confirmado. Mantén idempotencia y actualización atómica.
- No vuelvas a descontar inventario al procesar un webhook: la reserva se realiza al crear el checkout.
- Guía creada, entrega reportada por el transportista y entrega confirmada por el comprador son hechos diferentes.
- No modifiques ni repitas migraciones aplicadas. Añade una migración incremental revisable. No ejecutes reparaciones históricas de stock sin comprobar sus efectos.

## Antes de entregar

1. `npm run format` y `npm run check`.
2. `npm run build` con el entorno de desarrollo configurado; revisa qué variables se cargarán, en especial si existe `.env.production.local`.
3. Revisa en navegador el recorrido afectado, su estado vacío/error y una pantalla pequeña. Para pagos, etiquetas, entregas o reembolsos, usa TEST/sandbox y documenta lo que cambiaste.
4. Describe el problema, el cambio, la validación y los límites. Distingue una prueba con mocks, una prueba con proveedores de desarrollo y una validación de producción.
5. Comparte solo archivos de código/configuración de ejemplo. Nunca incluyas `.env*` reales, respaldos, tokens, NIP ni exportaciones de compradores.

Los checks locales no despliegan ni aplican migraciones. La publicación y los servicios LIVE tienen su propia revisión.
