"use client";

import { useEffect, useRef } from "react";
import type { RunSnapshot } from "@/lib/types";
import { AGENTS } from "./ui";

type Event = RunSnapshot["events"][number];
type Task = RunSnapshot["tasks"][number];

const KIND_MARK: Record<string, { mark: string; cls: string }> = {
  test_pass: { mark: "✓", cls: "text-ok" },
  test_fail: { mark: "✗", cls: "text-bad" },
  error: { mark: "!", cls: "text-bad" },
  wait: { mark: "…", cls: "text-warn" },
  done: { mark: "■", cls: "text-violet" },
};

/** Bitácora: todo lo que dice y hace cada agente, en orden. */
export function ActivityLog({ events, tasks, live }: { events: Event[]; tasks: Task[]; live: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const position = new Map(tasks.map((t) => [t.id, t.position]));

  return (
    <section className="hud flex max-h-[34rem] flex-col" aria-label="Bitácora de actividad">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="label">Bitácora</h2>
        {live && (
          <span className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-accent">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" /> en directo
          </span>
        )}
      </header>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-48 flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {events.map((event) => {
          const agent = event.agent === "system" ? null : AGENTS[event.agent];
          const mark = KIND_MARK[event.kind];
          const taskNumber = event.taskId ? position.get(event.taskId) : undefined;
          return (
            <div key={event.id} className="rise text-sm">
              <div className="flex items-baseline gap-2 font-mono text-[0.68rem] uppercase tracking-wider">
                <time className="tabular-nums text-faint">
                  {new Date(event.createdAt).toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
                <span className={agent ? agent.text : "text-muted"}>{agent ? agent.name : "Sistema"}</span>
                {taskNumber && <span className="text-faint">T{taskNumber}</span>}
                {mark && <span className={`ml-auto text-sm leading-none ${mark.cls}`}>{mark.mark}</span>}
              </div>
              <p
                className={`mt-0.5 leading-snug ${
                  event.kind === "test_fail" || event.kind === "error" ? "text-ink" : "text-ink/85"
                }`}
              >
                {event.message}
              </p>
            </div>
          );
        })}
        {!events.length && <p className="text-sm text-faint">Sin actividad todavía.</p>}
      </div>
    </section>
  );
}
