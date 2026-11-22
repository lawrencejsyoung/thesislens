import { GoogleGenAI, Type } from "@google/genai";
import { IntelSignal, IntelSourceType } from "../types";
import { safeFetchPublicText } from "../security/ssrf";
import { sanitizeHttpUrl } from "../security/validation";

const KNOWN_TICKERS = [
  "VALE",
  "COPX",
  "FCX",
  "TECK",
  "CCJ",
  "ETN",
  "NVDA",
  "GOOGL",
  "MSFT",
  "TSM",
  "XBB.TO",
  "SPY",
  "QQQ",
  "TLT",
  "GLD",
  "BTC",
  "TSLA",
  "NEE",
  "CEG",
  "BHP",
  "RIO",
];

const BULLISH_TERMS = [
  "deficit",
  "beat",
  "upgrade",
  "accelerating",
  "surging",
  "breakout",
  "supercycle",
  "record",
  "tailwind",
  "expansion",
  "raising guidance",
  "strong demand",
  "undersupplied",
  "outperform",
  "inflow",
];

const BEARISH_TERMS = [
  "miss",
  "downgrade",
  "slowdown",
  "recession",
  "oversupply",
  "margin compression",
  "default",
  "distress",
  "regulatory risk",
  "tariff",
  "cut guidance",
  "headwind",
  "overvalued",
  "drawdown",
  "dilution",
];

export const CURATED_INTEL_SIGNALS: IntelSignal[] = [
  {
    id: "intel-nl-grid-copper",
    sourceType: "newsletter",
    sourceName: "Grid & Metals Weekly (Substack)",
    title: "Hyperscaler 100MW+ AI Campuses Are Pulling Copper Demand Forward by 3 Years",
    publishedAt: "2026-11-20",
    url: "https://substack.com",
    tickers: ["VALE", "COPX", "ETN", "NVDA"],
    sentimentScore: 68,
    noveltyScore: 84,
    credibilityTier: 2,
    keyClaims: [
      "US & Canadian utility interconnection queues for AI data centers grew 42% YoY, requiring ~1.1Mt incremental copper through 2028.",
      "Transformer lead times for Eaton (ETN) and peers remain above 110 weeks, protecting gross margins >38%.",
      "Sudbury basin brownfield nickel/copper expansions offer lower permitting risk than greenfield LatAm mines.",
    ],
    catalysts: [
      "Q4 Hyperscaler 2027 Capex Guidance (Jan–Feb)",
      "LME Warehouse Copper Inventory Drawdowns",
    ],
    summary:
      "Specialist infrastructure newsletter highlights accelerating AI grid power bottlenecks and structural copper/switchgear pricing power.",
    live: false,
  },
  {
    id: "intel-pod-oddlots-macro",
    sourceType: "podcast",
    sourceName: "Odd Lots / Macro Voices (Podcast RSS)",
    title: "Ep. 412: Why Real Assets & Uranium Are Repricing Against Fiscal Dominance",
    publishedAt: "2026-11-19",
    url: "https://podcasts.apple.com",
    audioUrl: "https://feeds.megaphone.fm/BLM2009837477",
    durationLabel: "54m",
    tickers: ["CCJ", "VALE", "TLT", "XBB.TO"],
    sentimentScore: 44,
    noveltyScore: 76,
    credibilityTier: 2,
    keyClaims: [
      "Long-end sovereign term premia remain sticky despite policy rate cuts, pressuring unhedged duration (TLT/XBB.TO).",
      "Utility nuclear contracting for Cameco (CCJ) has shifted from spot-linked to multi-year floor/ceiling collars above $95/lb.",
      "Commodity CTAs are under-positioned in base metals relative to 2022 peaks, creating asymmetric upside on China stimulus.",
    ],
    catalysts: [
      "Federal Reserve & Bank of Canada December Policy Meetings",
      "US Utility Long-Term Uranium Contracting Cycle",
    ],
    summary:
      "Macro podcast discussion flags fiscal term-premium risks for long bonds while underscoring multi-year utility contracting floors in nuclear and critical minerals.",
    live: false,
  },
  {
    id: "intel-filing-sec-10q",
    sourceType: "filing",
    sourceName: "SEC EDGAR (10-Q / 6-K Primary Filing)",
    title: "Form 6-K / 10-Q Filing: Sudbury Base Metals Capex & Free Cash Flow Conversion Update",
    publishedAt: "2026-11-18",
    url: "https://www.sec.gov/edgar/searchedgar/companysearch",
    tickers: ["VALE", "ETN", "GOOGL"],
    sentimentScore: 32,
    noveltyScore: 91,
    credibilityTier: 1,
    keyClaims: [
      "Operating cash flow conversion remained above 1.15x Net Income with disciplined working-capital turns.",
      "Capital expenditure guidance raised 6% for underground mine electrification and grid-tie upgrades.",
      "Management noted FX sensitivity: every 5% BRL or CAD depreciation lifts local-cost EBITDA margins by ~140bps.",
    ],
    catalysts: [
      "Annual Reserve & Resource Update (NI 43-101 / Form 20-F)",
      "Dividend & Buyback Authorization Review",
    ],
    summary:
      "Primary regulatory filing confirms healthy cash conversion and modest capex increase tied to mine electrification.",
    live: false,
  },
  {
    id: "intel-news-semis-capex",
    sourceType: "news",
    sourceName: "Financial News Wire (RSS)",
    title: "Cloud Giants Signal Disciplined AI ROI Scrutiny While Locking In Multi-Year Power PPAs",
    publishedAt: "2026-11-21",
    url: "https://finance.yahoo.com",
    tickers: ["NVDA", "GOOGL", "MSFT", "TSM", "ETN"],
    sentimentScore: 18,
    noveltyScore: 72,
    credibilityTier: 2,
    keyClaims: [
      "Buy-side desks debate whether GPU capex growth decelerates from +55% to +22% in 2027, creating near-term multiple volatility.",
      "Power availability—not silicon supply—is now cited as the #1 constraint on new cluster deployments.",
    ],
    catalysts: [
      "NVDA / TSM Monthly Foundry Revenue Prints",
      "FERC Co-Located Nuclear Power Rulings",
    ],
    summary:
      "Wire report flags a rotation debate inside AI infrastructure from pure compute multiples toward power/grid bottlenecks.",
    live: false,
  },
  {
    id: "intel-macro-boc-fed",
    sourceType: "macro",
    sourceName: "Bank of Canada Valet / FRED Macro Feed",
    title: "Policy Rate Divergence & 10Y Breakeven Inflation Monitor",
    publishedAt: "2026-11-21",
    url: "https://www.bankofcanada.ca/valet/docs",
    tickers: ["XBB.TO", "TLT", "VALE", "COPX"],
    sentimentScore: -12,
    noveltyScore: 65,
    credibilityTier: 1,
    keyClaims: [
      "US-Canada 2Y rate differential remains wide (~110bps), keeping CAD weak and boosting USD-denominated Canadian exporters.",
      "5Y5Y forward inflation expectations ticked up +14bps MoM, favoring real-asset hedges over long-duration nominal bonds.",
    ],
    catalysts: [
      "US Core PCE & Canadian CPI Releases",
      "CFTC Commitment of Traders (COT) Copper Net Positioning",
    ],
    summary:
      "Central bank macro snapshot highlights persistent US-Canada rate spread and rising inflation breakevens.",
    live: false,
  },
];

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = 3200,
  headers: Record<string, string> = {}
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ThesisLens-Institutional-Research/1.0 (contact@thesislens.app)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json",
        ...headers,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripXml(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  return match ? stripXml(match[1]) : "";
}

function extractTickersFromText(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const t of KNOWN_TICKERS) {
    const escaped = t.replace(".", "\\.");
    if (new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(upper)) {
      found.add(t);
    }
  }
  // Also catch explicit $TICKER notation
  const dollarMatches = text.match(/\$([A-Z]{1,5})\b/g) ?? [];
  for (const m of dollarMatches) {
    found.add(m.slice(1));
  }
  return Array.from(found).slice(0, 6);
}

function scoreSentimentDeterministic(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of BULLISH_TERMS) {
    if (lower.includes(term)) score += 16;
  }
  for (const term of BEARISH_TERMS) {
    if (lower.includes(term)) score -= 18;
  }
  return Math.max(-95, Math.min(95, score));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24 && s.length < 280);
}

/**
 * Deterministic parser for RSS 2.0 / Atom / Podcast XML feeds
 */
export function parseRssOrPodcastXml(
  xml: string,
  sourceType: IntelSourceType,
  sourceName: string,
  limit = 4
): IntelSignal[] {
  const items: string[] = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const entryMatches = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  items.push(...itemMatches, ...entryMatches);

  const signals: IntelSignal[] = [];
  for (const raw of items.slice(0, limit)) {
    const title = extractTag(raw, "title");
    if (!title) continue;
    const desc =
      extractTag(raw, "description") ||
      extractTag(raw, "summary") ||
      extractTag(raw, "itunes:summary") ||
      extractTag(raw, "content:encoded");
    const linkMatch = raw.match(/<link[^>]*href=["']([^"']+)["']/i);
    const rawLink = extractTag(raw, "link") || (linkMatch ? linkMatch[1] : undefined);
    const link = sanitizeHttpUrl(rawLink);
    const enclosureMatch = raw.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
    const audioUrl = sanitizeHttpUrl(enclosureMatch ? enclosureMatch[1] : undefined);
    const duration = extractTag(raw, "itunes:duration") || undefined;
    const pubRaw = extractTag(raw, "pubDate") || extractTag(raw, "updated") || "";
    let publishedAt = new Date().toISOString().slice(0, 10);
    if (pubRaw) {
      const parsed = new Date(pubRaw);
      if (!Number.isNaN(parsed.getTime())) {
        publishedAt = parsed.toISOString().slice(0, 10);
      }
    }

    const combined = `${title}. ${desc}`;
    const tickers = extractTickersFromText(combined);
    const sentimentScore = scoreSentimentDeterministic(combined);
    const sentences = splitSentences(desc);
    const keyClaims =
      sentences.length > 0 ? sentences.slice(0, 3) : [title];

    signals.push({
      id: `live-${sourceType}-${Math.random().toString(36).slice(2, 9)}`,
      sourceType: audioUrl ? "podcast" : sourceType,
      sourceName,
      title,
      publishedAt,
      url: link,
      audioUrl,
      durationLabel: duration,
      tickers,
      sentimentScore,
      noveltyScore: 78,
      credibilityTier: sourceType === "filing" || sourceType === "macro" ? 1 : 2,
      keyClaims,
      catalysts: tickers.length > 0 ? [`Watch ${tickers.join(", ")} reaction`] : ["Macro / Sector Catalyst"],
      summary: desc.slice(0, 220) || title,
      live: true,
    });
  }
  return signals;
}

/**
 * Fetches live Bank of Canada policy rate observation via public Valet JSON API
 */
async function fetchBankOfCanadaMacroSignal(): Promise<IntelSignal | null> {
  const raw = await fetchTextWithTimeout(
    "https://www.bankofcanada.ca/valet/observations/V39079/json?recent=2",
    2800
  );
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as {
      observations?: Array<{ d: string; V39079?: { v: string } }>;
    };
    const obs = json.observations;
    if (!obs || obs.length === 0) return null;
    const latest = obs[obs.length - 1];
    const rate = latest.V39079?.v;
    if (!rate) return null;
    return {
      id: `live-boc-${latest.d}`,
      sourceType: "macro",
      sourceName: "Bank of Canada Valet API (Live)",
      title: `Bank of Canada Overnight Target Rate: ${rate}% (as of ${latest.d})`,
      publishedAt: latest.d,
      url: "https://www.bankofcanada.ca/rates/interest-rates/canadian-interest-rates/",
      tickers: ["XBB.TO", "VALE", "CCJ"],
      sentimentScore: Number(rate) <= 3.5 ? 25 : -15,
      noveltyScore: 70,
      credibilityTier: 1,
      keyClaims: [
        `Live Bank of Canada overnight policy rate prints at ${rate}%.`,
        "Directly impacts Canadian bond duration (XBB.TO), Sudbury capex financing, and USD/CAD exporter margins.",
      ],
      catalysts: ["Next Bank of Canada Rate Decision"],
      summary: `Live central bank print from Bank of Canada Valet API: Overnight Target Rate at ${rate}%.`,
      live: true,
    };
  } catch {
    return null;
  }
}

/**
 * Aggregates live + curated institutional intelligence signals matching a query / ticker list
 */
export async function fetchIntelligenceCorpus(
  query: string,
  tickers: string[] = []
): Promise<{ signals: IntelSignal[]; liveCount: number }> {
  const liveSignals: IntelSignal[] = [];

  // Attempt lightweight live feeds in parallel (fail gracefully offline/sandboxed)
  const [bocSignal, newsXml] = await Promise.all([
    fetchBankOfCanadaMacroSignal(),
    fetchTextWithTimeout(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
        tickers.slice(0, 4).join(",") || "VALE,NVDA,ETN"
      )}&region=US&lang=en-US`,
      2800
    ),
  ]);

  if (bocSignal) liveSignals.push(bocSignal);
  if (newsXml) {
    liveSignals.push(...parseRssOrPodcastXml(newsXml, "news", "Yahoo Finance Wire (Live RSS)", 3));
  }

  // Merge live signals with curated multi-source signals (Newsletter, Podcast, Filing, Macro)
  const tokens = `${query} ${tickers.join(" ")}`
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const curatedRanked = [...CURATED_INTEL_SIGNALS].sort((a, b) => {
    const score = (sig: IntelSignal) => {
      const hay = `${sig.title} ${sig.summary} ${sig.tickers.join(" ")}`.toLowerCase();
      return tokens.reduce((acc, tok) => acc + (hay.includes(tok) ? 1 : 0), 0);
    };
    return score(b) - score(a);
  });

  const merged = [...liveSignals, ...curatedRanked].slice(0, 8);
  return {
    signals: merged,
    liveCount: liveSignals.length,
  };
}

/**
 * Ingests a custom Newsletter (email/text), Podcast RSS URL, News RSS URL, or Transcript.
 * Uses Gemini structured extraction when an API key is provided, or deterministic NLP fallback.
 */
export async function ingestCustomIntelligence(params: {
  sourceType: IntelSourceType;
  sourceName: string;
  title?: string;
  rawText?: string;
  feedUrl?: string;
  apiKey?: string;
}): Promise<{ signals: IntelSignal[]; extractionMode: "gemini" | "deterministic" | "rss" }> {
  // 1. Live RSS / Podcast feed ingestion (SSRF-validated + byte-capped)
  if (params.feedUrl && params.feedUrl.trim()) {
    const xml = await safeFetchPublicText(params.feedUrl.trim(), {
      timeoutMs: 4500,
      maxBytes: 1_500_000,
    });
    if (xml) {
      const parsed = parseRssOrPodcastXml(
        xml,
        params.sourceType,
        params.sourceName || new URL(params.feedUrl.trim()).hostname,
        5
      );
      if (parsed.length > 0) {
        return { signals: parsed, extractionMode: "rss" };
      }
    }
  }

  // 2. Raw text ingestion (pasted newsletter email, podcast transcript, earnings call, research note)
  const text = (params.rawText || "").trim();
  const title = (params.title || `${params.sourceName || "Custom"} Intelligence Note`).trim();

  if (!text) {
    throw new Error("Provide either a valid RSS/Podcast feed URL or raw newsletter/transcript text.");
  }

  const effectiveKey = params.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (effectiveKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      const res = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: `Extract structured institutional hedge-fund investment signals from this ${params.sourceType} (${params.sourceName}).
Title: ${title}
Content:
${text.slice(0, 12000)}`,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tickers: { type: Type.ARRAY, items: { type: Type.STRING } },
              sentimentScore: { type: Type.INTEGER },
              noveltyScore: { type: Type.INTEGER },
              keyClaims: { type: Type.ARRAY, items: { type: Type.STRING } },
              catalysts: { type: Type.ARRAY, items: { type: Type.STRING } },
              summary: { type: Type.STRING },
            },
            required: ["tickers", "sentimentScore", "noveltyScore", "keyClaims", "catalysts", "summary"],
          },
        },
      });
      const parsed = JSON.parse(res.text || "{}") as {
        tickers?: string[];
        sentimentScore?: number;
        noveltyScore?: number;
        keyClaims?: string[];
        catalysts?: string[];
        summary?: string;
      };
      return {
        extractionMode: "gemini",
        signals: [
          {
            id: `custom-${Date.now()}`,
            sourceType: params.sourceType,
            sourceName: params.sourceName || "Custom Ingest",
            title,
            publishedAt: new Date().toISOString().slice(0, 10),
            tickers: (parsed.tickers ?? []).slice(0, 8),
            sentimentScore: Math.max(-100, Math.min(100, Number(parsed.sentimentScore ?? 0))),
            noveltyScore: Math.max(0, Math.min(100, Number(parsed.noveltyScore ?? 75))),
            credibilityTier: params.sourceType === "filing" ? 1 : 2,
            keyClaims: (parsed.keyClaims ?? [title]).slice(0, 4),
            catalysts: (parsed.catalysts ?? ["Monitor upcoming catalyst"]).slice(0, 3),
            summary: parsed.summary || text.slice(0, 220),
            live: true,
          },
        ],
      };
    } catch {
      // fall through to deterministic extractor
    }
  }

  // Deterministic NLP extraction fallback
  const tickers = extractTickersFromText(`${title} ${text}`);
  const sentimentScore = scoreSentimentDeterministic(`${title} ${text}`);
  const sentences = splitSentences(text);

  return {
    extractionMode: "deterministic",
    signals: [
      {
        id: `custom-${Date.now()}`,
        sourceType: params.sourceType,
        sourceName: params.sourceName || "Custom Ingest",
        title,
        publishedAt: new Date().toISOString().slice(0, 10),
        tickers,
        sentimentScore,
        noveltyScore: 82,
        credibilityTier: params.sourceType === "filing" ? 1 : 2,
        keyClaims: sentences.length > 0 ? sentences.slice(0, 3) : [text.slice(0, 200)],
        catalysts:
          tickers.length > 0
            ? [`Track earnings & flow impact on ${tickers.join(", ")}`]
            : ["Monitor macro repricing"],
        summary: text.slice(0, 240),
        live: true,
      },
    ],
  };
}
