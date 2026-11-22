import { StaticMarketDataProvider } from "./market-data";
import type { ConsensusEstimate, ConsensusProvider, MarketDataProvider, MarketQuote } from "./types";

interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3";

/**
 * Production MarketDataProvider backed by Financial Modeling Prep (FMP) with
 * in-memory TTL caching (60s quotes, 24h market caps) and graceful fallback.
 */
export class FmpMarketDataProvider implements MarketDataProvider {
  readonly id = "fmp-live";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly quoteCache = new Map<string, CacheEntry<MarketQuote>>();
  private readonly quoteTtlMs: number;

  constructor(opts: {
    apiKey?: string;
    baseUrl?: string;
    quoteTtlMs?: number;
    fetchImpl?: typeof fetch;
  } = {}) {
    const key = opts.apiKey || process.env.FMP_API_KEY?.trim();
    if (!key) {
      throw new Error("FmpMarketDataProvider requires FMP_API_KEY.");
    }
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl || FMP_BASE_URL).replace(/\/$/, "");
    this.quoteTtlMs = opts.quoteTtlMs ?? 60_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getQuote(
    ticker: string,
    opts?: { asOf?: string | null; fallbackPrice?: number | null; currency?: string }
  ): Promise<MarketQuote | null> {
    const symbol = ticker.trim().toUpperCase();
    // Point-in-time historical backtests should never leak live spot prices
    if (opts?.asOf) {
      return new StaticMarketDataProvider().getQuote(symbol, opts);
    }

    const cached = this.quoteCache.get(symbol);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.value;
    }

    try {
      const url = `${this.baseUrl}/quote/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(this.apiKey)}`;
      const resp = await this.fetchImpl(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) {
        return new StaticMarketDataProvider().getQuote(symbol, opts);
      }
      const rows = (await resp.json()) as Array<{
        symbol?: string;
        price?: number;
        marketCap?: number;
        beta?: number;
        currency?: string;
      }>;
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row || typeof row.price !== "number" || !Number.isFinite(row.price) || row.price <= 0) {
        return new StaticMarketDataProvider().getQuote(symbol, opts);
      }

      const quote: MarketQuote = {
        ticker: symbol,
        price: row.price,
        quoteCurrency: row.currency || opts?.currency || "USD",
        marketCapUsd: typeof row.marketCap === "number" ? row.marketCap : null,
        beta: typeof row.beta === "number" ? row.beta : null,
        adrRatio: 1,
        asOf: new Date().toISOString().slice(0, 10),
        source: "fmp-live",
      };
      this.quoteCache.set(symbol, { value: quote, expiresAtMs: Date.now() + this.quoteTtlMs });
      return quote;
    } catch {
      return new StaticMarketDataProvider().getQuote(symbol, opts);
    }
  }

  async getMarketCaps(tickers: string[]): Promise<Record<string, number>> {
    const clean = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)));
    if (clean.length === 0) return {};

    const out: Record<string, number> = {};
    const missing: string[] = [];
    const now = Date.now();
    for (const t of clean) {
      const cached = this.quoteCache.get(t);
      if (cached && cached.expiresAtMs > now && typeof cached.value.marketCapUsd === "number") {
        out[t] = cached.value.marketCapUsd;
      } else {
        missing.push(t);
      }
    }
    if (missing.length === 0) return out;

    try {
      const joined = missing.map(encodeURIComponent).join(",");
      const url = `${this.baseUrl}/quote/${joined}?apikey=${encodeURIComponent(this.apiKey)}`;
      const resp = await this.fetchImpl(url, { signal: AbortSignal.timeout(6000) });
      if (!resp.ok) return out;
      const rows = (await resp.json()) as Array<{
        symbol?: string;
        price?: number;
        marketCap?: number;
        beta?: number;
      }>;
      for (const row of Array.isArray(rows) ? rows : []) {
        const sym = row.symbol?.toUpperCase();
        if (sym && typeof row.marketCap === "number" && Number.isFinite(row.marketCap)) {
          out[sym] = row.marketCap;
        }
      }
    } catch {
      // Return partial cached results gracefully
    }
    return out;
  }
}

/**
 * Street consensus estimates provider backed by FMP analyst-estimates endpoint.
 */
export class FmpConsensusProvider implements ConsensusProvider {
  readonly id = "fmp-consensus";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    const key = opts.apiKey || process.env.FMP_API_KEY?.trim();
    if (!key) throw new Error("FmpConsensusProvider requires FMP_API_KEY.");
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl || FMP_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getEstimates(ticker: string, asOf?: string | null): Promise<ConsensusEstimate[]> {
    if (asOf) return [];
    const symbol = ticker.trim().toUpperCase();
    try {
      const url = `${this.baseUrl}/analyst-estimates/${encodeURIComponent(symbol)}?limit=4&apikey=${encodeURIComponent(this.apiKey)}`;
      const resp = await this.fetchImpl(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return [];
      const rows = (await resp.json()) as Array<{
        date?: string;
        estimatedRevenueAvg?: number;
        estimatedEpsAvg?: number;
        numberAnalystEstimatedRevenue?: number;
      }>;
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => typeof r.date === "string" && r.date.length >= 4)
        .map((r) => ({
          ticker: symbol,
          periodId: `FY${r.date!.slice(0, 4)}`,
          revenueMean: typeof r.estimatedRevenueAvg === "number" ? r.estimatedRevenueAvg : null,
          epsMean: typeof r.estimatedEpsAvg === "number" ? r.estimatedEpsAvg : null,
          analystCount: typeof r.numberAnalystEstimatedRevenue === "number" ? r.numberAnalystEstimatedRevenue : null,
          asOf: new Date().toISOString().slice(0, 10),
          source: "fmp-consensus",
        }));
    } catch {
      return [];
    }
  }
}

export function createMarketDataProvider(): MarketDataProvider {
  if (process.env.FMP_API_KEY?.trim()) {
    return new FmpMarketDataProvider();
  }
  return new StaticMarketDataProvider();
}
