# Sistema visual de RouteFlow

La identidad de la aplicación usa azul profundo y blanco. El símbolo aprobado es Encuentro (7 de noviembre de 2026). Se reutiliza mediante BrandMark; hereda el color del contexto.

## Fuente de verdad

- Paleta y tipografía: `src/app/globals.css` (tokens `accent`, `ink`, `muted`, `line`, `canvas`, `surface`).
- Acciones: `src/components/ui/Button.tsx`. Usar `Button` para acciones y `buttonStyles()` sobre `Link` para navegación. Nunca anidar un botón dentro de un enlace.
- Campos: `src/components/ui/Input.tsx`; etiquetas asociadas, mensajes de error y ayuda vinculados al campo.
- Tarjetas: `src/components/ui/Card.tsx`.
- Menús: `Navigation`, `CommerceHeader`, `SellerNavigation` y `DashboardLayout`.

## Reglas de presentación

- Acción principal azul; secundaria blanca con borde; acciones destructivas rojas. Verde y ámbar únicamente para comunicar estados.
- Mantener estados de carga, deshabilitado y foco de teclado. Las acciones compartidas tienen al menos 44 px de alto.
- Evitar botones que salten al pasar el cursor. La respuesta visual usa color, borde y sombra sutil; respetar movimiento reducido.
- Fondo claro, tarjetas blancas, bordes discretos. No añadir colores locales para cada pantalla.
- Texto de cuerpo legible y títulos de peso 600. Importes tabulares para facilitar comparaciones.
- Jerarquía: título, explicación breve, siguiente acción y detalles. No convertir todas las opciones en botones principales.
- Comprobar 390 px y escritorio, especialmente encabezados, formularios y acciones largas.
- El español es el idioma inicial del HTML y de las traducciones; se respeta una elección persistida o la detección de inglés del navegador.

## Antes de entregar

Revisar navegación con teclado, estados vacíos y de error, ausencia de desplazamiento horizontal, contratos privados y las comprobaciones de CONTRIBUTING. Un build correcto no sustituye una prueba visual autenticada ni una compra de desarrollo completa.
