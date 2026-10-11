# RouteFlow - Social Commerce Trust & Fulfillment Platform

RouteFlow turns social conversations (Instagram DMs, WhatsApp, TikTok) into verified, secure purchases. It combines instant purchase link generation, multi-carrier shipping logistics (DHL Express, FedEx, Uber Direct Local), and an escrow-style trust layer where buyers can track fulfillment and confirm delivery.

---

## 🌟 Core Architecture & User Flows

### 1. Buyer Experience
- **Verified Purchase Links (`/p/[publicId]`)**:
  - High-conversion product showcase with seller reputation indicators and verified badge.
  - Direct call-to-action to secure checkout.
- **Instant Checkout (`/checkout/[publicId]`)**:
  - One-page streamlined checkout with delivery preferences (Parcel Shipping or Local Same-Day).
  - 256-Bit SSL mock / Stripe authorization integration.
  - Instant transition into the buyer order tracking hub.
- **Buyer Live Order Tracking (`/order/[id]`)**:
  - Real-time carrier tracking status and milestones (Label Created, In Transit, Delivered).
  - One-click buyer delivery confirmation (`Yes, I received it`) releasing order to completed.
  - Dispute resolution trigger with dispute classification (Damaged product, Product not received).

### 2. Seller Operations
- **Overview Dashboard (`/dashboard`)**:
  - High-level KPIs: Gross Merchandise Value (GMV), Total Orders, Active Links, Link Views, Conversion Rate.
  - Quick access to pending dispatches and recent activity.
- **Order Management & Carrier Dispatch (`/dashboard/orders`, `/dashboard/orders/[id]`)**:
  - Comprehensive order pipeline: Ready to Ship, In Transit, Delivered, Completed.
  - Integrated carrier selection: **DHL Express**, **FedEx**, or **Uber Direct**.
  - One-click label generation and real-time tracking number assignment.
- **Product & Link Hub (`/dashboard/products`, `/dashboard/products/new`, `/dashboard/links`)**:
  - Create new products with multiple delivery options.
  - Instant purchase link minting with one-click copy and preview.
- **Analytics & Disputes (`/dashboard/analytics`, `/dashboard/disputes`)**:
  - Funnel metrics from link impression to completed delivery.
  - Dispute handling queue.

### 3. Administrator
- **Integration Monitor (`/admin`)**:
  - Live status monitor for payment gateways (Stripe) and shipping providers (DHL, FedEx, Uber Direct).

---

## 🚀 Getting Started

### Recibos y entrega (desarrollo)

- El recibo de `/checkout/success` y `/order/[id]` muestra artículos, cantidades, total, dirección y estado real. Requiere el token del comprador o una sesión de Stripe vinculada al pedido.
- Los pedidos del vendedor se consultan cada cinco segundos mientras la pestaña está visible. El stock se reserva al crear el pedido; confirmar el pago no lo descuenta otra vez.
- La entrega coordinada usa un NIP de seis dígitos privado para el comprador. El vendedor introduce el NIP para completar el pedido. Cinco intentos incorrectos bloquean la verificación durante quince minutos. Después, el proceso de operaciones puede transferir los fondos cuando Stripe Connect está habilitado y el pedido no tiene bloqueos.
- Para FedEx, configura el origen en `/dashboard/settings` y el peso real al publicar el producto. Las etiquetas PDF se guardan en el bucket privado `shipping-labels`; solamente el vendedor propietario puede descargarlas.
- La migración de estas funciones está en `supabase/migrations/20261010180602_coordinated_delivery_and_labels.sql`. Está aplicada al proyecto de desarrollo; producción requiere una migración y validación independientes.
- `predev` y `prebuild` preservan una caché `.next` con enlaces inválidos antes de regenerarla. El caché de webpack se desactiva en desarrollo y dentro de OneDrive. Ejecuta build y dev por separado para evitar que compartan `.next` simultáneamente.

### Prerequisites
- Node.js 18+ or 20+
- npm or pnpm

### Installation
```bash
git clone https://github.com/diego-zrtee19/RouteFlow.git
cd RouteFlow
npm install
```

### Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

### Development
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Build & Verification

La preparación del entorno nuevo está en `PRODUCTION_READINESS.md`. `npm run production:prepare` genera el esquema para revisión, sin ejecutarlo; `npm run production:preflight` revisa la configuración. Usa `.env.production.example` como plantilla. Las pruebas documentadas en `DEVELOPMENT_VERIFICATION.md` corresponden a desarrollo, no a producción.
```bash
npm run build
npm run start
```
The application builds cleanly with zero TypeScript errors across all static and dynamic routes.

---

## 📦 Shipping Integrations
See [`INTEGRATIONS.md`](./INTEGRATIONS.md) for full configuration details regarding DHL Express, FedEx, and Uber Direct.
