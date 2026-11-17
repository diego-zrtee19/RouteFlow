"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, PackageCheck, Store, MoreHorizontal, ArrowUpRight } from "lucide-react";

const primary = [
  { label: "Vender", href: "/dashboard", icon: ShoppingBag },
  { label: "Pedidos", href: "/dashboard/orders", icon: PackageCheck },
  { label: "Mi tienda", href: "/dashboard/catalogo", icon: Store },
];
const secondary = [
  { label: "Resultados", href: "/dashboard/analytics" },
  { label: "Casos de ayuda", href: "/dashboard/disputes" },
  { label: "Ajustes", href: "/dashboard/settings" },
  { label: "Pruebas con usuarios", href: "/dashboard/piloto" },
  { label: "Centro de ayuda", href: "/help" },
];

export function SellerNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const moreActive = secondary.some((item) => pathname.startsWith(item.href));
  return (
    <nav
      aria-label={mobile ? "Navegación móvil del vendedor" : "Navegación del vendedor"}
      className={mobile ? "seller-mobile-nav" : "space-y-2"}
    >
      {primary.map(({ label, href, icon: Icon }) => {
        const active =
          href === "/dashboard"
            ? pathname === href ||
              pathname.startsWith("/dashboard/products") ||
              pathname === "/dashboard/links"
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`seller-nav-item ${active ? "is-active" : ""}`}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
      <details key={pathname} className={`seller-more ${moreActive ? "is-active" : ""}`}>
        <summary className="seller-nav-item">
          <MoreHorizontal size={20} aria-hidden="true" />
          <span>Más</span>
        </summary>
        <div className="seller-more-content">
          {secondary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent-50 focus-visible:outline-2 focus-visible:outline-accent-600"
            >
              {item.label}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}

export function SellingTabs() {
  const pathname = usePathname();
  if (!["/dashboard/products", "/dashboard/links"].includes(pathname)) return null;
  return (
    <nav
      aria-label="Tus publicaciones"
      className="mb-7 flex flex-wrap gap-2 border-b border-line pb-3"
    >
      {[
        { label: "Inventario", href: "/dashboard/products" },
        { label: "Compartir enlaces", href: "/dashboard/links" },
      ].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${pathname === item.href ? "bg-accent-700 text-white" : "text-slate-600 hover:bg-white"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
