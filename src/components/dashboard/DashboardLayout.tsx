"use client";

import { BrandMark } from "@/components/shared/BrandMark";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SellerNavigation, SellingTabs } from "./SellerNavigation";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useI18n } from "@/i18n/LanguageProvider";
import { useAuth, useClerk } from "@clerk/nextjs";

/** The slice of GET /api/dashboard/me this card needs. */
interface SellerIdentity {
  businessName: string;
  storeUsername: string;
}

/** Normalises either response shape into the card's state. */
function mapSeller(raw: Record<string, unknown>): SellerIdentity {
  return {
    businessName: String(raw.businessName ?? ""),
    storeUsername: String(raw.storeUsername ?? ""),
  };
}

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useI18n();

  const { isLoaded, isSignedIn, userId } = useAuth();
  const pathname = usePathname();
  const [retry, setRetry] = useState(0);
  const { redirectToSignIn } = useClerk();

  const [seller, setSeller] = useState<SellerIdentity | null>(null);

  const [sellerState, setSellerState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setSeller(null);
    setSellerState("loading");
    // Wait for Clerk before loading private data; clear the previous identity on change.

    if (!isLoaded)
      return () => {
        cancelled = true;
      };

    // Clerk finished hydrating and there is genuinely no session. This is a
    // sign-in problem, not a store-load problem, so it must never render
    // "No se pudo cargar tu tienda" — there is no store to report on yet.
    if (!isSignedIn) {
      redirectToSignIn({ redirectUrl: pathname });
      return () => {
        cancelled = true;
      };
    }

    const loadSeller = async () => {
      try {
        const me = await fetch("/api/dashboard/me", { cache: "no-store" });
        const body = await me.json().catch(() => null);

        if (cancelled) return;

        // Onboarding trigger: exactly one condition, by error code.
        if (me.status === 403 && body?.error?.code === "SELLER_NOT_FOUND") {
          const created = await fetch("/api/dashboard/seller", { method: "POST" });

          if (cancelled) return;

          if (created.ok) {
            const payload = await created.json().catch(() => null);
            if (cancelled) return;
            if (payload?.seller) {
              setSeller(mapSeller(payload.seller as Record<string, unknown>));
              setSellerState("ready");
              return;
            }
          }

          setSellerState("error");
          return;
        }

        if (me.ok && body?.seller) {
          setSeller(mapSeller(body.seller as Record<string, unknown>));
          setSellerState("ready");
          return;
        }

        if (me.status === 401 || body?.error?.code === "UNAUTHENTICATED") {
          redirectToSignIn({ redirectUrl: pathname });
          return;
        }

        // Anything else: a real failure worth showing rather than hiding.
        setSellerState("error");
      } catch {
        if (!cancelled) setSellerState("error");
      }
    };

    loadSeller();

    return () => {
      cancelled = true;
    };
    // Re-run when Clerk finishes hydration or the identity changes, so a
    // sign-in that completes in this tab immediately re-reads the store.
  }, [isLoaded, isSignedIn, userId, redirectToSignIn, pathname, retry]);

  return (
    <div className="seller-shell min-h-screen flex flex-col md:flex-row">
      <a
        href="#seller-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4"
      >
        Ir al contenido
      </a>
      <aside className="seller-sidebar hidden md:flex w-60 shrink-0 flex-col justify-between sticky top-0 h-screen p-6">
        <div>
          <Link href="/dashboard" className="flex items-center gap-3 mb-12 text-ink">
            <BrandMark className="size-10 text-accent-700" />
            <span className="text-xl font-semibold tracking-tight">RouteFlow</span>
          </Link>
          <p className="mb-4 px-3 text-[11px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
            Tu espacio de venta
          </p>
          <SellerNavigation />
        </div>
        <div className="space-y-5">
          <LanguageSwitcher />
          <div className="border-t border-line pt-5">
            <p className="truncate text-sm font-semibold text-ink">
              {sellerState === "loading"
                ? t("common.loading")
                : sellerState === "error"
                  ? t("dashboard.storeLoadError")
                  : seller?.businessName}
            </p>
            {sellerState === "error" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setRetry((value) => value + 1)}
              >
                Volver a intentar
              </Button>
            )}
            {seller?.storeUsername && (
              <Link
                href={`/catalogo/${seller.storeUsername}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center text-sm text-accent-600 hover:underline"
              >
                Ver mi catálogo ↗
              </Link>
            )}
          </div>
        </div>
      </aside>
      <header className="md:hidden flex items-center justify-between border-b border-line bg-surface px-5 py-4">
        <Link href="/dashboard" className="font-semibold text-lg tracking-tight text-accent-700">
          RouteFlow
        </Link>
        <LanguageSwitcher />
      </header>
      <main
        id="seller-content"
        className="@container flex-1 min-w-0 break-words p-5 sm:p-8 lg:p-12 max-w-6xl mx-auto w-full pb-28 md:pb-12"
      >
        <SellingTabs />
        {children}
      </main>
      <div className="md:hidden">
        <SellerNavigation mobile />
      </div>
    </div>
  );
};
