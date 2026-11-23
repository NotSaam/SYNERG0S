"use client";

import { useState } from "react";
import type { CheckResult, RunSnapshot, TaskStatus } from "@/lib/types";

type Run = RunSnapshot["run"];
type Task = RunSnapshot["tasks"][number];

const COLUMNS: { key: string; title: string; statuses: TaskStatus[] }[] = [
  { key: "pending", title: "Pendiente", statuses: ["pending"] },
  { key: "develop", title: "En desarrollo", statuses: ["developing", "fixing"] },
  { key: "testing", title: "En pruebas", statuses: ["testing"] },
  { key: "closed", title: "Cerrada", statuses: ["passed", "failed"] },
];

const STATUS_LABEL: Record<TaskStatus, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "text-muted border-line-bright" },
  developing: { label: "Develop trabajando", cls: "text-accent border-accent/40 bg-accent/10" },
  fixing: { label: "Develop corrigiendo", cls: "text-warn border-warn/40 bg-warn/10" },
  testing: { label: "Testing probando", cls: "text-blue-neon border-blue-neon/40 bg-blue-neon/10" },
  passed: { label: "Aprobada", cls: "text-ok border-ok/40 bg-ok/10" },
  failed: { label: "Fallida", cls: "text-bad border-bad/40 bg-bad/10" },
};

const SUITE_LABEL: Record<CheckResult["suite"], string> = {
  static: "Suite base",
  acceptance: "Aceptación",
  regression: "Regresión",
};

/** Tablero: en qué estado está cada tarea. Al pulsar una tarjeta se ve su detalle. */
export function TaskBoard({ run, tasks }: { run: Run; tasks: Task[] }) {
  const [picked, setPicked] = useState<string | null>(null);

  const current = tasks.find((t) => t.status !== "passed" && t.status !== "failed");
  const selected = tasks.find((t) => t.id === picked) ?? current ?? tasks[tasks.length - 1];

  return (
    <section className="space-y-4" aria-label="Tareas">
      <div className="hud p-4">
        <h2 className="label mb-3">Tablero de tareas</h2>

        {!tasks.length ? (
          <p className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            {run.status === "failed"
              ? "La ejecución se detuvo antes de crear las tareas."
              : "El Orquestador está dividiendo la petición en tareas…"}
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="grid min-w-[40rem] grid-cols-4 gap-3">
              {COLUMNS.map((column) => {
                const items = tasks.filter((t) => column.statuses.includes(t.status));
                return (
                  <div key={column.key} className="rounded-lg border border-line bg-night/60 p-2">
                    <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                      <h3 className="font-mono text-[0.68rem] uppercase tracking-widest text-muted">{column.title}</h3>
                      <span className="font-mono text-[0.68rem] tabular-nums text-faint">{items.length}</span>
                    </div>
                    <div className="min-h-24 space-y-2">
                      {items.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          selected={selected?.id === task.id}
                          onSelect={() => setPicked(task.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selected && <TaskDetail task={selected} />}
    </section>
  );
}

function TaskCard({ task, selected, onSelect }: { task: Task; selected: boolean; onSelect: () => void }) {
  const status = STATUS_LABEL[task.status];
  const live = task.status === "developing" || task.status === "fixing" || task.status === "testing";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rise block w-full rounded-md border bg-panel-2 p-2.5 text-left transition-colors hover:border-line-bright ${
        selected ? "border-accent/60" : "border-line"
      }`}
    >
      <span className="flex items-center justify-between gap-2 font-mono text-[0.65rem] uppercase tracking-widest text-faint">
        <span>T{task.position}</span>
        {task.attempts > 1 && <span className="text-warn">intento {task.attempts}</span>}
      </span>
      <span className="mt-1 block text-sm font-medium leading-snug text-ink">{task.title}</span>
      <span
        className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.68rem] ${status.cls}`}
      >
        {live && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
        {status.label}
      </span>
      {task.report && (
        <span className="mt-1.5 block font-mono text-[0.68rem] tabular-nums text-muted">
          pruebas {task.report.passed}/{task.report.results.length}
        </span>
      )}
    </button>
  );
}

function TaskDetail({ task }: { task: Task }) {
  const status = STATUS_LABEL[task.status];
  const report = task.report;
  const failures = report?.results.filter((r) => !r.ok) ?? [];
  const passes = report?.results.filter((r) => r.ok) ?? [];
  const issues = report?.review?.issues ?? [];

  return (
    <div className="hud p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="label">Tarea {task.position}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] ${status.cls}`}>{status.label}</span>
        {task.attempts > 0 && (
          <span className="font-mono text-[0.68rem] text-muted">
            {task.attempts} {task.attempts === 1 ? "entrega" : "entregas"} de Develop
          </span>
        )}
      </div>
      <h3 className="mt-2 font-display text-lg font-semibold leading-snug">{task.title}</h3>
      <p className="mt-1 text-sm text-muted">{task.description}</p>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <h4 className="label mb-2 text-violet">Criterios de aceptación · Orquestador</h4>
          <ul className="space-y-1.5 text-sm text-ink/90">
            {task.acceptance.map((criterion) => (
              <li key={criterion} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-violet" />
                {criterion}
              </li>
            ))}
          </ul>

          {task.devSummary && (
            <>
              <h4 className="label mb-2 mt-5 text-accent">Última entrega · Develop</h4>
              <p className="text-sm text-ink/90">{task.devSummary}</p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {task.touchedFiles.map((path) => (
                  <code key={path} className="rounded border border-line bg-night px-1.5 py-0.5 font-mono text-xs text-muted">
                    {path}
                  </code>
                ))}
              </p>
            </>
          )}
        </div>

        <div>
          <h4 className="label mb-2 text-blue-neon">
            Informe de pruebas · Testing{report ? ` · intento ${report.attempt}` : ""}
          </h4>
          {!report ? (
            <p className="text-sm text-faint">
              {task.tests ? `${task.tests.length} tests escritos. Aún sin ejecutar.` : "Testing todavía no ha probado esta tarea."}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="font-mono text-sm tabular-nums">
                <span className="text-ok">{report.passed} en verde</span>
                <span className="text-faint"> · </span>
                <span className={report.failed ? "text-bad" : "text-faint"}>{report.failed} en rojo</span>
              </p>

              {failures.length > 0 && (
                <ul className="space-y-2">
                  {failures.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="rounded-md border border-bad/30 bg-bad/5 p-2.5 text-sm">
                      <p className="flex gap-2 text-ink">
                        <span className="text-bad">✗</span>
                        <span>
                          <span className="mr-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-faint">
                            {SUITE_LABEL[f.suite]}
                          </span>
                          {f.name}
                        </span>
                      </p>
                      {f.detail && <p className="mt-1 pl-5 font-mono text-xs leading-relaxed text-muted">{f.detail}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {issues.length > 0 && (
                <ul className="space-y-2">
                  {issues.map((issue, i) => (
                    <li
                      key={`${issue.file}-${i}`}
                      className={`rounded-md border p-2.5 text-sm ${
                        issue.severity === "bloqueante" ? "border-bad/30 bg-bad/5" : "border-line bg-night/60"
                      }`}
                    >
                      <p className="text-ink">
                        <span className="mr-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-faint">
                          Revisión · {issue.severity} · {issue.file}
                        </span>
                        {issue.problem}
                      </p>
                      <p className="mt-1 text-xs text-muted">Arreglo propuesto: {issue.fix}</p>
                    </li>
                  ))}
                </ul>
              )}

              {passes.length > 0 && (
                <details className="group rounded-md border border-line bg-night/60">
                  <summary className="cursor-pointer select-none px-2.5 py-2 text-sm text-muted hover:text-ink">
                    Ver las {passes.length} comprobaciones en verde
                  </summary>
                  <ul className="space-y-1 border-t border-line px-2.5 py-2">
                    {passes.map((p, i) => (
                      <li key={`${p.name}-${i}`} className="flex gap-2 text-xs text-ink/80">
                        <span className="text-ok">✓</span>
                        <span>
                          <span className="mr-1.5 font-mono text-[0.62rem] uppercase tracking-wider text-faint">
                            {SUITE_LABEL[p.suite]}
                          </span>
                          {p.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
