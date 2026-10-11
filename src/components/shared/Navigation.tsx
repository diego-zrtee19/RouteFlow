"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useI18n } from "@/i18n/LanguageProvider";

export const Navbar: React.FC = () => {
  const { t } = useI18n();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0B1220] flex items-center justify-center text-white font-bold text-base">
            RF
          </div>
          <span className="font-extrabold text-lg text-[#0B1220] tracking-tight">RouteFlow</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="#how-it-works" className="hover:text-[#0B1220] transition-colors">{t("nav.howItWorks")}</a>
          <Link href="/p/7H29XK" className="hover:text-[#0B1220] transition-colors">{t("nav.sampleProduct")}</Link>
          <Link href="/dashboard" className="hover:text-[#0B1220] transition-colors">{t("nav.sellerDashboard")}</Link>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/dashboard" className="hidden sm:block">
            <Button variant="secondary" size="sm">{t("nav.dashboard")}</Button>
          </Link>
          <Link href="/dashboard/products/new">
            <Button size="sm">
              {t("nav.createLink")}
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};


export const Footer: React.FC = () => {
  const { t } = useI18n();

  return (
    <footer className="border-t border-slate-200/80 bg-white py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-sm bg-[#0B1220] flex items-center justify-center text-white font-bold text-xs">
            RF
          </div>
          <span className="font-bold text-[#0B1220]">RouteFlow</span>
          <span className="text-xs text-slate-400">{t("footer.tagline", { year: new Date().getFullYear() })}</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-slate-600">
          <Link href="/dashboard" className="hover:text-slate-900">{t("nav.dashboard")}</Link>
          <Link href="/dashboard/orders" className="hover:text-slate-900">{t("nav.orders")}</Link>
          <Link href="/dashboard/analytics" className="hover:text-slate-900">{t("nav.analytics")}</Link>
          <Link href="/admin" className="hover:text-slate-900">{t("nav.admin")}</Link>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
};

