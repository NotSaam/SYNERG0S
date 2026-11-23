import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Assertion, TestReport } from "@/lib/types";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Una petición del usuario y todo el trabajo que desencadena. */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    /** queued → running → done | failed */
    status: text("status").notNull().default("queued"),
    /** Agente que tiene el turno ahora mismo (para pintarlo en pantalla). */
    activeAgent: text("active_agent"),
    activity: text("activity"),
    /** Cerrojo: solo una invocación avanza la ejecución a la vez. */
    lockUntil: timestamp("lock_until", { withTimezone: true }),
    /** Pausa por límite de cuota del proveedor de IA. */
    waitUntil: timestamp("wait_until", { withTimezone: true }),
    retries: integer("retries").notNull().default(0),
    error: text("error"),
    summary: text("summary"),
    llmCalls: integer("llm_calls").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    filesVersion: integer("files_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_user_idx").on(t.userId, t.createdAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    acceptance: jsonb("acceptance").$type<string[]>().notNull(),
    /** pending → developing → testing → (fixing → testing)* → passed | failed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** Tests de aceptación que escribe Testing la primera vez que ve el código. */
    tests: jsonb("tests").$type<Assertion[]>(),
    /** Último informe de Testing: es lo que recibe Develop para corregir. */
    report: jsonb("report").$type<TestReport>(),
    devSummary: text("dev_summary"),
    touchedFiles: jsonb("touched_files").$type<string[]>().notNull().default([]),
    reviewed: boolean("reviewed").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_run_idx").on(t.runId, t.position)],
);

/** Bitácora: cada cosa que hace un agente queda aquí y se pinta en pantalla. */
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    taskId: uuid("task_id"),
    /** orchestrator | develop | testing | system */
    agent: text("agent").notNull(),
    /** info | plan | handoff | dev | test_pass | test_fail | wait | error | done */
    kind: text("kind").notNull().default("info"),
    message: text("message").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_run_idx").on(t.runId, t.id)],
);

/** Espacio de trabajo virtual: los archivos de la web sobre la que trabajan los agentes. */
export const files = pgTable(
  "files",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    updatedBy: text("updated_by").notNull().default("base"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.path] })],
);

export type Run = typeof runs.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type FileRow = typeof files.$inferSelect;
