"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const endpoint = "/api/dashboard/instagram";
const notices: Record<string, string> = {
  connected: "Instagram quedó conectado.",
  cancelled: "La autorización se canceló. Puedes volver a intentarlo.",
  restart: "La autorización venció. Empieza de nuevo desde Ajustes.",
  "select-one": "Selecciona una sola cuenta profesional de Instagram al autorizar.",
  "already-linked": "La cuenta ya está vinculada o hay una conexión en curso.",
  failed: "Meta no pudo completar la conexión. Vuelve a intentarlo.",
};

type Connection = { available: boolean; username: string | null };

export function InstagramConnection() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("instagram");
    if (outcome) {
      setNotice(Object.hasOwn(notices, outcome) ? notices[outcome] : "");
      url.searchParams.delete("instagram");
      window.history.replaceState(null, "", url);
    }
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setConnection)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("No se pudo consultar la conexión. Recarga Ajustes.");
      });
    return () => controller.abort();
  }, []);

  async function update(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, { method });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "No se pudo actualizar Instagram");
      if (method === "POST") {
        window.location.assign(result.url);
        return;
      }
      setConnection((current) => current && { ...current, username: null });
      setConfirmDisconnect(false);
      setNotice("Instagram se desconectó de RouteFlow.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo actualizar Instagram");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <MessageCircle size={22} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
        <div>
          <h2 className="font-semibold text-ink">Instagram</h2>
          <p className="text-sm text-slate-600">
            Vincula tu cuenta profesional para recibir mensajes de Instagram en RouteFlow.
          </p>
          {connection?.username && (
            <p className="mt-1 text-sm font-semibold text-emerald-800">
              @{connection.username} conectado
            </p>
          )}
        </div>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {connection?.username ? (
        confirmDisconnect ? (
          <div className="space-y-2">
            <p className="text-sm">
              Dejarás de recibir mensajes y se borrarán los que RouteFlow guardó.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                isLoading={busy}
                onClick={() => update("DELETE")}
              >
                Confirmar desconexión
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmDisconnect(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setConfirmDisconnect(true)}>
            Desconectar Instagram
          </Button>
        )
      ) : connection?.available ? (
        <Button isLoading={busy} onClick={() => update("POST")}>
          Conectar Instagram
        </Button>
      ) : connection ? (
        <p className="text-sm text-slate-600">
          La conexión aún no está habilitada en este entorno.
        </p>
      ) : (
        !error && (
          <p role="status" className="text-sm">
            Consultando conexión…
          </p>
        )
      )}
    </Card>
  );
}
