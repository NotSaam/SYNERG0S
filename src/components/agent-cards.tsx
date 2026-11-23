import type { AgentId, RunSnapshot } from "@/lib/types";
import { AgentGlyph, AGENTS } from "./ui";

type Run = RunSnapshot["run"];
type Event = RunSnapshot["events"][number];

const ORDER: AgentId[] = ["orchestrator", "develop", "testing"];

type AgentState = "working" | "waiting" | "idle" | "standby" | "finished" | "stopped";

const STATE: Record<AgentState, { label: string; cls: string }> = {
  working: { label: "Trabajando", cls: "text-ink" },
  waiting: { label: "Esperando cuota de IA", cls: "text-warn" },
  standby: { label: "En espera de turno", cls: "text-muted" },
  idle: { label: "Sin empezar", cls: "text-faint" },
  finished: { label: "Ha terminado", cls: "text-ok" },
  stopped: { label: "Detenido", cls: "text-bad" },
};

/** Qué está haciendo cada agente ahora mismo. */
export function AgentCards({ run, events, waitingMs }: { run: Run; events: Event[]; waitingMs: number }) {
  const over = run.status === "done" || run.status === "failed";

  return (
    <section aria-label="Agentes">
      <div className="grid gap-3 md:grid-cols-3">
        {ORDER.map((agent) => {
          const meta = AGENTS[agent];
          const mine = events.filter((e) => e.agent === agent);
          const last = mine[mine.length - 1];
          const active = !over && run.activeAgent === agent;

          let state: AgentState;
          if (over) state = run.error ? "stopped" : mine.length ? "finished" : "idle";
          else if (active) state = waitingMs > 0 ? "waiting" : "working";
          else state = mine.length ? "standby" : "idle";

          const line = active
            ? waitingMs > 0
              ? `Límite de cuota gratuita alcanzado. Reintento en ${Math.ceil(waitingMs / 1000)} s.`
              : (run.activity ?? "…")
            : (last?.message ?? "Todavía no ha intervenido.");

          return (
            <article
              key={agent}
              aria-current={active ? "step" : undefined}
              className={`hud relative overflow-hidden p-4 transition-[border-color,box-shadow] duration-500 ${
                active ? meta.border : ""
              }`}
              style={{
                ["--hud-corner" as string]: active ? meta.color : undefined,
                boxShadow: active ? `0 0 32px -12px ${meta.color}` : undefined,
              }}
            >
              {active && state === "working" && (
                <span className="absolute inset-x-0 top-0 block h-px overflow-hidden">
                  <span
                    className="scan-bar block h-px w-1/3"
                    style={{ background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }}
                  />
                </span>
              )}

              <div className="flex items-center gap-3">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${meta.border} ${meta.bg} ${meta.text}`}
                >
                  <AgentGlyph agent={agent} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold leading-tight">{meta.name}</h2>
                  <p className={`mt-0.5 flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-widest ${STATE[state].cls}`}>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${state === "working" || state === "waiting" ? "pulse-dot" : ""}`}
                      style={{ background: state === "working" ? meta.color : "currentColor" }}
                    />
                    {STATE[state].label}
                  </p>
                </div>
                <span className="label ml-auto self-start tabular-nums" title="Intervenciones en esta ejecución">
                  {mine.length} {mine.length === 1 ? "acción" : "acciones"}
                </span>
              </div>

              <p className="mt-3 text-xs text-faint">{meta.role}</p>
              <p
                className={`mt-2 line-clamp-3 min-h-[3.75rem] border-l-2 pl-3 text-sm leading-5 ${
                  active ? "text-ink" : "text-muted"
                }`}
                style={{ borderColor: active ? meta.color : "var(--color-line)" }}
                aria-live={active ? "polite" : undefined}
              >
                {line}
              </p>
            </article>
          );
        })}
      </div>
      <p className="label mt-3 text-center">
        Orquestador reparte <span className="text-faint">→</span> Develop implementa{" "}
        <span className="text-faint">⇄</span> Testing verifica <span className="text-faint">→</span> Orquestador
        cierra
      </p>
    </section>
  );
}
