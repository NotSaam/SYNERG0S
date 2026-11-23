"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Formulario de petición. Con `fromRunId` la petición se aplica sobre la web de esa ejecución. */
export function NewRunForm({ examples, fromRunId }: { examples: string[]; fromRunId?: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, fromRunId }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (res.ok && body?.id) {
        router.push(`/runs/${body.id}`);
        return;
      }
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(body?.error ?? "No se ha podido crear la petición.");
    } catch {
      setError("No hay conexión con el servidor.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor="prompt" className="label">
        {fromRunId ? "Siguiente petición sobre esta web" : "Petición para el equipo"}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <textarea
          id="prompt"
          name="prompt"
          required
          minLength={8}
          maxLength={400}
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          placeholder="Por ejemplo: añade una página de contacto a esta web"
          className="min-h-[3.25rem] flex-1 resize-y rounded-md border border-line bg-night px-3.5 py-3 text-[0.95rem] text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-accent px-5 py-3 text-sm font-semibold text-night transition hover:brightness-110 disabled:opacity-60 sm:self-stretch"
        >
          {pending ? "Enviando…" : "Enviar al equipo"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setPrompt(example)}
            className="rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            {example}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
