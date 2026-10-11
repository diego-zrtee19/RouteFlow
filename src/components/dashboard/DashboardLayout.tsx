"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  PackageCheck,
  Link2,
  BarChart3,
  Settings,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useI18n } from "@/i18n/LanguageProvider";
import { useAuth, useClerk } from "@clerk/nextjs";

const navigation = [
  { key: "nav.overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "nav.orders", href: "/dashboard/orders", icon: PackageCheck },
  { key: "nav.products", href: "/dashboard/products", icon: ShoppingBag },
  { key: "nav.links", href: "/dashboard/links", icon: Link2 },
  { key: "nav.analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { key: "nav.disputes", href: "/dashboard/disputes", icon: ShieldAlert },
  { key: "nav.settings", href: "/dashboard/settings", icon: Settings },
];

/** The slice of GET /api/dashboard/me this card needs. */
interface SellerIdentity {
  businessName: string;
  storeUsername: string;
  kycStatus: "unverified" | "pending" | "verified";
}

/** The slice of GET /api/dashboard/catalog this card needs. */
interface CatalogLink {
  publicId: string;
  active: boolean;
}

/** Normalises either response shape into the card's state. */
function mapSeller(raw: Record<string, unknown>): SellerIdentity {
  return {
    businessName: String(raw.businessName ?? ""),
    storeUsername: String(raw.storeUsername ?? ""),
    kycStatus: (raw.kycStatus as SellerIdentity["kycStatus"]) ?? "unverified",
  };
}

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const { t } = useI18n();

  /*
   * CLERK READINESS
   *
   * `clerkMiddleware` treats `/dashboard` as public so the shell renders for
   * every visitor. That means `ClerkProvider` can still be hydrating the
   * session while this effect fires, and a request sent before hydration has
   * no `__session` cookie to verify — the API correctly answers 401, but it is
   * a 401 about *timing*, not about the visitor's identity.
   *
   * Gating on `isLoaded` means we never race the hydration, and `isSignedIn`
   * lets a genuinely signed-out visitor be sent to sign-in instead of being
   * told their store failed to load.
   */
  const { isLoaded, isSignedIn } = useAuth();
  /*
   * `redirectToSignIn` lives on the Clerk client, not on `useAuth`, and it
   * preserves where the visitor was heading so they land back on /dashboard
   * after authenticating.
   */
  const { redirectToSignIn } = useClerk();

  /*
   * The store card used to render a hardcoded demo seller and a hardcoded
   * purchase-link id, so every signed-in seller saw a storefront that was not
   * theirs and a preview link that belonged to a stranger.
   *
   * It now reads the authenticated seller from the same endpoints the rest of
   * the dashboard already uses. Both sit behind `requireSeller()`, so the data
   * is scoped to the signed-in user by the server, not by this component:
   * there is no seller id in the request to tamper with.
   */
  const [seller, setSeller] = useState<SellerIdentity | null>(null);
  const [activeLink, setActiveLink] = useState<string | null>(null);

  /*
   * "loading" is a real state, not an absence of data.
   *
   * The previous version set `seller` to null on every failure path and rendered
   * a literal "..." in the card, so a backend error was indistinguishable from a
   * slow request and the user was left staring at a permanent ellipsis with no
   * way forward and no explanation.
   */
  const [sellerState, setSellerState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    /*
     * CLERK READINESS GATE.
     *
     * Until `useAuth` has resolved we neither know nor trust the session, and
     * firing here would race hydration: the API would answer 401 for a
     * visitor who is actually signed in. Staying in `loading` until Clerk is
     * ready keeps the honest "working" state instead of a false error.
     */
    if (!isLoaded) return () => { cancelled = true; };

    // Clerk finished hydrating and there is genuinely no session. This is a
    // sign-in problem, not a store-load problem, so it must never render
    // "No se pudo cargar tu tienda" — there is no store to report on yet.
    if (!isSignedIn) {
      redirectToSignIn({ redirectUrl: "/dashboard" });
      return () => { cancelled = true; };
    }

    /*
     * Onboarding.
     *
     * A brand-new Clerk account has no `sellers` row, so every dashboard
     * endpoint answers 403 `SELLER_NOT_FOUND`. That is the correct answer, not
     * an error to surface: the fix is to register the store, which is a POST
     * because provisioning on a read is exactly what the audit removed.
     *
     * The flow is: read -> on SELLER_NOT_FOUND, register -> use it. Only that
     * specific code triggers registration. A 401, a 500 or a network failure
     * must NOT, because creating a seller against a database we could not reach
     * would either fail anyway or mask a real outage.
     */
    const loadSeller = async () => {
      try {
        const me = await fetch("/api/dashboard/me", { cache: "no-store" });
        const body = me.ok ? await me.json().catch(() => null) : await me.json().catch(() => null);

        if (cancelled) return;

        // Onboarding trigger: exactly one condition, by error code.
        if (me.status === 403 && body?.error?.code === "SELLER_NOT_FOUND") {
          const created = await fetch("/api/dashboard/seller", { method: "POST" });

          if (cancelled) return;

          if (created.ok) {
            const payload = await created.json().catch(() => null);
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

        /*
         * 401 means the SESSION, not the store.
         *
         * The server decides this before it ever looks for a `sellers` row, so
         * it carries no information about whether the seller exists. Reporting
         * it as a store failure is what used to strand sellers on a permanent
         * "No se pudo cargar tu tienda" with no path forward.
         *
         * Sending the visitor to sign-in is the honest recovery. The
         * onboarding POST above is deliberately NOT attempted here: a 401
         * cannot establish that this caller owns the store being created.
         */
        if (me.status === 401 || body?.error?.code === "UNAUTHENTICATED") {
          redirectToSignIn({ redirectUrl: "/dashboard" });
          return;
        }

        // Anything else: a real failure worth showing rather than hiding.
        setSellerState("error");
      } catch {
        if (!cancelled) setSellerState("error");
      }
    };

    loadSeller();

    fetch("/api/dashboard/catalog", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const links: CatalogLink[] = Array.isArray(data?.links) ? data.links : [];
        // Only an ACTIVE link resolves for a buyer; previewing a deactivated
        // one would show the buyer a 404.
        const firstActive = links.find((link) => link.active);
        setActiveLink(firstActive ? firstActive.publicId : null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // Re-run when Clerk finishes hydration or the identity changes, so a
    // sign-in that completes in this tab immediately re-reads the store.
  }, [isLoaded, isSignedIn, redirectToSignIn]);

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col md:flex-row">
      {/* DESKTOP SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200/80 p-5 hidden md:flex flex-col justify-between shrink-0 h-screen sticky top-0">
        <div>
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-2.5 mb-8 px-2">
            <div className="w-8 h-8 rounded-lg bg-[#0B1220] flex items-center justify-center text-white font-bold text-sm">
              RF
            </div>
            <div>
              <span className="font-extrabold text-base text-[#0B1220] tracking-tight block leading-tight">
                RouteFlow
              </span>
              <span className="text-[10px] text-slate-400 font-medium">{t("dashboard.sellerConsole")}</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              const label = t(item.key);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-[#2563EB] font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-[#0B1220]"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#2563EB]" : "text-slate-400"}`} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Store Card */}
        <div className="space-y-3">
          <LanguageSwitcher />
          <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-800 truncate">
                {sellerState === "loading" ? (
                  // A real spinner. The literal ellipsis it replaced looked
                  // identical whether the request was in flight or had already
                  // failed, which is how a 500 became an indefinite "loading".
                  <span className="flex items-center gap-1.5 text-xs font-normal text-slate-400">
                    <span className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-blue-600 animate-spin" />
                    {t("common.loading")}
                  </span>
                ) : sellerState === "error" ? (
                  // Surface the failure instead of hiding it behind a
                  // placeholder. Reloading re-runs the whole onboarding flow.
                  <span className="text-xs font-semibold text-rose-600">
                    {t("dashboard.storeLoadError")}
                  </span>
                ) : (
                  // Non-null: the only branch that reaches here is the one where
                  // sellerState === "ready", which is only ever set together
                  // with a seller. TypeScript cannot narrow that across the
                  // ternary, so the invariant is asserted here.
                  seller!.businessName
                )}
              </span>
              {/* The dot now means something: KYC state, not decoration. */}
              {seller ? (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    seller.kycStatus === "verified" ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
              ) : null}
            </div>

            <p className="text-[11px] text-slate-500 mb-2 font-mono truncate">
              {seller ? seller.storeUsername : ""}
            </p>

            {/* Preview only an ACTIVE link belonging to THIS seller. With no
                link yet there is nothing a buyer could open, so the card points
                at link creation instead of a dead URL. */}
            {activeLink ? (
              <Link
                href={`/p/${activeLink}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2563EB] hover:underline"
              >
                {t("dashboard.previewLink")}
                <ExternalLink className="w-3 h-3" />
              </Link>
            ) : (
              <Link
                href="/dashboard/products/new"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2563EB] hover:underline"
              >
                {t("dashboard.createLink")}
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* MOBILE TOP BAR */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0B1220] flex items-center justify-center text-white font-bold text-xs">
            RF
          </div>
          <span className="font-bold text-sm text-[#0B1220]">RouteFlow</span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link href="/dashboard/products/new" className="text-xs font-semibold text-[#2563EB]">
            {t("dashboard.createLink")}
          </Link>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full pb-20 md:pb-8">
        {children}
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-2 px-3 flex justify-around z-40">
        {navigation.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-1 px-2 text-[10px] ${
                isActive ? "text-[#2563EB] font-bold" : "text-slate-500"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

