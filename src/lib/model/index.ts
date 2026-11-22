import { getCompanyFundamentals } from "../fundamentals";
import type { CompanyFundamentals, FinancialPeriod } from "../fundamentals/types";
import { buildBaseline, ModelDataError } from "./baseline";
import { projectStatements } from "./engine";
import { templateConfig } from "./templates";
import {
  DRIVER_KEYS,
  type AssumptionNote,
  type AssumptionOverrides,
  type CompanyModel,
  type DriverInput,
  type DriverKey,
  type ModelAssumptions,
  type ModelCheck,
  type QuarterlyOutlook,
  type ScenarioResult,
} from "./types";
import { computeWacc, valueCompany } from "./valuation";
import {
  buildSpecialistFinancialModel,
  enhanceOperatingModelForSector,
  isFinancialSectorTemplate,
  type PipelineAsset,
} from "./sectors";

export * from "./types";
export * from "./sectors";
export { ModelDataError } from "./baseline";
export { MARKET_DEFAULTS } from "./baseline";

export class ModelUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnsupportedError";
  }
}
export class ModelInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelInputError";
  }
}

export interface BuildModelOptions {
  /** Price per share in the reporting currency (ADRs: convert for the ADR ratio first). */
  currentPrice?: number | null;
  overrides?: AssumptionOverrides;
  /** Defaults to asOf, else today. */
  valuationDate?: string;
  scenarioProbabilities?: { bear: number; base: number; bull: number };
  /** Optional clinical pipeline assets for Pharma/Biotech rNPV valuation (Phase 6). */
  pipelineAssets?: PipelineAsset[];
}

const DRIVER_BOUNDS: Record<DriverKey, [number, number]> = {
  revenueGrowth: [-0.9, 3],
  ebitMargin: [-2, 0.9],
  grossMargin: [-1, 1],
  daPctRevenue: [0, 0.6],
  capexPctRevenue: [0, 1],
  sbcPctRevenue: [0, 0.6],
  taxRate: [0, 0.6],
  dso: [0, 720],
  dio: [0, 720],
  dpo: [0, 720],
  dividendPayout: [0, 3],
  buybackPctOfFcf: [0, 3],
  shareCountChange: [-0.25, 0.5],
};

export function expandPath(input: DriverInput, years: number, key: string): number[] {
  const arr = Array.isArray(input) ? input : [input];
  if (arr.length === 0) throw new ModelInputError(`${key}: empty path.`);
  if (arr.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
    throw new ModelInputError(`${key}: every value must be a finite number.`);
  }
  return Array.from({ length: years }, (_, i) => arr[Math.min(i, arr.length - 1)]);
}

const fmt = (x: number) => (Math.abs(x) < 5 ? `${(x * 100).toFixed(1)}%` : x.toFixed(1));

/** Apply overrides onto baseline assumptions, recording a note for every change. */
export function applyOverrides(
  baseline: ModelAssumptions,
  overrides: AssumptionOverrides | undefined,
  notes: AssumptionNote[]
): ModelAssumptions {
  if (!overrides) return baseline;
  const years = baseline.years;
  const out: ModelAssumptions = {
    years,
    drivers: { ...baseline.drivers },
    financing: { ...baseline.financing },
    valuation: { ...baseline.valuation },
  };
  const why = (key: string) => overrides.rationale?.[key] ?? "User override.";

  for (const [key, value] of Object.entries(overrides.drivers ?? {})) {
    if (!(DRIVER_KEYS as readonly string[]).includes(key)) throw new ModelInputError(`Unknown driver "${key}".`);
    if (value === undefined) continue;
    const k = key as DriverKey;
    const path = expandPath(value, years, k);
    const [lo, hi] = DRIVER_BOUNDS[k];
    if (path.some((x) => x < lo || x > hi)) throw new ModelInputError(`${k} must stay within [${lo}, ${hi}].`);
    out.drivers[k] = path;
    notes.push({ key: k, value: path.length > 1 && new Set(path).size > 1 ? `${fmt(path[0])} → ${fmt(path[path.length - 1])}` : fmt(path[0]), basis: why(k), source: "override" });
  }

  const fin = overrides.financing ?? {};
  for (const k of ["interestRateOnDebt", "interestRateOnCash", "minCashPctRevenue"] as const) {
    const v = fin[k];
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < 0 || v > 0.5) throw new ModelInputError(`${k} must be between 0 and 0.5.`);
    out.financing[k] = v;
    notes.push({ key: k, value: fmt(v), basis: why(k), source: "override" });
  }
  if (fin.debtChange !== undefined) {
    out.financing.debtChange = expandPath(fin.debtChange, years, "debtChange");
    notes.push({ key: "debtChange", value: "custom schedule", basis: why("debtChange"), source: "override" });
  }

  const val = overrides.valuation ?? {};
  for (const [k, v] of Object.entries(val)) {
    if (v === undefined) continue;
    if (k === "sbcTreatment") {
      if (v !== "expense" && v !== "addback") throw new ModelInputError("sbcTreatment must be 'expense' or 'addback'.");
    } else if (typeof v !== "number" || !Number.isFinite(v) || v < -0.05 || v > 3) {
      throw new ModelInputError(`valuation.${k} is out of range.`);
    }
    (out.valuation as unknown as Record<string, unknown>)[k] = v;
    notes.push({ key: k, value: typeof v === "number" ? fmt(v) : String(v), basis: why(k), source: "override" });
  }
  return out;
}

function latestBalanceSheet(f: CompanyFundamentals): FinancialPeriod | undefined {
  return [...f.history.annual, ...f.history.quarterly]
    .filter((p) => typeof p.values.totalAssets === "number")
    .sort((a, b) => a.end.localeCompare(b.end))
    .pop();
}

function seasonalShares(f: CompanyFundamentals, item: "revenue" | "netIncome", fy0: number): number[] {
  const shares: number[][] = [];
  for (const fy of [fy0, fy0 - 1]) {
    const qs = [1, 2, 3, 4].map((k) => f.history.quarterly.find((q) => q.fiscalYear === fy && q.fiscalQuarter === k)?.values[item]);
    const total = qs.reduce<number>((a, x) => a + (x ?? NaN), 0);
    if (qs.every((x) => typeof x === "number") && total > 0 && qs.every((x) => (x as number) > 0)) {
      shares.push(qs.map((x) => (x as number) / total));
    }
  }
  if (shares.length === 0) return [0.25, 0.25, 0.25, 0.25];
  return [0, 1, 2, 3].map((k) => shares.reduce((a, s) => a + s[k], 0) / shares.length);
}

function quarterlyOutlook(
  f: CompanyFundamentals,
  model: Pick<CompanyModel, "projections" | "base">,
  ytd: FinancialPeriod[]
): QuarterlyOutlook[] {
  const out: QuarterlyOutlook[] = [];
  const revShare = seasonalShares(f, "revenue", model.base.fiscalYear);
  const niShare = seasonalShares(f, "netIncome", model.base.fiscalYear);
  for (const [i, year] of model.projections.slice(0, 2).entries()) {
    const actuals = i === 0 ? ytd : [];
    const actualRev = actuals.reduce((a, q) => a + (q.values.revenue ?? 0), 0);
    const actualEps = actuals.reduce((a, q) => a + (q.values.epsDiluted ?? 0), 0);
    const remaining = [1, 2, 3, 4].filter((k) => !actuals.some((q) => q.fiscalQuarter === k));
    const remRevShare = remaining.reduce((a, k) => a + revShare[k - 1], 0) || 1;
    const remNiShare = remaining.reduce((a, k) => a + niShare[k - 1], 0) || 1;
    for (const k of [1, 2, 3, 4]) {
      const actual = actuals.find((q) => q.fiscalQuarter === k);
      if (actual) {
        out.push({ periodId: actual.id, revenue: actual.values.revenue ?? 0, epsDiluted: actual.values.epsDiluted ?? 0, actual: true });
      } else {
        out.push({
          periodId: `FY${year.fiscalYear}Q${k}E`,
          revenue: ((year.revenue - actualRev) * revShare[k - 1]) / remRevShare,
          epsDiluted: ((year.epsDiluted - actualEps) * niShare[k - 1]) / remNiShare,
          actual: false,
        });
      }
    }
  }
  return out;
}

function scenarioAssumptions(a: ModelAssumptions, sign: -1 | 1, baseWacc: number): ModelAssumptions {
  const years = a.years;
  const growthDelta = (i: number) => sign * 0.02 * Math.max(0, 1 - i / Math.max(1, years - 1));
  return {
    ...a,
    drivers: {
      ...a.drivers,
      revenueGrowth: a.drivers.revenueGrowth.map((g, i) => g + growthDelta(i)),
      ebitMargin: a.drivers.ebitMargin.map((m) => m + sign * 0.02),
    },
    valuation: { ...a.valuation, waccOverride: baseWacc - sign * 0.005 },
  };
}

/** Pure model build from already-loaded fundamentals (no network; used by tests). */
export function buildModelFromFundamentals(f: CompanyFundamentals, opts: BuildModelOptions = {}): CompanyModel {
  const template = templateConfig(f.profile.templateId as Parameters<typeof templateConfig>[0]);
  const years = opts.overrides?.years ?? 10;
  if (!Number.isInteger(years) || years < 3 || years > 20) throw new ModelInputError("years must be an integer between 3 and 20.");
  const currentPrice = opts.currentPrice ?? null;
  if (currentPrice !== null && (!Number.isFinite(currentPrice) || currentPrice <= 0)) {
    throw new ModelInputError("currentPrice must be a positive number.");
  }

  // Phase 6: Banks, Insurers, and Capital Markets route to dedicated equity-side engines (zero refusals).
  if (isFinancialSectorTemplate(template.id)) {
    return buildSpecialistFinancialModel(f, {
      currentPrice,
      valuationDate: opts.valuationDate,
      years,
      riskFreeRate: opts.overrides?.valuation?.riskFreeRate,
      equityRiskPremium: opts.overrides?.valuation?.equityRiskPremium,
      scenarioProbabilities: opts.scenarioProbabilities,
    });
  }

  const baseline = buildBaseline({ history: f.history, template, years });
  const notes = [...baseline.notes];
  const warnings = [...baseline.warnings];
  const assumptions = applyOverrides(baseline.assumptions, opts.overrides, notes);

  // Valuation bridge from the latest reported balance sheet (often a 10-Q after the base FY).
  const bs = latestBalanceSheet(f);
  const bv = bs?.values ?? {};
  const grossDebt = bv.totalDebt ?? 0;
  // Long-term marketable securities are treated as cash-like (sell-side convention for e.g. Apple, Alphabet).
  const netDebt = grossDebt - (bv.cash ?? 0) - (bv.shortTermInvestments ?? 0) - (bv.longTermInvestments ?? 0);
  if (bv.longTermInvestments) {
    notes.push({
      key: "netDebt",
      value: `${(netDebt / 1e9).toFixed(1)}B`,
      basis: `${bs?.id} gross debt − cash − short- and long-term marketable securities.`,
      source: "baseline",
    });
  }
  const minorityAndOther = (bv.minorityInterest ?? 0) + (bv.mezzanineEquity ?? 0);
  const cover = f.history.latestSharesOutstanding;
  const shares = cover && (!bs || cover.date >= bs.end) ? cover.value : baseline.base.dilutedShares;
  if (!cover) warnings.push("No cover-page share count; valuing on diluted weighted-average shares.");

  const valuationDate = opts.valuationDate ?? f.history.asOf ?? new Date().toISOString().slice(0, 10);
  const terminalTaxRate = assumptions.drivers.taxRate[years - 1];
  const marketCap = currentPrice !== null ? currentPrice * shares : null;
  const wacc0 = computeWacc(assumptions.valuation, terminalTaxRate, marketCap, grossDebt).wacc;
  if (!Number.isFinite(assumptions.valuation.terminalRonic)) {
    assumptions.valuation.terminalRonic = wacc0 + template.terminalRonicSpread;
    notes.push({
      key: "terminalRonic",
      value: `${(assumptions.valuation.terminalRonic * 100).toFixed(1)}%`,
      basis: `WACC + ${(template.terminalRonicSpread * 100).toFixed(1)}pp ${template.id} franchise spread.`,
      source: "template",
    });
  }

  const run = (a: ModelAssumptions) => {
    const projections = projectStatements(baseline.base, a);
    const valuation = valueCompany({
      projections,
      assumptions: a.valuation,
      terminalTaxRate,
      valuationDate,
      netDebt,
      grossDebt,
      minorityAndOther,
      shares,
      currentPrice,
    });
    return { projections, valuation };
  };

  const core = run(assumptions);
  const probs = opts.scenarioProbabilities ?? { bear: 0.25, base: 0.5, bull: 0.25 };
  const probSum = probs.bear + probs.base + probs.bull;
  if (Math.abs(probSum - 1) > 1e-6 || [probs.bear, probs.base, probs.bull].some((p) => p < 0)) {
    throw new ModelInputError("Scenario probabilities must be non-negative and sum to 1.");
  }
  const scenario = (name: ScenarioResult["name"], sign: -1 | 0 | 1, description: string): ScenarioResult => {
    const r = sign === 0 ? core : run(scenarioAssumptions(assumptions, sign, core.valuation.wacc));
    const last = r.projections[r.projections.length - 1];
    return {
      name,
      probability: probs[name],
      description,
      valuePerShare: r.valuation.valuePerShare,
      revenueFinalYear: last.revenue,
      ebitMarginFinalYear: last.ebitMargin,
      wacc: r.valuation.wacc,
    };
  };
  const scenarios = [
    scenario("bear", -1, "Growth −2pp fading to zero by the final year, EBIT margin −2pp, WACC +0.5pp."),
    scenario("base", 0, "Assumptions as modelled."),
    scenario("bull", 1, "Growth +2pp fading to zero by the final year, EBIT margin +2pp, WACC −0.5pp."),
  ];
  const probabilityWeightedValue = scenarios.reduce((a, s) => a + s.probability * s.valuePerShare, 0);

  // ── Integrity and sanity checks ──
  const checks: ModelCheck[] = [];
  const worstBalance = Math.max(...core.projections.map((y) => Math.abs(y.balanceDifference) / Math.max(1, Math.abs(y.totalAssets))));
  checks.push({
    id: "balance-sheet-balances",
    status: worstBalance < 1e-9 ? "pass" : "fail",
    message: `Max |assets − (liabilities + equity)| = ${(worstBalance * 100).toExponential(2)}% of assets across forecast years.`,
  });
  const cashTie = Math.max(
    ...core.projections.map((y) => Math.abs(y.operatingCashFlow + y.investingCashFlow + y.financingCashFlow - y.netChangeInCash) / Math.max(1, Math.abs(y.totalAssets)))
  );
  checks.push({
    id: "cash-flow-ties",
    status: cashTie < 1e-9 ? "pass" : "fail",
    message: "CFO + CFI + CFF equals the change in balance-sheet cash every year.",
  });
  const ts = core.valuation.terminalShareOfEv;
  checks.push({
    id: "terminal-value-share",
    status: ts <= 0.8 ? "pass" : "warn",
    message: `Terminal value is ${(ts * 100).toFixed(0)}% of enterprise value.`,
  });
  const w = core.valuation.wacc;
  checks.push({
    id: "wacc-range",
    status: w >= 0.05 && w <= 0.14 ? "pass" : "warn",
    message: `WACC ${(w * 100).toFixed(2)}% (typical large-cap range 5–14%).`,
  });
  const peakRevolver = core.projections.reduce((best, y) => (y.revolverBalance / y.revenue > best.share ? { share: y.revolverBalance / y.revenue, label: y.label } : best), { share: 0, label: "" });
  if (peakRevolver.share > 0) {
    checks.push({
      id: "revolver",
      // Small draws are normal (payouts funded with incremental debt); large ones mean payout assumptions need review.
      status: peakRevolver.share > 0.1 ? "warn" : "pass",
      message: `Payouts exceed cash generation; revolver peaks at ${(peakRevolver.share * 100).toFixed(1)}% of revenue (${peakRevolver.label}).`,
    });
  }
  if (core.valuation.valuePerShare <= 0) {
    checks.push({ id: "positive-equity-value", status: "warn", message: "Equity value is negative: net debt exceeds enterprise value." });
  }
  for (const c of f.checks.filter((c) => c.status === "fail")) warnings.push(`Data check failed: ${c.id}${c.periodId ? ` (${c.periodId})` : ""}: ${c.message}`);
  if (f.history.currency !== "USD") {
    warnings.push(`Values are in ${f.history.currency}. Supply currentPrice in ${f.history.currency} per ordinary share (or use ADR conversion helper).`);
  }

  const partial = { projections: core.projections, base: baseline.base };
  const operatingModel: CompanyModel = {
    ticker: f.profile.ticker,
    name: f.profile.name,
    templateId: f.profile.templateId as CompanyModel["templateId"],
    currency: f.history.currency,
    asOf: f.history.asOf,
    base: baseline.base,
    history: f.history.annual.slice(-5).map((p) => ({
      periodId: p.id,
      revenue: p.values.revenue ?? 0,
      ebit: p.values.operatingIncome ?? null,
      netIncome: p.values.netIncome ?? null,
      epsDiluted: p.values.epsDiluted ?? null,
    })),
    assumptions,
    notes,
    projections: core.projections,
    quarterlyOutlook: quarterlyOutlook(f, partial, baseline.ytdQuarters),
    valuation: core.valuation,
    scenarios,
    probabilityWeightedValue,
    checks,
    warnings,
  };

  // Phase 6 specialist overlays for REITs, Utilities, Energy/Materials, Pharma/Biotech, and Autos
  return enhanceOperatingModelForSector(operatingModel, f, { pipelineAssets: opts.pipelineAssets });
}

/** Fetch SEC fundamentals and build the model. */
export async function buildCompanyModel(
  ticker: string,
  opts: BuildModelOptions & { asOf?: string } = {}
): Promise<CompanyModel> {
  const f = await getCompanyFundamentals(ticker, { asOf: opts.asOf, maxAnnualPeriods: 10, maxQuarterlyPeriods: 12 });
  if (f.history.annual.length === 0) throw new ModelDataError(`${ticker}: no annual history in SEC data.`);
  return buildModelFromFundamentals(f, opts);
}
