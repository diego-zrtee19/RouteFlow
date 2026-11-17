# Entrega a otro programador

## Entrada al proyecto

Lee el [README](../../README.md), el [mapa del código](code-map.md) y las [convenciones](../../CONTRIBUTING.md). Usa Node 22.12+ o 24, `npm ci`, variables propias de desarrollo y `npm run check`. El catálogo de [scripts](../../scripts/README.md) distingue trabajo local y operaciones con efectos externos.

## Organización revisada el 26 de octubre de 2026

- La raíz contiene los puntos de entrada, configuración y guías principales.
- `docs/operations` reúne configuración de servicios y operación. La guía de Supabase vigente reemplaza instrucciones antiguas de V2 y reparación de stock.
- `docs/history` conserva los documentos anteriores con un aviso explícito. No son instrucciones actuales de instalación.
- `docs/product` reúne decisiones y funciones pospuestas.
- `supabase/schemas` conserva los SQL antes ubicados en la raíz. Su contenido se mantuvo; scripts y pruebas usan las nuevas rutas.
- `supabase/migrations` mantiene sus nombres y contenido. No se ejecutaron migraciones como parte de esta limpieza.
- Dos módulos sin referencias desde las entradas de Next.js, scripts o pruebas se retiraron de `src`: `AppHeader.tsx` y `supabaseClient.ts`. La interfaz usa sus cabeceras actuales; las páginas acceden a datos por las API autorizadas. No se retiraron proveedores por el solo hecho de no estar activados.
- Cachés anteriores, logs y copias de los dos módulos retirados se conservan en `.routeflow-data`, fuera de las fuentes y de Git. Los movimientos iniciales tienen manifiesto local con hashes.

## Cómo revisar los cambios

El trabajo existente continúa en el directorio actual. Revisa `git status` y los diffs antes de preparar commits; esta limpieza no crea un commit global de cambios previos ni los publica. Los archivos movidos pueden aparecer como eliminados/nuevos hasta que Git detecte los renombrados al preparar la entrega.

Comparte el código versionable y los ejemplos de configuración. No entregues `.env` reales, `.routeflow-data`, respaldos, tokens ni NIP. `repository:check` comprueba rutas privadas versionadas y enlaces de la documentación de entrada; no es un escáner del contenido de secretos.

## Límites de esta preparación

La organización, el formato, los tipos y las pruebas facilitan el mantenimiento. Algunas API heredadas todavía consultan directamente el cliente administrativo y pueden extraerse a servicios de forma incremental, preservando autorización y contratos. El análisis estático de imports ayuda a localizar candidatos sin uso, pero no demuestra equivalencia funcional ni ausencia total de duplicación interna.

La validación local no sustituye una auditoría independiente de seguridad, pruebas con usuarios o aprobación legal/comercial. Los resultados de comandos se guardan localmente; los informes históricos describen el momento en que se escribieron.
