# Verificación de desarrollo · 10 de octubre de 2026

El MVP se conserva. Estas comprobaciones pertenecen únicamente a Supabase desarrollo, Stripe TEST y FedEx sandbox. No se publicó ni activó producción.

- Build: `npm run build` terminó con código 0, incluyendo TypeScript y ESLint. `npm run lint`: cero advertencias o errores. `npm test`: 149 pruebas pasando.
- Checkout de navegador: producto separado PRUEBA checkout navegador, 100 MXN, tarjeta oficial TEST, webhook automático HTTP 200, recibo PAID, dirección, cantidad y NIP de seis dígitos. Pedido RF-8SM4HV, entrega confirmada desde dashboard y proceso de operaciones HTTP 200, una transferencia. Se conservan pedido y recibo y se desactiva el link de prueba.
- Connect: cuenta TEST activa, sin requisitos pendientes. Pedido RF-F5NDN8: cobro 100 MXN y transferencia 95 MXN después del PIN. Reintento sin duplicación. Después se probaron reembolsos de 25 y 75 MXN con reversión de 23.75 y 71.25 MXN. Estado final REFUNDED / REVERSED. No es evidencia de depósito bancario real.
- SQL transaccional con ROLLBACK: `tests/refunds.postgres.sql` y `tests/legacy-reservations.postgres.sql` pasaron. Cubren límites, bloqueo concurrente, idempotencia, fallo bancario, alertas vencidas, revisión de inventario, propietario, protección de pedidos pagados y permisos privados.
- Seguridad Supabase: se fijó search_path de set_updated_at. Sin advertencias de seguridad; permanecen avisos informativos de RLS sin políticas en tablas privadas accesibles solo por el servidor.
- Ventas: los importes mostrados descuentan reembolsos confirmados. Alertas: disputas vencidas y reservas antiguas requieren revisión humana. El pedido antiguo original no se canceló ni cambió de inventario.
- OneDrive: se reprodujo EINVAL al iniciar desarrollo después del build. La preparación de caché ahora contempla enlaces reportados por Dirent y conserva la caché de producción antes de iniciar dev. El servidor volvió a iniciar y las rutas respondieron correctamente. OneDrive puede volver a alterar archivos generados; si reaparece, conviene trabajar fuera de una carpeta sincronizada.
- Rutas públicas `/`, `/p/[publicId]`, `/checkout/[publicId]`: HTTP 200. Dashboard sin sesión: 307; API de pedidos sin sesión: 401. Dashboard autenticado verificado en navegador.

## Pendientes externos

### Corrección de la primera importación de Vercel

El despliegue `dpl_AUzmFHNg8RRH2P8qNEA8uKzhH6mr` intentó instalar el commit legacy `0462ea34ee6002e61427f55a83746e6e9458f334`, no la V2 local. Falló por Next 15.1.0 incompatible con la dependencia de Clerk. Se actualizaron Next y eslint-config-next a 15.5.27 y se regeneró package-lock desde una resolución aislada, corrigiendo también inconsistencias de dependencias opcionales. `npm ci` completó una instalación limpia y las 149 pruebas volvieron a pasar, además de las dos pruebas del paquete de instalación.

El build de Next 15.5.27 terminó con código 0, incluyendo TypeScript y ESLint. El arranque de desarrollo preservó la caché de producción correctamente.

La auditoría de dependencias de ejecución reporta una vulnerabilidad alta y una moderada, sin críticas; la auditoría completa incluye dos críticas de herramientas de pruebas. Esta corrección de instalación no equivale a cerrar esa auditoría ni a habilitar producción. Los cambios locales todavía requieren sincronización con GitHub y la configuración del entorno de Vercel.

Supabase producción separado, hosting HTTPS, correo y dominio verificado, Clerk LIVE, Stripe LIVE, FedEx producción, dirección y paquetes reales. `PRODUCTION_READINESS.md` documenta respaldo, restauración, migraciones y vigilancia de la primera hora. Esos pasos no se han ejecutado: falta identificar el entorno de producción y completar sus credenciales. Las notificaciones TEST son vistas previas, sin correos enviados a personas.
