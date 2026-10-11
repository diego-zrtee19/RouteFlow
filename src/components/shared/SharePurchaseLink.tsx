"use client";
import { useEffect, useState } from "react";
export function SharePurchaseLink({ publicId, title = "Mi producto" }: { publicId: string; title?: string }) {
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/p/${encodeURIComponent(publicId)}`;
  const text = `${title}: consulta el producto, paga y sigue tu pedido en RouteFlow. ${url}`;
  return <div className="space-y-2 text-sm"><div className="flex flex-wrap gap-2">
    <button type="button" disabled={!origin} className="min-h-11 rounded-lg border px-4 font-semibold" onClick={async () => { try { if (navigator.share) await navigator.share({ title, text, url }); else { await navigator.clipboard.writeText(url); setMessage("Enlace copiado"); } } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setMessage("No se pudo compartir. Copia el enlace manualmente."); } }}>Compartir enlace</button>
    {origin && <a className="min-h-11 rounded-lg bg-emerald-700 px-4 py-3 text-white font-semibold" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>}
  </div><p role="status">{message}</p></div>;
}
