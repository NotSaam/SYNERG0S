"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLE_PROMPTS } from "@/lib/base-site";
import type { RunSnapshot } from "@/lib/types";
import { ActivityLog } from "./activity-log";
import { AgentCards } from "./agent-cards";
import { NewRunForm } from "./new-run-form";
import { ResultPanel } from "./result-panel";
import { TaskBoard } from "./task-board";
import { RunStatusChip } from "./ui";

type Run = RunSnapshot["run"];
type Task = RunSnapshot["tasks"][number];
type Event = RunSnapshot["events"][number];
type StepOutcome = { state: "advanced" | "busy" | "finished" } | { state: "waiting"; retryInMs: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isOver = (status: Run["status"]) => status === "done" || status === "failed";

export function RunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [epoch, setEpoch] = useState(0); // se incrementa al reintentar, para rearrancar los bucles

  // Sondeo: trae el estado y solo los eventos nuevos.
  useEffect(() => {
    let cancelled = false;
    let lastId = 0;
    (async () => {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/runs/${runId}?after=${lastId}`, { cache: "no-store" });
          if (res.status === 401) {
            window.location.href = "/login";
            return;
          }
          if (res.status === 404) {
            setMissing(true);
            return;
          }
          if (res.ok) {
            const snapshot = (await res.json()) as RunSnapshot;
            if (cancelled) return;
            if (snapshot.events.length) {
              lastId = snapshot.events[snapshot.events.length - 1].id;
              setEvents((prev) => {
                const known = prev.length ? prev[prev.length - 1].id : 0;
                return [...prev, ...snapshot.events.filter((e) => e.id > known)];
              });
            }
            setRun(snapshot.run);
            setTasks(snapshot.tasks);
            if (isOver(snapshot.run.status)) return;
          }
        } catch {
          // Corte de red puntual: se reintenta en el siguiente ciclo.
        }
        await sleep(1200);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, epoch]);

  // Conductor: pide al servidor que ejecute el siguiente turno mientras la ejecución siga viva.
  // El servidor tiene un cerrojo, así que da igual cuántas pestañas empujen a la vez.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        let outcome: StepOutcome | null = null;
        try {
          const res = await fetch(`/api/runs/${runId}/step`, { method: "POST" });
          if (res.status === 401 || res.status === 404) return;
          if (res.ok) outcome = (await res.json()) as StepOutcome;
        } catch {
          outcome = null;
        }
        if (cancelled) return;
        if (!outcome) await sleep(4000);
        else if (outcome.state === "finished") return;
        else if (outcome.state === "waiting") await sleep(Math.min(outcome.retryInMs + 500, 20_000));
        else if (outcome.state === "busy") await sleep(2500);
        else await sleep(150);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, epoch]);

  const over = run ? isOver(run.status) : false;
  useEffect(() => {
    if (over) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [over]);

  const retrying = useRef(false);
  async function retry() {
    if (retrying.current) return;
    retrying.current = true;
    const res = await fetch(`/api/runs/${runId}/retry`, { method: "POST" });
    retrying.current = false;
    if (res.ok) setEpoch((n) => n + 1);
  }

  const stats = useMemo(() => {
    const passed = tasks.filter((t) => t.status === "passed").length;
    const closed = tasks.filter((t) => t.status === "passed" || t.status === "failed").length;
    return { passed, closed, total: tasks.length };
  }, [tasks]);

  if (missing) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="label mb-2">404</p>
        <h1 className="font-display text-2xl font-semibold">Esta ejecución no existe</h1>
        <Link href="/" className="mt-6 inline-block text-accent hover:underline">
          Volver al panel
        </Link>
      </div>
    );
  }

  if (!run) {
    return <p className="label px-6 py-24 text-center">Conectando con el equipo…</p>;
  }

  const waitingMs = run.waitUntil ? new Date(run.waitUntil).getTime() - now : 0;
  const elapsed = (run.finishedAt ? new Date(run.finishedAt).getTime() : now) - new Date(run.createdAt).getTime();
  const progress = stats.total ? Math.round((stats.closed / stats.total) * 100) : run.status === "queued" ? 4 : 8;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6">
      {/* Cabecera: la petición y el estado global */}
      <section className="hud p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="label mb-2">Petición del cliente</p>
            <h1 className="font-display text-xl font-semibold leading-snug sm:text-2xl">«{run.prompt}»</h1>
          </div>
          <RunStatusChip status={run.status} />
        </div>

        <div className="mt-5 h-1 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${run.status === "failed" ? "bg-bad" : "bg-accent"}`}
            style={{ width: `${over && run.status === "done" ? 100 : progress}%` }}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Stat label="Tareas aprobadas" value={stats.total ? `${stats.passed} / ${stats.total}` : "—"} />
          <Stat label="Llamadas a la IA" value={String(run.llmCalls)} />
          <Stat label="Tokens" value={formatTokens(run.tokensIn + run.tokensOut)} />
          <Stat label="Tiempo" value={formatDuration(elapsed)} />
        </dl>
      </section>

      {run.error && (
        <section role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-4">
          <p className="font-semibold text-bad">La ejecución se ha detenido</p>
          <p className="mt-1 text-sm text-ink/90">{run.error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-md border border-bad/50 px-3 py-1.5 text-sm text-bad transition-colors hover:bg-bad/10"
          >
            Reintentar desde el último paso
          </button>
        </section>
      )}

      <AgentCards run={run} events={events} waitingMs={waitingMs} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <TaskBoard run={run} tasks={tasks} />
        <ActivityLog events={events} tasks={tasks} live={!over} />
      </div>

      {run.summary && (
        <section className="hud rise p-5 sm:p-6" style={{ ["--hud-corner" as string]: "#8b5cf6" }}>
          <p className="label mb-2 text-violet">Informe final del Orquestador</p>
          <p className="max-w-3xl leading-relaxed text-ink/90">{run.summary}</p>
        </section>
      )}

      <ResultPanel runId={run.id} filesVersion={run.filesVersion} />

      {over && (
        <section className="hud p-5 sm:p-6">
          <NewRunForm examples={EXAMPLE_PROMPTS.slice(1)} fromRunId={run.id} />
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(".", ",")} k`;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
