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

  const container =
    variant === "dark"
      ? "border-slate-700 bg-slate-800/70"
      : "border-slate-200 bg-slate-50";

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
            ? "bg-slate-900 text-white shadow-sm"
            : "bg-white text-[#0B1220] shadow-sm";
        const idle =
          variant === "dark"
            ? "text-slate-300 hover:text-white"
            : "text-slate-500 hover:text-[#0B1220]";

        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={isActive}
            title={t("language.switchTo", { language: LOCALE_NAMES[code] })}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
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
