/**
 * Canonical public Purchase Link URL construction.
 *
 * RouteFlow builds shareable links (copy, preview, WhatsApp) that buyers open
 * from Instagram or WhatsApp, so the origin must come from configuration in
 * production and only fall back to the browser origin during local development.
 */

const DEFAULT_ORIGIN = "http://localhost:3000";

/** Origin configured for the current environment, or "" when not set. */
export function getConfiguredAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  return typeof configured === "string" ? configured.trim().replace(/\/+$/, "") : "";
}

/**
 * Resolves the app origin for a server request: the explicit env value wins,
 * otherwise the request's own origin is used so previews never point at
 * localhost from a deployed domain.
 */
export function resolveAppOrigin(fallbackOrigin?: string): string {
  const configured = getConfiguredAppOrigin();
  if (configured) return configured;
  if (fallbackOrigin) return fallbackOrigin.replace(/\/+$/, "");
  return DEFAULT_ORIGIN;
}

/** Builds the canonical buyer-facing URL for a purchase link public id. */
export function buildPublicLinkUrl(publicId: string, origin?: string): string {
  const base = (origin && origin.trim().replace(/\/+$/, "")) || DEFAULT_ORIGIN;
  return `${base}/p/${publicId}`;
}
