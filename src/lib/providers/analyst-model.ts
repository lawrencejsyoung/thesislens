import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import type {
  AnalystGenerateRequest,
  AnalystGenerateResponse,
  AnalystModel,
  AnalystToolCall,
  AnalystUsage,
} from "./types";

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

/** Rough per-million token pricing for cost tracking (USD). */
const MODEL_PRICING: Record<string, { input: number; cached: number; output: number }> = {
  gemini: { input: 0.15, cached: 0.0375, output: 0.6 },
  claude: { input: 3.0, cached: 0.3, output: 15.0 },
  openai: { input: 2.0, cached: 0.5, output: 8.0 },
};

function estimateCostUsd(
  input: number,
  cached: number,
  output: number,
  provider: "gemini" | "claude" | "openai" = "gemini"
): number {
  const rates = MODEL_PRICING[provider] ?? MODEL_PRICING.gemini;
  const uncached = Math.max(0, input - cached);
  return (
    (uncached / 1_000_000) * rates.input +
    (cached / 1_000_000) * rates.cached +
    (output / 1_000_000) * rates.output
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
 * Anthropic Claude AnalystModel via native Messages API.
 * Supports prompt caching (`cache_control: ephemeral`), multi-turn tool use,
 * and enterprise ZDR base URL overrides (e.g., AWS Bedrock / VPC proxy).
 */
export class ClaudeAnalystModel implements AnalystModel {
  readonly providerId = "claude";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {}) {
    const key = opts.apiKey || process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      throw new Error("ClaudeAnalystModel requires ANTHROPIC_API_KEY or an explicit apiKey.");
    }
    this.apiKey = key;
    this.modelName = opts.model || DEFAULT_CLAUDE_MODEL;
    this.baseUrl = (opts.baseUrl || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(request: AnalystGenerateRequest): Promise<AnalystGenerateResponse> {
    const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [];
    for (const msg of request.messages) {
      if (msg.role === "system") continue;
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        const blocks: Array<Record<string, unknown>> = [];
        if (msg.content) blocks.push({ type: "text", text: msg.content });
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
          }
        }
        if (blocks.length > 0) messages.push({ role: "assistant", content: blocks });
      } else if (msg.role === "tool") {
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId || msg.toolName || "tool_call",
              content: msg.content,
            },
          ],
        });
      }
    }

    const tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: 4096,
      temperature: request.temperature ?? 0.2,
      system: [
        {
          type: "text",
          text: request.systemPrefix,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    };

    const resp = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Claude API error (${resp.status}): ${errText.slice(0, 300)}`);
    }

    const payload = (await resp.json()) as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
      model?: string;
    };

    const textParts: string[] = [];
    const toolCalls: AnalystToolCall[] = [];
    for (const block of payload.content ?? []) {
      if (block.type === "text" && block.text) textParts.push(block.text);
      if (block.type === "tool_use" && block.name) {
        toolCalls.push({
          id: block.id || `claude_call_${Date.now()}_${toolCalls.length}`,
          name: block.name,
          args: block.input ?? {},
        });
      }
    }

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    const cachedInputTokens = payload.usage?.cache_read_input_tokens ?? 0;

    return {
      text: textParts.join("\n"),
      toolCalls,
      model: payload.model || this.modelName,
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        estimatedCostUsd: estimateCostUsd(inputTokens, cachedInputTokens, outputTokens, "claude"),
      },
    };
  }
}

/**
 * OpenAI AnalystModel via Chat Completions API.
 * Supports tool calling, JSON structured output, and enterprise ZDR/Azure base URL overrides.
 */
export class OpenAIAnalystModel implements AnalystModel {
  readonly providerId = "openai";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {}) {
    const key = opts.apiKey || process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      throw new Error("OpenAIAnalystModel requires OPENAI_API_KEY or an explicit apiKey.");
    }
    this.apiKey = key;
    this.modelName = opts.model || DEFAULT_OPENAI_MODEL;
    this.baseUrl = (opts.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(request: AnalystGenerateRequest): Promise<AnalystGenerateResponse> {
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: request.systemPrefix },
    ];
    for (const msg of request.messages) {
      if (msg.role === "system") continue;
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        const entry: Record<string, unknown> = { role: "assistant", content: msg.content || null };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          entry.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          }));
        }
        messages.push(entry);
      } else if (msg.role === "tool") {
        messages.push({
          role: "tool",
          tool_call_id: msg.toolCallId || msg.toolName || "tool_call",
          content: msg.content,
        });
      }
    }

    const tools = request.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const body: Record<string, unknown> = {
      model: this.modelName,
      temperature: request.temperature ?? 0.2,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      ...(request.responseMimeType === "application/json" && tools.length === 0
        ? { response_format: { type: "json_object" } }
        : {}),
    };

    const resp = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`OpenAI API error (${resp.status}): ${errText.slice(0, 300)}`);
    }

    const payload = (await resp.json()) as {
      model?: string;
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };

    const msgOut = payload.choices?.[0]?.message;
    const toolCalls: AnalystToolCall[] = [];
    for (const tc of msgOut?.tool_calls ?? []) {
      const fnName = tc.function?.name;
      if (!fnName) continue;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function?.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }
      toolCalls.push({
        id: tc.id || `openai_call_${Date.now()}_${toolCalls.length}`,
        name: fnName,
        args: parsedArgs,
      });
    }

    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    const cachedInputTokens = payload.usage?.prompt_tokens_details?.cached_tokens ?? 0;

    return {
      text: msgOut?.content ?? "",
      toolCalls,
      model: payload.model || this.modelName,
      usage: {
        inputTokens,
        outputTokens,
        cachedInputTokens,
        estimatedCostUsd: estimateCostUsd(inputTokens, cachedInputTokens, outputTokens, "openai"),
      },
    };
  }
}

/**
 * Factory selecting the AnalystModel adapter via ANALYST_PROVIDER env var (Decision D4).
 * Supports Gemini, Claude, OpenAI, and Recorded mock models.
 */
export function createAnalystModel(opts: {
  provider?: AnalystProviderName;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
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

  if (provider === "claude") {
    return new ClaudeAnalystModel({
      apiKey: opts.apiKey,
      model: opts.model,
      baseUrl: opts.baseUrl,
      fetchImpl: opts.fetchImpl,
    });
  }

  if (provider === "openai") {
    return new OpenAIAnalystModel({
      apiKey: opts.apiKey,
      model: opts.model,
      baseUrl: opts.baseUrl,
      fetchImpl: opts.fetchImpl,
    });
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
