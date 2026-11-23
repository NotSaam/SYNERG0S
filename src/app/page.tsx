import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NewRunForm } from "@/components/new-run-form";
import { AgentGlyph, AGENTS, RunStatusChip, TopBar } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { EXAMPLE_PROMPTS } from "@/lib/base-site";
import { listRuns } from "@/lib/runs";
import type { AgentId } from "@/lib/types";

const FLOW: { agent: AgentId; step: string }[] = [
  { agent: "orchestrator", step: "Divide la petición en tareas con criterios de aceptación." },
  { agent: "develop", step: "Implementa cada tarea sobre los archivos de la web." },
  { agent: "testing", step: "Ejecuta pruebas reales y devuelve lo que falla hasta que todo pasa." },
];

export default function Home() {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-10 px-4 py-10 sm:px-6">
        <section>
          <p className="label mb-3">Panel de control</p>
          <h1 className="max-w-3xl font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Pide un cambio en la web y mira cómo se lo reparten tres agentes de IA.
          </h1>
          <p className="mt-3 max-w-2xl text-muted">
            La web de prueba es la de un pequeño taller de cerámica. Cada petición pasa por el Orquestador,
            Develop y Testing, y verás en directo qué hace cada uno y en qué estado está cada tarea.
          </p>
        </section>

        <section className="hud p-5 sm:p-6">
          <NewRunForm examples={EXAMPLE_PROMPTS} />
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {FLOW.map(({ agent, step }, i) => (
            <div key={agent} className="hud p-4">
              <div className={`mb-2 flex items-center gap-2 ${AGENTS[agent].text}`}>
                <AgentGlyph agent={agent} className="h-5 w-5" />
                <span className="font-display font-semibold">{AGENTS[agent].name}</span>
                <span className="label ml-auto">0{i + 1}</span>
              </div>
              <p className="text-sm text-muted">{step}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="label mb-3">Peticiones anteriores</h2>
          <Suspense fallback={<p className="text-sm text-faint">Cargando…</p>}>
            <RunList />
          </Suspense>
        </section>
      </main>
    </>
  );
}

async function RunList() {
  const session = await getSession();
  if (!session) redirect("/login");
  const runs = await listRuns(session.userId);

  if (!runs.length) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
        Todavía no hay peticiones. Escribe una arriba o pulsa uno de los ejemplos.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel/70">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/runs/${run.id}`}
            className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-panel-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{run.prompt}</span>
              <span className="mt-0.5 block font-mono text-[0.7rem] text-faint">
                {new Date(run.createdAt).toLocaleString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Madrid",
                })}
                {run.total > 0 && ` · ${run.passed}/${run.total} tareas aprobadas`}
              </span>
            </span>
            <RunStatusChip status={run.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
