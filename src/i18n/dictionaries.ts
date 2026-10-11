import en from "./locales/en.json";
import es from "./locales/es.json";
import { DEFAULT_LOCALE, Locale } from "./config";

export type Dictionary = Record<string, string>;
export type TranslationVars = Record<string, string | number>;

export const dictionaries: Record<Locale, Dictionary> = {
  en: en as Dictionary,
  es: es as Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
}

/** Replaces {placeholders} inside a translated string. */
export function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}

/**
 * Looks up a translation key for the given locale.
 * Falls back to English, then to a humanised version of the key so the UI
 * never renders an empty label when a key is missing.
 */
export function translate(locale: Locale, key: string, vars?: TranslationVars): string {
  const dictionary = getDictionary(locale);
  const fallback = dictionaries[DEFAULT_LOCALE];
  const template = dictionary[key] ?? fallback[key];
  if (typeof template === "string") return interpolate(template, vars);
  return humanizeKey(key);
}

export function humanizeKey(key: string): string {
  const leaf = key.split(".").pop() || key;
  return leaf
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const translationKeys = Object.keys(dictionaries[DEFAULT_LOCALE]);
