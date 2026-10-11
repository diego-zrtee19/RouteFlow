"use client";
import { useEffect, useState } from "react";
interface Notice { id: string; subject: string; body: string; status: string; created_at: string }
export function BuyerNotifications({ orderId, token, sessionId }: { orderId: string; token: string | null; sessionId: string | null }) {
  const [notes, setNotes] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const query = !token && sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/notifications${query}`, { headers: token ? { "x-buyer-token": token } : {}, cache: "no-store", signal: controller.signal });
        if (!res.ok) throw Error("No se pudieron actualizar los avisos.");
        const data = await res.json(); if (!controller.signal.aborted) { setNotes(data.notifications); setError(""); }
      } catch { if (!controller.signal.aborted) setError("No se pudieron actualizar los avisos."); }
    };
    void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [orderId, token, sessionId]);
  return <section className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-bold">Actualizaciones de tu compra</h2>
    {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
    {!notes.length && <p className="text-sm text-slate-500">Los avisos de pago, entrega y resolución aparecerán aquí.</p>}
    {notes.map(n => <article key={n.id} className="border-t pt-3 text-sm"><h3 className="font-semibold">{n.subject}</h3><p>{n.body}</p><p className="text-xs text-slate-500">{new Date(n.created_at).toLocaleString("es-MX")} · {n.status === "SENT" ? "Correo enviado" : "Aviso disponible en tu pedido"}</p></article>)}
  </section>;
}
