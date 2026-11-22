import type { CompanyFundamentals } from "../fundamentals/types";
import type { FundamentalsOptions } from "../fundamentals";

/**
 * Provider interfaces (Decisions D1 & D4).
 *
 * Every external data feed and LLM backend sits behind an interface with a free/default
 * implementation so paid vendors (FMP, EODHD, FactSet, LSEG, Visible Alpha) or alternative
 * LLMs (Claude, OpenAI) plug in as adapters without rewriting downstream code.
 */

export interface FundamentalsProvider {
  readonly id: string;
  /** Whether this provider can serve the given ticker (e.g. US SEC vs EU ESEF vs JP EDINET). */
  supports(ticker: string): boolean;
  getFundamentals(ticker: string, opts?: FundamentalsOptions): Promise<CompanyFundamentals>;
}

export interface RatesSnapshot {
  /** Risk-free rate as a decimal (e.g. 0.0425 = 4.25%). */
  riskFreeRate: number;
  /** Equity risk premium as a decimal (e.g. 0.045 = 4.50%). */
  equityRiskPremium: number;
  /** Effective observation date (YYYY-MM-DD), <= requested asOf when point-in-time. */
  asOf: string;
  /** Provenance strings for auditability. */
  riskFreeSource: string;
  erpSource: string;
}

export interface RatesProvider {
  readonly id: string;
  getRates(asOf?: string | null): Promise<RatesSnapshot>;
}

export interface MarketQuote {
  ticker: string;
  /** Price per listed share in quoteCurrency. */
  price: number;
  quoteCurrency: string;
  /** Market capitalization in USD (when known). */
  marketCapUsd: number | null;
  /** Regression equity beta (when known). */
  beta: number | null;
  /** Ordinary shares represented by one listed share (e.g. 5 for TSM ADR). */
  adrRatio: number;
  asOf: string;
  source: string;
}

export interface MarketDataProvider {
  readonly id: string;
  getQuote(ticker: string, opts?: { asOf?: string | null; fallbackPrice?: number | null; currency?: string }): Promise<MarketQuote | null>;
  getMarketCaps?(tickers: string[], asOf?: string | null): Promise<Record<string, number>>;
}

export interface ConsensusEstimate {
  ticker: string;
  periodId: string;
  revenueMean: number | null;
  epsMean: number | null;
  analystCount: number | null;
  asOf: string;
  source: string;
}

export interface ConsensusProvider {
  readonly id: string;
  getEstimates(ticker: string, asOf?: string | null): Promise<ConsensusEstimate[]>;
}

// ── Analyst LLM interface (D4) ──

export interface AnalystToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AnalystToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AnalystMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: AnalystToolCall[];
  toolCallId?: string;
  toolName?: string;
}

export interface AnalystGenerateRequest {
  /** Shared cacheable prefix (sector instructions, schema, worked examples). */
  systemPrefix: string;
  messages: AnalystMessage[];
  tools: AnalystToolDeclaration[];
  /** Optional JSON schema hint for final structured output. */
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
}

export interface AnalystUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number;
}

export interface AnalystGenerateResponse {
  text: string;
  toolCalls: AnalystToolCall[];
  usage: AnalystUsage;
  model: string;
}

export interface AnalystModel {
  readonly providerId: string;
  readonly modelName: string;
  generate(request: AnalystGenerateRequest): Promise<AnalystGenerateResponse>;
}
