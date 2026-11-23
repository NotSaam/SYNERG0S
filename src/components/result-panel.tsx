"use client";

import { useEffect, useState } from "react";

interface SiteFile {
  path: string;
  content: string;
  updatedBy: string;
  change: "base" | "nuevo" | "modificado";
}

const CHANGE_CLS: Record<SiteFile["change"], string> = {
  base: "text-faint border-line",
  nuevo: "text-ok border-ok/40",
  modificado: "text-warn border-warn/40",
};

/** La web sobre la que trabajan los agentes: vista previa en vivo y código. */
export function ResultPanel({ runId, filesVersion }: { runId: string; filesVersion: number }) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${runId}/files`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { files: SiteFile[] } | null) => {
        if (!cancelled && body) setFiles(body.files);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runId, filesVersion]);

  const pages = files.filter((f) => f.path.endsWith(".html"));
  const [page, setPage] = useState("index.html");
  const current = files.find((f) => f.path === open) ?? files.find((f) => f.change !== "base") ?? files[0];
  const previewSrc = `/preview/${runId}/${page}?v=${filesVersion}`;

  const tabCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors ${
      active ? "bg-accent/15 text-accent" : "text-muted hover:text-ink"
    }`;

  return (
    <section className="hud overflow-hidden" aria-label="Web resultante">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="label">La web</h2>
          <p className="mt-0.5 text-xs text-faint">
            Se actualiza cada vez que Develop entrega. Versión {filesVersion}.
          </p>
        </div>
        <div className="flex items-center gap-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={tabCls(tab === "preview")}>
            Vista previa
          </button>
          <button type="button" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")} className={tabCls(tab === "code")}>
            Archivos ({files.length})
          </button>
        </div>
      </header>

      {tab === "preview" ? (
        <div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-night/60 px-4 py-2">
            {pages.map((p) => (
              <button
                key={p.path}
                type="button"
                onClick={() => setPage(p.path)}
                className={`rounded border px-2 py-0.5 font-mono text-xs ${
                  page === p.path ? "border-accent/50 text-accent" : "border-line text-muted hover:text-ink"
                }`}
              >
                {p.path}
              </button>
            ))}
            <a
              href={previewSrc}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs text-muted underline-offset-2 hover:text-accent hover:underline"
            >
              Abrir en otra pestaña ↗
            </a>
          </div>
          {/* Código generado por IA: sandbox sin same-origin, no puede tocar la sesión de la app. */}
          <iframe
            key={previewSrc}
            src={previewSrc}
            title="Vista previa de la web generada"
            sandbox="allow-scripts allow-forms allow-modals"
            className="h-[34rem] w-full bg-white"
          />
        </div>
      ) : (
        <div className="grid md:grid-cols-[14rem_minmax(0,1fr)]">
          <ul className="border-b border-line p-2 md:border-b-0 md:border-r">
            {files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => setOpen(file.path)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left font-mono text-xs ${
                    current?.path === file.path ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  <span className="truncate">{file.path}</span>
                  {file.change !== "base" && (
                    <span className={`shrink-0 rounded border px-1 text-[0.6rem] uppercase ${CHANGE_CLS[file.change]}`}>
                      {file.change}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">
            {current && (
              <>
                <p className="border-b border-line px-4 py-2 font-mono text-xs text-faint">
                  {current.path}
                  {current.change !== "base" && ` · ${current.change} por Develop (${current.updatedBy})`}
                </p>
                <pre className="max-h-[32rem] overflow-auto p-4 font-mono text-xs leading-relaxed text-ink/90">
                  <code>{current.content}</code>
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
