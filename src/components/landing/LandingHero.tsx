"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";

export const LandingHero: React.FC = () => {
  const { t } = useI18n();

  return (
    <section className="py-12 md:py-20 bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
        {/* Value Tag */}
        <div className="inline-flex items-center gap-2 border-l-2 border-accent-700 pl-3 text-sm font-medium text-slate-600 mb-6">
          <span className="flex h-2 w-2 rounded-full bg-accent-600" />
          {t("landing.hero.tag")}
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-ink max-w-4xl leading-[1.12] mb-6">
          {t("landing.hero.titlePrefix")}{" "}
          <span className="text-accent-700">{t("landing.hero.titleHighlight")}</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-slate-600 max-w-2xl font-normal leading-relaxed mb-10">
          {t("landing.hero.subtitle")}
        </p>

        <section
          aria-label="Elige cómo vender"
          className="grid sm:grid-cols-2 gap-6 max-w-4xl mb-10"
        >
          <div className="border-t-2 border-accent-700 pt-5 space-y-3">
            <h2 className="text-xl font-semibold">Vender un artículo</h2>
            <p className="text-sm leading-relaxed text-slate-600">
              ¿Una camisa que ya no usas? Publica sus datos y comparte un enlace de compra con la
              persona interesada.
            </p>
            <Link href="/dashboard/products/new?mode=quick" className={buttonStyles()}>
              Crear venta rápida
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="border-t-2 border-slate-300 pt-5 space-y-3">
            <h2 className="text-xl font-semibold">Crear mi catálogo</h2>
            <p className="text-sm leading-relaxed text-slate-600">
              ¿Vendes gorras por Instagram? Reúne tu marca y tus productos en un catálogo para que
              el comprador elija.
            </p>
            <Link href="/dashboard/catalogo" className={buttonStyles({ variant: "secondary" })}>
              Preparar mi catálogo
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
        <a
          href="#how-it-works"
          className="inline-block min-h-11 text-sm text-accent-700 underline mb-8"
        >
          {t("landing.hero.ctaSecondary")}
        </a>
        {/* Social Commerce Flow Visual Diagram */}
        <div className="border-t border-slate-200 pt-7 text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-6 text-left">
            {t("landing.hero.flowTitle")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] gap-3 items-center">
            {/* Step 1 */}
            <div className="flex flex-col items-start text-left p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-xs font-bold text-slate-800">
                {t("landing.hero.step1.title")}
              </span>
              <span className="text-sm text-slate-500 mt-1">{t("landing.hero.step1.sub")}</span>
            </div>

            <div className="hidden sm:flex justify-center text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-start text-left p-3 rounded-lg bg-accent-50/70 border border-accent-100">
              <span className="text-xs font-bold text-accent-700">
                {t("landing.hero.step2.title")}
              </span>
              <span className="text-sm text-accent-600/80 mt-1">{t("landing.hero.step2.sub")}</span>
            </div>

            <div className="hidden sm:flex justify-center text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-start text-left p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-xs font-bold text-slate-800">
                {t("landing.hero.step3.title")}
              </span>
              <span className="text-sm text-slate-500 mt-1">{t("landing.hero.step3.sub")}</span>
            </div>

            <div className="hidden sm:flex justify-center text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </div>

            {/* Step 4 */}
            <div className="flex flex-col items-start text-left p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-xs font-bold text-slate-800">
                {t("landing.hero.step4.title")}
              </span>
              <span className="text-sm text-slate-500 mt-1">{t("landing.hero.step4.sub")}</span>
            </div>

            <div className="hidden sm:flex justify-center text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </div>

            {/* Step 5 */}
            <div className="flex flex-col items-start text-left p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <span className="text-xs font-bold text-brand-success">
                {t("landing.hero.step5.title")}
              </span>
              <span className="text-sm text-emerald-600/80 mt-1">
                {t("landing.hero.step5.sub")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
