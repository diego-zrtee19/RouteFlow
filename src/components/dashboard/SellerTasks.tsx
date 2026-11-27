"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";
import type { SellerTask, TaskActivity } from "@/domain/sellerTasks";
type TaskData = {
  tasks: SellerTask[];
  completed: SellerTask[];
  openCount: number;
  activity: TaskActivity[];
};
const endpoint = "/api/dashboard/tasks";
class TaskRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function call<T>(init?: RequestInit): Promise<T> {
  const res = await fetch(endpoint, { cache: "no-store", ...init });
  const data = await res.json();
  if (!res.ok)
    throw new TaskRequestError(
      data.error?.message ?? "No pudimos completar la operación",
      res.status,
    );
  return data;
}
function TaskPanel() {
  const [data, setData] = useState<TaskData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const attempt = useRef<Record<string, unknown> | null>(null);
  const load = useCallback(async () => {
    const next = await call<TaskData>();
    setData(next);
  }, []);
  useEffect(() => {
    let active = true;
    call<TaskData>()
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function change(task: SellerTask) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await call({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "state",
          taskId: task.id,
          revision: task.revision,
          done: !task.done,
        }),
      });
      setMessage(task.done ? "Tarea reabierta." : "Tarea completada.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cambio");
    } finally {
      setBusy(false);
    }
  }
  const visible = [...(data?.tasks ?? []), ...(data?.completed ?? [])];
  return (
    <details className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <summary className="cursor-pointer py-2 text-lg font-semibold">
        Mis tareas{" "}
        {data ? `· ${data.openCount} ${data.openCount === 1 ? "pendiente" : "pendientes"}` : ""}
      </summary>
      <p className="mt-2 text-sm text-muted">
        Anota pendientes propios del negocio. Los avisos de pedidos, clientes y stock siguen
        apareciendo en “Tu siguiente paso”. Estas tareas no envían mensajes.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        className="mt-2"
        onClick={() =>
          load()
            .then(() => setError(""))
            .catch((e) => setError(e.message))
        }
      >
        Actualizar tareas
      </Button>
      {error && (
        <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-4">
          <p>{error}</p>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Actualizar lista
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-accent-700">
          {message}
        </p>
      )}
      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = e.currentTarget;
          setBusy(true);
          setError("");
          setMessage("");
          try {
            if (!attempt.current) {
              const fields = new FormData(form);
              const due = String(fields.get("dueAt") ?? "");
              if (due && !Number.isFinite(Date.parse(due)))
                throw Error("Revisa la fecha de la tarea");
              attempt.current = {
                action: "create",
                clientId: crypto.randomUUID(),
                title: String(fields.get("title") ?? ""),
                detail: String(fields.get("detail") ?? ""),
                dueAt: due ? new Date(due).toISOString() : null,
              };
            }
            await call({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(attempt.current),
            });
            attempt.current = null;
            setRetrying(false);
            form.reset();
            setMessage("Tarea guardada.");
            await load();
          } catch (e) {
            if (e instanceof TaskRequestError && e.status >= 400 && e.status < 500) {
              attempt.current = null;
              setRetrying(false);
            } else if (attempt.current) setRetrying(true);
            setError(e instanceof Error ? e.message : "No se guardó. Conservamos tu borrador.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm font-medium">
          Qué necesitas hacer
          <input
            name="title"
            required
            maxLength={200}
            disabled={busy || retrying}
            className="mt-2 block w-full rounded-xl border border-line px-3 py-3"
            placeholder="Por ejemplo: revisar el empaque de los pedidos"
          />
        </label>
        <details>
          <summary className="cursor-pointer py-2 text-sm text-accent-700">
            Añadir detalle o fecha
          </summary>
          <label className="mt-3 block text-sm font-medium">
            Detalle
            <textarea
              name="detail"
              maxLength={2000}
              disabled={busy || retrying}
              className="mt-2 block min-h-24 w-full rounded-xl border border-line p-3"
            />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Fecha y hora opcional
            <input
              name="dueAt"
              type="datetime-local"
              disabled={busy || retrying}
              className="mt-2 block max-w-full rounded-xl border border-line p-3"
            />
          </label>
          <p className="mt-2 text-xs text-muted">Se usa la zona horaria de tu dispositivo.</p>
        </details>
        {retrying && (
          <p className="text-sm text-muted">
            Conservamos el mismo intento para evitar duplicados. Reintenta el guardado antes de
            cambiar sus datos.
          </p>
        )}
        <Button type="submit" disabled={busy} isLoading={busy}>
          {retrying ? "Reintentar guardado" : "Añadir tarea"}
        </Button>
      </form>
      {!data ? (
        <p role="status" className="mt-5 text-sm text-muted">
          {error
            ? "La lista no está disponible todavía. Puedes volver a actualizarla."
            : "Cargando tareas…"}
        </p>
      ) : (
        <>
          <ul className="mt-5 divide-y divide-line">
            {data.tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold">{task.title}</h3>
                  {task.detail && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">
                      {task.detail}
                    </p>
                  )}
                  {task.due_at && (
                    <p
                      className={`mt-2 text-sm ${Date.parse(task.due_at) < Date.now() ? "font-semibold text-amber-800" : "text-muted"}`}
                    >
                      {Date.parse(task.due_at) < Date.now() ? "Vencida: " : "Para: "}
                      {new Date(task.due_at).toLocaleString("es-MX")}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  aria-label={`Completar: ${task.title}`}
                  onClick={() => void change(task)}
                >
                  Completar
                </Button>
              </li>
            ))}
          </ul>
          {data.tasks.length === 0 && (
            <p className="mt-4 text-sm text-muted">No tienes tareas propias pendientes.</p>
          )}
          {data.openCount > data.tasks.length && (
            <p className="text-sm text-muted">
              Mostrando las primeras 50 de {data.openCount}. Completa las primeras para ver las
              siguientes.
            </p>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer py-2 text-sm font-semibold">
              Completadas recientemente · {data.completed.length}
            </summary>
            <ul className="divide-y divide-line">
              {data.completed.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1 break-words">{task.title}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Reabrir: ${task.title}`}
                    onClick={() => void change(task)}
                  >
                    Reabrir
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              Se muestran las 10 tareas completadas más recientes.
            </p>
          </details>
          <details className="mt-3">
            <summary className="cursor-pointer py-2 text-sm font-semibold">
              Historial reciente
            </summary>
            <ul className="divide-y divide-line">
              {data.activity.map((a) => (
                <li key={a.id} className="py-2 text-xs text-muted">
                  {visible.find((t) => t.id === a.task_id)?.title ?? "Tarea fuera de esta lista"} ·{" "}
                  {{ created: "Creada", completed: "Completada", reopened: "Reabierta" }[a.action]}{" "}
                  · {new Date(a.created_at).toLocaleString("es-MX")}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              Últimos 20 movimientos. Las tareas se conservan al completarlas.
            </p>
          </details>
        </>
      )}
    </details>
  );
}
export function SellerTasks() {
  const { userId } = useAuth();
  return userId ? <TaskPanel key={userId} /> : null;
}
