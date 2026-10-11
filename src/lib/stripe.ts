import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/** Thrown when a Stripe operation is attempted without credentials configured. */
export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured. Missing STRIPE_SECRET_KEY.");
    this.name = "StripeNotConfiguredError";
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

/** Publishable key is safe for the browser (never the secret key). */
export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
}

/** Test mode is inferred from the secret key prefix; never claim live money in test mode. */
export function isStripeTestMode(): boolean {
  return String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new StripeNotConfiguredError();
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      appInfo: { name: "RouteFlow", version: "0.1.0" },
    });
  }
  return stripeClient;
}

