"use client";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useSessionDraft } from "@/components/shared/useSessionDraft";
const tasks = [
  "Crear venta rápida y compartir enlace",
  "Elegir dos productos con variante",
  "Corregir stock insuficiente en checkout",
  "Encontrar compra y explicar su siguiente paso",
  "Proponer y confirmar entrega coordinada",
  "Reportar un problema y encontrar respuesta",
];
interface Result {
  code: string;
  task: string;
  outcome: string;
  minutes: number;
  notes: string;
  at: string;
}
const initial: Result[] = [];
function parse(v: unknown): Result[] | null {
  return Array.isArray(v) &&
    v.length <= 100 &&
    v.every(
      (r) =>
        r &&
        typeof r.code === "string" &&
        r.code.length <= 20 &&
        typeof r.notes === "string" &&
        r.notes.length <= 1000 &&
        tasks.includes(r.task) &&
        ["Solo", "Con ayuda", "No completó"].includes(r.outcome) &&
        typeof r.minutes === "number" &&
        r.minutes >= 0 &&
        r.minutes <= 180 &&
        typeof r.at === "string",
    )
    ? v
    : null;
}
export default function PilotPage() {
  const { user } = useUser();
  const draft = useSessionDraft(user ? `routeflow.pilot.${user.id}` : null, initial, parse);
  const [form, setForm] = useState({
    code: "",
    task: tasks[0],
    outcome: "Solo",
    minutes: "",
    notes: "",
  });
  function exportResults() {
    const escape = (value: unknown) =>
      `"${String(value)
        .replace(/^[=+@-]/, "'")
        .replace(/"/g, '""')}"`;
    const csv = [
      "Código,Tarea,Resultado,Minutos,Observaciones,Fecha",
      ...draft.value.map((r) =>
        [r.code, r.task, r.outcome, r.minutes, r.notes, r.at].map(escape).join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "routeflow-piloto.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <DashboardLayout>
      <main className="max-w-3xl space-y-5">
        <h1 className="text-3xl font-semibold">Piloto de usabilidad</h1>
        <p>
          Prueba con personas que acepten participar. Usa datos ficticios y entorno TEST; este
          registro no significa que ya hubo compradores reales.
        </p>
        <section className="border rounded-lg bg-white p-5 space-y-3">
          <h2 className="font-semibold">Guía para moderar</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Explica que se prueba el producto, no la persona. Pide permiso antes de grabar; no
              grabes datos personales.
            </li>
            <li>
              Invita primero a dos vendedores y tres compradores. Asigna códigos como V01 o C01.
            </li>
            <li>
              Entrega una tarea sin explicar cómo hacerla. Observa dónde duda, pide ayuda o
              abandona.
            </li>
            <li>
              Pregunta qué cree que pasó con su compra, quién responde un caso y cuándo debe
              compartir el NIP.
            </li>
            <li>
              Registra tiempo, ayuda necesaria y obstáculos. Corrige los bloqueos antes de ampliar
              el piloto.
            </li>
          </ol>
        </section>
        <form
          className="border rounded-lg p-5 bg-white space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.value.length >= 100) return;
            draft.setValue((old) => [
              ...old,
              { ...form, minutes: Number(form.minutes), at: new Date().toISOString() },
            ]);
            setForm((old) => ({ ...old, notes: "", minutes: "" }));
          }}
        >
          <h2 className="font-semibold">Registrar observación real</h2>
          <p className="text-sm">
            Usa solo un código anónimo. Los resultados se guardan en esta pestaña hasta 4 horas;
            exporta el CSV para conservarlos. No incluyas correos, nombres ni NIP.
          </p>
          <label className="block">
            Código participante
            <input
              required
              maxLength={20}
              className="block w-full border rounded-lg p-3"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label className="block">
            Tarea
            <select
              className="block w-full border rounded-lg p-3"
              value={form.task}
              onChange={(e) => setForm({ ...form, task: e.target.value })}
            >
              {tasks.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            Resultado
            <select
              className="block w-full border rounded-lg p-3"
              value={form.outcome}
              onChange={(e) => setForm({ ...form, outcome: e.target.value })}
            >
              {["Solo", "Con ayuda", "No completó"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            Tiempo (minutos)
            <input
              type="number"
              min="0"
              max="180"
              step="0.1"
              required
              className="block w-full border rounded-lg p-3"
              value={form.minutes}
              onChange={(e) => setForm({ ...form, minutes: e.target.value })}
            />
          </label>
          <label className="block">
            Qué dificultad observaste
            <textarea
              maxLength={1000}
              className="block w-full border rounded-lg p-3"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <button
            disabled={!user || !draft.ready || draft.value.length >= 100}
            className="min-h-11 bg-accent-700 text-white p-3 rounded-lg"
          >
            Guardar observación
          </button>
        </form>
        <section className="space-y-3">
          <h2 className="font-semibold">{draft.value.length} observaciones registradas</h2>
          <button
            disabled={!draft.value.length}
            className="min-h-11 border rounded-lg p-3"
            onClick={exportResults}
          >
            Exportar resultados CSV
          </button>
          {draft.value.map((r, i) => (
            <article key={`${r.at}:${i}`} className="border rounded-lg p-3">
              <p>
                {r.code} · {r.task} · {r.outcome} · {r.minutes} min
              </p>
              <p className="break-words">{r.notes}</p>
              <button
                className="min-h-11 underline"
                onClick={() => draft.setValue((old) => old.filter((_, index) => index !== i))}
              >
                Quitar observación {i + 1}
              </button>
            </article>
          ))}
        </section>
      </main>
    </DashboardLayout>
  );
}
