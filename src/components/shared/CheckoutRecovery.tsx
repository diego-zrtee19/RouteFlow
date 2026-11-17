"use client";
import { useEffect, useState } from "react";
import { storedCheckoutAttemptKey, clearCheckoutAttempt } from "@/lib/checkoutAttemptStore";
import { storeBuyerToken } from "@/lib/buyerTokenStore";
import { Button } from "@/components/ui/Button";
export function CheckoutRecovery({ scope }: { scope: string }) {
  const [key, setKey] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setKey(storedCheckoutAttemptKey(scope));
    refresh();
    window.addEventListener("routeflow:checkout-attempt", refresh);
    return () => window.removeEventListener("routeflow:checkout-attempt", refresh);
  }, [scope]);
  if (!key) return null;
  async function resume() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout/resume", {
        method: "POST",
        headers: { "Idempotency-Key": key! },
      });
      const data = await response.json();
      if (data.code === "CHECKOUT_CLOSED") clearCheckoutAttempt(scope);
      if (!response.ok || !data.url)
        throw Error(data.message || data.error || "No se pudo recuperar el pago");
      storeBuyerToken(data.orderId, data.buyerToken);
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisa tu conexión e intenta de nuevo");
      setBusy(false);
    }
  }
  return (
    <aside
      className="rounded-xl border border-slate-200 bg-white p-4 my-4 space-y-2"
      aria-label="Recuperar pago"
    >
      <p className="font-medium">¿Ya habías iniciado el pago?</p>
      <p className="text-sm text-slate-600">
        Retoma el mismo pedido sin reservar productos de nuevo.
      </p>
      <Button type="button" disabled={busy} onClick={resume}>
        {busy ? "Recuperando…" : "Retomar mi intento de pago"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </aside>
  );
}
