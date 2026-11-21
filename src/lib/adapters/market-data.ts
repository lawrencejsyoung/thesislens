import { LiveMarketQuote } from "../types";

const CURATED_SYNTHETIC_MARKETS: LiveMarketQuote[] = [
  {
    id: "syn-copper-15k",
    venue: "Polymarket",
    question: "Will LME Copper exceed $15,000/metric ton before Dec 31, 2027?",
    yesPriceCents: 38,
    noPriceCents: 64,
    volumeUsd: 4_820_000,
    liquidityUsd: 640_000,
    endDate: "2027-12-31",
    url: "https://polymarket.com",
    live: false,
  },
  {
    id: "syn-fed-cuts",
    venue: "Kalshi",
    question: "Will the Federal Reserve cut rates at least 75 bps in the next 12 months?",
    yesPriceCents: 44,
    noPriceCents: 58,
    volumeUsd: 12_400_000,
    liquidityUsd: 1_900_000,
    endDate: "2027-11-30",
    url: "https://kalshi.com",
    live: false,
  },
  {
    id: "syn-boc-rate",
    venue: "Polymarket",
    question: "Will Bank of Canada overnight rate fall below 2.50% before Q4?",
    yesPriceCents: 52,
    noPriceCents: 50,
    volumeUsd: 2_150_000,
    liquidityUsd: 380_000,
    endDate: "2027-09-30",
    url: "https://polymarket.com",
    live: false,
  },
  {
    id: "syn-ai-open-model",
    venue: "Polymarket",
    question: "Will an open-weight AI model hold #1 overall on LMArena before year-end?",
    yesPriceCents: 34,
    noPriceCents: 68,
    volumeUsd: 8_910_000,
    liquidityUsd: 1_120_000,
    endDate: "2027-12-31",
    url: "https://polymarket.com",
    live: false,
  },
  {
    id: "syn-uranium-120",
    venue: "Kalshi",
    question: "Will Uranium spot price surpass $120/lb before 2028?",
    yesPriceCents: 41,
    noPriceCents: 61,
    volumeUsd: 3_450_000,
    liquidityUsd: 510_000,
    endDate: "2027-12-31",
    url: "https://kalshi.com",
    live: false,
  },
  {
    id: "syn-us-recession",
    venue: "Kalshi",
    question: "Will NBER declare a US recession starting before 2028?",
    yesPriceCents: 29,
    noPriceCents: 73,
    volumeUsd: 18_700_000,
    liquidityUsd: 2_600_000,
    endDate: "2027-12-31",
    url: "https://kalshi.com",
    live: false,
  },
];

async function fetchWithTimeout(url: string, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(id);
  }
}

async function queryPolymarket(query: string): Promise<LiveMarketQuote[]> {
  try {
    const url = `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=40&order=volume24hr&ascending=false`;
    const resp = await fetchWithTimeout(url, 3200);
    if (!resp.ok) return [];
    const data = (await resp.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data)) return [];

    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const parsed: LiveMarketQuote[] = [];
    for (const m of data) {
      const question = String(m.question || m.title || "").trim();
      if (!question) continue;
      if (
        tokens.length > 0 &&
        !tokens.some((tok) => question.toLowerCase().includes(tok))
      ) {
        continue;
      }

      let yesPrice = 50;
      let noPrice = 50;
      try {
        const rawPrices =
          typeof m.outcomePrices === "string"
            ? JSON.parse(m.outcomePrices)
            : m.outcomePrices;
        if (Array.isArray(rawPrices) && rawPrices.length >= 2) {
          yesPrice = Math.min(99, Math.max(1, Math.round(Number(rawPrices[0]) * 100)));
          noPrice = Math.min(99, Math.max(1, Math.round(Number(rawPrices[1]) * 100)));
        }
      } catch {
        // default 50/50
      }

      const slug = String(m.slug || "");
      parsed.push({
        id: `poly-${String(m.id || slug || Math.random())}`,
        venue: "Polymarket",
        question,
        yesPriceCents: yesPrice,
        noPriceCents: noPrice,
        volumeUsd: Math.round(Number(m.volumeNum || m.volume || 0)),
        liquidityUsd: Math.round(Number(m.liquidityNum || m.liquidity || 0)),
        endDate: String(m.endDate || "2027-12-31").slice(0, 10),
        url: slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com",
        live: true,
      });

      if (parsed.length >= 6) break;
    }
    return parsed;
  } catch {
    return [];
  }
}

async function queryKalshi(query: string): Promise<LiveMarketQuote[]> {
  try {
    const url = `https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=40`;
    const resp = await fetchWithTimeout(url, 3200);
    if (!resp.ok) return [];
    const json = (await resp.json()) as { markets?: Array<Record<string, unknown>> };
    const markets = json.markets;
    if (!Array.isArray(markets)) return [];

    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const parsed: LiveMarketQuote[] = [];
    for (const m of markets) {
      const title = String(m.title || m.subtitle || "").trim();
      if (!title) continue;
      if (
        tokens.length > 0 &&
        !tokens.some((tok) => title.toLowerCase().includes(tok))
      ) {
        continue;
      }

      const yesAsk = Number(m.yes_ask || m.last_price || 50);
      const noAsk = Number(m.no_ask || 100 - yesAsk);
      const ticker = String(m.ticker || "");
      parsed.push({
        id: `kalshi-${ticker || Math.random()}`,
        venue: "Kalshi",
        question: title,
        yesPriceCents: Math.min(99, Math.max(1, Math.round(yesAsk))),
        noPriceCents: Math.min(99, Math.max(1, Math.round(noAsk))),
        volumeUsd: Math.round(Number(m.volume || 0)),
        liquidityUsd: Math.round(Number(m.open_interest || 0)),
        endDate: String(m.close_time || "2027-12-31").slice(0, 10),
        url: ticker ? `https://kalshi.com/markets/${ticker}` : "https://kalshi.com",
        live: true,
      });

      if (parsed.length >= 4) break;
    }
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Searches live Polymarket & Kalshi prediction markets, falling back cleanly
 * to curated synthetic market quotes if offline or no exact match exists.
 */
export async function searchPredictionMarkets(
  query: string
): Promise<{ markets: LiveMarketQuote[]; liveCount: number }> {
  const cleanQuery = query.trim();
  const [poly, kalshi] = await Promise.all([
    queryPolymarket(cleanQuery),
    queryKalshi(cleanQuery),
  ]);

  const liveResults = [...poly, ...kalshi];
  if (liveResults.length > 0) {
    return { markets: liveResults.slice(0, 8), liveCount: liveResults.length };
  }

  // Fallback to curated synthetic markets filtered by query
  const tokens = cleanQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const matchedSynthetic =
    tokens.length > 0
      ? CURATED_SYNTHETIC_MARKETS.filter((m) =>
          tokens.some((tok) => m.question.toLowerCase().includes(tok))
        )
      : CURATED_SYNTHETIC_MARKETS;

  return {
    markets: matchedSynthetic.length > 0 ? matchedSynthetic : CURATED_SYNTHETIC_MARKETS,
    liveCount: 0,
  };
}
