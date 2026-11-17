# FedEx Sandbox Configuration Instructions

## CRITICAL: Add Your FedEx Credentials

The FedEx integration is now implemented but **REQUIRES** your actual FedEx credentials to function.

## ADD TO .env.local

Add the following lines to your `.env.local` file:

```env
FEDEX_CLIENT_ID=your_fedex_client_id_here
FEDEX_CLIENT_SECRET=your_fedex_client_secret_here
FEDEX_ACCOUNT_NUMBER=your_fedex_account_number
FEDEX_BASE_URL=https://apis-sandbox.fedex.com
```

## Where to Get Credentials

1. Go to https://developer.fedex.com/
2. Log in to your FedEx Developer account
3. Navigate to your project
4. Copy your API Key (Client ID)
5. Copy your Secret Key (Client Secret)

## Variables Explained

- **FEDEX_CLIENT_ID**: Your FedEx API Key from the Developer Portal
- **FEDEX_CLIENT_SECRET**: Your FedEx Secret Key from the Developer Portal  
- **FEDEX_ACCOUNT_NUMBER**: The shipping account linked to your FedEx API project.
- **FEDEX_BASE_URL**: FedEx Sandbox URL (configured for testing)

## What I've Implemented

### 1. FedEx OAuth 2.0 Authentication
- Created `src/lib/fedexAuth.ts` for OAuth token management
- Automatic token caching and renewal
- 60-minute token lifecycle management
- Server-side only (credentials never exposed to browser)

### 2. FedEx Shipping Provider
- Updated `src/providers/shipping/FedExProvider.ts` with real FedEx API integration
- OAuth 2.0 authentication with Bearer tokens
- Real API calls to FedEx Sandbox

### 3. Rates API Integration
- Endpoint: `POST /rate/v1/rates/quotes`
- Returns real FedEx rates from your account
- Maps FedEx response to RouteFlow format

### 4. Ship API Integration  
- Endpoint: `POST /ship/v1/shipments`
- Creates test labels when configured with the sandbox URL; production requires its own credentials and validation.
- Returns actual tracking numbers
- Processes label URLs

### 5. Tracking API Integration
- Endpoint: `POST /track/v1/trackingnumbers`
- Real-time tracking from FedEx
- Maps FedEx statuses to RouteFlow statuses
- Detailed scan events

### 6. Integration Status
- Updated `ShippingRegistry.getIntegrationStatus()`
- Distinguishes between TEST and CONFIGURED modes; configured does not mean the connection is verified.

## Configuración desde RouteFlow

Guarda la dirección completa del remitente en `/dashboard/settings`. En `/dashboard/products`, introduce el peso del paquete cerrado en kg y pulsa **Guardar peso**. Un pedido pagado con método `shipping` permite seleccionar FedEx y obtener el rastreo y el PDF de la etiqueta.

Las direcciones marcadas **DEMO** son ficticias. Sustitúyelas y revisa el peso real antes de utilizar producción.

## Producción

Obtén las credenciales de producción y la cuenta de envíos de tu proyecto en [FedEx Developer Portal](https://developer.fedex.com/). Completa la certificación que el portal indique para las etiquetas y configura `FEDEX_BASE_URL=https://apis.fedex.com` junto con esas credenciales en el entorno de producción. Reinicia el servidor y verifica autenticación y servicios disponibles antes de generar un envío real.

Guarda las claves únicamente en `.env.local` o en el gestor de secretos del despliegue. Generar una etiqueta en producción puede crear un envío con cargo a la cuenta.

Referencia: [guía oficial de inicio de FedEx](https://developer.fedex.com/api/en-lc/get-started.html).
- Shows NOT_CONFIGURED when credentials missing

### 7. Security
- All credentials server-side only
- No credentials in client JavaScript
- No credentials in Git (.env.local in .gitignore)
- OAuth tokens never logged
- Error messages sanitized

## Next Steps

1. **Add credentials** to `.env.local` as shown above
2. **Restart the application** to load environment variables
3. **Test the integration** through the normal RouteFlow flow

## Testing Flow

Once credentials are configured:

1. Create a product in Seller Dashboard
2. Create a Purchase Link
3. Open Purchase Link as buyer
4. Complete Stripe TEST payment
5. Open order in Seller Dashboard
6. Select FedEx as shipping provider
7. Verify FedEx rates are returned
8. Create shipment
9. Verify real tracking number is returned
10. Check tracking page shows FedEx status

## Architecture Preserved

- DHL integration: ✅ Unchanged
- MockShippingProvider: ✅ Unchanged  
- Stripe: ✅ Unchanged
- Purchase Links: ✅ Unchanged
- ShippingProvider interface: ✅ Preserved
- ShippingRegistry: ✅ Enhanced, not broken

## Build Status

- TypeScript: ✅ PASS
- Build: ✅ PASS
- No breaking changes
- All existing functionality preserved

## API Endpoints Used

- **OAuth**: `POST /oauth/token`
- **Rates**: `POST /rate/v1/rates/quotes`
- **Ship**: `POST /ship/v1/shipments`
- **Tracking**: `POST /track/v1/trackingnumbers`
- **Cancel**: `POST /ship/v1/shipments/cancel`

All using FedEx Sandbox: `https://apis-sandbox.fedex.com`

## Status Check Once Configured

After adding credentials, the integration status should show:
- **FEDEX: TEST** (when using sandbox)
- **FEDEX: CONNECTED** (when using production)

Before adding credentials it will show:
- **FEDEX: NOT_CONFIGURED**
