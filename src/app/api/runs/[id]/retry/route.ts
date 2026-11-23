import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { events, runs, tasks } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getOwnedRun } from "@/lib/runs";

/** Reanuda una ejecución que se detuvo por un error (p. ej. la IA no respondía). */
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[id]/retry">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const run = await getOwnedRun(id, session.userId);
  if (!run) return Response.json({ error: "No existe" }, { status: 404 });
  if (run.status !== "failed" || !run.error) {
    return Response.json({ error: "Esta ejecución no se puede reanudar." }, { status: 409 });
  }

  const db = getDb();
  const [anyTask] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.runId, id)).limit(1);
  await db
    .update(runs)
    .set({ status: anyTask ? "running" : "queued", error: null, retries: 0, finishedAt: null, waitUntil: null })
    .where(eq(runs.id, id));
  await db.insert(events).values({
    runId: id,
    agent: "system",
    kind: "info",
    message: "Ejecución reanudada desde el último paso guardado.",
  });
  return Response.json({ ok: true });
}
