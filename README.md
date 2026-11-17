# RouteFlow

MVP de social commerce: el vendedor comparte un enlace de compra rápida o un catálogo, el comprador paga en un checkout y después consulta su pedido y solicita ayuda. El proyecto evoluciona el producto existente; no es una reconstrucción ni un marketplace de descubrimiento.

**Objetivo vigente:** preparar marca, demostración y materiales para presentar a la directora de tecnología de la escuela de Diego; el piloto con usuarios se realizará después de la preparación fiscal y el acompañamiento acordados. Consultar el [brief del proyecto](docs/product/PROJECT_BRIEF.md) y la [primera propuesta de identidad](docs/brand/identity-v1.md) antes de planear cambios.

**Estado:** prototipo funcional con recorridos verificados en desarrollo. Stripe TEST, FedEx sandbox y correo preview son entornos de prueba; no equivalen a una operación comercial aprobada. La formalización contable/legal es una de varias pendientes, junto con proveedores LIVE, validación de producción y pilotos con usuarios.

## Para ejecutar

Requisitos: Node **22.12+ en la rama 22**, o **24**; npm y servicios de desarrollo propios. El lockfile determina las versiones instaladas.

```sh
npm ci
```

Copia `.env.example` a `.env.local` (`Copy-Item .env.example .env.local` en PowerShell) y completa sus variables con credenciales de desarrollo. No sobrescribas un archivo local que ya exista. Clerk protege las páginas privadas; Supabase es el sistema de registro y requiere su esquema y migraciones. No hay un fallback de pedidos ficticios cuando falla la base.

```sh
npm run dev
```

Abre http://localhost:3000. Mantén una sola instancia por repositorio. Si el puerto está ocupado, identifica el proceso antes de cerrarlo.

## Para un programador nuevo

1. [Mapa del código y recorridos](docs/development/code-map.md).
2. [Cómo contribuir y comprobar cambios](CONTRIBUTING.md).
3. [Arranque, caché y recuperación de fallos](docs/development/troubleshooting.md).
4. [Configuración de servicios y estado de producción](docs/operations/PRODUCTION_READINESS.md).
5. [Piloto de los tres recorridos](docs/three-journeys-pilot-2026-10-22.md).

### Carpetas principales

```text
src/app/              Páginas y API de Next.js App Router
src/components/       Interfaz compartida, comprador y vendedor
src/domain/           Tipos, DTO, validaciones y reglas
src/services/         Casos de uso y coordinación de proveedores
src/repositories/     Acceso a datos y conversiones de filas
src/lib/              Autorización, clientes y utilidades
src/providers/        Contratos e implementaciones de logística
src/i18n/             Idiomas existentes
supabase/migrations/  Cambios incrementales de base
supabase/schemas/     Esquemas conservados y fuentes de instalación revisable
scripts/              Operación, preparación y verificaciones
tests/                Pruebas (sin credenciales en la suite local)
docs/development/     Guía vigente para mantener el proyecto
```

La documentación vigente empieza en [docs/README.md](docs/README.md). Los informes anteriores están en `docs/history`; los esquemas conservados, en `supabase/schemas`. No ejecutes todos esos SQL contra una base existente.

## Comandos de calidad

```sh
npm run format
npm run check
npm run build
```

- `format` aplica Prettier a los archivos mantenidos; `format:check` comprueba sin escribir.
- `repository:check` comprueba enlaces de la documentación de entrada y rutas privadas/generadas versionadas; no inspecciona el contenido de secretos ni cuentas remotas.
- `lint` exige cero advertencias de ESLint.
- `typecheck` comprueba TypeScript sin depender de artefactos `.next` temporales.
- `test` ejecuta la suite Vitest con mocks; `test:cache` comprueba separación y recuperación de cachés; `test:scripts` verifica utilidades con fixtures y proveedores simulados.
- `check` encadena formato, lint, tipos y las tres suites. No aplica migraciones ni contacta proveedores de pago/envío.
- `build` produce `.next`, incluidas las comprobaciones de Next. Requiere configuración apropiada del entorno.
- `start` sirve ese build; **no arranca servicios externos ni convierte pagos TEST en LIVE**.
- `dev:fresh` conserva `.next-dev` como respaldo y regenera el entorno de desarrollo. Primero detén el servidor actual.

El workflow de GitHub ejecuta `check` en Node 22 y 24 sin secretos. No despliega. El build y las pruebas con proveedores se verifican por separado con el entorno configurado.

## Qué ofrece el MVP

- Venta rápida: `/dashboard/products/new?mode=quick` → `/p/[publicId]` → `/checkout/[publicId]`.
- Catálogo: `/dashboard/catalogo` → `/catalogo/[username]` → carrito y checkout del mismo vendedor.
- Comprador: `/order/[id]` para recibo, seguimiento y casos; `/mis-compras` mediante correo verificado. Comprar no exige registro.
- Vendedor: productos, inventario, enlaces, pedidos, acuerdos de entrega, paquetería, casos y desglose financiero.
- Entrega coordinada: propuesta/confirmación de cita y NIP privado de seis dígitos. Solo se comparte después de recibir y revisar el producto.
- FedEx: cotización, guía y seguimiento cuando el entorno está configurado; una guía creada no prueba recepción por la paquetería.
- Pago: confirmación de servidor/webhook, idempotencia y conciliación. El stock se reserva al crear el pedido; no se vuelve a descontar al confirmar el pago.
- Operaciones: avisos, reintentos y transferencia sujeta al estado de entrega, bloqueos y configuración. No es una promesa de depósito bancario inmediato ni de reembolso automático.

DHL y Uber tienen código de proveedor, pero su presencia no demuestra validación/configuración en producción. Google Maps está preparado y requiere configuración propia; no se activa facturación al instalar el repositorio. El envío real de correo también requiere proveedor y remitente verificado.

## Entornos y secretos

`.env.example` es una plantilla sin claves reales. Nunca subas `.env.local`, `.env.production.local`, `.routeflow-data`, respaldos, tokens ni NIP. La clave administrativa de Supabase y las claves privadas de Stripe/Clerk/FedEx son de servidor.

Antes de ejecutar `build`/`start`, revisa si existe `.env.production.local`: puede apuntar a servicios distintos de desarrollo. No uses credenciales LIVE en una demo escolar.

[PRODUCTION_READINESS.md](docs/operations/PRODUCTION_READINESS.md), [PROVIDERS_ACTIVATION.md](docs/operations/PROVIDERS_ACTIVATION.md) y [OPERATIONS_HOSTING.md](docs/operations/OPERATIONS_HOSTING.md) describen preparación y servicios. Los scripts `production:*` y `verify-*-live.ts` se deben leer y revisar antes de ejecutar: no forman parte del arranque normal.

## Presentación del proyecto

Una demo muestra capacidades del prototipo y sus límites. Las pruebas automatizadas no son clientes, ingresos, entrevistas ni aprobación para operar con dinero real. Para la presentación conviene tener un recorrido ensayado, una copia de respaldo y una solicitud concreta de mentoría contable/legal y validación con usuarios.
