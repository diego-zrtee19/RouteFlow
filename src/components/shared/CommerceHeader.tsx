import { BrandMark } from "@/components/shared/BrandMark";
import Link from "next/link";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** Common navigation for the buyer's journey, including recovery and help. */
export function CommerceHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="bg-accent-700 text-white">
      <nav
        aria-label="RouteFlow"
        className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
      >
        <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <BrandMark />
          RouteFlow
        </Link>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/mis-compras" className="hover:underline">
            Mis compras
          </Link>
          <Link href="/help" className="hover:underline">
            Ayuda
          </Link>
          <LanguageSwitcher variant="dark" />
          {children}
        </div>
      </nav>
    </header>
  );
}
