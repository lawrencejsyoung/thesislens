import type { ConsensusEstimate, ConsensusProvider, MarketDataProvider, MarketQuote } from "./types";

/**
 * Free default MarketDataProvider (Decision D1).
 * Uses caller-supplied prices or an optional in-memory quote table until a paid feed
 * (FMP, EODHD, FactSet, LSEG) is plugged in.
 */
export class StaticMarketDataProvider implements MarketDataProvider {
  readonly id = "static-caller";
  private readonly quotes: Map<string, MarketQuote>;

  constructor(initialQuotes: MarketQuote[] = []) {
    this.quotes = new Map(initialQuotes.map((q) => [q.ticker.toUpperCase(), q]));
  }

  setQuote(quote: MarketQuote) {
    this.quotes.set(quote.ticker.toUpperCase(), quote);
  }

  async getQuote(
    ticker: string,
    opts?: { asOf?: string | null; fallbackPrice?: number | null; currency?: string }
  ): Promise<MarketQuote | null> {
    const key = ticker.toUpperCase();
    const existing = this.quotes.get(key);
    if (existing && (!opts?.asOf || existing.asOf <= opts.asOf)) {
      return existing;
    }
    if (typeof opts?.fallbackPrice === "number" && Number.isFinite(opts.fallbackPrice) && opts.fallbackPrice > 0) {
      return {
        ticker: key,
        price: opts.fallbackPrice,
        quoteCurrency: opts.currency ?? "USD",
        marketCapUsd: null,
        beta: null,
        adrRatio: 1,
        asOf: opts.asOf ?? new Date().toISOString().slice(0, 10),
        source: "caller-supplied",
      };
    }
    return null;
  }

  async getMarketCaps(tickers: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of tickers) {
      const q = this.quotes.get(t.toUpperCase());
      if (q && typeof q.marketCapUsd === "number") out[t.toUpperCase()] = q.marketCapUsd;
    }
    return out;
  }
}

/**
 * Free default ConsensusProvider (Decision D1).
 * Returns empty estimates until a paid consensus adapter (Visible Alpha, FactSet, LSEG, FMP) is configured.
 */
export class NullConsensusProvider implements ConsensusProvider {
  readonly id = "none";
  async getEstimates(): Promise<ConsensusEstimate[]> {
    return [];
  }
}
