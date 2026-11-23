import Link from "next/link";
import type { AgentId, RunStatus } from "@/lib/types";
import { LogoutButton } from "./logout-button";

export const AGENTS: Record<
  AgentId,
  { name: string; role: string; color: string; text: string; border: string; bg: string }
> = {
  orchestrator: {
    name: "Orquestador",
    role: "Recibe la petición, la divide en tareas y decide a quién le toca cada una.",
    color: "#8b5cf6",
    text: "text-violet",
    border: "border-violet/50",
    bg: "bg-violet/10",
  },
  develop: {
    name: "Develop",
    role: "Escribe el código de cada tarea y corrige lo que Testing le devuelve.",
    color: "#2dd4bf",
    text: "text-accent",
    border: "border-accent/50",
    bg: "bg-accent/10",
  },
  testing: {
    name: "Testing",
    role: "Escribe y ejecuta las pruebas de cada tarea y devuelve lo que falla.",
    color: "#38bdf8",
    text: "text-blue-neon",
    border: "border-blue-neon/50",
    bg: "bg-blue-neon/10",
  },
};

export function AgentGlyph({ agent, className }: { agent: AgentId; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  if (agent === "orchestrator") {
    return (
      <svg {...common}>
        <circle cx="12" cy="5" r="2.2" />
        <circle cx="5" cy="19" r="2.2" />
        <circle cx="19" cy="19" r="2.2" />
        <path d="M12 7.2v4.3M12 11.5 5.8 17M12 11.5l6.2 5.5" />
      </svg>
    );
  }
  if (agent === "develop") {
    return (
      <svg {...common}>
        <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-wide">
      <span className="grid h-7 w-7 place-items-center rounded-md border border-accent/40 bg-accent/10 text-accent">
        <AgentGlyph agent="orchestrator" className="h-4 w-4" />
      </span>
      <span>
        SYNERG<span className="text-accent">0</span>S
      </span>
    </Link>
  );
}

export function TopBar({ withLogout = true }: { withLogout?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-night/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-4">
          <span className="label hidden sm:inline">Equipo de 3 agentes de IA</span>
          {withLogout && <LogoutButton />}
        </div>
      </div>
    </header>
  );
}

const RUN_STATUS: Record<RunStatus, { label: string; cls: string; live: boolean }> = {
  queued: { label: "En cola", cls: "border-line-bright text-muted", live: true },
  running: { label: "En curso", cls: "border-accent/50 text-accent bg-accent/10", live: true },
  done: { label: "Completada", cls: "border-ok/50 text-ok bg-ok/10", live: false },
  failed: { label: "Con incidencias", cls: "border-bad/50 text-bad bg-bad/10", live: false },
};

export function RunStatusChip({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-widest ${s.cls}`}
    >
      {s.live && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
      {s.label}
    </span>
  );
}
