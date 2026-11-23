import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { files } from "@/db/schema";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
};

/**
 * Sirve la web que han generado los agentes para verla en un iframe.
 * El código lo ha escrito una IA, así que se trata como no fiable: la cabecera CSP `sandbox`
 * le quita el origen (sin cookies ni acceso a la API de la app) aunque se abra fuera del iframe.
 * No hay sesión aquí: el identificador de la ejecución es un UUID no adivinable.
 */
export async function GET(request: Request, ctx: RouteContext<"/preview/[runId]/[[...path]]">) {
  const { runId, path } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return new Response("No encontrado", { status: 404 });
  if (!path?.length) {
    return Response.redirect(new URL(`/preview/${runId}/index.html`, request.url), 307);
  }

  const filePath = path.join("/");
  const [file] = await getDb()
    .select({ content: files.content })
    .from(files)
    .where(and(eq(files.runId, runId), eq(files.path, filePath)));
  if (!file) return new Response("No encontrado", { status: 404 });

  const ext = filePath.split(".").pop() ?? "";
  return new Response(file.content, {
    headers: {
      "Content-Type": TYPES[ext] ?? "text/plain; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-modals",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
