"use client";

import React from "react";
import { LOCALES, LOCALE_LABELS, LOCALE_NAMES } from "@/i18n/config";
import { useI18n } from "@/i18n/LanguageProvider";

interface LanguageSwitcherProps {
  /** `light` matches white surfaces, `dark` matches the slate-900 sections. */
  variant?: "light" | "dark";
  className?: string;
  /** Renders the full language name next to the code (used in Settings). */
  showNames?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = "light",
  className = "",
  showNames = false,
}) => {
  const { locale, setLocale, t } = useI18n();

  const container = variant === "dark" ? "border-white/25 bg-white/10" : "border-line bg-surface";

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className={`inline-flex items-center rounded-lg border p-0.5 ${container} ${className}`}
    >
      {LOCALES.map((code) => {
        const isActive = locale === code;
        const active =
          variant === "dark"
            ? "bg-white text-accent-900 shadow-sm"
            : "bg-accent-700 text-white shadow-sm";
        const idle =
          variant === "dark"
            ? "text-white/85 hover:bg-white/10 hover:text-white"
            : "text-slate-600 hover:bg-accent-50 hover:text-accent-700";

        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={isActive}
            title={t("language.switchTo", { language: LOCALE_NAMES[code] })}
            className={`min-h-9 min-w-9 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              isActive ? active : idle
            }`}
          >
            {showNames ? LOCALE_NAMES[code] : LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
};
