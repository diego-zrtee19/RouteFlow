"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Connection = {
  available: boolean;
  appId: string | null;
  configId: string | null;
  testAvailable: boolean;
  phone: string | null;
  expiresAt: string | null;
  testMode: boolean;
};
type Facebook = {
  init: (options: {
    appId: string;
    version: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
  }) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ) => void;
};
declare global {
  interface Window {
    FB?: Facebook;
  }
}
const endpoint = "/api/dashboard/whatsapp";
export function WhatsAppConnection() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loginState, setLoginState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [coexistence, setCoexistence] = useState(true);
  const [reload, setReload] = useState(0);
  const active = useRef(false);
  const flow = useRef<{
    code?: string;
    wabaId?: string;
    phoneId?: string;
    flow?: string;
    sent?: boolean;
  }>({});
  useEffect(() => {
    const c = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: c.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("No se pudo consultar WhatsApp. Recarga Ajustes.");
        const data = await response.json();
        if (!c.signal.aborted) setConnection(data);
      })
      .catch((failure) => {
        if (!c.signal.aborted) setError(failure.message);
      });
    return () => {
      c.abort();
      active.current = false;
    };
  }, [reload]);
  useEffect(() => {
    if (!connection?.available) return;
    const c = new AbortController();
    setLoginState(null);
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "begin" }),
      signal: c.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error?.message ?? "No se pudo preparar la conexión");
        if (!c.signal.aborted) setLoginState(data.state);
      })
      .catch((failure) => {
        if (!c.signal.aborted) setError(failure.message);
      });
    return () => c.abort();
  }, [connection?.available, reload]);
  useEffect(() => {
    async function finish() {
      const data = flow.current;
      if (!active.current || !data.code || !data.wabaId || !data.phoneId || !data.flow || data.sent)
        return;
      data.sent = true;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, state: loginState }),
          signal: AbortSignal.timeout(45000),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error?.message ?? "No se pudo completar WhatsApp");
        setNotice("WhatsApp conectado. Puedes abrir tus mensajes.");
        setReload((n) => n + 1);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "No se pudo conectar WhatsApp");
        setReload((n) => n + 1);
      } finally {
        active.current = false;
        flow.current = {};
        setBusy(false);
      }
    }
    const receive = (event: MessageEvent) => {
      if (
        !active.current ||
        !["https://www.facebook.com", "https://facebook.com", "https://web.facebook.com"].includes(
          event.origin,
        )
      )
        return;
      let payload;
      try {
        payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (
        [
          "FINISH",
          "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          "FINISH_GRANT_ONLY_API_ACCESS",
        ].includes(payload.event)
      ) {
        flow.current = {
          ...flow.current,
          flow: payload.event,
          wabaId: payload.data?.waba_id,
          phoneId: payload.data?.phone_number_id,
        };
        void finish();
      } else if (["CANCEL", "ERROR", "FINISH_ONLY_WABA"].includes(payload.event)) {
        active.current = false;
        setBusy(false);
        setError("La conexión no terminó con un número seleccionado. Puedes volver a intentarlo.");
      }
    };
    const codeReceived = () => {
      void finish();
    };
    window.addEventListener("message", receive);
    window.addEventListener("routeflow-whatsapp-code", codeReceived);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("routeflow-whatsapp-code", codeReceived);
    };
  }, [loginState]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => {
      if (!active.current || flow.current.sent) return;
      active.current = false;
      flow.current = {};
      setBusy(false);
      setError("Meta no completó la conexión. Cierra su ventana y vuelve a intentarlo.");
      setReload((n) => n + 1);
    }, 60000);
    return () => window.clearTimeout(timer);
  }, [busy]);
  function connect() {
    if (!connection?.available || !window.FB || !loginState || busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    active.current = true;
    flow.current = {};
    window.FB.login(
      (response) => {
        if (!active.current) return;
        if (response.authResponse?.code) {
          flow.current.code = response.authResponse.code;
          window.dispatchEvent(new Event("routeflow-whatsapp-code"));
        } else {
          active.current = false;
          setBusy(false);
          setNotice("La autorización se canceló. Puedes intentarlo de nuevo.");
        }
      },
      {
        config_id: connection.configId,
        response_type: "code",
        override_default_response_type: true,
        state: loginState,
        extras: {
          setup: {},
          ...(coexistence ? { featureType: "whatsapp_business_app_onboarding" } : {}),
        },
      },
    );
  }
  async function update(action: "connect-test" | "disconnect") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: action === "disconnect" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(action === "connect-test" ? { body: JSON.stringify({ action }) } : {}),
        signal: AbortSignal.timeout(45000),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error?.message ?? "No se pudo actualizar WhatsApp");
      setConfirmDisconnect(false);
      setNotice(
        action === "disconnect"
          ? "WhatsApp desconectado de RouteFlow. Los pedidos y conversaciones se conservan."
          : "Número de prueba conectado.",
      );
      setReload((n) => n + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo actualizar WhatsApp");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 p-5" id="whatsapp-connection">
      {connection?.available && connection.appId && (
        <Script
          id="routeflow-meta-sdk"
          src="https://connect.facebook.net/es_LA/sdk.js"
          strategy="afterInteractive"
          onReady={() => {
            window.FB?.init({
              appId: connection.appId!,
              version: "v27.0",
              autoLogAppEvents: false,
              xfbml: false,
            });
            setSdkReady(Boolean(window.FB));
          }}
          onError={() =>
            setError("No se pudo cargar la conexión de Meta. Recarga Ajustes e inténtalo de nuevo.")
          }
        />
      )}
      <div className="flex items-start gap-3">
        <MessageCircle size={22} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
        <div>
          <h2 className="font-semibold text-ink">WhatsApp</h2>
          <p className="text-sm text-muted">
            Atiende conversaciones, comparte compras y gestiona sus entregas junto a tu inventario.
          </p>
          {connection?.phone && (
            <p className="mt-1 text-sm font-semibold text-accent-700">
              {connection.phone} conectado
            </p>
          )}
        </div>
      </div>
      {connection?.testMode && (
        <p className="text-xs text-muted">
          Modo de prueba: solo números autorizados. No activa campañas ni envíos automáticos.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}{" "}
          <button className="underline" onClick={() => setReload((n) => n + 1)}>
            Volver a consultar
          </button>
        </p>
      )}
      {connection?.phone && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/messages?channel=whatsapp"
            className={buttonStyles({ size: "sm" })}
          >
            Ver mensajes de WhatsApp
          </Link>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => setConfirmDisconnect(true)}
          >
            Desconectar
          </Button>
        </div>
      )}
      {confirmDisconnect && (
        <div className="space-y-2 text-sm">
          <p>
            Se pausará el acceso desde RouteFlow. Tus conversaciones y pedidos se conservan. Puedes
            revisar también los permisos concedidos en Meta.
          </p>
          <div className="flex gap-2">
            <Button size="sm" isLoading={busy} onClick={() => update("disconnect")}>
              Confirmar desconexión
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {connection?.available && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={coexistence}
              disabled={busy}
              onChange={(event) => setCoexistence(event.target.checked)}
            />
            <span>Quiero conectar un número que ya uso en WhatsApp Business.</span>
          </label>
          <p className="text-xs text-muted">
            Meta comprobará si tu cuenta puede conectarse. Tú eliges el número y autorizas el
            acceso; la credencial se guarda cifrada. Si das de alta un número Cloud API, RouteFlow
            administra su registro y el NIP de plataforma de forma segura.
          </p>
          <Button isLoading={busy} disabled={!sdkReady || !loginState} onClick={connect}>
            {connection.phone ? "Renovar autorización" : "Conectar WhatsApp Business"}
          </Button>
        </div>
      )}
      {connection?.testAvailable && (
        <Button
          size="sm"
          variant="secondary"
          isLoading={busy}
          onClick={() => update("connect-test")}
        >
          Conectar número de prueba de Meta
        </Button>
      )}
      {connection && !connection.available && !connection.testAvailable && (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            Estamos preparando la conexión oficial de Meta para este entorno. Aquí podrás conectar
            tu WhatsApp Business cuando termine su configuración.
          </p>
          <Link
            className="text-sm font-semibold text-accent-700 underline"
            href="/dashboard/messages?channel=whatsapp"
          >
            Ver bandeja de WhatsApp
          </Link>
        </div>
      )}
      {!connection && !error && (
        <p role="status" className="text-sm text-muted">
          Consultando WhatsApp…
        </p>
      )}
    </Card>
  );
}
