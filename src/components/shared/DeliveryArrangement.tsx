"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useSessionDraft } from "./useSessionDraft";
const initial = { place: "", time: "" };
function parse(v: unknown) {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  return typeof b.place === "string" &&
    b.place.length <= 300 &&
    typeof b.time === "string" &&
    b.time.length < 40
    ? { place: b.place, time: b.time }
    : null;
}
interface Arrangement {
  version: number;
  place: string;
  scheduled_at: string;
  proposed_by: string;
  status: string;
  updated_at: string;
}
export function DeliveryArrangement({
  orderId,
  audience,
  token,
  editable,
}: {
  orderId: string;
  audience: "seller" | "buyer";
  token?: string | null;
  editable: boolean;
}) {
  const [data, setData] = useState<{
    arrangement: Arrangement | null;
    history: { id: string; actor_kind: string; action: string; created_at: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const draft = useSessionDraft(`routeflow.arrangement.${orderId}.${audience}`, initial, parse);
  const headers = {
    "x-routeflow-audience": audience,
    ...(token ? { "x-buyer-token": token } : {}),
  };
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    fetch(`/api/orders/${orderId}/arrangement`, {
      cache: "no-store",
      headers: { "x-routeflow-audience": audience, ...(token ? { "x-buyer-token": token } : {}) },
      signal: c.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error?.message || "No se pudo consultar");
        if (!c.signal.aborted) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [orderId, audience, token, reload]);
  async function send(action: string) {
    if (busy || !data) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/orders/${orderId}/arrangement`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          version: data.arrangement?.version ?? 0,
          ...(action === "propose"
            ? { place: draft.value.place, scheduledAt: new Date(draft.value.time).toISOString() }
            : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error?.message || "No se pudo guardar");
      if (action === "propose") draft.discard();
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }
  const a = data?.arrangement;
  const next = !a
    ? "Siguiente paso: propón un lugar y una fecha para la entrega."
    : a.status === "PROPOSED"
      ? a.proposed_by === audience
        ? "Esperando a que la otra persona confirme tu propuesta. Todavía no hay una cita acordada."
        : "Siguiente paso: revisa el lugar y horario y confirma la propuesta si estás de acuerdo."
      : a.status === "CONFIRMED"
        ? "Cita acordada. El comprador comparte su NIP solo después de recibir y revisar el producto."
        : "La cita no terminó en una entrega. Propón otro horario o pide ayuda desde el pedido.";
  return (
    <section
      aria-label="Acuerdo de entrega"
      className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4"
    >
      <h2 className="text-base font-semibold text-slate-900">Acuerda tu entrega aquí</h2>
      <p className="text-sm leading-relaxed text-slate-600">
        La propuesta necesita confirmación de la otra parte. Un acuerdo o una cita incumplida no
        libera fondos; el NIP solo se comparte después de recibir el producto.
      </p>
      {data && (
        <p
          role="status"
          className="border-l-2 border-accent-700 pl-3 text-sm font-medium text-accent-700"
        >
          {editable
            ? next
            : "La cita no está disponible en el estado actual del pedido. Si el pago está pendiente, podrás acordarla cuando se confirme."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-rose-700">
          {error}{" "}
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setReload((n) => n + 1)}
          >
            Reconsultar acuerdo
          </Button>
        </p>
      )}
      {!data && !error && <p role="status">Consultando acuerdo…</p>}
      {a && (
        <div className="bg-slate-50 p-3 rounded-lg">
          <p className="font-semibold">
            {
              (
                {
                  PROPOSED: "Propuesta pendiente",
                  CONFIRMED: "Confirmado por ambas partes",
                  MISSED: "Cita reportada sin entrega",
                } as Record<string, string>
              )[a.status]
            }
          </p>
          <p className="break-words">{a.place}</p>
          <p>
            {new Date(a.scheduled_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}{" "}
            · hora Ciudad de México
          </p>
          <p className="text-sm">
            Propuso: {a.proposed_by === "buyer" ? "comprador" : "vendedor"}. Revisión {a.version}.
          </p>
        </div>
      )}
      {editable && data && (
        <>
          <details open={!a} className="border-t border-slate-200 pt-2">
            <summary className="cursor-pointer min-h-11 py-3 text-sm font-semibold">
              {a ? "Proponer un cambio de lugar u horario" : "Elegir lugar y fecha"}
            </summary>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send("propose");
              }}
            >
              <label className="block text-sm font-medium text-slate-700">
                Lugar propuesto
                <input
                  className="block w-full min-w-0 border border-slate-300 bg-white rounded-lg p-3 mt-2"
                  required
                  minLength={3}
                  maxLength={300}
                  disabled={busy}
                  value={draft.value.place}
                  onChange={(e) => draft.setValue((v) => ({ ...v, place: e.target.value }))}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Fecha y hora (hora de tu dispositivo)
                <input
                  type="datetime-local"
                  required
                  disabled={busy}
                  className="block w-full min-w-0 border border-slate-300 bg-white rounded-lg p-3 mt-2"
                  value={draft.value.time}
                  onChange={(e) => draft.setValue((v) => ({ ...v, time: e.target.value }))}
                />
              </label>
              <Button type="submit" isLoading={busy} className="sm:col-span-2">
                {a ? "Enviar nueva propuesta" : "Enviar propuesta"}
              </Button>
            </form>
          </details>
          {a?.status === "PROPOSED" && a.proposed_by !== audience && (
            <Button
              disabled={busy}
              onClick={() => void send("confirm")}
              variant="secondary"
              type="button"
            >
              Confirmar esta propuesta
            </Button>
          )}
          {a?.status === "CONFIRMED" && Date.parse(a.scheduled_at) < Date.now() && (
            <Button
              disabled={busy}
              onClick={() => void send("missed")}
              type="button"
              variant="ghost"
            >
              La cita pasó y no se entregó
            </Button>
          )}
        </>
      )}
      {a?.status === "MISSED" && (
        <p>
          Propón un nuevo horario o abre un caso desde el pedido si no puedes resolverlo. El reporte
          no determina quién incumplió.
        </p>
      )}
      {!!data?.history.length && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">
            Historial de cambios
          </summary>
          <ul className="text-sm space-y-2">
            {data.history.map((h) => (
              <li key={h.id}>
                {h.actor_kind === "buyer" ? "Comprador" : "Vendedor"} ·{" "}
                {(
                  {
                    DELIVERY_PROPOSE: "propuso una cita",
                    DELIVERY_CONFIRM: "confirmó la cita",
                    DELIVERY_MISSED: "reportó cita sin entrega",
                  } as Record<string, string>
                )[h.action] ?? h.action}{" "}
                · {new Date(h.created_at).toLocaleString("es-MX")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
