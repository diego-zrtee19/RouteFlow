"use client";

import React from "react";
import Link from "next/link";
import { Link2, Send, Truck, CheckCircle2, ArrowRight } from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";

export const LandingSections: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="space-y-16 py-16">
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-8">
          <p className="text-xs font-medium text-accent-600 mb-2">{t("landing.how.eyebrow")}</p>
          <h2 className="text-3xl font-medium text-ink">{t("landing.how.title")}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border-t border-slate-300 pt-6 pb-4 relative">
            <span className="text-3xl font-medium text-slate-100 absolute top-4 right-5">01</span>
            <div className="w-10 h-10 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center mb-4">
              <Link2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-ink mb-2">
              {t("landing.how.step1.title")}
            </h3>
            <p className="text-sm text-slate-600">
              {t("landing.how.step1.body", { sample: "p/7H29XK" })}
            </p>
          </div>

          <div className="border-t border-slate-300 pt-6 pb-4 relative">
            <span className="text-3xl font-medium text-slate-100 absolute top-4 right-5">02</span>
            <div className="w-10 h-10 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center mb-4">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-ink mb-2">
              {t("landing.how.step2.title")}
            </h3>
            <p className="text-sm text-slate-600">{t("landing.how.step2.body")}</p>
          </div>

          <div className="border-t border-slate-300 pt-6 pb-4 relative">
            <span className="text-3xl font-medium text-slate-100 absolute top-4 right-5">03</span>
            <div className="w-10 h-10 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center mb-4">
              <Truck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-ink mb-2">
              {t("landing.how.step3.title")}
            </h3>
            <p className="text-sm text-slate-600">{t("landing.how.step3.body")}</p>
          </div>
        </div>
      </section>

      <section className="bg-accent-700 py-12 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h3 className="text-xl font-semibold mb-4 text-white">{t("landing.sellers.title")}</h3>
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-400" />
                <span>{t("landing.sellers.item1")}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-400" />
                <span>{t("landing.sellers.item2")}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-400" />
                <span>{t("landing.sellers.item3")}</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-4 text-white">{t("landing.buyers.title")}</h3>
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{t("landing.buyers.item1")}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{t("landing.buyers.item2")}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{t("landing.buyers.item3")}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-3xl font-medium text-ink mb-3">{t("landing.cta.title")}</h2>
        <p className="text-slate-600 mb-6 text-sm">{t("landing.cta.body")}</p>
        <Link href="/dashboard/products/new" className={buttonStyles({ size: "lg" })}>
          {t("landing.cta.button")}
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </section>
    </div>
  );
};
