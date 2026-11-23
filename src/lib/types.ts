export type AgentId = "orchestrator" | "develop" | "testing";

export type RunStatus = "queued" | "running" | "done" | "failed";

export type TaskStatus =
  | "pending"
  | "developing"
  | "testing"
  | "fixing"
  | "passed"
  | "failed";

export const ASSERTION_TYPES = [
  "file_exists",
  "file_contains",
  "exists",
  "not_exists",
  "count_gte",
  "text_contains",
  "attr_equals",
  "attr_present",
] as const;

export type AssertionType = (typeof ASSERTION_TYPES)[number];

/** Un test de aceptación ejecutable contra los archivos de la web. */
export interface Assertion {
  /** Criterio de aceptación que verifica. */
  criterion: string;
  description: string;
  type: AssertionType;
  file: string;
  selector?: string;
  attr?: string;
  value?: string;
}

export interface CheckResult {
  /** static = suite base · acceptance = tests de la tarea · regression = tests de tareas ya aprobadas */
  suite: "static" | "acceptance" | "regression";
  name: string;
  ok: boolean;
  /** Qué se esperaba y qué se encontró. Es lo que lee Develop para corregir. */
  detail?: string;
  file?: string;
}

export interface ReviewIssue {
  severity: "bloqueante" | "menor";
  file: string;
  problem: string;
  fix: string;
}

export interface TestReport {
  attempt: number;
  passed: number;
  failed: number;
  results: CheckResult[];
  review?: { approved: boolean; issues: ReviewIssue[] };
  verdict: "pass" | "fail";
}

/** Lo que devuelve la API al navegador en cada sondeo. */
export interface RunSnapshot {
  run: {
    id: string;
    prompt: string;
    status: RunStatus;
    activeAgent: AgentId | null;
    activity: string | null;
    waitUntil: string | null;
    error: string | null;
    summary: string | null;
    llmCalls: number;
    tokensIn: number;
    tokensOut: number;
    filesVersion: number;
    createdAt: string;
    finishedAt: string | null;
  };
  tasks: {
    id: string;
    position: number;
    title: string;
    description: string;
    acceptance: string[];
    status: TaskStatus;
    attempts: number;
    tests: Assertion[] | null;
    report: TestReport | null;
    devSummary: string | null;
    touchedFiles: string[];
  }[];
  events: {
    id: number;
    taskId: string | null;
    agent: AgentId | "system";
    kind: string;
    message: string;
    detail: Record<string, unknown> | null;
    createdAt: string;
  }[];
}
