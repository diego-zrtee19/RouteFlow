# Brief vigente de RouteFlow

Actualizado el 4 de noviembre de 2026 con instrucciones de Diego Zárate.

## Meta inmediata

Presentar a la directora de tecnología de su escuela un proyecto avanzado, coherente y bien preparado. Antes de esa reunión queremos cerrar identidad visual, demostración estable, propuesta escrita, presentación y video. El apartado de ingresos debe distinguir objetivos y cifras confirmadas; el modelo no está cerrado mientras falten tarifas y compatibilidad de la configuración de pagos.

Se busca su acompañamiento en formalización fiscal/jurídica, contactos, promoción y preparación de un piloto. No dar por hecho que será socia ni ofrecer participaciones sin que Diego lo decida expresamente.

## Secuencia elegida

1. Pulir producto y marca, y preparar los materiales de presentación.
2. Cerrar las preguntas de costos y control de depósitos con Stripe u otro proveedor compatible.
3. Presentar el proyecto y la petición concreta de apoyo a la directora.
4. Preparar los requisitos fiscales, jurídicos y operativos con el acompañamiento correspondiente.
5. Realizar pruebas con usuarios y un piloto medido; aprender e iterar a partir de sus resultados.

Esta secuencia es una preferencia expresa de Diego. No se debe reemplazar por la exigencia de conseguir usuarios antes de preparar la presentación. La falta de validación de demanda debe describirse con honestidad.

## Producto

Ampliación solicitada el 23 de noviembre de 2026: evolucionar hacia la operación conectada del negocio descrita en [OPERATING_SYSTEM_VISION.md](OPERATING_SYSTEM_VISION.md). Sus módulos deben integrarse por etapas sobre la arquitectura existente, manteniendo las restricciones de pruebas y los límites de confianza aquí acordados.

Infraestructura para compras que nacen en redes sociales: el vendedor consigue al comprador y comparte un enlace de compra rápida o un catálogo simple de sus productos. El comprador compra, consulta su pedido y puede pedir ayuda. No se busca convertirlo en un marketplace de descubrimiento.

Venta rápida: un artículo ocasional. Catálogo: productos de un vendedor recurrente. Mantener ambas rutas. El comprador no necesita crear una cuenta para comprar y debe poder recuperar acceso seguro al seguimiento.

## Ingresos

El objetivo actual es un costo combinado cercano al 6% por venta, con margen inicial reducido como parte de la estrategia de adquisición de vendedores. Procesamiento, Connect/retiros y el tratamiento de impuestos deben aclararse antes de afirmar un margen. Envío se analiza aparte. El remanente después del procesamiento no es utilidad neta.

El seguimiento a Stripe solicita compatibilidad simultánea entre cobros directos sin cuotas adicionales y bloqueo efectivo de retiros hasta confirmar entrega. La respuesta general de soporte no sustituye una configuración concreta verificada ni un desglose numérico. No activar LIVE ni modificar las comisiones del MVP por esta hipótesis.

## Identidad

- Nombre: RouteFlow. Route significa ruta; flow, flujo. Como interpretación de marca: un recorrido claro desde la compra hasta la entrega.
- Preferencia visual elegida por Diego: azul profundo y blanco, para comunicar confianza y claridad.
- Símbolo elegido por Diego el 7 de noviembre de 2026: **Encuentro**. Integrado en los encabezados de la app, panel, pie y favicon.
- Sustituir la RF tipográfica provisional por un símbolo diseñado y un conjunto consistente de aplicaciones.
- Mantener una experiencia humana, sencilla y profesional, con referencias de claridad de comercios conocidos y una identidad propia.
- No usar escudos, palomitas o afirmaciones de verificación como decoración si sugieren garantías que RouteFlow no ofrece.
- La función de generar logos con IA para vendedores continúa pospuesta y no forma parte del diseño de esta marca.

## Estado de los entregables

Existen un MVP y materiales previos. Revisarlos y evolucionarlos; no reconstruir ni presentar material anterior como la versión final sin revisarlo. Las propuestas de identidad se encuentran en [la guía inicial de marca](../brand/identity-v1.md).

Diego propuso reunir propuesta, video, presentación y demostración en una página interactiva inspirada en el tablero de marca. La primera versión local está en [output/presentation-v1](../../output/presentation-v1/README.md); sus materiales están identificados como borradores o anteriores cuando corresponde. No es un despliegue público ni el paquete final aprobado para la reunión.

## Centro de control (8 de noviembre de 2026)

Administración separada de la navegación del vendedor, con Resumen, Pedidos, Vendedores, Casos de ayuda y Operación. Implementación local: /admin; raíz de admin.localhost reescrita a /admin. El dominio público admin.routeflow.mx no se ha verificado ni conectado. Mantener permisos administrativos en servidor. Ver docs/development/admin-centre.md para el alcance y configuración.
