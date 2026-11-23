import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { NoObjectGeneratedError } from "ai";
import type { z } from "zod";
import { getDb } from "@/db";
import { events, files, runs, tasks, type Run, type Task } from "@/db/schema";
import { callAgent, ProviderBusyError } from "@/lib/llm";
import type { AgentId, Assertion, CheckResult, ReviewIssue, TestReport } from "@/lib/types";
import { isValidSelector, runAssertions, runStaticSuite, type Workspace } from "./harness";
import {
  developRequest,
  FILE_PATH,
  MAX_FILE_BYTES,
  planRequest,
  reviewRequest,
  summaryRequest,
  testPlanRequest,
  type TestPlanSchema,
} from "./roles";

/**
 * Motor del equipo. Es una máquina de estados guardada en Postgres:
 * cada llamada a `advance()` ejecuta UN paso (un turno de un agente) y lo persiste.
 *
 *   queued ──Orquestador planifica──▶ running
 *   tarea: pending ─Develop─▶ testing ─Testing─▶ passed
 *                                 │ falla           ▲
 *                                 ▼                 │
 *                              fixing ──Develop─────┘   (hasta MAX_ATTEMPTS)
 *   todas las tareas cerradas ──Orquestador verifica e informa──▶ done | failed
 *
 * Al ser pasos cortos e idempotentes, funciona en funciones serverless (sin procesos
 * largos) y se puede reanudar si el navegador se cierra a mitad.
 */

export const MAX_ATTEMPTS = 4;
const MAX_RETRIES = 3;
/** Esperas seguidas al proveedor de IA (cuota o saturación) antes de detener la ejecución. */
const MAX_BUSY_WAITS = 30;
/** A partir de este intento la revisión de código deja de poder bloquear (evita bucles). */
const LAST_BLOCKING_REVIEW = 2;

export type StepOutcome =
  | { state: "advanced" }
  | { state: "busy" }
  | { state: "waiting"; retryInMs: number }
  | { state: "finished" };

interface Ctx {
  runId: string;
  agent: AgentId | "system";
}

export async function advance(runId: string): Promise<StepOutcome> {
  const db = getDb();

  // Cerrojo atómico: si dos pestañas empujan la misma ejecución, solo una avanza.
  const [run] = await db
    .update(runs)
    .set({ lockUntil: sql`now() + interval '150 seconds'` })
    .where(
      and(
        eq(runs.id, runId),
        inArray(runs.status, ["queued", "running"]),
        or(isNull(runs.lockUntil), lt(runs.lockUntil, sql`now()`)),
      ),
    )
    .returning();

  if (!run) {
    const [current] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, runId));
    if (!current || current.status === "done" || current.status === "failed") return { state: "finished" };
    return { state: "busy" };
  }

  const ctx: Ctx = { runId, agent: (run.activeAgent as AgentId | null) ?? "system" };

  try {
    if (run.waitUntil && run.waitUntil.getTime() > Date.now()) {
      return { state: "waiting", retryInMs: run.waitUntil.getTime() - Date.now() };
    }
    await step(ctx, run);
    await db.update(runs).set({ retries: 0, busyWaits: 0, waitUntil: null }).where(eq(runs.id, runId));
    return { state: "advanced" };
  } catch (err) {
    if (err instanceof ProviderBusyError) {
      const busyWaits = run.busyWaits + 1;
      const why =
        err.reason === "quota"
          ? "ha alcanzado su límite de cuota gratuita"
          : "está saturado y no responde";
      if (busyWaits > MAX_BUSY_WAITS) {
        const message = `El proveedor de IA ${why}. Se intentó ${MAX_BUSY_WAITS} veces seguidas; prueba a reintentar en unos minutos.`;
        await db
          .update(runs)
          .set({ status: "failed", error: message, activeAgent: null, activity: null, finishedAt: new Date() })
          .where(eq(runs.id, runId));
        await log({ ...ctx, agent: "system" }, "error", message);
        return { state: "finished" };
      }
      // La saturación va y viene en segundos: esperas cortas que crecen poco. Con cuota, lo que
      // indique el proveedor.
      const waitMs =
        err.reason === "quota" ? err.retryAfterMs : Math.min(err.retryAfterMs + 1_500 * (busyWaits - 1), 15_000);
      const seconds = Math.ceil(waitMs / 1000);
      await db
        .update(runs)
        .set({ busyWaits, waitUntil: new Date(Date.now() + waitMs) })
        .where(eq(runs.id, runId));
      // Una línea por racha de esperas (y un recordatorio cada cinco) para no inundar la bitácora.
      if (busyWaits === 1) {
        await log(ctx, "wait", `El proveedor de IA ${why}. Espero y reintento hasta que responda.`);
      } else if (busyWaits % 5 === 0) {
        await log(ctx, "wait", `El proveedor de IA sigue sin responder (${busyWaits} intentos). Sigo reintentando; próximo en ${seconds} s.`);
      }
      return { state: "waiting", retryInMs: waitMs };
    }

    const retries = run.retries + 1;
    const message = describeError(err);
    if (retries >= MAX_RETRIES) {
      await db
        .update(runs)
        .set({ status: "failed", error: message, activeAgent: null, activity: null, finishedAt: new Date() })
        .where(eq(runs.id, runId));
      await log({ ...ctx, agent: "system" }, "error", `Ejecución detenida tras ${MAX_RETRIES} errores seguidos: ${message}`);
      return { state: "finished" };
    }
    await db.update(runs).set({ retries }).where(eq(runs.id, runId));
    await log(ctx, "error", `Paso fallido (${message}). Reintento ${retries} de ${MAX_RETRIES - 1}.`);
    return { state: "advanced" };
  } finally {
    await db.update(runs).set({ lockUntil: null, updatedAt: new Date() }).where(eq(runs.id, runId));
  }
}

async function step(ctx: Ctx, run: Run): Promise<void> {
  if (run.status === "queued") return plan(ctx, run);

  const taskList = await getDb()
    .select()
    .from(tasks)
    .where(eq(tasks.runId, run.id))
    .orderBy(asc(tasks.position));

  const current = taskList.find((t) => t.status !== "passed" && t.status !== "failed");
  if (!current) return finish(ctx, run, taskList);
  if (current.status === "testing") return test(ctx, run, current, taskList);
  return develop(ctx, run, current);
}

// ───────────────────────── Orquestador ─────────────────────────

async function plan(ctx: Ctx, run: Run): Promise<void> {
  const db = getDb();
  await setActivity(ctx, "orchestrator", "Analizando la petición y dividiéndola en tareas…");

  const ws = await loadWorkspace(run.id);
  const planned = await call(ctx, planRequest(run.prompt, ws));

  const inserted = await db
    .insert(tasks)
    .values(
      planned.tasks.map((t, i) => ({
        runId: run.id,
        position: i + 1,
        title: t.title,
        description: t.description,
        acceptance: t.acceptance,
      })),
    )
    .returning({ id: tasks.id, position: tasks.position, title: tasks.title });

  await log(ctx, "plan", `${planned.analysis} He dividido el trabajo en ${inserted.length} ${plural(inserted.length, "tarea")}.`, {
    tasks: planned.tasks.map((t) => ({ title: t.title, files: t.files, acceptance: t.acceptance })),
  });
  const first = inserted.find((t) => t.position === 1)!;
  await log(ctx, "handoff", `Asigno la tarea 1 a Develop: «${first.title}».`, undefined, first.id);

  await db.update(runs).set({ status: "running" }).where(eq(runs.id, run.id));
}

async function finish(ctx: Ctx, run: Run, taskList: Task[]): Promise<void> {
  const db = getDb();
  await setActivity(ctx, "orchestrator", "Verificación final y redacción del informe…");

  const ws = await loadWorkspace(run.id);
  const passedTasks = taskList.filter((t) => t.status === "passed");
  const finalResults = [
    ...runStaticSuite(ws),
    ...passedTasks.flatMap((t) => runAssertions(ws, t.tests ?? [], "regression")),
  ];
  const finalFailed = finalResults.filter((r) => !r.ok);
  const allPassed = passedTasks.length === taskList.length && finalFailed.length === 0;

  let summary = fallbackSummary(taskList, Object.keys(ws));
  try {
    const result = await call(
      ctx,
      summaryRequest({
        prompt: run.prompt,
        tasks: taskList.map((t) => ({
          title: t.title,
          status: t.status === "passed" ? "aprobada" : "no aprobada",
          attempts: t.attempts,
          devSummary: t.devSummary,
        })),
        files: Object.keys(ws).sort(),
      }),
    );
    summary = result.summary;
  } catch {
    // El informe redactado es un extra: si la IA no responde, vale el resumen determinista.
  }

  await log(
    ctx,
    "done",
    allPassed
      ? `Trabajo terminado: ${taskList.length} de ${taskList.length} tareas aprobadas y verificación final en verde (${finalResults.length} comprobaciones).`
      : `Trabajo terminado con incidencias: ${passedTasks.length} de ${taskList.length} tareas aprobadas.`,
    { finalChecks: finalResults.length, finalFailed: finalFailed.map((f) => ({ name: f.name, detail: f.detail })) },
  );

  await db
    .update(runs)
    .set({
      status: allPassed ? "done" : "failed",
      summary,
      activeAgent: null,
      activity: null,
      finishedAt: new Date(),
    })
    .where(eq(runs.id, run.id));
}

// ─────────────────────────── Develop ───────────────────────────

async function develop(ctx: Ctx, run: Run, task: Task): Promise<void> {
  const db = getDb();
  const fixing = task.status === "fixing";
  const attempt = task.attempts + 1;

  if (task.status === "pending") {
    await db.update(tasks).set({ status: "developing", updatedAt: new Date() }).where(eq(tasks.id, task.id));
  }
  await setActivity(
    ctx,
    "develop",
    fixing ? `Corrigiendo «${task.title}» (intento ${attempt})…` : `Implementando «${task.title}»…`,
  );

  const ws = await loadWorkspace(run.id);
  const failures = fixing ? (task.report?.results.filter((r) => !r.ok) ?? []) : [];
  const issues = fixing ? (task.report?.review?.issues.filter((i) => i.severity === "bloqueante") ?? []) : [];

  const result = await call(ctx, developRequest({ prompt: run.prompt, task, ws, attempt, failures, issues }));

  const written = result.files.filter(
    (f) => FILE_PATH.test(f.path) && !f.path.includes("..") && f.content.length <= MAX_FILE_BYTES,
  );
  if (!written.length) throw new Error("Develop no ha devuelto ningún archivo válido");

  for (const file of written) {
    await db
      .insert(files)
      .values({ runId: run.id, path: file.path, content: file.content, updatedBy: `tarea ${task.position}` })
      .onConflictDoUpdate({
        target: [files.runId, files.path],
        set: { content: file.content, updatedBy: `tarea ${task.position}`, updatedAt: new Date() },
      });
  }

  const touched = [...new Set([...task.touchedFiles, ...written.map((f) => f.path)])].sort();
  await db
    .update(tasks)
    .set({ status: "testing", attempts: attempt, devSummary: result.summary, touchedFiles: touched, updatedAt: new Date() })
    .where(eq(tasks.id, task.id));
  await db
    .update(runs)
    .set({ filesVersion: sql`${runs.filesVersion} + 1` })
    .where(eq(runs.id, run.id));

  await log(
    ctx,
    "dev",
    result.summary,
    {
      attempt,
      files: written.map((f) => ({
        path: f.path,
        action: f.path in ws ? "modificado" : "creado",
        bytes: f.content.length,
      })),
    },
    task.id,
  );
  await log(
    { ...ctx, agent: "orchestrator" },
    "handoff",
    `Tarea ${task.position} entregada por Develop. Se la paso a Testing.`,
    undefined,
    task.id,
  );
}

// ─────────────────────────── Testing ───────────────────────────

async function test(ctx: Ctx, run: Run, task: Task, taskList: Task[]): Promise<void> {
  const db = getDb();
  const ws = await loadWorkspace(run.id);
  const touched = task.touchedFiles.filter((p) => p in ws);

  // 1. La primera vez que ve el código, Testing escribe los tests de aceptación de la tarea.
  let tests = task.tests;
  if (!tests) {
    await setActivity(ctx, "testing", `Escribiendo los tests de aceptación de «${task.title}»…`);
    const planned = await call(ctx, testPlanRequest({ task, ws, touched }));
    tests = sanitizeTests(planned.tests);
    if (!tests.length) throw new Error("Testing no ha generado ningún test ejecutable");
    await db.update(tasks).set({ tests, updatedAt: new Date() }).where(eq(tasks.id, task.id));
    await log(ctx, "info", `He escrito ${tests.length} tests de aceptación para «${task.title}».`, { tests }, task.id);
  }

  // 2. Ejecución real: suite base + tests de la tarea + regresión de las tareas ya aprobadas.
  await setActivity(ctx, "testing", `Ejecutando pruebas de «${task.title}» (intento ${task.attempts})…`);
  const results: CheckResult[] = [
    ...runStaticSuite(ws),
    ...runAssertions(ws, tests, "acceptance"),
    ...taskList
      .filter((t) => t.status === "passed" && t.tests)
      .flatMap((t) => runAssertions(ws, t.tests!, "regression")),
  ];
  const failed = results.filter((r) => !r.ok);

  // 3. Con todo en verde, revisión de código (solo puede bloquear en los primeros intentos).
  let review: TestReport["review"];
  if (!failed.length && task.attempts <= LAST_BLOCKING_REVIEW) {
    await setActivity(ctx, "testing", `Tests en verde. Revisando el código de «${task.title}»…`);
    const reviewed = await call(ctx, reviewRequest({ task, ws, touched }));
    review = { approved: reviewed.approved, issues: reviewed.issues as ReviewIssue[] };
  }
  const blocking = review?.issues.filter((i) => i.severity === "bloqueante") ?? [];

  const verdict: TestReport["verdict"] = !failed.length && !blocking.length ? "pass" : "fail";
  const report: TestReport = {
    attempt: task.attempts,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    review,
    verdict,
  };
  const detail = {
    attempt: task.attempts,
    passed: report.passed,
    total: results.length,
    failures: failed.map((f) => ({ suite: f.suite, name: f.name, detail: f.detail })),
    issues: review?.issues ?? [],
  };
  const orchestrator: Ctx = { ...ctx, agent: "orchestrator" };

  if (verdict === "pass") {
    await db
      .update(tasks)
      .set({ status: "passed", report, reviewed: true, updatedAt: new Date() })
      .where(eq(tasks.id, task.id));
    await log(
      ctx,
      "test_pass",
      `«${task.title}» aprobada: ${report.passed} de ${results.length} comprobaciones en verde${
        task.attempts > 1 ? ` tras ${task.attempts} intentos` : " a la primera"
      }.`,
      detail,
      task.id,
    );
    const next = taskList.find((t) => t.position > task.position && t.status === "pending");
    await log(
      orchestrator,
      "handoff",
      next
        ? `Tarea ${task.position} cerrada. Asigno la tarea ${next.position} a Develop: «${next.title}».`
        : `Tarea ${task.position} cerrada. No quedan tareas pendientes.`,
      undefined,
      next?.id ?? task.id,
    );
    return;
  }

  const problems = failed.length + blocking.length;
  const exhausted = task.attempts >= MAX_ATTEMPTS;
  await db
    .update(tasks)
    .set({ status: exhausted ? "failed" : "fixing", report, updatedAt: new Date() })
    .where(eq(tasks.id, task.id));
  await log(
    ctx,
    "test_fail",
    `«${task.title}» no pasa: ${problems} ${plural(problems, "fallo")} en el intento ${task.attempts}.`,
    detail,
    task.id,
  );
  await log(
    orchestrator,
    exhausted ? "error" : "handoff",
    exhausted
      ? `La tarea ${task.position} sigue fallando tras ${MAX_ATTEMPTS} intentos. La marco como fallida y sigo.`
      : `Devuelvo la tarea ${task.position} a Develop con el informe de Testing.`,
    undefined,
    task.id,
  );
}

/** Descarta tests que el banco de pruebas no puede ejecutar (selector inválido, campos que faltan). */
function sanitizeTests(
  raw: z.infer<typeof TestPlanSchema>["tests"],
): Assertion[] {
  const out: Assertion[] = [];
  for (const t of raw) {
    const file = t.file.trim().replace(/^\.?\//, "");
    const selector = t.selector?.trim() || undefined;
    const value = t.value === null || t.value === undefined ? undefined : String(t.value);
    const attr = t.attr?.trim() || undefined;
    const needsSelector = !["file_exists", "file_contains"].includes(t.type);

    if (!file) continue;
    if (needsSelector && (!selector || !isValidSelector(selector))) continue;
    if (["file_contains", "text_contains"].includes(t.type) && !value) continue;
    if (["attr_present", "attr_equals"].includes(t.type) && !attr) continue;
    if (t.type === "attr_equals" && value === undefined) continue;

    out.push({ criterion: t.criterion, description: t.description, type: t.type, file, selector, attr, value });
  }
  return out;
}

// ─────────────────────────── Utilidades ───────────────────────────

async function loadWorkspace(runId: string): Promise<Workspace> {
  const rows = await getDb()
    .select({ path: files.path, content: files.content })
    .from(files)
    .where(eq(files.runId, runId));
  return Object.fromEntries(rows.map((r) => [r.path, r.content]));
}

/** Llama a la IA con el rol indicado y apunta el consumo en la ejecución. */
async function call<T>(
  ctx: Ctx,
  request: { system: string; prompt: string; schema: z.ZodType<T>; maxOutputTokens: number },
): Promise<T> {
  const result = await callAgent(request);
  await getDb()
    .update(runs)
    .set({
      llmCalls: sql`${runs.llmCalls} + 1`,
      tokensIn: sql`${runs.tokensIn} + ${result.tokensIn}`,
      tokensOut: sql`${runs.tokensOut} + ${result.tokensOut}`,
    })
    .where(eq(runs.id, ctx.runId));
  return result.output;
}

async function setActivity(ctx: Ctx, agent: AgentId, activity: string): Promise<void> {
  ctx.agent = agent;
  await getDb().update(runs).set({ activeAgent: agent, activity }).where(eq(runs.id, ctx.runId));
}

async function log(
  ctx: Ctx,
  kind: string,
  message: string,
  detail?: Record<string, unknown>,
  taskId?: string,
): Promise<void> {
  await getDb().insert(events).values({ runId: ctx.runId, agent: ctx.agent, kind, message, detail, taskId });
}

function describeError(err: unknown): string {
  if (NoObjectGeneratedError.isInstance(err)) return "la IA devolvió una respuesta que no cumple el formato pedido";
  if (err instanceof Error) return err.message.slice(0, 300);
  return "error desconocido";
}

function fallbackSummary(taskList: Task[], paths: string[]): string {
  const passed = taskList.filter((t) => t.status === "passed").length;
  const fixes = taskList.reduce((n, t) => n + Math.max(0, t.attempts - 1), 0);
  return `${passed} de ${taskList.length} tareas aprobadas por Testing, con ${fixes} ${plural(fixes, "corrección", "correcciones")} de Develop. Archivos de la web: ${paths.sort().join(", ")}.`;
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm;
}
