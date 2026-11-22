import { coverageScore, runQualityChecks } from "./checks";
import { templateForCompany, type TemplateId } from "./sector";
import type { CompanyFundamentals, FinancialHistory, FinancialPeriod } from "./types";
import type { FundamentalsProvider } from "../providers/types";
import { SecFundamentalsProvider } from "../providers/sec-fundamentals";
import type { FundamentalsOptions } from "./index";

export interface InternationalAnnualFactRow {
  fiscalYear: number;
  start: string;
  end: string;
  filed: string;
  revenue: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  epsDiluted?: number;
  dilutedShares?: number;
  operatingCashFlow?: number;
  capex?: number;
  cash?: number;
  totalAssets?: number;
  totalDebt?: number;
  stockholdersEquity?: number;
  ppe?: number;
  depreciationAmortization?: number;
}

/**
 * Pure normalizer converting ESEF (EU IFRS) or EDINET (Japan FSA) annual fact rows
 * into ThesisLens's standard CompanyFundamentals shape with full point-in-time `asOf` filtering.
 */
export function normalizeInternationalFacts(input: {
  ticker: string;
  entityName: string;
  currency: string;
  exchange: string;
  templateId?: TemplateId;
  sourceLabel: "ESEF-iXBRL" | "EDINET-JP";
  rows: InternationalAnnualFactRow[];
  asOf?: string | null;
}): CompanyFundamentals {
  const asOf = input.asOf ?? null;
  const visible = input.rows
    .filter((r) => !asOf || r.filed <= asOf)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);

  const annual: FinancialPeriod[] = visible.map((r) => {
    const fcf =
      typeof r.operatingCashFlow === "number" && typeof r.capex === "number"
        ? r.operatingCashFlow - Math.abs(r.capex)
        : undefined;
    const src = { tags: [`${input.sourceLabel}:ifrs`], method: "reported" as const, form: input.sourceLabel, filed: r.filed };
    return {
      id: `FY${r.fiscalYear}`,
      fiscalYear: r.fiscalYear,
      fiscalQuarter: null,
      start: r.start,
      end: r.end,
      values: {
        revenue: r.revenue,
        grossProfit: r.grossProfit,
        operatingIncome: r.operatingIncome,
        netIncome: r.netIncome,
        epsDiluted: r.epsDiluted,
        dilutedShares: r.dilutedShares,
        operatingCashFlow: r.operatingCashFlow,
        capex: r.capex !== undefined ? Math.abs(r.capex) : undefined,
        freeCashFlow: fcf,
        cash: r.cash,
        totalAssets: r.totalAssets,
        totalDebt: r.totalDebt,
        equity: r.stockholdersEquity,
        ppe: r.ppe,
        depreciationAmortization: r.depreciationAmortization,
      },
      sources: {
        revenue: src,
        operatingIncome: src,
        netIncome: src,
      },
    };
  });

  const last = visible[visible.length - 1];
  const templateId = input.templateId ?? templateForCompany(input.ticker, null);
  const history: FinancialHistory = {
    cik: 0,
    entityName: input.entityName,
    currency: input.currency,
    taxonomy: "ifrs-full",
    asOf,
    annual,
    quarterly: [],
    latestSharesOutstanding: last?.dilutedShares
      ? { value: last.dilutedShares, date: last.end, filed: last.filed, accn: `${input.sourceLabel}-${last.fiscalYear}` }
      : null,
    lastFiled: last?.filed ?? null,
  };

  return {
    profile: {
      ticker: input.ticker.toUpperCase(),
      cik: 0,
      name: input.entityName,
      sic: null,
      sicDescription: input.sourceLabel,
      exchanges: [input.exchange],
      fiscalYearEnd: last ? last.end.slice(5, 10).replace("-", "") : null,
      templateId,
    },
    history,
    checks: runQualityChecks(history, templateId),
    coverageScore: coverageScore(history, templateId),
  };
}

const EU_SUFFIX_RE = /\.(DE|PA|AS|MC|MI|CO|ST|HE|OL|BR|LS|VI|SW)$/i;
const JP_SUFFIX_RE = /\.T$/i;

/**
 * EU ESEF iXBRL provider (filings.xbrl.org) — Phase 6 non-SEC adapter.
 */
export class EsefFundamentalsProvider implements FundamentalsProvider {
  readonly id = "esef-xbrl";

  constructor(private readonly fixtureStore: Record<string, Parameters<typeof normalizeInternationalFacts>[0]> = {}) {}

  supports(ticker: string): boolean {
    return EU_SUFFIX_RE.test(ticker.trim()) || Boolean(this.fixtureStore[ticker.trim().toUpperCase()]);
  }

  async getFundamentals(ticker: string, opts?: FundamentalsOptions): Promise<CompanyFundamentals> {
    const key = ticker.trim().toUpperCase();
    const local = this.fixtureStore[key];
    if (local) {
      return normalizeInternationalFacts({ ...local, asOf: opts?.asOf ?? null });
    }
    // Live ESEF API lookup (filings.xbrl.org)
    const url = `https://filings.xbrl.org/api/filings?filter[entity.name]=${encodeURIComponent(key)}&page[size]=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`ESEF filings.xbrl.org lookup failed for ${key} (HTTP ${res.status}).`);
    throw new Error(`ESEF live XBRL extraction for ${key} requires a mapped LEI or paid FundamentalsProvider adapter.`);
  }
}

/**
 * Japan FSA EDINET v2 provider — Phase 6 non-SEC adapter.
 */
export class EdinetFundamentalsProvider implements FundamentalsProvider {
  readonly id = "edinet-jp";

  constructor(private readonly fixtureStore: Record<string, Parameters<typeof normalizeInternationalFacts>[0]> = {}) {}

  supports(ticker: string): boolean {
    return JP_SUFFIX_RE.test(ticker.trim()) || Boolean(this.fixtureStore[ticker.trim().toUpperCase()]);
  }

  async getFundamentals(ticker: string, opts?: FundamentalsOptions): Promise<CompanyFundamentals> {
    const key = ticker.trim().toUpperCase();
    const local = this.fixtureStore[key];
    if (local) {
      return normalizeInternationalFacts({ ...local, asOf: opts?.asOf ?? null });
    }
    const apiKey = process.env.EDINET_API_KEY;
    if (!apiKey) {
      throw new Error(`EDINET provider requires EDINET_API_KEY for live Japanese filings (${key}).`);
    }
    throw new Error(`EDINET live XBRL extraction for ${key} requires a mapped EDINET code.`);
  }
}

/**
 * Composite FundamentalsProvider routing across SEC EDGAR, EU ESEF, Japan EDINET,
 * and any optional paid vendor adapter (FMP, EODHD, FactSet, LSEG — Decision D1).
 */
export class CompositeFundamentalsProvider implements FundamentalsProvider {
  readonly id = "composite-global";
  private readonly providers: FundamentalsProvider[];

  constructor(providers?: FundamentalsProvider[]) {
    this.providers = providers ?? [
      new SecFundamentalsProvider(),
      new EsefFundamentalsProvider(),
      new EdinetFundamentalsProvider(),
    ];
  }

  supports(ticker: string): boolean {
    return this.providers.some((p) => p.supports(ticker));
  }

  async getFundamentals(ticker: string, opts?: FundamentalsOptions): Promise<CompanyFundamentals> {
    for (const p of this.providers) {
      if (p.supports(ticker)) {
        return p.getFundamentals(ticker, opts);
      }
    }
    throw new Error(`No FundamentalsProvider supports ticker "${ticker}".`);
  }
}
