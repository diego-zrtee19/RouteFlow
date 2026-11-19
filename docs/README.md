# Documentación de RouteFlow

Entrada vigente para mantener el MVP. El [README principal](../README.md) describe sus capacidades y límites.

## Primer día de un programador

1. [Mapa del código y recorridos](development/code-map.md).
2. [Convenciones y comprobaciones](../CONTRIBUTING.md).
3. [Problemas de arranque y caché](development/troubleshooting.md).
4. [Catálogo de scripts](../scripts/README.md): distingue comprobaciones locales de operaciones remotas.
5. [Configuración de base de datos](operations/supabase-setup.md).
6. [Entrega técnica y alcance de la limpieza](development/handoff.md).

## Revisiones recientes

- [Auditoría y correcciones verificadas](development/system-audit-2026-11-01.md).
- [Sistema visual compartido](development/visual-system.md).

## Operación e integraciones

- [Preparación de producción](operations/PRODUCTION_READINESS.md).
- [Activación de proveedores](operations/PROVIDERS_ACTIVATION.md).
- [Procesos y alojamiento](operations/OPERATIONS_HOSTING.md).
- [Configuración de FedEx](operations/FEDEX_CREDENTIALS_INSTRUCTIONS.md).
- [Google Maps opcional](google-maps-setup.md).

La presencia de una guía no demuestra que la cuenta correspondiente esté configurada. Usa TEST/sandbox para desarrollar; los servicios LIVE requieren su propia validación.

## Producto

- [Objetivo y secuencia acordados con Diego](product/PROJECT_BRIEF.md).
- [Identidad de marca: azul profundo y blanco](brand/identity-v1.md).
- [Página interactiva para presentar el proyecto](product/presentation-hub.md).
- [Venta rápida y catálogo](catalog-sales.md).
- [Piloto de los tres recorridos](three-journeys-pilot-2026-10-22.md).
- [Decisión pendiente de proveedor de pago](product/PAYMENT_PROVIDER_PENDING.md).
- [Logos con IA: función pospuesta](product/pending-ai-logo.md).

## Antecedentes y archivos locales

`history/` conserva informes y guías de etapas anteriores, identificados como históricos. Pueden contener instrucciones reemplazadas. Los esquemas SQL conservados están en [`supabase/schemas`](../supabase/schemas/README.md); las migraciones incrementales permanecen en `supabase/migrations`.

`.routeflow-data/` contiene material local privado e ignorado por Git: capturas, logs, respaldos y cachés archivadas. No lo compartas como parte del código. `.next`, `.next-dev` y `node_modules` son generados; no son fuentes de la aplicación.

- [Cierre de rastreo, reintentos, dependencias y OneDrive — 2 noviembre 2026](development/reliability-followup-2026-11-02.md).
