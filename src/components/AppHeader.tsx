"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export default function AppHeader({
  right,
}: {
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-zinc-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black text-xl">
            R
          </div>
          <span className="font-extrabold text-lg text-zinc-900">RouteFlow</span>
        </Link>
        {right}
      </div>
    </header>
  );
}
