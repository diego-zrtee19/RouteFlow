"use client";
import { useState } from "react";
export function VariantInventory({ variant, onSaved }: { variant: { id: string; label: string; stock: number }; onSaved: (stock: number, productStock: number) => void }) {
  const [stock, setStock] = useState(String(variant.stock));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <form className="flex flex-wrap items-end gap-2 mt-3" onSubmit={async event => { event.preventDefault(); setBusy(true); setMessage(""); try { const response = await fetch("/api/dashboard/catalog/variants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId: variant.id, stock: Number(stock) }) }); const data = await response.json(); if (!response.ok) throw Error(data.error?.message ?? "No se pudo guardar"); onSaved(data.stock, data.productStock); setMessage("Inventario guardado"); } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); } finally { setBusy(false); } }}><label className="text-sm">{variant.label} · disponibles para nuevas compras<input type="number" min={0} max={100000} step={1} value={stock} required onChange={event => setStock(event.target.value)} className="block border rounded-lg p-2 w-28" /></label><button disabled={busy} className="border rounded-lg p-2 min-h-11">Guardar inventario</button><p role="status" className="text-sm">{message}</p></form>;
}
