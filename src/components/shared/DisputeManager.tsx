"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useSessionDraft } from "./useSessionDraft";
import { parseResponseDraft } from "@/domain/formDrafts";
import { disputeGuidance } from "@/domain/disputeGuidance";
interface Detail {
  dispute: {
    status: string;
    description: string;
    sellerResponse: string | null;
    responseDueAt: string;
    resolution: string | null;
  };
  evidence: { id: string; filename: string; audience: string; url: string }[];
}
export function DisputeManager({
  id,
  audience,
  token,
}: {
  id: string;
  audience: "buyer" | "seller" | "admin";
  token?: string;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const { user } = useUser();
  const draft = useSessionDraft(
    `routeflow.caseDraft.${id}.${audience}.${user?.id ?? "guest"}`,
    "",
    parseResponseDraft,
  );
  const text = draft.value;
  const setText = draft.setValue;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [reload, setReload] = useState(0);
  const headers = {
    "x-routeflow-audience": audience,
    ...(token ? { "x-buyer-token": token } : {}),
  };
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    const load = () =>
      fetch(`/api/disputes/${id}`, {
        headers: { "x-routeflow-audience": audience, ...(token ? { "x-buyer-token": token } : {}) },
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error?.message || "No se pudo cargar");
          if (!controller.signal.aborted) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [id, token, audience, reload, user?.id]);
  async function send(method: string, body: BodyInit, contentType?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSavedMessage("");
    try {
      const r = await fetch(`/api/disputes/${id}`, {
        method,
        headers: {
          ...headers,
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
        body,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "No se pudo guardar");
      setSavedMessage(
        method === "PUT"
          ? "Evidencia guardada en el caso."
          : "Respuesta guardada. El comprador podrá consultarla desde su pedido.",
      );
      if (method !== "PUT") draft.discard();
      const refresh = await fetch(`/api/disputes/${id}`, {
        headers,
        cache: "no-store",
      });
      if (!refresh.ok)
        throw new Error(
          "El cambio se guardó, pero no se pudo recargar el caso. Vuelve a consultar antes de reenviarlo.",
        );
      setData(await refresh.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }
  const open = data && ["OPEN", "UNDER_REVIEW"].includes(data.dispute.status);
  const guidance = data
    ? disputeGuidance(
        data.dispute.status,
        data.dispute.sellerResponse,
        data.dispute.responseDueAt,
        audience,
      )
    : null;
  return (
    <div className="space-y-2 mt-3">
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
          <button
            type="button"
            disabled={busy}
            className="block min-h-11 underline"
            onClick={() => setReload((value) => value + 1)}
          >
            Volver a consultar el caso
          </button>
        </p>
      )}
      {savedMessage && (
        <p role="status" className="text-emerald-800">
          {savedMessage}
        </p>
      )}
      {!data && !error && <p role="status">Cargando caso y evidencia…</p>}
      {data && (
        <>
          <p className="font-semibold">
            Estado del caso:{" "}
            {(
              {
                OPEN: "Abierto",
                UNDER_REVIEW: "En revisión",
                RESOLVED_BUYER: "Resuelto a favor del comprador",
                RESOLVED_SELLER: "Resuelto a favor del vendedor",
                CLOSED: "Cerrado",
              } as Record<string, string>
            )[data.dispute.status] ?? data.dispute.status}
          </p>
          <p className="text-sm">{data.dispute.description}</p>
          {guidance && (
            <section
              aria-label="Siguiente paso del caso"
              className="rounded-lg bg-slate-50 p-4 space-y-2 text-sm"
            >
              <p className="font-bold">Responsable del siguiente paso: {guidance.owner}</p>
              <p>{guidance.next}</p>
              {guidance.awaitingSeller &&
                Number.isFinite(Date.parse(data.dispute.responseDueAt)) && (
                  <p>
                    Plazo solicitado al vendedor:{" "}
                    {new Date(data.dispute.responseDueAt).toLocaleString("es-MX")}
                  </p>
                )}
              <p>{guidance.timing}</p>
              <p>
                {data.evidence.length
                  ? `${data.evidence.length} archivo(s) de evidencia disponibles.`
                  : "Todavía no hay archivos adjuntos. Puedes aportar fotos del producto, paquete o comprobantes relevantes; evita datos bancarios o documentos personales."}
              </p>
            </section>
          )}
          {data.dispute.sellerResponse && (
            <p>Respuesta del vendedor: {data.dispute.sellerResponse}</p>
          )}
          {data.dispute.resolution && <p>Resolución: {data.dispute.resolution}</p>}
          {data.evidence.map((f) => (
            <a
              key={f.id}
              className="block text-accent-700 underline"
              target="_blank"
              rel="noreferrer"
              href={f.url}
            >
              {f.filename} ({f.audience})
            </a>
          ))}
          {open && audience !== "admin" && (
            <label className="block">
              Agregar evidencia (JPG, PNG, PDF; máximo 5 MB)
              <input
                className="block min-h-11 w-full mt-2"
                disabled={busy}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const form = new FormData();
                    form.append("file", file);
                    void send("PUT", form);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {open && audience !== "buyer" && (
            <>
              <label className="block text-sm font-semibold">
                {audience === "admin" ? "Motivo de resolución" : "Respuesta al comprador"}
                <textarea
                  aria-label={
                    audience === "admin" ? "Motivo de resolución" : "Respuesta del vendedor"
                  }
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={4000}
                  className="block w-full border rounded-lg p-3 min-h-28"
                />
              </label>
              <p className="text-sm text-slate-600">
                Tu respuesta se conserva en esta pestaña si falla el envío. Revisa los datos antes
                de enviarla.
              </p>
              {audience === "seller" ? (
                <button
                  disabled={busy || text.trim().length < 3}
                  onClick={() =>
                    send("POST", JSON.stringify({ response: text }), "application/json")
                  }
                  className="border rounded-lg px-3 py-2 min-h-11"
                >
                  Enviar respuesta
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    disabled={busy || text.trim().length < 3}
                    onClick={() =>
                      send(
                        "PATCH",
                        JSON.stringify({
                          decision: "refund",
                          resolution: text,
                        }),
                        "application/json",
                      )
                    }
                    className="border rounded-sm px-3 py-2"
                  >
                    Resolver con reembolso
                  </button>
                  <button
                    disabled={busy || text.trim().length < 3}
                    onClick={() =>
                      send(
                        "PATCH",
                        JSON.stringify({
                          decision: "release",
                          resolution: text,
                        }),
                        "application/json",
                      )
                    }
                    className="border rounded-sm px-3 py-2"
                  >
                    Resolver a favor del vendedor
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
