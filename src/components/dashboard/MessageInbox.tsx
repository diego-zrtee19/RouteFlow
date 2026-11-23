"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, RefreshCw, Send } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/Button";
import type { InstagramInbox, InstagramMessage, InstagramThread } from "@/domain/instagramInbox";
import {
  ConversationSales,
  emptySaleDraft,
  type ConversationSaleDraft,
} from "@/components/dashboard/ConversationSales";

import { whatsappSenderPattern } from "@/domain/whatsapp";
export type MessagingChannel = "instagram" | "whatsapp";
const channelName = (channel: MessagingChannel) =>
  channel === "whatsapp" ? "WhatsApp" : "Instagram";
const date = (value: string) =>
  new Date(value).toLocaleString("es-MX", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const customer = (id: string) => `Cliente · ${id.slice(-6)}`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "No se pudo completar la solicitud");
  return result;
}

type Conversation = {
  messages: InstagramMessage[];
  hasMore: boolean;
  replyAllowed: boolean;
  lastIncomingAt: string | null;
};
type Composer = {
  draft: string;
  attempt: { id: string; text: string } | null;
  uncertain: boolean;
  saleId?: string;
  saleDraft?: ConversationSaleDraft;
};
const emptyComposer: Composer = { draft: "", attempt: null, uncertain: false };
function Thread({
  channel,
  sender,
  repliesEnabled,
  onBack,
  composer,
  updateComposer,
}: {
  channel: MessagingChannel;
  sender: string;
  repliesEnabled: boolean;
  onBack: () => void;
  composer: Composer;
  updateComposer: (update: (current: Composer) => Composer) => void;
}) {
  const endpoint = `/api/dashboard/${channel}/inbox`;
  const name = channelName(channel);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState("");
  const { draft, attempt, uncertain } = composer;
  const setDraft = (value: string) => updateComposer((current) => ({ ...current, draft: value }));
  const setAttempt = (value: Composer["attempt"]) =>
    updateComposer((current) => ({ ...current, attempt: value }));
  const setUncertain = (value: boolean) =>
    updateComposer((current) => ({ ...current, uncertain: value }));
  const [busy, setBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const history = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);
  useEffect(() => {
    const area = history.current;
    if (!area || !conversation) return;
    if (firstLoad.current || area.scrollHeight - area.clientHeight - area.scrollTop < 180) {
      area.scrollTop = area.scrollHeight;
    }
    firstLoad.current = false;
  }, [conversation]);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const data = await json<Conversation>(`${endpoint}?sender=${sender}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setConversation((old) => {
            const all = new Map(old?.messages.map((m) => [m.id, m]) ?? []);
            data.messages.forEach((m) => all.set(m.id, m));
            return {
              ...data,
              hasMore: old ? old.hasMore : data.hasMore,
              messages: [...all.values()].sort(
                (a, b) => b.sent_at.localeCompare(a.sent_at) || b.id.localeCompare(a.id),
              ),
            };
          });
          setError("");
        }
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "No se pudo cargar la conversación",
          );
      } finally {
        loading = false;
      }
    }
    void load();
    const interval = window.setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", load);
    };
  }, [sender, refresh, endpoint]);

  async function older() {
    const last = conversation?.messages.at(-1);
    if (!last || olderBusy) return;
    setOlderBusy(true);
    try {
      const params = new URLSearchParams({ sender, before: last.sent_at, key: last.id });
      const data = await json<Conversation>(`${endpoint}?${params}`);
      setConversation(
        (current) =>
          current && {
            ...current,
            hasMore: data.hasMore,
            messages: [
              ...new Map([...current.messages, ...data.messages].map((m) => [m.id, m])).values(),
            ],
          },
      );
    } catch {
      setError("No se pudieron cargar los mensajes anteriores. Puedes volver a intentarlo.");
    } finally {
      setOlderBusy(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || uncertain || !draft.trim()) return;
    const request = attempt ?? { id: crypto.randomUUID(), text: draft.trim() };
    setAttempt(request);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await json<{ status: string; providerCode?: number }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: sender,
          text: request.text,
          clientId: request.id,
          ...(composer.saleId ? { saleId: composer.saleId } : {}),
        }),
      });
      if (["sent", "delivered", "read"].includes(result.status)) {
        setDraft("");
        setAttempt(null);
        updateComposer((current) => ({ ...current, saleId: undefined }));
        setNotice(`Mensaje enviado a ${name}.`);
      } else if (result.status === "failed") {
        setAttempt(null);
        // Keep the send result when background history refresh clears loading errors.
        setNotice(
          `Meta rechazó el envío${result.providerCode ? ` (código ${result.providerCode})` : ""}. Tu borrador se conserva. Revisa la conexión antes de volver a intentarlo.`,
        );
      } else {
        setUncertain(true);
        setNotice(
          `Aún no podemos confirmar el envío. Revisa ${name} antes de escribir otro mensaje para evitar duplicarlo.`,
        );
      }
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "No se pudo enviar. Tu borrador se conserva.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 flex-1" aria-label={`Conversación con ${customer(sender)}`}>
      <header className="flex items-center gap-3 border-b border-line p-4">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Volver a conversaciones">
          <ArrowLeft size={18} />
        </Button>
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">{customer(sender)}</h2>
          <p className="text-xs text-muted">
            {conversation?.lastIncomingAt
              ? `Último mensaje recibido: ${date(conversation.lastIncomingAt)}`
              : `Conversación de ${name}`}
          </p>
        </div>
      </header>
      <div
        className="max-h-[55vh] min-h-48 space-y-3 overflow-y-auto bg-surface p-4 sm:p-6"
        aria-label="Historial de mensajes"
        ref={history}
      >
        {conversation?.hasMore && (
          <Button variant="secondary" size="sm" isLoading={olderBusy} onClick={older}>
            Cargar anteriores
          </Button>
        )}
        {!conversation && !error && (
          <p role="status" className="text-sm text-muted">
            Cargando conversación…
          </p>
        )}
        {conversation &&
          [...conversation.messages].reverse().map((message) => (
            <article
              key={message.id}
              className={`max-w-[90%] w-fit rounded-2xl px-4 py-3 ${message.direction === "outgoing" ? "ml-auto bg-accent-700 text-white" : "border border-line bg-white text-ink"}`}
            >
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                {message.message_text}
              </p>
              <p
                className={`mt-2 text-xs ${message.direction === "outgoing" ? "text-white/80" : "text-muted"}`}
              >
                <time dateTime={message.sent_at}>{date(message.sent_at)}</time>
                {message.direction === "outgoing" &&
                  ` · ${{ received: "Recibido", sent: "Enviado", delivered: "Entregado", read: "Leído", failed: "No entregado", pending: "En proceso", unknown: "Sin confirmar" }[message.status] ?? "Sin confirmar"}`}
              </p>
            </article>
          ))}
      </div>
      <div className="space-y-3 border-t border-line p-4">
        {error && (
          <div role="alert" className="text-sm text-rose-700">
            {error}{" "}
            <button className="font-semibold underline" onClick={() => setRefresh((v) => v + 1)}>
              Actualizar
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="text-sm text-muted">
            {notice}
          </p>
        )}
        {uncertain && (
          <a
            href={
              channel === "whatsapp"
                ? "https://web.whatsapp.com/"
                : "https://www.instagram.com/direct/inbox/"
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-semibold text-accent-700 underline"
          >
            Revisar en {name}
          </a>
        )}
        {!repliesEnabled ? (
          <p className="text-sm text-muted">
            <Link className="font-semibold text-accent-700 underline" href="/dashboard/settings">
              Habilita las respuestas en Ajustes
            </Link>{" "}
            para contestar desde aquí.
          </p>
        ) : conversation && !conversation.replyAllowed ? (
          <p className="text-sm text-muted">
            La ventana de respuesta de 24 horas terminó. Podrás responder aquí cuando el cliente
            envíe otro mensaje.
          </p>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <label className="block text-sm font-medium text-ink" htmlFor="instagram-reply">
              Tu respuesta
            </label>
            <textarea
              id="instagram-reply"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (!uncertain) setAttempt(null);
              }}
              maxLength={1000}
              rows={3}
              disabled={busy || uncertain || !conversation}
              placeholder="Escribe una respuesta para tu cliente…"
              className="w-full rounded-xl border border-line bg-white p-3 text-sm focus-visible:outline-2 focus-visible:outline-accent-700 disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">{draft.length}/1,000</span>
              <Button
                type="submit"
                size="sm"
                isLoading={busy}
                disabled={!draft.trim() || uncertain || !conversation}
              >
                <Send size={16} />
                Enviar
              </Button>
            </div>
            {uncertain && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setUncertain(false);
                  setAttempt(null);
                  setDraft("");
                  setNotice("");
                }}
              >
                Ya revisé {name}; escribir otro mensaje
              </Button>
            )}
          </form>
        )}
      </div>
      <ConversationSales
        channel={channel}
        composeDisabled={busy || uncertain || !repliesEnabled || !conversation?.replyAllowed}
        sender={sender}
        draft={composer.saleDraft ?? emptySaleDraft}
        updateDraft={(change) =>
          updateComposer((current) => ({
            ...current,
            saleDraft: change(current.saleDraft ?? emptySaleDraft),
          }))
        }
        onCompose={(sale) => {
          updateComposer((current) => ({
            ...current,
            draft: current.draft.includes(sale.url)
              ? current.draft
              : current.draft.trim()
                ? `${current.draft}\n\n${sale.url}`
                : `Hola, aquí está el enlace para completar tu compra de forma segura:\n${sale.url}`,
            attempt: null,
            saleId: sale.id,
          }));
          document.getElementById("instagram-reply")?.focus();
        }}
      />
    </section>
  );
}

function Inbox({
  channel,
  composers,
  setComposers,
}: {
  channel: MessagingChannel;
  composers: Record<string, Composer>;
  setComposers: Dispatch<SetStateAction<Record<string, Composer>>>;
}) {
  const endpoint = `/api/dashboard/${channel}/inbox`;
  const name = channelName(channel);
  const [inbox, setInbox] = useState<InstagramInbox | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  useEffect(() => {
    const sender = new URL(window.location.href).searchParams.get("sender");
    if (sender && (channel === "whatsapp" ? whatsappSenderPattern : /^\d{1,32}$/).test(sender))
      setSelected(sender);
  }, [channel]);
  function choose(sender: string | null) {
    setSelected(sender);
    const url = new URL(window.location.href);
    if (sender) url.searchParams.set("sender", sender);
    else url.searchParams.delete("sender");
    window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const data = await json<InstagramInbox>(endpoint, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setInbox((current) =>
            !current || current.username !== data.username
              ? data
              : {
                  ...data,
                  hasMore: current.hasMore,
                  threads: [
                    ...new Map(
                      [...current.threads, ...data.threads].map((t) => [t.sender_id, t]),
                    ).values(),
                  ].sort(
                    (a, b) =>
                      b.sent_at.localeCompare(a.sent_at) || b.sender_id.localeCompare(a.sender_id),
                  ),
                },
          );
          setError("");
          if (!data.username) {
            setSelected(null);
            setComposers({});
          }
        }
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : `No se pudo cargar ${name}`);
      } finally {
        loading = false;
      }
    }
    void load();
    const interval = window.setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", load);
    };
  }, [refresh, endpoint, name, setComposers]);
  async function more() {
    const last = inbox?.threads.at(-1);
    if (!last || moreBusy) return;
    setMoreBusy(true);
    try {
      const data = await json<InstagramInbox>(
        `${endpoint}?${new URLSearchParams({ before: last.sent_at, key: last.sender_id })}`,
      );
      setInbox(
        (current) =>
          current && {
            ...current,
            hasMore: data.hasMore,
            threads: [
              ...new Map(
                [...current.threads, ...data.threads].map((t) => [t.sender_id, t]),
              ).values(),
            ],
          },
      );
    } catch {
      setError("No se pudieron cargar más conversaciones.");
    } finally {
      setMoreBusy(false);
    }
  }
  const threads =
    inbox?.threads.filter((thread: InstagramThread) =>
      `${thread.sender_id} ${thread.message_text}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    ) ?? [];
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent-700">Tu atención al cliente</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            Mensajes de {name}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            {inbox?.username
              ? `${channel === "instagram" ? "@" : ""}${inbox.username} · Mensajes nuevos desde que conectaste tu cuenta. Se actualizan cada 15 segundos.`
              : "Tus conversaciones con clientes, junto a tus ventas."}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setRefresh((v) => v + 1)}>
          <RefreshCw size={16} />
          Actualizar
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {!inbox ? (
        <p role="status">
          {error ? "Vuelve a intentar con Actualizar." : "Cargando tus mensajes…"}
        </p>
      ) : !inbox.username ? (
        <div className="rounded-2xl border border-line bg-white p-8">
          <MessageCircle size={32} className="text-accent-700" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">
            Conecta tu {channel === "whatsapp" ? "WhatsApp Business" : "cuenta profesional"}
          </h2>
          <p className="my-3 text-sm text-muted">
            Recibe aquí los nuevos mensajes de tus clientes de {name}.
          </p>
          <Link href="/dashboard/settings" className={buttonStyles({ size: "sm" })}>
            Conectar {name}
          </Link>
        </div>
      ) : (
        <div className="flex overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <aside
            className={`${selected ? "hidden xl:block" : "block"} w-full shrink-0 border-r border-line xl:w-72`}
            aria-label="Conversaciones"
          >
            <div className="p-4">
              <label htmlFor="search-conversation" className="sr-only">
                Buscar en las conversaciones cargadas
              </label>
              <input
                id="search-conversation"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar en mensajes cargados"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-accent-700"
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {threads.map((thread) => (
                <button
                  key={thread.sender_id}
                  onClick={() => choose(thread.sender_id)}
                  aria-pressed={selected === thread.sender_id}
                  className={`block w-full border-t border-line px-4 py-4 text-left hover:bg-accent-50 focus-visible:outline-2 focus-visible:outline-accent-700 ${selected === thread.sender_id ? "bg-accent-50" : ""}`}
                >
                  <span className="block text-sm font-semibold text-ink">
                    {customer(thread.sender_id)}
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted">
                    {thread.message_text}
                  </span>
                  <time dateTime={thread.sent_at} className="mt-2 block text-xs text-muted">
                    {date(thread.sent_at)}
                  </time>
                </button>
              ))}
              {threads.length === 0 && (
                <p className="p-5 text-sm text-muted">
                  {query
                    ? "Sin coincidencias en los mensajes cargados."
                    : `Aún no hay mensajes. Los nuevos que recibas en ${name} aparecerán aquí.`}
                </p>
              )}
              {inbox.hasMore && (
                <div className="p-4">
                  <Button variant="secondary" size="sm" isLoading={moreBusy} onClick={more}>
                    Cargar más conversaciones
                  </Button>
                </div>
              )}
            </div>
          </aside>
          {selected ? (
            <Thread
              key={selected}
              channel={channel}
              sender={selected}
              repliesEnabled={inbox.repliesEnabled}
              onBack={() => choose(null)}
              composer={composers[selected] ?? emptyComposer}
              updateComposer={(update) =>
                setComposers((current) => ({
                  ...current,
                  [selected]: update(current[selected] ?? emptyComposer),
                }))
              }
            />
          ) : (
            <div className="hidden min-h-96 flex-1 items-center justify-center p-8 text-center xl:flex">
              <div>
                <MessageCircle size={36} className="mx-auto text-accent-700" aria-hidden />
                <h2 className="mt-4 font-semibold text-ink">Cada conversación, en su lugar</h2>
                <p className="mt-2 text-sm text-muted">
                  Selecciona un cliente para leer sus mensajes y responder.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Esta primera versión muestra texto recibido desde la conexión y respuestas enviadas desde
        RouteFlow. Los archivos se consultan en {name}; no se importa automáticamente todo el
        historial.
      </p>
    </>
  );
}

export function MessageInbox({ channel }: { channel: MessagingChannel }) {
  const [drafts, setDrafts] = useState<Record<MessagingChannel, Record<string, Composer>>>({
    instagram: {},
    whatsapp: {},
  });
  const update = useCallback<Dispatch<SetStateAction<Record<string, Composer>>>>(
    (change) => {
      setDrafts((current) => ({
        ...current,
        [channel]: typeof change === "function" ? change(current[channel]) : change,
      }));
    },
    [channel],
  );
  return (
    <Inbox key={channel} channel={channel} composers={drafts[channel]} setComposers={update} />
  );
}
