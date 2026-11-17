"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const items = [
  ["Resumen", "/admin"],
  ["Pedidos", "/admin/orders"],
  ["Vendedores", "/admin/sellers"],
  ["Casos de ayuda", "/admin/disputes"],
  ["Operación", "/admin/operations"],
];
export function AdminNavigation() {
  const path = usePathname();
  return (
    <nav
      aria-label="Centro de control"
      className="flex flex-wrap gap-2 border-b border-line p-4 md:border-b-0 md:border-r md:w-52 md:shrink-0 md:flex-col md:justify-start md:self-start md:sticky md:top-0"
    >
      {items.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${path === href ? "bg-accent-700 text-white" : "text-muted hover:bg-accent-50"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
