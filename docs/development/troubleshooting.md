# Ejecutar y recuperar el entorno local

## Instalación reproducible

Usa Node 22.12 o posterior dentro de la rama 22, o Node 24. El requisito viene también de Vitest; Node 18/20 ya no sirve para toda la cadena actual. Instala con `npm ci`, respetando `package-lock.json`.

`npm run typecheck` comprueba código sin depender de tipos temporales de `.next`. `npm run build` también verifica los tipos de las rutas que genera Next.js.

## Puerto 3000 ocupado

No inicies varias instancias sobre el mismo repositorio. Next puede elegir 3001, pero enlaces, cookies y webhooks locales quizá sigan apuntando a 3000. Cierra con Ctrl+C el proceso que tú iniciaste y vuelve a arrancar. No termines procesos por un PID antiguo sin verificar propietario y ruta.

## ChunkLoadError, manifiesto ausente o pestaña antigua

1. Conserva cualquier formulario pendiente antes de recargar.
2. Recarga la página una vez. Una pestaña anterior a un reinicio puede solicitar archivos que ya cambiaron.
3. Si persiste, detén el servidor con Ctrl+C y ejecuta `npm run dev:fresh`.
4. El comando conserva `.next-dev` como `.next-dev-before-<timestamp>` y regenera únicamente el resultado de desarrollo. No borra código, datos ni el build de producción.
5. Si vuelve a ocurrir, guarda el error y los logs sin credenciales. OneDrive y sus archivos bajo demanda pueden afectar el acceso a artefactos; para trabajo diario conviene una copia local fuera de carpetas sincronizadas, mediante Git. No muevas la carpeta original ni pierdas cambios sin respaldarlos.

La caché de compilación de desarrollo usa memoria durante ese proceso. No se comparten cachés de webpack en disco con OneDrive. Esto reduce recompilación, pero no convierte un fallo intermitente del sistema de archivos en un problema garantizadamente resuelto.

## Desarrollo y build

`npm run dev` usa `.next-dev`; `npm run build` y `npm start` usan `.next`. No levantes dos servidores de desarrollo a la vez. Durante una demo evita editar código o ejecutar verificaciones pesadas que saturen la computadora.

Para una demostración sin recompilación de páginas, un build validado seguido de `npm start` puede ser más predecible. Antes revisa las variables que Next cargará: `.env.production.local` puede apuntar a otro entorno. Modo de compilación de producción y pagos LIVE son conceptos distintos. No uses credenciales LIVE para una demo escolar.

## Acceso y datos

- Dashboard redirige a acceso: inicia sesión con Clerk; no elimines la protección.
- API responde 401/403: comprueba sesión y propietario. No lo resuelvas dando permisos globales.
- API responde 503: revisa configuración y disponibilidad; no sustituyas pedidos reales por datos de muestra.
- Correo en modo preview: no se envió un correo real, aunque el aviso exista en el panel.
- FedEx no cotiza: comprueba origen, destino, peso, dimensiones y entorno sandbox; no generes una etiqueta real para probar un botón.

## Revisiones remotas

`npm run check` es local y usa mocks; no sustituye pruebas end-to-end con proveedores. Los scripts llamados `verify-*-live.ts` y los comandos `production:*` pueden consultar o modificar servicios: sus nombres no son permiso para ejecutarlos contra producción. Lee cada script y su documentación antes de usarlos.
