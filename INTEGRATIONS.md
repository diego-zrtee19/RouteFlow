# RouteFlow Carrier & Payment Integrations

RouteFlow integrates with leading logistics and payment providers to power social commerce fulfillment.

---

## 1. Shipping Providers

RouteFlow uses a pluggable `ShippingProvider` registry architecture defined in `src/providers/shipping/`. If API keys are not supplied in the environment, providers gracefully fall back to deterministic mock simulations to enable full end-to-end local testing.

### A. DHL Express (`DHLShippingProvider`)
- **API Spec**: DHL Express MyDHL API v3.0 REST
- **Base URL**: Defaults to sandbox `https://express.api.dhl.com/mydhlapi/test`
- **Required Env Variables**:
  ```env
  DHL_API_KEY=your_dhl_api_key
  DHL_API_SECRET=your_dhl_api_secret
  DHL_ACCOUNT_NUMBER=your_dhl_account_number
  DHL_BASE_URL=https://express.api.dhl.com/mydhlapi/test
  ```
- **Capabilities**:
  - `getRates`: Queries international & domestic DHL rates and delivery capability timeframes.
  - `createShipment`: Generates shipment manifests, air waybill tracking numbers, and printable PDF label URLs.
  - `getTracking`: Live tracking event checkpoints (Label Created, Picked Up, In Transit, Delivered).

### B. FedEx (`FedExShippingProvider`)
- **API Spec**: FedEx Developer Portal REST APIs
- **Base URL**: Defaults to sandbox `https://apis-sandbox.fedex.com`
- **Required Env Variables**:
  ```env
  FEDEX_API_KEY=your_fedex_api_key
  FEDEX_SECRET_KEY=your_fedex_secret_key
  FEDEX_ACCOUNT_NUMBER=your_fedex_account_number
  FEDEX_BASE_URL=https://apis-sandbox.fedex.com
  ```
- **Capabilities**:
  - Services: Standard Overnight, 2Day Express, Ground Economy.
  - Generates barcode tracking numbers (`FDX-...`) and shipment status milestones.

### C. Uber Direct (`UberDeliveryProvider`)
- **API Spec**: Uber Direct Same-Day On-Demand REST API
- **Base URL**: Defaults to `https://api.uber.com/v1/customers`
- **Required Env Variables**:
  ```env
  UBER_CUSTOMER_ID=your_uber_customer_id
  UBER_CLIENT_ID=your_uber_client_id
  UBER_CLIENT_SECRET=your_uber_client_secret
  UBER_API_URL=https://api.uber.com/v1/customers
  ```
- **Capabilities**:
  - Intra-city courier dispatching for same-day local commerce (30-60 min delivery).
  - Live courier assignment, pickup notification, and real-time transit telemetry.

---

## 2. Payment Layer — Stripe (REAL, not simulated)

RouteFlow uses **Stripe-hosted Checkout** with server-side order state transitions.
No card data ever touches RouteFlow servers or storage.

### Required Env Variables
```env
# Server-only. Never prefix with NEXT_PUBLIC_.
STRIPE_SECRET_KEY=sk_test_xxx
# Safe for the browser.
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
# From `stripe listen` or the Stripe Dashboard webhook endpoint.
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

| Variable | Scope | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Server only | Creates Checkout Sessions, PaymentIntents, refunds |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public | Stripe.js / hosted checkout bootstrap |
| `STRIPE_WEBHOOK_SECRET` | Server only | Verifies webhook signature authenticity |

### Running Stripe locally (test mode)

1. Install and authenticate the CLI: `npm i -g stripe && stripe login`
2. Start the app: `npm run dev`
3. Forward webhooks in a second terminal:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Copy the printed `whsec_...` into `.env.local` as `STRIPE_WEBHOOK_SECRET`, then restart the dev server.
5. Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.
   - Payment declines: `4000 0000 0000 0002`
   - Insufficient funds: `4000 0000 0000 9995`

Test mode is detected from the `sk_test_` prefix and surfaced in the Admin console
(`/admin`) as a **TEST MODE** badge. No test payment is ever presented as real money.

### Checkout flow (server-controlled amounts)

```
/p/{publicId}  ->  /checkout/{publicId}
   POST /api/checkout/session
     1. validate + normalize buyer input
     2. resolve link -> product -> seller  (server-side, from the datastore)
     3. amount = product.price            (client can never send an amount)
     4. create order  status = PAYMENT_PENDING
     5. stripe.checkout.sessions.create(..., idempotencyKey: rf_checkout_{orderId})
     6. persist sessionId / paymentIntentId on the order
   ->  redirect buyer to session.url  (Stripe-hosted payment UI)
   ->  Stripe confirms payment, calls the webhook
   ->  order becomes PAID  (server-side only)
```

The success page at `/checkout/success` **reads** the order state from the server.
It never declares success on its own; while the webhook is still in flight it shows
an "awaiting payment confirmation" state instead of a false positive.

### Webhooks (`src/app/api/webhooks/stripe/route.ts`)

Events handled:

| Event | Effect |
| --- | --- |
| `checkout.session.completed` | Reconcile -> order `PAID` |
| `checkout.session.async_payment_succeeded` | Reconcile -> order `PAID` |
| `checkout.session.async_payment_failed` | Order -> `PAYMENT_FAILED` / cancelled |
| `checkout.session.expired` | Order -> `CANCELLED` (abandoned checkout) |
| `payment_intent.payment_failed` / `.canceled` | Order payment -> `FAILED` |
| `charge.refunded` | Order -> `REFUNDED` with the real Stripe refund id |

Safety properties:
- **Signature verified** via `stripe.webhooks.constructEvent`; unsigned/invalid requests get `400`.
- **Idempotent**: processed event ids are tracked, so a redelivery never double-charges
  or double-marks an order. Checkout session creation also uses an idempotency key.
- Returns `500` on handler errors so Stripe retries delivery.

### Refunds

Refunds are created through the official Stripe API (`stripe.refunds.create`) and the
RouteFlow order only transitions to `REFUNDED` after Stripe confirms success.

### What is stored on the order

Only Stripe identifiers and metadata: `stripeCheckoutSessionId`, `stripePaymentIntentId`,
`stripeCustomerId` (when present), `paymentStatus`, `amount`, `currency`, timestamps.

**Never stored:** card number, CVC, expiry, or any raw payment credential.

---

## 3. Database & Auth (Optional Cloud Storage)

- **Supabase**:
  ```env
  NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
  SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
  ```
- **Clerk Auth**:
  ```env
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
  CLERK_SECRET_KEY=sk_test_xxx
  ```
- **Persistence**: Supabase is the only datastore. The former in-memory store (`src/services/dataStore.ts`) and its `store.json` snapshot were removed once checkout, webhooks, the API routes and the dashboard all read and wrote real rows. `tests/v1.retired.test.ts` fails the build if either file or an import of them reappears.

---

## 4. Internationalization (English / Spanish)

RouteFlow ships with one product and two dictionaries — there is no duplicated ES/EN UI.

| Piece | Location |
| --- | --- |
| Locale config + labels | `src/i18n/config.ts` |
| English dictionary | `src/i18n/locales/en.json` |
| Spanish dictionary | `src/i18n/locales/es.json` |
| Dictionaries loader | `src/i18n/dictionaries.ts` |
| `LanguageProvider` + `useI18n()` | `src/i18n/LanguageProvider.tsx` |
| `EN \| ES` switcher | `src/components/shared/LanguageSwitcher.tsx` |

Usage inside any component:

```tsx
const { t, locale, setLocale } = useI18n();
<h1>{t("dashboard.products.title")}</h1>
<p>{t("dashboard.links.views", { count: link.views })}</p>
```

Both `en.json` and `es.json` are flat key/value maps with identical key sets, so a missing
translation is impossible to introduce in one language only.

**Resolution order for the initial locale:**
1. The user's explicit choice persisted in `localStorage` (and mirrored to a cookie for SSR).
2. The `Accept-Language` browser header, matching `es` prefixes.
3. Fallback to English.

Once a visitor picks a language it persists across navigation and reloads, so they are never
asked again. The switcher appears in the public navbar, the dashboard sidebar, and
`/dashboard/settings`.

No environment variables are required for i18n.

