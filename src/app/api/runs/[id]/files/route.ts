import { getSession } from "@/lib/auth";
import { getFiles, getOwnedRun } from "@/lib/runs";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/files">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const run = await getOwnedRun(id, session.userId);
  if (!run) return Response.json({ error: "No existe" }, { status: 404 });
  return Response.json({ files: await getFiles(id) }, { headers: { "Cache-Control": "no-store" } });
}
