import { getSession } from "@/lib/auth";
import { getSnapshot } from "@/lib/runs";

/** Estado de la ejecución. El navegador lo sondea; `after` trae solo los eventos nuevos. */
export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const after = Number.parseInt(new URL(request.url).searchParams.get("after") ?? "0", 10) || 0;
  const snapshot = await getSnapshot(id, session.userId, after);
  if (!snapshot) return Response.json({ error: "No existe" }, { status: 404 });
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
