# Pendiente: proveedor de pagos de RouteFlow

Registrado el 11 de octubre de 2026 a petición de Diego.

Antes de integrar o sustituir un proveedor, retomar la evaluación de Openpay
México y Clip. Priorizar una consulta al equipo comercial y Partners de Openpay.
La documentación pública no confirma autorización para el modelo completo de
RouteFlow: no asumir que cuentas con saldo o retiros equivalen a escrow aprobado.

## Consulta que debe enviarse

RouteFlow conecta vendedores independientes con compradores. Necesitamos cobrar
por tarjeta y SPEI, separar nuestra comisión y pagar al vendedor después de
confirmar la entrega por rastreo o NIP. ¿Autorizan este modelo en México? ¿Qué
identificación requiere cada vendedor? ¿Cuánto cobran por cobro, cuenta de
vendedor, transferencia, reembolso y contracargo? ¿Cuánto tiempo puede permanecer
el dinero pendiente de liberación?

Estamos en fase MVP y todavía no procesamos pagos reales. Buscamos confirmar la
viabilidad del modelo y conocer todos los costos antes de integrar su servicio.

## Criterios de decisión

- Techo deseado: 6% total por venta, incluyendo procesamiento e IVA de comisión;
  el envío se cotiza aparte.
- Buscar mejores márgenes; una diferencia después del procesamiento no es
  utilidad neta: faltan transferencias, operación y tratamiento fiscal.
- Mantener tarjeta y evaluar SPEI complementario; no asumir que SPEI integrado
  es gratuito.
- Exigir confirmación escrita del flujo de múltiples vendedores, comisión,
  liberación por entrega, restricciones y tarifas completas antes de cambiar
  Stripe.
- No activar cobros, envíos reales ni contactar terceros sin autorización.

Fuentes oficiales para retomar:

- https://documents.openpay.mx/docs/partner
- https://documents.openpay.mx/docs/api/index.html
- https://developer.clip.mx/

Recordatorio solicitado: martes 13 de octubre de 2026, 10:00, Ciudad de México.

## Seguimiento del 7 de noviembre de 2026

Diego autorizó consultar alternativas en paralelo para no depender únicamente de
Stripe. Esta autorización cubre consultas comerciales; no contratación, activación
LIVE ni cambios a la integración del MVP.

### Openpay México

- Consulta enviada por correo a `ventas@openpay.mx`, dirección publicada en
  https://www.openpay.mx/ . Gmail confirmó el mensaje como enviado; esto no prueba
  que Openpay lo haya leído o aceptado.
- Asunto: «RouteFlow México: consulta de viabilidad para múltiples vendedores y
  cotización completa».
- Se describió el prototipo sin operación real ni volumen validado. Se pidió
  autorización del modelo, tarjeta y SPEI, comisión de plataforma, bloqueo de
  retiros hasta NIP/rastreo, plazos, identificación de vendedores ocasionales,
  requisitos de la plataforma, sandbox, reembolsos, contracargos y saldos negativos.
- Caso económico solicitado: UNA compra de $500 MXN, UN depósito bancario,
  objetivo de $470 para el vendedor y $30 para todos los cargos combinados,
  incluyendo IVA aplicable y comisión de RouteFlow; envío aparte. Sin asumir
  descuentos por volumen futuro.
- Pendiente: respuesta comercial y revisión técnica. No hay tarifa aceptada ni
  compatibilidad confirmada.

### Mercado Pago México

- Canal comercial localizado desde su sitio oficial:
  https://www.mercadopago.com.mx/herramientas-para-vender/check-out#benefits-checkout
- El formulario solicita nombre, teléfono, correo y una confirmación relacionada
  con su declaración de privacidad. Diego autorizó el teléfono en esta conversación
  y se envió la solicitud de contacto con su nombre, correo y número autorizado.
  La página confirmó «¡Listo! Tus datos fueron enviados» e indicó contacto en las
  próximas 24 horas o durante el próximo día hábil. Este mensaje no confirma
  aceptación del modelo ni tarifas. No guardar el teléfono en documentación pública.
- No se crearon cuentas, aceptaron contratos ni obtuvieron credenciales.
- Preparar la misma consulta económica y operativa. El formulario de contacto no
  incluye campo para explicar el modelo; después de obtener contacto comercial,
  enviar el cuestionario completo y solicitar especialista en plataformas.
- Documentación revisada:
  https://www.mercadopago.com.mx/developers/es/docs/split-payments/split-1-1/prerequisites
  y
  https://www.mercadopago.com.mx/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
- Split 1:1 documenta división de pago y comisión de plataforma; no demuestra
  control de todos los retiros hasta entrega. La página de integración contiene
  ejemplos de tarjeta y también una restricción sobre dinero en cuenta y
  transferencias de instituciones externas. Pedir aclaración específica para
  tarjeta y SPEI en México antes de afirmar compatibilidad.
- El control de fecha de liberación de la comisión no equivale a controlar la
  disponibilidad o el retiro del dinero del vendedor.

### Siguiente paso

Obtener respuesta escrita de Openpay y esperar el contacto comercial solicitado
a Mercado Pago. Entregar a Mercado Pago el cuestionario completo cuando contacte;
el formulario enviado solo capturó los datos de contacto. Pedir a ambos los costos obligatorios sin IVA
incluido ambiguamente, la parte de cada participante y las limitaciones de
liberación. Solo preparar una prueba sandbox después de confirmar que el producto
admite el flujo; no sustituir Stripe por tarifas genéricas de una tienda individual.

### Clip — consulta enviada el 7 de noviembre de 2026

- Diego solicitó contactar a Clip. Se envió una consulta comercial a `info@clip.mx`,
  dirección que Clip publica para consultas generales y ventas en:
  https://blog.clip.mx/articulo/lector-clip-dudas-preguntas-ayuda-customer-happiness
- Gmail confirmó el mensaje como enviado. No equivale a entrega confirmada,
  lectura, autorización del modelo o cotización aceptada.
- Asunto: «RouteFlow México: viabilidad y costos de pagos para vendedores
  independientes».
- Se pidió autorización de múltiples vendedores, comisión separada, tarjeta y
  SPEI, control efectivo del depósito hasta NIP/rastreo, plazos, identificación
  de vendedores ocasionales, requisitos de la plataforma y acceso a sandbox.
- Mismo caso para comparar: compra única de $500 MXN, un depósito, objetivo de
  $470 al vendedor y $30 de cargos combinados con IVA aplicable; envío aparte.
  Se pidieron costos de reembolsos, contracargos, saldos negativos y cargos
  evitables, sin asumir volumen ni tarifas negociadas.
- No se compartió el teléfono autorizado específicamente para Mercado Pago.
- Pendiente: respuesta y derivación a especialista comercial/técnico si hace falta.
