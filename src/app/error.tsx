"use client";

import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/Button";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg px-5 py-16" role="alert">
      <p className="mb-3 text-sm font-semibold text-accent-700">RouteFlow</p>
      <h1 className="text-2xl font-semibold text-slate-900">No pudimos cargar esta página</h1>
      <p className="mt-3 leading-relaxed text-slate-600">
        Intenta de nuevo. Si estabas pagando, consulta tu pedido antes de repetir el pago.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="button" onClick={reset}>
          Volver a intentar
        </Button>
        <Link href="/mis-compras" className={buttonStyles({ variant: "secondary" })}>
          Mis compras
        </Link>
        <Link href="/" className={buttonStyles({ variant: "ghost" })}>
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
