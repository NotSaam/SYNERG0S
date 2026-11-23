import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText, Output, RetryError, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * Proveedor de IA configurable por variables de entorno (nunca en el repo):
 *
 *  - LLM_API_KEY + LLM_BASE_URL + LLM_MODEL → cualquier API compatible con OpenAI
 *    con plan gratuito (Groq, Cerebras, Mistral, Gemini, OpenRouter…).
 *    LLM_MODEL puede ser una lista separada por comas (principal y reservas).
 *  - LLM_FALLBACK_API_KEY + LLM_FALLBACK_BASE_URL + LLM_FALLBACK_MODEL → segundo proveedor opcional.
 *  - Si no hay LLM_API_KEY → Vercel AI Gateway (AI_GATEWAY_MODEL, autenticado por OIDC).
 */
interface Candidate {
  model: LanguageModel;
  label: string;
}

function fromEnv(prefix: "LLM" | "LLM_FALLBACK"): Candidate[] {
  const apiKey = process.env[`${prefix}_API_KEY`];
  if (!apiKey) return [];
  const baseURL = process.env[`${prefix}_BASE_URL`] ?? "https://api.groq.com/openai/v1";
  const ids = (process.env[`${prefix}_MODEL`] ?? "openai/gpt-oss-120b")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const provider = createOpenAICompatible({
    name: prefix.toLowerCase(),
    apiKey,
    baseURL,
    supportsStructuredOutputs: process.env[`${prefix}_STRUCTURED_OUTPUTS`] === "true",
  });
  return ids.map((id) => ({ model: provider(id), label: id }));
}

/**
 * Modelos a probar, en orden. LLM_MODEL admite varios separados por comas (principal y reservas)
 * y LLM_FALLBACK_* añade, opcionalmente, un segundo proveedor por si el primero está caído.
 */
function resolveModels(): Candidate[] {
  const configured = [...fromEnv("LLM"), ...fromEnv("LLM_FALLBACK")];
  if (configured.length > 0) return configured;
  const gatewayModel = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-oss-120b";
  return [{ model: gatewayModel, label: gatewayModel }];
}

export function modelLabel(): string {
  return resolveModels()[0].label;
}

/** El proveedor no puede atender ahora (cuota agotada o saturado): el motor espera y reintenta. */
export class ProviderBusyError extends Error {
  constructor(
    public reason: "quota" | "overloaded",
    public retryAfterMs: number,
  ) {
    super(reason === "quota" ? "Límite de cuota del proveedor de IA" : "Proveedor de IA saturado");
  }
}

export interface AgentCall<T> {
  output: T;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

/** Tiempo máximo por intento: un modelo gratuito saturado puede tardar más de un minuto en contestar. */
const CALL_TIMEOUT_MS = 45_000;
/** Margen total de una llamada, por debajo del límite de la función que ejecuta el paso. */
const CALL_BUDGET_MS = 100_000;

/**
 * Una llamada a un agente: prompt de sistema (su rol) + entrada → objeto validado con Zod.
 * Si el modelo principal está saturado o sin cuota se prueba con los de reserva; si ninguno
 * responde se lanza ProviderBusyError y el motor pausa la ejecución. Si el modelo devuelve algo
 * que no encaja con el esquema, el SDK lanza y el motor reintenta el paso.
 */
export async function callAgent<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<AgentCall<T>> {
  const candidates = resolveModels();
  const startedAt = Date.now();
  let busy: ProviderBusyError | null = null;

  for (const candidate of candidates) {
    const left = CALL_BUDGET_MS - (Date.now() - startedAt);
    if (left < 10_000) break;
    const attemptAt = Date.now();
    try {
      const result = await generateText({
        model: candidate.model,
        system: opts.system,
        prompt: opts.prompt,
        output: Output.object({ schema: opts.schema }),
        maxOutputTokens: opts.maxOutputTokens ?? 4000,
        temperature: opts.temperature ?? 0.2,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, left)),
      });
      return {
        output: result.output as T,
        tokensIn: result.usage.inputTokens ?? 0,
        tokensOut: result.usage.outputTokens ?? 0,
        model: candidate.label,
      };
    } catch (err) {
      const asBusy = toBusy(err);
      console.warn(
        `[llm] ${candidate.label} falló en ${Date.now() - attemptAt} ms: ${describe(err)}`,
      );
      if (!asBusy) throw err;
      // De varios motivos se conserva «saturado»: es el que se resuelve antes.
      if (!busy || asBusy.reason === "overloaded") busy = asBusy;
    }
  }
  throw busy ?? new ProviderBusyError("overloaded", 5_000);
}

function toBusy(err: unknown): ProviderBusyError | null {
  const cause = RetryError.isInstance(err) ? err.lastError : err;
  if (isTimeout(cause)) return new ProviderBusyError("overloaded", 5_000);
  if (!APICallError.isInstance(cause)) return null;
  const status = cause.statusCode ?? 0;
  if (status === 429) {
    const header = cause.responseHeaders?.["retry-after"];
    const seconds = header ? Number.parseFloat(header) : Number.NaN;
    const ms = Number.isFinite(seconds) ? seconds * 1000 : 20_000;
    return new ProviderBusyError("quota", Math.min(Math.max(ms, 3_000), 90_000));
  }
  if (status >= 500) return new ProviderBusyError("overloaded", 5_000);
  return null;
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

function describe(err: unknown): string {
  const cause = RetryError.isInstance(err) ? err.lastError : err;
  if (isTimeout(cause)) return "tiempo de espera agotado";
  if (APICallError.isInstance(cause)) return `HTTP ${cause.statusCode ?? "?"}`;
  return err instanceof Error ? err.name : "error desconocido";
}
