import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText, Output, RetryError, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * Proveedor de IA configurable por variables de entorno (nunca en el repo):
 *
 *  - LLM_API_KEY + LLM_BASE_URL + LLM_MODEL → cualquier API compatible con OpenAI
 *    con plan gratuito (Groq, Cerebras, Mistral, Gemini, OpenRouter…).
 *  - Si no hay LLM_API_KEY → Vercel AI Gateway (AI_GATEWAY_MODEL, autenticado por OIDC).
 */
function resolveModel(): { model: LanguageModel; label: string } {
  const apiKey = process.env.LLM_API_KEY;
  if (apiKey) {
    const baseURL = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
    const modelId = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";
    const provider = createOpenAICompatible({
      name: "llm",
      apiKey,
      baseURL,
      supportsStructuredOutputs: process.env.LLM_STRUCTURED_OUTPUTS === "true",
    });
    return { model: provider(modelId), label: modelId };
  }
  const gatewayModel = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-oss-120b";
  return { model: gatewayModel, label: gatewayModel };
}

export function modelLabel(): string {
  return resolveModel().label;
}

export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super("Límite de cuota del proveedor de IA");
  }
}

export interface AgentCall<T> {
  output: T;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Una llamada a un agente: prompt de sistema (su rol) + entrada → objeto validado con Zod.
 * Si el modelo devuelve algo que no encaja con el esquema, el SDK lanza y el motor reintenta.
 */
export async function callAgent<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<AgentCall<T>> {
  const { model } = resolveModel();
  try {
    const result = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
      maxOutputTokens: opts.maxOutputTokens ?? 4000,
      temperature: opts.temperature ?? 0.2,
      maxRetries: 1,
    });
    return {
      output: result.output as T,
      tokensIn: result.usage.inputTokens ?? 0,
      tokensOut: result.usage.outputTokens ?? 0,
    };
  } catch (err) {
    const rate = asRateLimit(err);
    if (rate) throw rate;
    throw err;
  }
}

function asRateLimit(err: unknown): RateLimitError | null {
  const cause = RetryError.isInstance(err) ? err.lastError : err;
  if (!APICallError.isInstance(cause)) return null;
  if (cause.statusCode !== 429) return null;
  const header = cause.responseHeaders?.["retry-after"];
  const seconds = header ? Number.parseFloat(header) : Number.NaN;
  const ms = Number.isFinite(seconds) ? seconds * 1000 : 20_000;
  return new RateLimitError(Math.min(Math.max(ms, 3_000), 90_000));
}
