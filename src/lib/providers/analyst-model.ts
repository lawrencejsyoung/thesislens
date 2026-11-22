import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import type {
  AnalystGenerateRequest,
  AnalystGenerateResponse,
  AnalystModel,
  AnalystToolCall,
  AnalystUsage,
} from "./types";

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** Rough per-million token pricing for Gemini 2.5 Flash cost tracking (USD). */
const INPUT_COST_PER_M = 0.15;
const CACHED_INPUT_COST_PER_M = 0.0375;
const OUTPUT_COST_PER_M = 0.6;

function estimateCostUsd(input: number, cached: number, output: number): number {
  const uncached = Math.max(0, input - cached);
  return (
    (uncached / 1_000_000) * INPUT_COST_PER_M +
    (cached / 1_000_000) * CACHED_INPUT_COST_PER_M +
    (output / 1_000_000) * OUTPUT_COST_PER_M
  );
}

/**
 * Default AnalystModel backed by Google Gemini (@google/genai, Decision D4).
 * Uses systemInstruction as a shared cacheable prompt prefix (Phase 3d cost control)
 * and supports multi-turn tool calls + JSON structured output.
 */
export class GeminiAnalystModel implements AnalystModel {
  readonly providerId = "gemini";
  readonly modelName: string;
  private readonly ai: GoogleGenAI;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    const key = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GeminiAnalystModel requires GEMINI_API_KEY or an explicit apiKey.");
    }
    this.modelName = opts.model || DEFAULT_GEMINI_MODEL;
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  async generate(request: AnalystGenerateRequest): Promise<AnalystGenerateResponse> {
    const contents: Content[] = [];
    for (const msg of request.messages) {
      if (msg.role === "system") continue;
      if (msg.role === "user") {
        contents.push({ role: "user", parts: [{ text: msg.content }] });
      } else if (msg.role === "assistant") {
        const parts: Part[] = [];
        if (msg.content) parts.push({ text: msg.content });
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({ functionCall: { name: tc.name, args: tc.args } });
          }
        }
        if (parts.length > 0) contents.push({ role: "model", parts });
      } else if (msg.role === "tool") {
        let parsedResp: Record<string, unknown>;
        try {
          parsedResp = JSON.parse(msg.content) as Record<string, unknown>;
        } catch {
          parsedResp = { result: msg.content };
        }
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.toolName || "tool",
                response: parsedResp,
              },
            },
          ],
        });
      }
    }

    const functionDeclarations: FunctionDeclaration[] = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as FunctionDeclaration["parameters"],
    }));

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction: request.systemPrefix,
        temperature: request.temperature ?? 0.2,
        ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
        ...(request.responseMimeType && functionDeclarations.length === 0
          ? { responseMimeType: request.responseMimeType }
          : {}),
      },
    });

    const toolCalls: AnalystToolCall[] = [];
    const fnCalls = response.functionCalls ?? [];
    for (let i = 0; i < fnCalls.length; i++) {
      const fc = fnCalls[i];
      if (!fc.name) continue;
      toolCalls.push({
        id: fc.id || `call_${Date.now()}_${i}`,
        name: fc.name,
        args: (fc.args ?? {}) as Record<string, unknown>,
      });
    }

    const meta = response.usageMetadata;
    const inputTokens = meta?.promptTokenCount ?? 0;
    const outputTokens = meta?.candidatesTokenCount ?? 0;
    const cachedInputTokens = meta?.cachedContentTokenCount ?? 0;

    return {
      text: response.text ?? "",
      toolCalls,
      model: this.modelName,
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        estimatedCostUsd: estimateCostUsd(inputTokens, cachedInputTokens, outputTokens),
      },
    };
  }
}

/**
 * Deterministic recorded/scripted AnalystModel for offline CI tests (verify:analyst)
 * and backtests without requiring an API key.
 */
export class RecordedAnalystModel implements AnalystModel {
  readonly providerId = "recorded-mock";
  readonly modelName: string;
  private callIndex = 0;

  constructor(
    private readonly handler:
      | AnalystGenerateResponse[]
      | ((request: AnalystGenerateRequest, turn: number) => AnalystGenerateResponse | Promise<AnalystGenerateResponse>),
    modelName = "recorded-analyst-v1"
  ) {
    this.modelName = modelName;
  }

  async generate(request: AnalystGenerateRequest): Promise<AnalystGenerateResponse> {
    const turn = this.callIndex++;
    if (Array.isArray(this.handler)) {
      const resp = this.handler[Math.min(turn, this.handler.length - 1)];
      if (!resp) throw new Error("RecordedAnalystModel: no recorded response for turn " + turn);
      return resp;
    }
    return this.handler(request, turn);
  }
}

export type AnalystProviderName = "gemini" | "claude" | "openai" | "recorded";

/**
 * Factory selecting the AnalystModel adapter via ANALYST_PROVIDER env var (Decision D4).
 * Defaults to Gemini.
 */
export function createAnalystModel(opts: {
  provider?: AnalystProviderName;
  apiKey?: string;
  model?: string;
  recordedHandler?: ConstructorParameters<typeof RecordedAnalystModel>[0];
} = {}): AnalystModel {
  const provider = (opts.provider ?? (process.env.ANALYST_PROVIDER as AnalystProviderName | undefined) ?? "gemini").toLowerCase();

  if (provider === "recorded") {
    if (!opts.recordedHandler) {
      throw new Error("RecordedAnalystModel requires a recordedHandler.");
    }
    return new RecordedAnalystModel(opts.recordedHandler, opts.model);
  }

  if (provider === "gemini") {
    return new GeminiAnalystModel({ apiKey: opts.apiKey, model: opts.model });
  }

  if (provider === "claude" || provider === "openai") {
    throw new Error(
      `Analyst provider "${provider}" is a pluggable adapter slot (Decision D4). Configure its SDK adapter or set ANALYST_PROVIDER=gemini.`
    );
  }

  throw new Error(`Unknown ANALYST_PROVIDER "${provider}". Supported: gemini, claude, openai, recorded.`);
}

export function emptyUsage(): AnalystUsage {
  return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, estimatedCostUsd: 0 };
}

export function addUsage(a: AnalystUsage, b: AnalystUsage): AnalystUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    estimatedCostUsd: Number((a.estimatedCostUsd + b.estimatedCostUsd).toFixed(6)),
  };
}
