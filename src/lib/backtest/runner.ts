import { runAnalystOnFundamentals } from "../analyst";
import type { CompanyFundamentals, FinancialPeriod } from "../fundamentals/types";
import type { TemplateId } from "../fundamentals/sector";
import { buildModelFromFundamentals } from "../model";
import type { AnalystModel, RatesProvider } from "../providers/types";
import { FredDamodaranRatesProvider } from "../providers/rates";
import { forecastNaiveSeasonal } from "./naive";
import type {
  BacktestGateResult,
  BacktestReport,
  ForecastPoint,
  ForecasterMetrics,
  ForecasterName,
  LookAheadAudit,
  QuarterBacktestRow,
  TemplateScorecard,
} from "./types";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ape(forecast: number, actual: number): number {
  const denom = Math.max(1e-6, Math.abs(actual));
  return Math.abs(forecast - actual) / denom;
}

function subtractOneDay(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function latestFiledDate(p: FinancialPeriod): string {
  let latest = p.end;
  for (const src of Object.values(p.sources)) {
    if (src?.filed && src.filed > latest) latest = src.filed;
  }
  return latest;
}

/**
 * Slices a full CompanyFundamentals object strictly to `asOf` (simulating Phase 1 point-in-time
 * cutoff without re-parsing raw SEC JSON for every quarter).
 */
export function sliceFundamentalsAsOf(full: CompanyFundamentals, asOf: string): CompanyFundamentals {
  const annual = full.history.annual.filter((p) => latestFiledDate(p) <= asOf);
  const quarterly = full.history.quarterly.filter((p) => latestFiledDate(p) <= asOf);
  const lastFiled = [...annual, ...quarterly]
    .map(latestFiledDate)
    .sort()
    .pop() ?? null;

  return {
    ...full,
    history: {
      ...full.history,
      asOf,
      annual,
      quarterly,
      lastFiled,
      latestSharesOutstanding:
        full.history.latestSharesOutstanding && full.history.latestSharesOutstanding.filed <= asOf
          ? full.history.latestSharesOutstanding
          : null,
    },
  };
}

function summarizeForecaster(rows: QuarterBacktestRow[], name: ForecasterName): ForecasterMetrics {
  const revApes = rows.map((r) => r.revenueApe[name]);
  const epsApes = rows.map((r) => r.epsApe[name]);

  let revDirTotal = 0;
  let revDirHits = 0;
  let epsDirTotal = 0;
  let epsDirHits = 0;

  for (const r of rows) {
    if (r.priorYearRevenue !== null) {
      revDirTotal++;
      const actualUp = r.actualRevenue >= r.priorYearRevenue;
      const predUp = r.forecasts[name].revenue >= r.priorYearRevenue;
      if (actualUp === predUp) revDirHits++;
    }
    if (r.priorYearEps !== null) {
      epsDirTotal++;
      const actualUp = r.actualEps >= r.priorYearEps;
      const predUp = r.forecasts[name].epsDiluted >= r.priorYearEps;
      if (actualUp === predUp) epsDirHits++;
    }
  }

  return {
    count: rows.length,
    medianRevenueApe: median(revApes),
    medianEpsApe: median(epsApes),
    revenueDirectionalHitRate: revDirTotal > 0 ? revDirHits / revDirTotal : 0,
    epsDirectionalHitRate: epsDirTotal > 0 ? epsDirHits / epsDirTotal : 0,
  };
}

export interface BacktestRunnerOptions {
  /** Number of trailing quarters to evaluate per company (default 8). */
  quartersPerCompany?: number;
  /** Factory producing an AnalystModel for a given company & asOf date. */
  createAnalystForQuarter: (company: CompanyFundamentals, asOf: string, targetPeriodId: string) => AnalystModel;
  ratesProvider?: RatesProvider;
  /** Minimum templates where analyst must beat naive on median revenue error (default 6 of 8). */
  requiredTemplateWins?: number;
}

/**
 * Phase 5 Point-in-Time Backtesting Engine & Expansion Gate.
 * Scores naive seasonal baseline, Phase 2 mechanical baseline, and Phase 3 analyst
 * strictly without look-ahead, then evaluates the expansion gate.
 */
export async function runPointInTimeBacktest(
  companies: CompanyFundamentals[],
  opts: BacktestRunnerOptions
): Promise<BacktestReport> {
  const quartersPerCompany = opts.quartersPerCompany ?? 8;
  const ratesProvider = opts.ratesProvider ?? new FredDamodaranRatesProvider({ allowNetwork: false });
  const rows: QuarterBacktestRow[] = [];

  for (const full of companies) {
    const validQuarters = full.history.quarterly
      .filter(
        (q) =>
          q.fiscalQuarter !== null &&
          typeof q.values.revenue === "number" &&
          q.values.revenue > 0 &&
          typeof q.values.epsDiluted === "number"
      )
      .sort((a, b) => a.end.localeCompare(b.end));

    const targets = validQuarters.slice(-quartersPerCompany);

    for (const target of targets) {
      const filed = latestFiledDate(target);
      const asOf = subtractOneDay(filed);
      const pit = sliceFundamentalsAsOf(full, asOf);
      if (pit.history.annual.length === 0 || pit.history.quarterly.length < 4) continue;

      const actualRevenue = target.values.revenue!;
      const actualEps = target.values.epsDiluted!;
      const priorYearQ = full.history.quarterly.find(
        (q) => q.fiscalYear === target.fiscalYear - 1 && q.fiscalQuarter === target.fiscalQuarter
      );

      // 1. Naive seasonal baseline
      const naiveFc: ForecastPoint = forecastNaiveSeasonal(
        pit.history.quarterly,
        target.fiscalYear,
        target.fiscalQuarter!
      );

      // 2. Phase 2 mechanical baseline
      const baseModel = buildModelFromFundamentals(pit, { valuationDate: asOf });
      const baseQ =
        baseModel.quarterlyOutlook.find((q) => !q.actual && q.periodId.startsWith(`FY${target.fiscalYear}Q${target.fiscalQuarter}`)) ??
        baseModel.quarterlyOutlook.find((q) => !q.actual);
      const baselineFc: ForecastPoint = baseQ
        ? { revenue: baseQ.revenue, epsDiluted: baseQ.epsDiluted }
        : { revenue: baseModel.projections[0].revenue / 4, epsDiluted: baseModel.projections[0].epsDiluted / 4 };

      // 3. Phase 3 analyst
      const analystModel = opts.createAnalystForQuarter(pit, asOf, target.id);
      const analystRes = await runAnalystOnFundamentals(pit, {
        asOf,
        valuationDate: asOf,
        ratesProvider,
        analystModel,
      });
      const analystQ =
        analystRes.model.quarterlyOutlook.find(
          (q) => !q.actual && q.periodId.startsWith(`FY${target.fiscalYear}Q${target.fiscalQuarter}`)
        ) ?? analystRes.model.quarterlyOutlook.find((q) => !q.actual);
      const analystFc: ForecastPoint = analystQ
        ? { revenue: analystQ.revenue, epsDiluted: analystQ.epsDiluted }
        : { revenue: analystRes.model.projections[0].revenue / 4, epsDiluted: analystRes.model.projections[0].epsDiluted / 4 };

      // Look-ahead audit on every citation
      const violations: string[] = [];
      let validCitations = 0;
      for (const c of analystRes.citations) {
        if (c.passage.filed <= asOf) validCitations++;
        else violations.push(`${full.profile.ticker} ${target.id}: citation ${c.citationId} filed ${c.passage.filed} > asOf ${asOf}`);
      }

      rows.push({
        ticker: full.profile.ticker,
        templateId: full.profile.templateId as TemplateId,
        targetPeriodId: target.id,
        asOf,
        actualRevenue,
        actualEps,
        priorYearRevenue: priorYearQ?.values.revenue ?? null,
        priorYearEps: priorYearQ?.values.epsDiluted ?? null,
        forecasts: { naive: naiveFc, baseline: baselineFc, analyst: analystFc },
        revenueApe: {
          naive: ape(naiveFc.revenue, actualRevenue),
          baseline: ape(baselineFc.revenue, actualRevenue),
          analyst: ape(analystFc.revenue, actualRevenue),
        },
        epsApe: {
          naive: ape(naiveFc.epsDiluted, actualEps),
          baseline: ape(baselineFc.epsDiluted, actualEps),
          analyst: ape(analystFc.epsDiluted, actualEps),
        },
        citationsChecked: analystRes.citations.length,
        citationsValidBeforeAsOf: validCitations,
        lookAheadViolations: violations,
      });
    }
  }

  const overall: Record<ForecasterName, ForecasterMetrics> = {
    naive: summarizeForecaster(rows, "naive"),
    baseline: summarizeForecaster(rows, "baseline"),
    analyst: summarizeForecaster(rows, "analyst"),
  };

  // Group by template
  const templateMap = new Map<TemplateId, QuarterBacktestRow[]>();
  for (const r of rows) {
    const list = templateMap.get(r.templateId) ?? [];
    list.push(r);
    templateMap.set(r.templateId, list);
  }

  const byTemplate: TemplateScorecard[] = [];
  for (const [templateId, tRows] of templateMap.entries()) {
    const naive = summarizeForecaster(tRows, "naive");
    const baseline = summarizeForecaster(tRows, "baseline");
    const analyst = summarizeForecaster(tRows, "analyst");
    byTemplate.push({
      templateId,
      naive,
      baseline,
      analyst,
      analystBeatsNaiveRevenue: analyst.medianRevenueApe < naive.medianRevenueApe,
      analystBeatsBaselineEps: analyst.medianEpsApe < baseline.medianEpsApe,
    });
  }

  const totalCitations = rows.reduce((s, r) => s + r.citationsChecked, 0);
  const validCitations = rows.reduce((s, r) => s + r.citationsValidBeforeAsOf, 0);
  const allViolations = rows.flatMap((r) => r.lookAheadViolations);
  const lookAheadAudit: LookAheadAudit = {
    totalCitations,
    validCitations,
    cleanRate: totalCitations > 0 ? validCitations / totalCitations : 1,
    violations: allViolations,
  };

  const templatesBeatingNaiveRevenue = byTemplate.filter((t) => t.analystBeatsNaiveRevenue).length;
  const requiredTemplatesToBeat = opts.requiredTemplateWins ?? Math.min(6, byTemplate.length);
  const analystBeatsBaselineEpsOverall = overall.analyst.medianEpsApe < overall.baseline.medianEpsApe;
  const lookAheadPassed = lookAheadAudit.cleanRate === 1 && allViolations.length === 0;

  const reasons: string[] = [];
  if (templatesBeatingNaiveRevenue < requiredTemplatesToBeat) {
    reasons.push(`Analyst beat naive revenue error in ${templatesBeatingNaiveRevenue}/${byTemplate.length} templates (need >= ${requiredTemplatesToBeat}).`);
  }
  if (!analystBeatsBaselineEpsOverall) {
    reasons.push(
      `Analyst median EPS error (${(overall.analyst.medianEpsApe * 100).toFixed(2)}%) did not beat Phase 2 baseline (${(overall.baseline.medianEpsApe * 100).toFixed(2)}%).`
    );
  }
  if (!lookAheadPassed) {
    reasons.push(`Look-ahead audit failed (${(lookAheadAudit.cleanRate * 100).toFixed(1)}% clean, ${allViolations.length} violations).`);
  }

  const gate: BacktestGateResult = {
    passed: reasons.length === 0,
    templatesBeatingNaiveRevenue,
    totalTemplatesEvaluated: byTemplate.length,
    requiredTemplatesToBeat,
    analystBeatsBaselineEpsOverall,
    lookAheadCleanRate: lookAheadAudit.cleanRate,
    reasons,
  };

  return {
    generatedAt: new Date().toISOString(),
    companiesEvaluated: new Set(rows.map((r) => r.ticker)).size,
    quartersEvaluated: rows.length,
    overall,
    byTemplate,
    lookAheadAudit,
    gate,
    rows,
  };
}
