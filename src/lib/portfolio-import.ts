import {
  AnalysisMode,
  AnalysisRequestPayload,
  AssetClass,
  Holding,
  Jurisdiction,
  RiskProfile,
} from "./types";

export type ImportFormat = "csv" | "json";

export interface ImportedPortfolioMetadata {
  title?: string;
  thesisPrompt?: string;
  analysisMode?: AnalysisMode;
  jurisdiction?: Jurisdiction;
  capital?: number;
  monthlyContribution?: number;
  horizonYears?: number;
  riskProfile?: RiskProfile;
}

export interface PortfolioImportResult {
  format: ImportFormat;
  holdings: Holding[];
  inferredCapital?: number;
  metadata?: ImportedPortfolioMetadata;
  warnings: string[];
  errors: string[];
}

export const VALID_SECTORS: Holding["sector"][] = [
  "Technology",
  "Mining & Materials",
  "Energy",
  "Financials",
  "Healthcare",
  "Industrials",
  "Fixed Income",
  "Consumer",
  "Real Estate",
  "Crypto & Digital",
  "Event Contract",
  "Venture / Private",
];

const VALID_ASSET_CLASSES: AssetClass[] = [
  "equity",
  "etf",
  "prediction_market",
  "option",
  "fixed_income",
  "commodity_future",
  "real_estate",
  "private_venture",
  "crypto",
  "custom_outcome",
];

interface SectorDefaults {
  beta: number;
  expectedAnnualReturnPct: number;
  annualVolatilityPct: number;
  dividendYieldPct: number;
  assetClass: AssetClass;
}

const SECTOR_DEFAULTS: Record<Holding["sector"], SectorDefaults> = {
  Technology: {
    beta: 1.25,
    expectedAnnualReturnPct: 13.5,
    annualVolatilityPct: 28,
    dividendYieldPct: 0.4,
    assetClass: "equity",
  },
  "Mining & Materials": {
    beta: 1.15,
    expectedAnnualReturnPct: 11.5,
    annualVolatilityPct: 30,
    dividendYieldPct: 2.8,
    assetClass: "equity",
  },
  Energy: {
    beta: 1.1,
    expectedAnnualReturnPct: 11.0,
    annualVolatilityPct: 29,
    dividendYieldPct: 3.5,
    assetClass: "equity",
  },
  Financials: {
    beta: 1.05,
    expectedAnnualReturnPct: 10.0,
    annualVolatilityPct: 22,
    dividendYieldPct: 3.2,
    assetClass: "equity",
  },
  Healthcare: {
    beta: 0.78,
    expectedAnnualReturnPct: 9.5,
    annualVolatilityPct: 18,
    dividendYieldPct: 1.8,
    assetClass: "equity",
  },
  Industrials: {
    beta: 1.08,
    expectedAnnualReturnPct: 10.8,
    annualVolatilityPct: 23,
    dividendYieldPct: 1.6,
    assetClass: "equity",
  },
  "Fixed Income": {
    beta: 0.05,
    expectedAnnualReturnPct: 4.5,
    annualVolatilityPct: 9,
    dividendYieldPct: 4.4,
    assetClass: "fixed_income",
  },
  Consumer: {
    beta: 0.88,
    expectedAnnualReturnPct: 9.2,
    annualVolatilityPct: 19,
    dividendYieldPct: 2.1,
    assetClass: "equity",
  },
  "Real Estate": {
    beta: 0.75,
    expectedAnnualReturnPct: 8.8,
    annualVolatilityPct: 19,
    dividendYieldPct: 4.6,
    assetClass: "real_estate",
  },
  "Crypto & Digital": {
    beta: 1.85,
    expectedAnnualReturnPct: 22.0,
    annualVolatilityPct: 65,
    dividendYieldPct: 0,
    assetClass: "crypto",
  },
  "Event Contract": {
    beta: 0.1,
    expectedAnnualReturnPct: 15.0,
    annualVolatilityPct: 45,
    dividendYieldPct: 0,
    assetClass: "prediction_market",
  },
  "Venture / Private": {
    beta: 1.4,
    expectedAnnualReturnPct: 18.0,
    annualVolatilityPct: 48,
    dividendYieldPct: 0,
    assetClass: "private_venture",
  },
};

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseNumeric(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Handle accounting negatives like ($1,234.50)
  const isParenNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const cleaned = trimmed
    .replace(/[(),$€£¥%\s]/g, "")
    .replace(/,/g, "");
  if (!cleaned) return undefined;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;
  return isParenNegative ? -Math.abs(parsed) : parsed;
}

export function normalizeSector(raw?: string, ticker?: string): Holding["sector"] {
  const s = (raw ?? "").trim().toLowerCase();
  if (s) {
    const exact = VALID_SECTORS.find((v) => v.toLowerCase() === s);
    if (exact) return exact;

    if (/(tech|software|semi|ai|cloud|internet|info|comm)/.test(s)) return "Technology";
    if (/(min|material|metal|copper|nickel|gold|lithium|basic)/.test(s))
      return "Mining & Materials";
    if (/(energ|oil|gas|uranium|nuclear|utilit|power)/.test(s)) return "Energy";
    if (/(financ|bank|insur|capital|broker)/.test(s)) return "Financials";
    if (/(health|bio|pharma|med)/.test(s)) return "Healthcare";
    if (/(industr|aero|defen|transport|manufact)/.test(s)) return "Industrials";
    if (/(fixed|bond|treasur|credit|debt|cash|money|bill|income)/.test(s))
      return "Fixed Income";
    if (/(consum|retail|staple|discretion|food|bev)/.test(s)) return "Consumer";
    if (/(real\s*estate|reit|propert|housing)/.test(s)) return "Real Estate";
    if (/(crypto|digital|btc|eth|coin|blockchain)/.test(s)) return "Crypto & Digital";
    if (/(event|predict|polymarket|kalshi|contract)/.test(s)) return "Event Contract";
    if (/(ventur|private|safe|startup|pe\b)/.test(s)) return "Venture / Private";
  }

  // Fallback heuristic by common tickers
  const t = (ticker ?? "").toUpperCase();
  if (/^(TLT|BND|AGG|IEF|SHY|SGOV|BIL|LQD|HYG|TIP|ZAG|XBB)/.test(t))
    return "Fixed Income";
  if (/^(BTC|ETH|SOL|IBIT|FBTC|MSTR|COIN)/.test(t)) return "Crypto & Digital";
  if (/^(VNQ|O|PLD|AMT|EQIX|XRE)/.test(t)) return "Real Estate";
  if (/^(VALE|FCX|NEM|BHP|RIO|TECK|SCCO|GLD|SLV)/.test(t))
    return "Mining & Materials";
  if (/^(XOM|CVX|CCJ|XLE|SU|CNQ|ENB|NEE)/.test(t)) return "Energy";
  if (/^(JPM|BAC|GS|BRK|RY|TD|BMO|XLF|V|MA)/.test(t)) return "Financials";
  if (/^(UNH|JNJ|LLY|PFE|ABBV|XLV|NVO)/.test(t)) return "Healthcare";
  if (/^(ETN|CAT|GE|HON|LMT|RTX|XLI|UNP)/.test(t)) return "Industrials";
  if (/^(WMT|COST|PG|KO|AMZN|MCD|XLP|XLY)/.test(t)) return "Consumer";

  return "Technology";
}

function normalizeAssetClass(raw: unknown, sector: Holding["sector"], ticker: string): AssetClass {
  if (typeof raw === "string" && raw.trim()) {
    const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const exact = VALID_ASSET_CLASSES.find((ac) => ac === cleaned);
    if (exact) return exact;
    if (cleaned.includes("etf") || cleaned.includes("index") || cleaned.includes("fund"))
      return "etf";
    if (cleaned.includes("bond") || cleaned.includes("treasury") || cleaned.includes("fixed"))
      return "fixed_income";
    if (cleaned.includes("crypto")) return "crypto";
    if (cleaned.includes("option")) return "option";
    if (cleaned.includes("real") || cleaned.includes("reit")) return "real_estate";
    if (cleaned.includes("venture") || cleaned.includes("private")) return "private_venture";
    if (cleaned.includes("predict") || cleaned.includes("event")) return "prediction_market";
    if (cleaned.includes("commod") || cleaned.includes("future")) return "commodity_future";
  }
  const t = ticker.toUpperCase();
  if (/^(SPY|QQQ|VOO|VTI|XEQT|VEQT|VFV|XIU|IWM|TLT|BND|AGG|GLD|SLV|XLE|XLF|XLK|VNQ|IBIT)$/.test(t)) {
    return sector === "Fixed Income" ? "fixed_income" : "etf";
  }
  return SECTOR_DEFAULTS[sector].assetClass;
}

/**
 * RFC-4180 compliant CSV parser supporting quoted fields, escaped quotes,
 * embedded commas/newlines, and CRLF/LF line endings.
 */
export function parseCsvRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, ""); // strip UTF-8 BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  return rows;
}

interface RawHoldingDraft {
  rowLabel: string;
  ticker: string;
  name: string;
  sector: Holding["sector"];
  assetClass: AssetClass;
  side: "LONG" | "SHORT";
  explicitWeightPct?: number;
  marketValue?: number;
  currentPrice?: number;
  shares?: number;
  beta?: number;
  expectedAnnualReturnPct?: number;
  annualVolatilityPct?: number;
  dividendYieldPct?: number;
  advUsd?: number;
  borrowCostPct?: number;
}

function getAliasedValue(
  record: Record<string, unknown>,
  aliases: string[]
): unknown {
  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== "") {
      return record[alias];
    }
  }
  return undefined;
}

function normalizeRecordKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

function extractDraftsFromRecords(
  records: Record<string, unknown>[],
  warnings: string[],
  errors: string[]
): RawHoldingDraft[] {
  const drafts: RawHoldingDraft[] = [];

  records.forEach((rawRecord, idx) => {
    const rowLabel = `Row ${idx + 1}`;
    const rec = normalizeRecordKeys(rawRecord);

    const tickerRaw = getAliasedValue(rec, [
      "ticker",
      "symbol",
      "code",
      "asset",
      "instrument",
      "securitysymbol",
    ]);
    const ticker =
      typeof tickerRaw === "string"
        ? tickerRaw.trim().toUpperCase().replace(/\s+/g, "")
        : "";

    if (!ticker) {
      errors.push(`${rowLabel}: Missing required "ticker" (or "symbol") field — skipped.`);
      return;
    }

    const nameRaw = getAliasedValue(rec, [
      "name",
      "company",
      "companyname",
      "description",
      "security",
      "securityname",
      "holding",
    ]);
    const name =
      typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : ticker;

    const sectorRaw = getAliasedValue(rec, [
      "sector",
      "industry",
      "category",
      "assetsector",
    ]);
    const sector = normalizeSector(
      typeof sectorRaw === "string" ? sectorRaw : undefined,
      ticker
    );

    const assetClassRaw = getAliasedValue(rec, [
      "assetclass",
      "type",
      "instrumenttype",
      "securitytype",
    ]);
    const assetClass = normalizeAssetClass(assetClassRaw, sector, ticker);

    const sideRaw = getAliasedValue(rec, [
      "side",
      "direction",
      "position",
      "longshort",
    ]);
    let side: "LONG" | "SHORT" = "LONG";
    if (typeof sideRaw === "string") {
      const s = sideRaw.trim().toUpperCase();
      if (s === "SHORT" || s === "S" || s === "SELL") {
        side = "SHORT";
      }
    }

    const weightRaw = getAliasedValue(rec, [
      "weightpct",
      "weight",
      "allocation",
      "allocationpct",
      "pct",
      "percent",
      "targetweight",
      "targetweightpct",
      "portfolioweight",
    ]);
    const parsedWeight = parseNumeric(weightRaw);

    const marketValueRaw = getAliasedValue(rec, [
      "marketvalue",
      "value",
      "notional",
      "amount",
      "positionvalue",
      "marketvalueusd",
      "dollarvalue",
      "mv",
    ]);
    const parsedMarketValue = parseNumeric(marketValueRaw);

    const priceRaw = getAliasedValue(rec, [
      "currentprice",
      "price",
      "lastprice",
      "close",
      "markprice",
      "unitprice",
    ]);
    const parsedPrice = parseNumeric(priceRaw);

    const sharesRaw = getAliasedValue(rec, [
      "shares",
      "quantity",
      "qty",
      "units",
    ]);
    const parsedShares = parseNumeric(sharesRaw);

    // Detect short side from negative numeric inputs
    if (
      (parsedWeight !== undefined && parsedWeight < 0) ||
      (parsedMarketValue !== undefined && parsedMarketValue < 0) ||
      (parsedShares !== undefined && parsedShares < 0)
    ) {
      side = "SHORT";
    }

    let computedMarketValue =
      parsedMarketValue !== undefined ? Math.abs(parsedMarketValue) : undefined;
    if (
      computedMarketValue === undefined &&
      parsedShares !== undefined &&
      parsedPrice !== undefined &&
      parsedPrice > 0
    ) {
      computedMarketValue = Math.abs(parsedShares) * parsedPrice;
    }

    const beta = parseNumeric(getAliasedValue(rec, ["beta"]));
    const expectedAnnualReturnPct = parseNumeric(
      getAliasedValue(rec, [
        "expectedannualreturnpct",
        "expectedreturnpct",
        "expectedreturn",
        "returnpct",
        "cagr",
      ])
    );
    const annualVolatilityPct = parseNumeric(
      getAliasedValue(rec, [
        "annualvolatilitypct",
        "volatilitypct",
        "volatility",
        "vol",
        "stdev",
      ])
    );
    const dividendYieldPct = parseNumeric(
      getAliasedValue(rec, [
        "dividendyieldpct",
        "dividendyield",
        "yieldpct",
        "yield",
        "divyield",
      ])
    );
    const advUsd = parseNumeric(
      getAliasedValue(rec, ["advusd", "adv", "averagedailyvolume"])
    );
    const borrowCostPct = parseNumeric(
      getAliasedValue(rec, ["borrowcostpct", "borrowcost", "borrowfee"])
    );

    drafts.push({
      rowLabel,
      ticker,
      name,
      sector,
      assetClass,
      side,
      explicitWeightPct:
        parsedWeight !== undefined ? Math.abs(parsedWeight) : undefined,
      marketValue: computedMarketValue,
      currentPrice:
        parsedPrice !== undefined && parsedPrice > 0 ? parsedPrice : undefined,
      shares: parsedShares !== undefined ? Math.abs(parsedShares) : undefined,
      beta,
      expectedAnnualReturnPct,
      annualVolatilityPct,
      dividendYieldPct,
      advUsd,
      borrowCostPct,
    });
  });

  // Check if explicit weights look like decimal fractions (e.g. 0.25, 0.35, 0.40 summing to ~1.0)
  const explicitWeights = drafts
    .map((d) => d.explicitWeightPct)
    .filter((w): w is number => w !== undefined);
  if (explicitWeights.length > 0 && explicitWeights.length === drafts.length) {
    const sum = explicitWeights.reduce((acc, w) => acc + w, 0);
    const maxW = Math.max(...explicitWeights);
    if (sum > 0 && sum <= 1.6 && maxW <= 1.0) {
      warnings.push(
        "Detected fractional weights (e.g. 0.25) — automatically converted to percentages (25%)."
      );
      drafts.forEach((d) => {
        if (d.explicitWeightPct !== undefined) {
          d.explicitWeightPct = Number((d.explicitWeightPct * 100).toFixed(2));
        }
      });
    }
  }

  return drafts;
}

function finalizeHoldings(
  drafts: RawHoldingDraft[],
  warnings: string[]
): { holdings: Holding[]; inferredCapital?: number } {
  const totalMarketValue = drafts.reduce((sum, d) => sum + (d.marketValue ?? 0), 0);
  const allHaveMarketValue =
    drafts.length > 0 && drafts.every((d) => (d.marketValue ?? 0) > 0);
  const noneHaveExplicitWeight = drafts.every(
    (d) => d.explicitWeightPct === undefined
  );

  let inferredCapital: number | undefined;
  if (totalMarketValue > 0) {
    inferredCapital = Math.round(totalMarketValue);
  }

  let defaultedQuantCount = 0;

  const holdings: Holding[] = drafts.map((d) => {
    const defaults = SECTOR_DEFAULTS[d.sector];

    let weightPct: number;
    if (d.explicitWeightPct !== undefined) {
      weightPct = Number(d.explicitWeightPct.toFixed(2));
    } else if (d.marketValue !== undefined && totalMarketValue > 0) {
      weightPct = Number(((d.marketValue / totalMarketValue) * 100).toFixed(2));
    } else {
      // Equal weight fallback
      weightPct = Number((100 / drafts.length).toFixed(2));
    }

    if (
      d.beta === undefined ||
      d.expectedAnnualReturnPct === undefined ||
      d.annualVolatilityPct === undefined
    ) {
      defaultedQuantCount++;
    }

    const holding: Holding = {
      ticker: d.ticker,
      name: d.name,
      sector: d.sector,
      assetClass: d.assetClass,
      side: d.side,
      weightPct,
      currentPrice: d.currentPrice ?? 100,
      beta: d.beta ?? defaults.beta,
      expectedAnnualReturnPct:
        d.expectedAnnualReturnPct ?? defaults.expectedAnnualReturnPct,
      annualVolatilityPct:
        d.annualVolatilityPct ?? defaults.annualVolatilityPct,
      dividendYieldPct: d.dividendYieldPct ?? defaults.dividendYieldPct,
    };

    if (d.advUsd !== undefined && d.advUsd > 0) {
      holding.advUsd = d.advUsd;
    }
    if (d.borrowCostPct !== undefined && d.borrowCostPct >= 0) {
      holding.borrowCostPct = d.borrowCostPct;
    } else if (d.side === "SHORT") {
      holding.borrowCostPct = 0.75;
    }

    return holding;
  });

  if (noneHaveExplicitWeight && allHaveMarketValue) {
    warnings.push(
      `Derived portfolio weights automatically from position market values (total $${inferredCapital?.toLocaleString()}).`
    );
  } else if (
    noneHaveExplicitWeight &&
    !allHaveMarketValue &&
    drafts.length > 0
  ) {
    warnings.push(
      "No weights or market values were provided — applied equal weights across all positions."
    );
  }

  if (defaultedQuantCount > 0) {
    warnings.push(
      `Applied sector-calibrated quant defaults (beta, expected return, volatility) for ${defaultedQuantCount} position${
        defaultedQuantCount === 1 ? "" : "s"
      } missing optional fields.`
    );
  }

  // Warn about duplicate tickers
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  holdings.forEach((h) => {
    const key = `${h.ticker}:${h.side ?? "LONG"}`;
    if (seen.has(key)) duplicates.add(h.ticker);
    seen.add(key);
  });
  if (duplicates.size > 0) {
    warnings.push(
      `Duplicate ticker${duplicates.size > 1 ? "s" : ""} detected: ${Array.from(
        duplicates
      ).join(", ")}.`
    );
  }

  return { holdings, inferredCapital };
}

function extractMetadata(obj: Record<string, unknown>): ImportedPortfolioMetadata | undefined {
  const meta: ImportedPortfolioMetadata = {};
  if (typeof obj.title === "string" && obj.title.trim()) {
    meta.title = obj.title.trim();
  }
  if (typeof obj.thesisPrompt === "string" && obj.thesisPrompt.trim()) {
    meta.thesisPrompt = obj.thesisPrompt.trim();
  }
  const capital = parseNumeric(obj.capital ?? obj.initialCapital ?? obj.aum);
  if (capital !== undefined && capital >= 1000) {
    meta.capital = Math.round(capital);
  }
  const monthly = parseNumeric(obj.monthlyContribution);
  if (monthly !== undefined && monthly >= 0) {
    meta.monthlyContribution = Math.round(monthly);
  }
  const horizon = parseNumeric(obj.horizonYears);
  if (horizon !== undefined && horizon >= 1 && horizon <= 30) {
    meta.horizonYears = Math.round(horizon);
  }
  if (
    obj.riskProfile === "conservative" ||
    obj.riskProfile === "balanced" ||
    obj.riskProfile === "aggressive"
  ) {
    meta.riskProfile = obj.riskProfile;
  }
  if (
    obj.jurisdiction === "Canada" ||
    obj.jurisdiction === "US" ||
    obj.jurisdiction === "Global"
  ) {
    meta.jurisdiction = obj.jurisdiction;
  }
  if (
    obj.analysisMode === "any_outcome" ||
    obj.analysisMode === "hedge_fund" ||
    obj.analysisMode === "portfolio" ||
    obj.analysisMode === "prediction" ||
    obj.analysisMode === "options" ||
    obj.analysisMode === "real_assets" ||
    obj.analysisMode === "venture"
  ) {
    meta.analysisMode = obj.analysisMode;
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}

export function detectImportFormat(
  rawText: string,
  fileName?: string
): ImportFormat {
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "csv";
  }
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }
  return "csv";
}

export function parsePortfolioImport(
  rawText: string,
  explicitFormat?: ImportFormat,
  fileName?: string
): PortfolioImportResult {
  const format = explicitFormat ?? detectImportFormat(rawText, fileName);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!rawText.trim()) {
    return {
      format,
      holdings: [],
      warnings,
      errors: ["Input is empty. Paste CSV or JSON data, or upload a file."],
    };
  }

  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      return {
        format: "json",
        holdings: [],
        warnings,
        errors: [
          `Invalid JSON syntax: ${
            err instanceof Error ? err.message : "Could not parse JSON"
          }`,
        ],
      };
    }

    let rawRecords: Record<string, unknown>[] = [];
    let metadata: ImportedPortfolioMetadata | undefined;

    if (Array.isArray(parsed)) {
      rawRecords = parsed.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item)
      );
    } else if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      metadata = extractMetadata(obj);
      const listCandidate =
        obj.holdings ?? obj.positions ?? obj.portfolio ?? obj.assets;
      if (Array.isArray(listCandidate)) {
        rawRecords = listCandidate.filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && !Array.isArray(item)
        );
      } else {
        return {
          format: "json",
          holdings: [],
          metadata,
          warnings,
          errors: [
            'JSON object must contain a "holdings", "positions", or "portfolio" array (or be a top-level array of positions).',
          ],
        };
      }
    } else {
      return {
        format: "json",
        holdings: [],
        warnings,
        errors: ["JSON root must be an array of holdings or an object with a holdings array."],
      };
    }

    if (rawRecords.length === 0) {
      return {
        format: "json",
        holdings: [],
        metadata,
        warnings,
        errors: ["No position objects found in JSON input."],
      };
    }

    const drafts = extractDraftsFromRecords(rawRecords, warnings, errors);
    if (drafts.length === 0) {
      return { format: "json", holdings: [], metadata, warnings, errors };
    }

    const { holdings, inferredCapital } = finalizeHoldings(drafts, warnings);
    return {
      format: "json",
      holdings,
      inferredCapital: metadata?.capital ?? inferredCapital,
      metadata,
      warnings,
      errors,
    };
  }

  // CSV parsing
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) {
    return {
      format: "csv",
      holdings: [],
      warnings,
      errors: [
        "CSV must contain a header row and at least one position row (e.g. ticker,name,sector,weightPct).",
      ],
    };
  }

  const headers = rows[0];
  const rawRecords: Record<string, unknown>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rec: Record<string, unknown> = {};
    headers.forEach((h, colIdx) => {
      if (h) rec[h] = cells[colIdx] ?? "";
    });
    rawRecords.push(rec);
  }

  const drafts = extractDraftsFromRecords(rawRecords, warnings, errors);
  if (drafts.length === 0) {
    return { format: "csv", holdings: [], warnings, errors };
  }

  const { holdings, inferredCapital } = finalizeHoldings(drafts, warnings);
  return {
    format: "csv",
    holdings,
    inferredCapital,
    warnings,
    errors,
  };
}

/**
 * Normalizes long-only holdings weights to sum to exactly 100.00%.
 * Leaves long/short books untouched so gross/net leverage isn't distorted.
 */
export function normalizeLongOnlyWeights(holdings: Holding[]): Holding[] {
  if (holdings.length === 0) return holdings;
  const hasShorts = holdings.some((h) => h.side === "SHORT" || h.weightPct < 0);
  if (hasShorts) return holdings;

  const total = holdings.reduce((s, h) => s + Math.abs(h.weightPct), 0);
  if (total <= 0) return holdings;

  let running = 0;
  return holdings.map((h, idx) => {
    if (idx === holdings.length - 1) {
      return {
        ...h,
        weightPct: Number(Math.max(0, 100 - running).toFixed(2)),
      };
    }
    const scaled = Number(((Math.abs(h.weightPct) / total) * 100).toFixed(2));
    running += scaled;
    return { ...h, weightPct: scaled };
  });
}

function escapeCsvCell(val: string | number | undefined): string {
  if (val === undefined || val === null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportHoldingsToCsv(holdings: Holding[]): string {
  const headers = [
    "ticker",
    "name",
    "sector",
    "assetClass",
    "side",
    "weightPct",
    "currentPrice",
    "beta",
    "expectedAnnualReturnPct",
    "annualVolatilityPct",
    "dividendYieldPct",
  ];
  const lines = [headers.join(",")];
  for (const h of holdings) {
    lines.push(
      [
        escapeCsvCell(h.ticker),
        escapeCsvCell(h.name),
        escapeCsvCell(h.sector),
        escapeCsvCell(h.assetClass ?? "equity"),
        escapeCsvCell(h.side ?? (h.weightPct < 0 ? "SHORT" : "LONG")),
        escapeCsvCell(Math.abs(h.weightPct)),
        escapeCsvCell(h.currentPrice),
        escapeCsvCell(h.beta),
        escapeCsvCell(h.expectedAnnualReturnPct),
        escapeCsvCell(h.annualVolatilityPct),
        escapeCsvCell(h.dividendYieldPct ?? 0),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function exportPortfolioToJson(payload: AnalysisRequestPayload): string {
  return JSON.stringify(
    {
      title: payload.title,
      jurisdiction: payload.jurisdiction ?? "Canada",
      capital: payload.capital,
      monthlyContribution: payload.monthlyContribution,
      horizonYears: payload.horizonYears,
      riskProfile: payload.riskProfile,
      holdings: payload.holdings,
    },
    null,
    2
  );
}

export const SAMPLE_PORTFOLIO_CSV = `ticker,name,sector,side,weightPct,currentPrice,beta,expectedAnnualReturnPct,annualVolatilityPct,dividendYieldPct
NVDA,NVIDIA Corp.,Technology,LONG,25,142.00,1.55,17.5,44,0.03
GOOGL,Alphabet Inc.,Technology,LONG,20,184.50,1.08,13.8,25,0.4
VALE,Vale S.A. (Critical Minerals),Mining & Materials,LONG,15,12.40,1.18,14.5,30,6.2
RY.TO,Royal Bank of Canada,Financials,LONG,15,174.20,0.86,9.8,17,3.4
CCJ,Cameco Corp. (Uranium),Energy,LONG,10,54.80,1.24,16.0,36,0.3
XBB.TO,iShares Core Canadian Universe Bond ETF,Fixed Income,LONG,15,27.90,0.05,4.4,7,3.6`;

export const SAMPLE_PORTFOLIO_JSON = JSON.stringify(
  {
    title: "North American AI, Critical Minerals & Income Core",
    jurisdiction: "Canada",
    capital: 250000,
    monthlyContribution: 1500,
    horizonYears: 10,
    riskProfile: "balanced",
    holdings: [
      {
        ticker: "MSFT",
        name: "Microsoft Corp.",
        sector: "Technology",
        assetClass: "equity",
        side: "LONG",
        weightPct: 24,
        currentPrice: 428.5,
        beta: 1.05,
        expectedAnnualReturnPct: 13.2,
        annualVolatilityPct: 23,
        dividendYieldPct: 0.7,
      },
      {
        ticker: "ETN",
        name: "Eaton Corp. (Power Grid)",
        sector: "Industrials",
        assetClass: "equity",
        side: "LONG",
        weightPct: 18,
        currentPrice: 342.0,
        beta: 1.12,
        expectedAnnualReturnPct: 14.0,
        annualVolatilityPct: 24,
        dividendYieldPct: 1.1,
      },
      {
        ticker: "FCX",
        name: "Freeport-McMoRan (Copper)",
        sector: "Mining & Materials",
        assetClass: "equity",
        side: "LONG",
        weightPct: 16,
        currentPrice: 45.6,
        beta: 1.32,
        expectedAnnualReturnPct: 14.8,
        annualVolatilityPct: 35,
        dividendYieldPct: 1.3,
      },
      {
        ticker: "JPM",
        name: "JPMorgan Chase & Co.",
        sector: "Financials",
        assetClass: "equity",
        side: "LONG",
        weightPct: 17,
        currentPrice: 238.0,
        beta: 1.04,
        expectedAnnualReturnPct: 10.6,
        annualVolatilityPct: 21,
        dividendYieldPct: 2.1,
      },
      {
        ticker: "SGOV",
        name: "iShares 0-3 Month Treasury Bond ETF",
        sector: "Fixed Income",
        assetClass: "fixed_income",
        side: "LONG",
        weightPct: 25,
        currentPrice: 100.45,
        beta: 0.01,
        expectedAnnualReturnPct: 4.5,
        annualVolatilityPct: 1.5,
        dividendYieldPct: 4.6,
      },
    ],
  },
  null,
  2
);
