"use client";
import { Button } from "@/components/ui/Button";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl">No pudimos cargar esta sección</h1>
      <p>
        Revisa tu conexión y vuelve a intentar. No se mostrarán ceros como si fueran datos
        confirmados.
      </p>
      <Button onClick={reset}>Volver a intentar</Button>
    </main>
  );
}
