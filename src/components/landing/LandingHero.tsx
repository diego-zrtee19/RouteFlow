"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";

export const LandingHero: React.FC = () => {
  const { t } = useI18n();

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden bg-linear-to-b from-white via-slate-50/50 to-[#F8FAFC]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Value Tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/60 text-xs font-semibold text-[#2563EB] mb-8 animate-fade-in-up">
          <span className="flex h-2 w-2 rounded-full bg-[#2563EB]" />
          {t("landing.hero.tag")}
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#0B1220] max-w-4xl mx-auto leading-[1.08] mb-6">
          {t("landing.hero.titlePrefix")}{" "}
          <span className="text-[#2563EB]">{t("landing.hero.titleHighlight")}</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto font-normal leading-relaxed mb-10">
          {t("landing.hero.subtitle")}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href="/dashboard/products/new">
            <Button size="lg" className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold shadow-lg shadow-blue-500/25">
              {t("landing.hero.ctaPrimary")}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <a href="#how-it-works">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto px-6 py-3.5 text-base font-semibold">
              {t("landing.hero.ctaSecondary")}
            </Button>
          </a>
        </div>

        {/* Social Commerce Flow Visual Diagram */}
        <div className="max-w-4xl mx-auto bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/40 text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6 text-center">
            {t("landing.hero.flowTitle")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 items-center">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-bold text-slate-800">{t("landing.hero.step1.title")}</span>
              <span className="text-[11px] text-slate-500 mt-1">{t("landing.hero.step1.sub")}</span>
            </div>

            <div className="hidden sm:flex justify-center text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center p-3 rounded-xl bg-blue-50/70 border border-blue-100">
              <span className="text-xs font-bold text-[#2563EB]">{t("landing.hero.step2.title")}</span>
              <span className="text-[11px] text-blue-600/80 mt-1">{t("landing.hero.step2.sub")}</span>
            </div>

            <div className="hidden sm:flex justify-center text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-bold text-slate-800">{t("landing.hero.step3.title")}</span>
              <span className="text-[11px] text-slate-500 mt-1">{t("landing.hero.step3.sub")}</span>
            </div>

            <div className="hidden sm:flex justify-center text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </div>

            {/* Step 4 */}
            <div className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-bold text-slate-800">{t("landing.hero.step4.title")}</span>
              <span className="text-[11px] text-slate-500 mt-1">{t("landing.hero.step4.sub")}</span>
            </div>

            <div className="hidden sm:flex justify-center text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </div>

            {/* Step 5 */}
            <div className="flex flex-col items-center text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <span className="text-xs font-bold text-brand-success">{t("landing.hero.step5.title")}</span>
              <span className="text-[11px] text-emerald-600/80 mt-1">{t("landing.hero.step5.sub")}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
