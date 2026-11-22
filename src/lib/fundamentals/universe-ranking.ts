import { UNIVERSE, type UniverseEntry } from "./universe";
import type { MarketDataProvider } from "../providers/types";

export interface RankedUniverseEntry extends UniverseEntry {
  rank: number;
  marketCapUsd: number | null;
  source: "market-data-provider" | "seed-fallback";
}

/**
 * Phase 6: Dynamically ranks the covered universe by market capitalization from a MarketDataProvider
 * (falling back cleanly to the seed ordering when a live market-cap feed is unavailable).
 */
export async function rankUniverseByMarketCap(
  marketDataProvider: MarketDataProvider,
  opts: { candidates?: UniverseEntry[]; limit?: number; asOf?: string | null } = {}
): Promise<RankedUniverseEntry[]> {
  const candidates = opts.candidates ?? UNIVERSE;
  const limit = opts.limit ?? 500;
  const tickers = candidates.map((c) => c.ticker);

  let caps: Record<string, number> = {};
  if (marketDataProvider.getMarketCaps) {
    try {
      caps = await marketDataProvider.getMarketCaps(tickers, opts.asOf ?? null);
    } catch {
      caps = {};
    }
  }

  const enriched = candidates.map((c, idx) => {
    const cap = caps[c.ticker.toUpperCase()];
    const hasCap = typeof cap === "number" && Number.isFinite(cap) && cap > 0;
    return {
      ...c,
      seedIndex: idx,
      marketCapUsd: hasCap ? cap : null,
      source: hasCap ? ("market-data-provider" as const) : ("seed-fallback" as const),
    };
  });

  enriched.sort((a, b) => {
    if (a.marketCapUsd !== null && b.marketCapUsd !== null) return b.marketCapUsd - a.marketCapUsd;
    if (a.marketCapUsd !== null) return -1;
    if (b.marketCapUsd !== null) return 1;
    return a.seedIndex - b.seedIndex;
  });

  return enriched.slice(0, limit).map((item, i) => ({
    ticker: item.ticker,
    template: item.template,
    predecessorCiks: item.predecessorCiks,
    rank: i + 1,
    marketCapUsd: item.marketCapUsd,
    source: item.source,
  }));
}
