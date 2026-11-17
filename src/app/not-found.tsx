import Link from "next/link";
import { CommerceHeader } from "@/components/shared/CommerceHeader";
import { buttonStyles } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <>
      <CommerceHeader />
      <main className="mx-auto max-w-xl px-5 py-16">
        <p className="text-sm text-slate-500">Página no encontrada · 404</p>
        <h1 className="mt-3 text-3xl font-semibold">
          Este enlace no lleva a una página disponible
        </h1>
        <p className="mt-4 text-slate-600">
          Revisa el enlace. Si ya realizaste una compra, puedes recuperarla desde Mis compras.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/mis-compras" className={buttonStyles()}>
            Mis compras
          </Link>
          <Link href="/" className={buttonStyles({ variant: "secondary" })}>
            Volver al inicio
          </Link>
        </div>
      </main>
    </>
  );
}
