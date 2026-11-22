import type { CompanyFundamentals, FinancialPeriod } from "../fundamentals/types";
import type { TemplateId } from "../fundamentals/sector";
import type { AssumptionNote } from "../model/types";
import type {
  CompanyDossier,
  DossierPassage,
  FilingSectionKind,
  GuidanceItem,
  KpiPoint,
  SegmentRow,
} from "./types";

const fmtNum = (x: number | undefined, decimals = 1): string =>
  typeof x === "number" && Number.isFinite(x) ? x.toFixed(decimals) : "";

const fmtMoneyM = (x: number | undefined): string =>
  typeof x === "number" && Number.isFinite(x) ? (x / 1e6).toFixed(1) : "";

const fmtPct = (x: number | undefined): string =>
  typeof x === "number" && Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : "";

export function formatHistoryCsv(periods: FinancialPeriod[], maxRows = 10): string {
  const rows = periods.slice(-maxRows);
  const header = "period,end,rev_m,gp_m,ebit_m,ni_m,eps,cfo_m,capex_m,fcf_m,cash_m,debt_m,equity_m,filed";
  const lines = [header];
  for (const p of rows) {
    const v = p.values;
    const filed = latestFiledInPeriod(p) ?? p.end;
    lines.push(
      [
        p.id,
        p.end,
        fmtMoneyM(v.revenue),
        fmtMoneyM(v.grossProfit),
        fmtMoneyM(v.operatingIncome),
        fmtMoneyM(v.netIncome),
        fmtNum(v.epsDiluted, 2),
        fmtMoneyM(v.operatingCashFlow),
        fmtMoneyM(v.capex),
        fmtMoneyM(v.freeCashFlow),
        fmtMoneyM(v.cash),
        fmtMoneyM(v.totalDebt),
        fmtMoneyM(v.equity),
        filed,
      ].join(",")
    );
  }
  return lines.join("\n");
}

function latestFiledInPeriod(p: FinancialPeriod): string | null {
  let latest: string | null = null;
  for (const src of Object.values(p.sources)) {
    if (src?.filed && (!latest || src.filed > latest)) latest = src.filed;
  }
  return latest;
}

/**
 * Validates that segment revenues sum to reported revenue within tolerance (default 2%).
 * Per Phase 3b: "Segments must sum to reported totals or are rejected."
 */
export function validateSegmentSum(
  segments: SegmentRow[],
  periods: FinancialPeriod[],
  tolerance = 0.02
): { accepted: SegmentRow[]; warnings: string[] } {
  const byPeriod = new Map<string, SegmentRow[]>();
  for (const row of segments) {
    const list = byPeriod.get(row.periodId) ?? [];
    list.push(row);
    byPeriod.set(row.periodId, list);
  }

  const periodMap = new Map(periods.map((p) => [p.id, p]));
  const accepted: SegmentRow[] = [];
  const warnings: string[] = [];

  for (const [periodId, rows] of byPeriod.entries()) {
    const reported = periodMap.get(periodId)?.values.revenue;
    if (typeof reported !== "number" || reported <= 0) {
      warnings.push(`Rejected segments for ${periodId}: reported revenue unavailable to reconcile.`);
      continue;
    }
    const sum = rows.reduce((s, r) => s + r.revenue, 0);
    const diff = Math.abs(sum - reported) / reported;
    if (diff > tolerance) {
      warnings.push(
        `Rejected segments for ${periodId}: segment sum (${(sum / 1e6).toFixed(1)}M) differs from reported revenue (${(reported / 1e6).toFixed(1)}M) by ${(diff * 100).toFixed(1)}% (> ${(tolerance * 100).toFixed(0)}%).`
      );
      continue;
    }
    accepted.push(...rows);
  }

  return { accepted, warnings };
}

/**
 * Derive compact XBRL-grounded passages from normalized SEC history so every company
 * has verifiable, dated passages even before live 10-K/8-K narrative scraping.
 */
function buildFinancialPassages(f: CompanyFundamentals): DossierPassage[] {
  const passages: DossierPassage[] = [];
  const annual = f.history.annual.slice(-5);

  for (let i = 0; i < annual.length; i++) {
    const p = annual[i];
    const prev = i > 0 ? annual[i - 1] : null;
    const v = p.values;
    const rev = v.revenue;
    const revGrowth =
      typeof rev === "number" && prev?.values.revenue && prev.values.revenue > 0
        ? (rev - prev.values.revenue) / prev.values.revenue
        : undefined;
    const gm = typeof v.grossProfit === "number" && rev ? v.grossProfit / rev : undefined;
    const ebitM = typeof v.operatingIncome === "number" && rev ? v.operatingIncome / rev : undefined;
    const capexPct = typeof v.capex === "number" && rev ? Math.abs(v.capex) / rev : undefined;
    const sbcPct = typeof v.stockBasedCompensation === "number" && rev ? v.stockBasedCompensation / rev : undefined;
    const revSrc = p.sources.revenue ?? Object.values(p.sources)[0];
    const filed = latestFiledInPeriod(p) ?? p.end;

    passages.push({
      id: `FIN-${p.id}`,
      section: "financials",
      title: `${f.profile.ticker} ${p.id} Reported Financial Summary`,
      filed,
      form: revSrc?.form ?? "10-K",
      accn: revSrc?.accn,
      text:
        `${p.id} (ended ${p.end}, filed ${filed}): ` +
        `Revenue ${fmtMoneyM(rev)}M${revGrowth !== undefined ? ` (${fmtPct(revGrowth)} YoY)` : ""}, ` +
        `Gross Margin ${fmtPct(gm)}, EBIT Margin ${fmtPct(ebitM)}, ` +
        `Net Income ${fmtMoneyM(v.netIncome)}M, Diluted EPS ${fmtNum(v.epsDiluted, 2)}, ` +
        `Capex/Rev ${fmtPct(capexPct)}, SBC/Rev ${fmtPct(sbcPct)}, ` +
        `FCF ${fmtMoneyM(v.freeCashFlow)}M.`,
    });
  }

  const recentQ = f.history.quarterly.slice(-4);
  for (const q of recentQ) {
    const v = q.values;
    const rev = v.revenue;
    const ebitM = typeof v.operatingIncome === "number" && rev ? v.operatingIncome / rev : undefined;
    const revSrc = q.sources.revenue ?? Object.values(q.sources)[0];
    const filed = latestFiledInPeriod(q) ?? q.end;
    passages.push({
      id: `FIN-${q.id}`,
      section: "financials",
      title: `${f.profile.ticker} ${q.id} Quarterly Filing Summary`,
      filed,
      form: revSrc?.form ?? "10-Q",
      accn: revSrc?.accn,
      text:
        `${q.id} (ended ${q.end}, filed ${filed}): ` +
        `Revenue ${fmtMoneyM(rev)}M, EBIT Margin ${fmtPct(ebitM)}, ` +
        `Net Income ${fmtMoneyM(v.netIncome)}M, Diluted EPS ${fmtNum(v.epsDiluted, 2)}.`,
    });
  }

  return passages;
}

/**
 * Derive standard operating KPIs from normalized fundamentals (margin, ROIC proxy, FCF conversion, NWC days).
 */
function deriveOperatingKpis(f: CompanyFundamentals): KpiPoint[] {
  const kpis: KpiPoint[] = [];
  for (const p of f.history.annual.slice(-5)) {
    const v = p.values;
    const filed = latestFiledInPeriod(p) ?? p.end;
    const rev = v.revenue;
    if (typeof rev === "number" && rev > 0) {
      if (typeof v.grossProfit === "number") {
        kpis.push({ periodId: p.id, metric: "gross_margin", value: v.grossProfit / rev, unit: "ratio", filed, source: `SEC ${p.id}` });
      }
      if (typeof v.operatingIncome === "number") {
        kpis.push({ periodId: p.id, metric: "ebit_margin", value: v.operatingIncome / rev, unit: "ratio", filed, source: `SEC ${p.id}` });
      }
      if (typeof v.freeCashFlow === "number") {
        kpis.push({ periodId: p.id, metric: "fcf_margin", value: v.freeCashFlow / rev, unit: "ratio", filed, source: `SEC ${p.id}` });
      }
      if (typeof v.researchAndDevelopment === "number") {
        kpis.push({ periodId: p.id, metric: "rd_pct_revenue", value: v.researchAndDevelopment / rev, unit: "ratio", filed, source: `SEC ${p.id}` });
      }
    }
  }
  return kpis;
}

export interface BuildDossierOptions {
  /** Point-in-time cutoff (YYYY-MM-DD). All passages/guidance/KPIs with filed > asOf are stripped. */
  asOf?: string | null;
  /** Additional filing passages (e.g. MD&A, segment notes, 8-K exhibit 99.1 excerpts). */
  extraPassages?: DossierPassage[];
  /** Raw segment rows (reconciled against reported revenue). */
  segments?: SegmentRow[];
  /** Additional KPI points. */
  extraKpis?: KpiPoint[];
  /** Dated management guidance entries. */
  guidance?: GuidanceItem[];
  /** Prior model version's assumption notes ("what changed since last model"). */
  priorAssumptions?: AssumptionNote[];
}

/**
 * Strict point-in-time filter for a dossier (zero look-ahead guarantee).
 */
export function filterDossierAsOf(dossier: CompanyDossier, asOf: string | null): CompanyDossier {
  if (!asOf) return dossier;
  return {
    ...dossier,
    asOf,
    segments: dossier.segments.filter((s) => s.filed <= asOf),
    kpis: dossier.kpis.filter((k) => k.filed <= asOf),
    guidance: dossier.guidance.filter((g) => g.filed <= asOf),
    passages: dossier.passages.filter((p) => p.filed <= asOf),
  };
}

export function buildCompanyDossier(f: CompanyFundamentals, opts: BuildDossierOptions = {}): CompanyDossier {
  const asOf = opts.asOf ?? f.history.asOf ?? null;
  const allPeriods = [...f.history.annual, ...f.history.quarterly];
  const { accepted: segments, warnings: segmentWarnings } = validateSegmentSum(opts.segments ?? [], allPeriods);

  const guidancePassages: DossierPassage[] = (opts.guidance ?? []).map((g) => ({
    id: g.id,
    section: "guidance" as FilingSectionKind,
    title: `Management Guidance: ${g.targetPeriod} ${g.metric}`,
    filed: g.filed,
    form: g.form,
    accn: g.accn,
    text: `${g.targetPeriod} ${g.metric}: ${g.quote}`,
  }));

  const passages = [...buildFinancialPassages(f), ...(opts.extraPassages ?? []), ...guidancePassages];
  const kpis = [...deriveOperatingKpis(f), ...(opts.extraKpis ?? [])];

  const annualCsv = formatHistoryCsv(f.history.annual, 10);
  const quarterlyCsv = formatHistoryCsv(f.history.quarterly, 12);

  const rawDossier: CompanyDossier = {
    ticker: f.profile.ticker,
    name: f.profile.name,
    cik: f.profile.cik,
    templateId: f.profile.templateId as TemplateId,
    currency: f.history.currency,
    asOf,
    annualCsv,
    quarterlyCsv,
    segments,
    segmentWarnings,
    kpis,
    guidance: opts.guidance ?? [],
    priorAssumptions: opts.priorAssumptions ?? [],
    passages,
    estimatedTokens: 0,
  };

  const filtered = filterDossierAsOf(rawDossier, asOf);
  const charCount =
    filtered.annualCsv.length +
    filtered.quarterlyCsv.length +
    filtered.passages.reduce((s, p) => s + p.text.length + p.title.length, 0) +
    JSON.stringify(filtered.priorAssumptions).length;
  filtered.estimatedTokens = Math.ceil(charCount / 4);
  return filtered;
}

export function lookupCitation(dossier: CompanyDossier, citationId: string): DossierPassage | null {
  return dossier.passages.find((p) => p.id === citationId) ?? null;
}

export function getPassagesBySection(dossier: CompanyDossier, section: FilingSectionKind): DossierPassage[] {
  return dossier.passages.filter((p) => p.section === section);
}
