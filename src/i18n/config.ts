export const LOCALES = ["en", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie + localStorage key used to persist the user language choice. */
export const LOCALE_STORAGE_KEY = "routeflow_locale";
export const LOCALE_COOKIE = "routeflow_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  es: "ES",
};

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Best-effort locale detection from an Accept-Language / navigator.language string. */
export function resolveLocaleFromLanguageTag(tag?: string | null): Locale {
  if (!tag) return DEFAULT_LOCALE;
  return tag.toLowerCase().startsWith("es") ? "es" : DEFAULT_LOCALE;
}
