# Google Maps: integración preparada, sin activar cargos

El selector de ubicación se incluye en checkout individual y carrito. Sin clave, permite abrir Google Maps y pegar coordenadas o un enlace completo del punto. El enlace se guarda como referencia en las instrucciones del pedido. No sustituye calle, número, ciudad, estado o código postal requeridos por la paquetería.

Para habilitar el mapa integrado, configurar `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` con una clave de navegador restringida a los dominios autorizados y únicamente Maps JavaScript API y Geocoding API. La integración solo carga Google cuando el comprador abre el mapa. Clic en el mapa selecciona el marcador; geocodificación propone campos de dirección que el comprador debe revisar.

No se creó cuenta, clave ni facturación en esta entrega, a petición de Diego. Antes de activar, verificar precios, límites de cuota y configuración en Google Cloud. No usar una clave de servidor sin restricciones en una variable pública.

Referencia: https://developers.google.com/maps/documentation/javascript/get-api-key

La integración con clave necesita validación real después de configurar Google; no se presenta como probada con una cuenta que todavía no existe.
