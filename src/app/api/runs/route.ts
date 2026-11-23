import { getSession } from "@/lib/auth";
import { createRun, listRuns, RunError } from "@/lib/runs";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "No autenticado" }, { status: 401 });
  return Response.json({ runs: await listRuns(session.userId) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "No autenticado" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { prompt?: unknown; fromRunId?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  const fromRunId = typeof body?.fromRunId === "string" ? body.fromRunId : undefined;

  try {
    const id = await createRun(session.userId, prompt, fromRunId);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof RunError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
