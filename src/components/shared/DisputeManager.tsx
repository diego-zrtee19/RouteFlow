"use client";
import { useEffect, useState } from "react";
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
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const headers = token ? { "x-buyer-token": token } : undefined;
  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetch(`/api/disputes/${id}`, {
      headers: token ? { "x-buyer-token": token } : undefined,
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || "No se pudo cargar");
        if (!controller.signal.aborted) { setData(d); setError(""); }
      })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [id, token]);
  async function send(method: string, body: BodyInit, contentType?: string) {
    setBusy(true);
    setError("");
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
      const refresh = await fetch(`/api/disputes/${id}`, {
        headers,
        cache: "no-store",
      });
      if (!refresh.ok) throw new Error("No se pudo actualizar");
      setData(await refresh.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }
  const open = data && ["OPEN", "UNDER_REVIEW"].includes(data.dispute.status);
  return (
    <div className="space-y-2 mt-3">
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="font-semibold">Estado del caso: {({ OPEN: "Abierto", UNDER_REVIEW: "En revisión", RESOLVED_BUYER: "Resuelto a favor del comprador", RESOLVED_SELLER: "Resuelto a favor del vendedor", CLOSED: "Cerrado" } as Record<string, string>)[data.dispute.status] ?? data.dispute.status}</p>
          <p className="text-sm">{data.dispute.description}</p>
          <p>
            Respuesta antes de:{" "}
            {new Date(data.dispute.responseDueAt).toLocaleString("es-MX")}
          </p>
          {data.dispute.sellerResponse && (
            <p>Respuesta del vendedor: {data.dispute.sellerResponse}</p>
          )}
          {data.dispute.resolution && (
            <p>Resolución: {data.dispute.resolution}</p>
          )}
          {data.evidence.map((f) => (
            <a
              key={f.id}
              className="block text-blue-700 underline"
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
              <textarea
                aria-label={
                  audience === "admin"
                    ? "Motivo de resolución"
                    : "Respuesta del vendedor"
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={4000}
                className="w-full border rounded-sm p-2"
              />
              {audience === "seller" ? (
                <button
                  disabled={busy || text.trim().length < 3}
                  onClick={() =>
                    send(
                      "POST",
                      JSON.stringify({ response: text }),
                      "application/json",
                    )
                  }
                  className="border rounded-sm px-3 py-2"
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
