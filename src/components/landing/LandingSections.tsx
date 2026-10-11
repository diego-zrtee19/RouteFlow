"use client";

import React from "react";
import Link from "next/link";
import { Link2, Send, Truck, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";

export const LandingSections: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="space-y-20 pb-20">
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-bold uppercase tracking-wider text-[#2563EB] mb-2">{t("landing.how.eyebrow")}</p>
          <h2 className="text-3xl font-extrabold text-[#0B1220]">
            {t("landing.how.title")}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 relative">
            <span className="text-3xl font-black text-slate-100 absolute top-4 right-5">01</span>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center mb-4">
              <Link2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#0B1220] mb-2">{t("landing.how.step1.title")}</h3>
            <p className="text-sm text-slate-600">
              {t("landing.how.step1.body", { sample: "p/7H29XK" })}
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 relative">
            <span className="text-3xl font-black text-slate-100 absolute top-4 right-5">02</span>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#0B1220] mb-2">{t("landing.how.step2.title")}</h3>
            <p className="text-sm text-slate-600">
              {t("landing.how.step2.body")}
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 relative">
            <span className="text-3xl font-black text-slate-100 absolute top-4 right-5">03</span>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <Truck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#0B1220] mb-2">{t("landing.how.step3.title")}</h3>
            <p className="text-sm text-slate-600">
              {t("landing.how.step3.body")}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 py-16 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h3 className="text-xl font-bold mb-4 text-white">{t("landing.sellers.title")}</h3>
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                <span>{t("landing.sellers.item1")}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                <span>{t("landing.sellers.item2")}</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                <span>{t("landing.sellers.item3")}</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-4 text-white">{t("landing.buyers.title")}</h3>
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
        <h2 className="text-3xl font-extrabold text-[#0B1220] mb-3">
          {t("landing.cta.title")}
        </h2>
        <p className="text-slate-600 mb-6 text-sm">
          {t("landing.cta.body")}
        </p>
        <Link href="/dashboard/products/new">
          <Button size="lg" className="px-8 shadow-md">
            {t("landing.cta.button")}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </section>
    </div>
  );
};

