import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { events, files, runs, tasks } from "@/db/schema";
import { BASE_SITE } from "@/lib/base-site";
import type { AgentId, RunSnapshot, RunStatus, TaskStatus } from "@/lib/types";

const MAX_RUNS_PER_DAY = Number.parseInt(process.env.MAX_RUNS_PER_DAY ?? "40", 10);

export class RunError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function getOwnedRun(runId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const [run] = await getDb()
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  return run ?? null;
}

export async function listRuns(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: runs.id,
      prompt: runs.prompt,
      status: runs.status,
      createdAt: runs.createdAt,
      llmCalls: runs.llmCalls,
      total: sql<number>`(select count(*)::int from ${tasks} where ${tasks.runId} = ${runs.id})`,
      passed: sql<number>`(select count(*)::int from ${tasks} where ${tasks.runId} = ${runs.id} and ${tasks.status} = 'passed')`,
    })
    .from(runs)
    .where(eq(runs.userId, userId))
    .orderBy(desc(runs.createdAt))
    .limit(20);
  return rows.map((r) => ({ ...r, status: r.status as RunStatus, createdAt: r.createdAt.toISOString() }));
}

/**
 * Crea una ejecución con su copia de la web. Si `fromRunId` es una ejecución terminada
 * del mismo usuario, se parte de su resultado (para encadenar peticiones sobre la misma web).
 */
export async function createRun(userId: string, prompt: string, fromRunId?: string) {
  const db = getDb();
  const text = prompt.trim().replace(/\s+/g, " ");
  if (text.length < 8) throw new RunError("Describe la petición con algo más de detalle.");
  if (text.length > 400) throw new RunError("La petición no puede superar los 400 caracteres.");

  const [{ today }] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(runs)
    .where(gt(runs.createdAt, sql`now() - interval '24 hours'`));
  if (today >= MAX_RUNS_PER_DAY) {
    throw new RunError("Se ha alcanzado el límite diario de peticiones de esta demo (cuota gratuita de IA).", 429);
  }

  let site: { path: string; content: string }[] = Object.entries(BASE_SITE).map(([path, content]) => ({
    path,
    content,
  }));
  if (fromRunId) {
    const source = await getOwnedRun(fromRunId, userId);
    if (!source) throw new RunError("No existe la ejecución de partida.", 404);
    const sourceFiles = await db
      .select({ path: files.path, content: files.content })
      .from(files)
      .where(eq(files.runId, source.id));
    if (sourceFiles.length) site = sourceFiles;
  }

  const [run] = await db.insert(runs).values({ userId, prompt: text }).returning({ id: runs.id });
  await db.insert(files).values(site.map((f) => ({ runId: run.id, path: f.path, content: f.content })));
  await db.insert(events).values({
    runId: run.id,
    agent: "system",
    kind: "info",
    message: fromRunId
      ? "Petición recibida. Se parte de la web resultante de la ejecución anterior."
      : "Petición recibida. Se entrega al Orquestador junto con la web actual.",
  });
  return run.id;
}

export async function getSnapshot(runId: string, userId: string, afterEventId = 0): Promise<RunSnapshot | null> {
  const run = await getOwnedRun(runId, userId);
  if (!run) return null;
  const db = getDb();

  const [taskRows, eventRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.position)),
    db
      .select()
      .from(events)
      .where(and(eq(events.runId, runId), gt(events.id, afterEventId)))
      .orderBy(asc(events.id)),
  ]);

  return {
    run: {
      id: run.id,
      prompt: run.prompt,
      status: run.status as RunStatus,
      activeAgent: run.activeAgent as AgentId | null,
      activity: run.activity,
      waitUntil: run.waitUntil?.toISOString() ?? null,
      error: run.error,
      summary: run.summary,
      llmCalls: run.llmCalls,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      filesVersion: run.filesVersion,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    },
    tasks: taskRows.map((t) => ({
      id: t.id,
      position: t.position,
      title: t.title,
      description: t.description,
      acceptance: t.acceptance,
      status: t.status as TaskStatus,
      attempts: t.attempts,
      tests: t.tests,
      report: t.report,
      devSummary: t.devSummary,
      touchedFiles: t.touchedFiles,
    })),
    events: eventRows.map((e) => ({
      id: e.id,
      taskId: e.taskId,
      agent: e.agent as AgentId | "system",
      kind: e.kind,
      message: e.message,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function getFiles(runId: string) {
  const rows = await getDb()
    .select({ path: files.path, content: files.content, updatedBy: files.updatedBy })
    .from(files)
    .where(eq(files.runId, runId))
    .orderBy(asc(files.path));
  return rows.map((f) => ({
    ...f,
    /** base = igual que en la web de partida · nuevo / modificado = lo han tocado los agentes */
    change: f.updatedBy === "base" ? ("base" as const) : f.path in BASE_SITE ? ("modificado" as const) : ("nuevo" as const),
  }));
}
