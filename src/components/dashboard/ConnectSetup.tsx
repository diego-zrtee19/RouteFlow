"use client";
import { useEffect, useState } from "react";
interface Status {
  connected: boolean;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: string[];
  testMode: boolean;
}
export function ConnectSetup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/dashboard/connect", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || "Stripe no disponible");
        setStatus(d);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/dashboard/connect", { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.url)
        throw new Error(d.error?.message || "No se pudo iniciar el alta");
      window.location.assign(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }
  return (
    <section className="bg-white border rounded-xl p-5 space-y-3">
      <h2 className="font-bold">Recibe tus fondos con Stripe</h2>
      <p className="text-sm">
        Completa la verificación y registra tu cuenta bancaria en Stripe. Los
        pedidos completados se transfieren cuando tu cuenta está habilitada.
      </p>
      {status && (
        <p>
          {status.testMode ? "Modo de prueba" : "Modo producción"} ·{" "}
          {status.transfersEnabled && status.payoutsEnabled
            ? "Cuenta habilitada"
            : status.connected
              ? "Verificación pendiente"
              : "Cuenta sin conectar"}
        </p>
      )}
      {status?.requirements.length ? (
        <p className="text-sm">
          Stripe solicita: {status.requirements.join(", ")}
        </p>
      ) : null}
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      <button
        onClick={connect}
        disabled={busy}
        className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {busy
          ? "Abriendo Stripe…"
          : status?.connected
            ? "Completar / revisar cuenta"
            : "Conectar cuenta de Stripe"}
      </button>
    </section>
  );
}
