# RouteFlow: operación conectada del negocio

Requisito de Diego del 23 de noviembre de 2026. Fuente: documento «RouteFlow será el sistema desde el que un negocio mexicano pequeño o mediano pueda operar sus ventas completas».

Esta visión amplía el producto existente; no autoriza reconstruirlo, activar proveedores LIVE, inventar datos empresariales ni presentar capacidades pendientes como terminadas. Se mantienen venta rápida y catálogo, compra sin registro y protección de datos por vendedor.

## Secuencia de integración y criterios de aceptación

1. **Clientes e historial**: ficha privada a partir de pedidos, notas y próximo contacto. Implementación inicial: `/dashboard/customers`, API autenticada y migración `seller_customer_followup`. Agrupación por correo declarado, no verificación de identidad. Falta crear prospectos sin pedido, preferencias estructuradas, saldos y vinculación explícita a identidades sociales.
2. **Seguimiento de conversaciones**: reutilizar Instagram/WhatsApp y ventas por conversación. Pendiente estados de consulta/cotización/apartado, asignación a colaboradores, recordatorios y motivos de abandono. WhatsApp recibe pero Meta bloquea respuestas hasta verificar negocio; Facebook Messenger no está implementado.
3. **Cotizaciones a pedidos**: reutilizar selección de productos y checkout; faltan cotizaciones editables, descuentos controlados, vencimiento y conversión idempotente con snapshot de precios. No cambiar inventario dos veces al convertir.
4. **Cobros y saldos**: separar registro de efectivo/transferencia de verificación del proveedor. Pendientes libro de movimientos, anticipos, comprobantes y conciliación; jamás marcar un pago de Stripe como exitoso por una nota manual.
5. **Inventario completo**: existen productos, variantes, stock y reservas transaccionales. Faltan costo de compra, condición/procedencia estructurada, alertas configurables e historial íntegro de movimientos con motivo y actor.
6. **Panel de tareas**: existen avisos operativos. Incorporar próximos contactos, ventas detenidas, preparación y stock incompleto sobre las mismas fuentes. No agregar menús duplicados.
7. **Logística**: reutilizar FedEx sandbox, cotizaciones, guías, rastreo y entrega coordinada/NIP. Falta reparto propio con responsable y evidencia; verificar siempre configuración real antes de LIVE.
8. **Confianza y catálogo**: conservar identidad y políticas claras; faltan referencias externas diferenciadas de reseñas vinculadas a pedidos entregados y agenda para llamadas. No usar «auténtico», «verificado» ni «protegido» sin proceso que lo sustente.
9. **Posventa**: reutilizar casos, evidencia y reembolsos existentes. Faltan cambios/devoluciones con logística y reposición de stock controlada, y solicitud de reseña.
10. **Finanzas**: existe desglose monetario por pedido. Faltan costos de mercancía, gastos, corte por periodo y utilidad estimada con advertencias de datos incompletos; no confundir ingresos, dinero pendiente y utilidad neta.
11. **Reportes**: existen indicadores operativos; faltan conversión desde consultas, recompra, ventas por canal, cancelaciones y tiempos de atención basados en eventos reales.
12. **Equipo y permisos**: pendiente membresías por negocio, invitaciones, permisos por acción y bitácora. El acceso administrativo global existente no sustituye permisos de colaboradores.
13. **Automatizaciones e IA**: reutilizar operaciones/notificaciones existentes. Pendientes tareas programadas, resúmenes y borradores sobre datos reales. No enviar mensajes, cambiar precios o reembolsar automáticamente sin controles específicos. Sin proveedor IA habilitado por este documento.
14. **Importación/exportación**: pendiente Excel/CSV con vista previa, validación, protección contra fórmulas y claves idempotentes. Nunca mezclar vendedores ni importar stock silenciosamente.
15. **Crecimiento**: promociones, recuperación, campañas, referidos y atribución quedan después de registrar correctamente ventas y permisos/consentimientos.

## Entrega transversal

Cada bloque debe incluir migración versionada cuando corresponda, servidor con propiedad del vendedor, interfaz dentro del diseño existente, errores que conserven borradores, pruebas de aislamiento y concurrencia, verificación del recorrido real y documentación. Una pantalla o un mock no equivale a una integración terminada.

La comisión combinada cercana al 6% sigue siendo objetivo de negocio pendiente de validación. No modificar tarifas por esta ampliación. La formalización y revisión de proveedores permanecen pendientes, no resueltas por añadir módulos.
