import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { BrandMark } from "@/components/shared/BrandMark";
import { AdminNavigation } from "./AdminNavigation";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "RouteFlow · Centro de control",
  robots: { index: false, follow: false },
};
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdmin();
  if (!access.ok) {
    if (access.status === 401) redirect("/sign-in?redirect_url=%2Fadmin");
    return (
      <main className="mx-auto max-w-lg p-8 space-y-4">
        <h1 className="text-2xl">Acceso restringido</h1>
        <p>Esta cuenta no tiene permisos para administrar RouteFlow.</p>
        <Link href="/">Volver a RouteFlow</Link>
      </main>
    );
  }
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-5 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-3 font-semibold text-xl text-accent-700"
          >
            <BrandMark />
            RouteFlow <span className="text-sm font-normal text-muted">Centro de control</span>
          </Link>
          <Link className="text-sm text-muted underline" href="/">
            Ver aplicación
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl md:flex">
        <AdminNavigation />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
