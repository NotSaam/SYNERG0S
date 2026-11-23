import { advance } from "@/lib/agents/engine";
import { getSession } from "@/lib/auth";
import { getOwnedRun } from "@/lib/runs";

// Un paso = un turno de un agente (una o dos llamadas a la IA). Cabe de sobra en una función.
export const maxDuration = 120;

export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[id]/step">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const run = await getOwnedRun(id, session.userId);
  if (!run) return Response.json({ error: "No existe" }, { status: 404 });

  return Response.json(await advance(id));
}
