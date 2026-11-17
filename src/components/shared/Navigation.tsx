"use client";

import { BrandMark } from "@/components/shared/BrandMark";
import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useI18n } from "@/i18n/LanguageProvider";

export const Navbar: React.FC = () => {
  const { t } = useI18n();

  return (
    <nav className="sticky top-0 z-50 bg-accent-700 text-white border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 flex flex-wrap gap-2 py-2 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="font-semibold text-lg text-white tracking-tight">RouteFlow</span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-white/80">
          <a href="#how-it-works" className="hover:text-white transition-colors">
            {t("nav.howItWorks")}
          </a>
          <Link href="/help" className="hover:text-white transition-colors">
            Ayuda para comprar
          </Link>
        </div>

        <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">
          <Link
            href="/mis-compras"
            className="text-sm font-medium text-white min-h-11 inline-flex items-center whitespace-nowrap"
          >
            Mis compras
          </Link>
          <LanguageSwitcher variant="dark" />
          <div className="hidden sm:block">
            <Link href="/dashboard" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              {t("nav.dashboard")}
            </Link>
          </div>
          <Link
            href="/dashboard/products/new"
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            {t("nav.createLink")}
            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
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
          <BrandMark className="size-8 text-accent-700" />
          <span className="font-bold text-ink">RouteFlow</span>
          <span className="text-xs text-slate-500">
            {t("footer.tagline", { year: new Date().getFullYear() })}
          </span>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-6 text-xs text-slate-600">
          <Link href="/mis-compras">Mis compras</Link>
          <Link href="/dashboard" className="hover:text-slate-900">
            {t("nav.dashboard")}
          </Link>
          <Link href="/dashboard/orders" className="hover:text-slate-900">
            {t("nav.orders")}
          </Link>
          <Link href="/dashboard/analytics" className="hover:text-slate-900">
            {t("nav.analytics")}
          </Link>
          <Link href="/help" className="hover:text-slate-900">
            Ayuda
          </Link>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
};
