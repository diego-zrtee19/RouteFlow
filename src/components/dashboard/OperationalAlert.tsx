"use client";
import { useState } from "react";
import Link from "next/link";
export interface AlertView {
  id: string;
  kind: string;
  order_id: string | null;
  message: string;
}
export function OperationalAlert({ alert }: { alert: AlertView }) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resolved, setResolved] = useState(false);
  async function recover() {
    if (!alert.order_id || !choice) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/dashboard/reservations/${alert.order_id}/recover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restoreStock: choice === "restore" }),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "No se pudo recuperar");
      setResolved(true);
      setMessage("Reserva recuperada");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="border border-amber-200 bg-amber-50 rounded p-3 space-y-2">
      <p>{resolved ? "Reserva recuperada" : alert.message}</p>
      {alert.order_id && (
        <Link
          className="text-blue-700 underline"
          href={`/dashboard/orders/${alert.order_id}`}
        >
          Revisar pedido
        </Link>
      )}
      {alert.kind === "LEGACY_INVENTORY_REVIEW" && !resolved && (
        <>
          <label className="block">
            ¿Este pedido había descontado inventario?
            <select
              aria-label="Inventario de la reserva antigua"
              className="block border rounded p-2"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="">Selecciona después de revisar tu stock</option>
              <option value="restore">
                Sí: cancelar y devolver las unidades
              </option>
              <option value="keep">No: cancelar sin cambiar el stock</option>
            </select>
          </label>
          <button
            disabled={!choice || busy}
            onClick={recover}
            className="border rounded px-3 py-2 disabled:opacity-50"
          >
            {busy ? "Verificando Stripe…" : "Recuperar reserva"}
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
