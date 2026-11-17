# Sistema visual de RouteFlow

El 4 de noviembre de 2026 Diego eligió **azul profundo y blanco** para la nueva identidad. La [propuesta de marca](../brand/identity-v1.md) contiene esa dirección y sus símbolos en exploración. Las medidas y reglas siguientes describen la implementación actual; su paleta verde todavía no se ha migrado a la identidad propuesta.

La interfaz comparte sus colores y tipografía en `src/app/globals.css`. Los componentes de `src/components/ui` definen botones, campos y tarjetas. No crear otra paleta por página.

## Colores

- `accent-700`: verde petróleo principal; navegación seleccionada y acciones principales.
- `accent-600`: enlaces, foco y hover.
- `accent-50` y `accent-100`: superficies seleccionadas y avisos informativos.
- `ink`, `muted`: texto principal y secundario.
- `canvas`, `surface`, blanco: fondo general, navegación y tarjetas.
- `line`: bordes y divisiones.
- Rojo, ámbar y verde de estado: errores, advertencias y confirmaciones; acompañarlos siempre con texto o icono.

Los nombres anteriores `brand-blue` y `primary-*` son alias de la misma paleta para compatibilidad. Usar `accent-*` en código nuevo. Las páginas de administración, comprador, vendedor y acceso siguen el mismo sistema.

## Tipografía y medidas

Una sola pila tipográfica del sistema, Segoe UI en Windows, sin descargas externas. Cuerpo de 16 px con interlineado 1.65; texto compacto de 14 px con interlineado 1.6. Encabezados con peso 600 y espaciado ligeramente reducido. Reservar monoespaciada para identificadores y NIP.

Usar la escala de espacios de Tailwind (4, 8, 12, 16, 24, 32 px). Tarjetas compartidas: radio de 16 px, borde de 1 px y relleno de 20 px en móvil / 24 px a partir de sm. Botones y campos: radio de 12 px y área de interacción de al menos 44 px; inputs compartidos usan 48 px. Para tarjetas con relleno especial, especificar también el ajuste responsive si corresponde.

El dashboard es un contenedor para que las opciones de venta usen dos columnas solo cuando hay suficiente espacio real, sin depender únicamente del ancho de la ventana junto al menú lateral.

## Interacción y accesibilidad

Mantener foco visible, estados deshabilitados y de carga, y respetar movimiento reducido. No usar color como único indicador. Los enlaces con apariencia de botón usan `buttonStyles`, sin anidar un botón dentro de un enlace. La navegación de idioma usa la misma paleta en superficies claras y oscuras.

## Revisión visual

Comprobar dashboard, productos, catálogo, checkout, seguimiento, Mis compras y ayuda. Revisar escritorio y un ancho de móvil de 390 px: ausencia de desplazamiento horizontal, textos sin recortes y separación de acciones. No crear compras ni modificar datos reales para revisar estilos. Las páginas sin productos pueden revisarse en su estado vacío; eso no equivale a validar el flujo de un pedido existente.
