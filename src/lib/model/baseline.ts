import type { FinancialHistory, FinancialPeriod } from "../fundamentals/types";
import type { TemplateConfig } from "./templates";
import type { AssumptionNote, BaseYear, DriverPaths, ModelAssumptions } from "./types";

/**
 * Baseline assumptions derived only from the company's own reported history.
 *
 * This is the "no-opinion" model: recent run-rates, a growth fade to the terminal rate and
 * sector defaults for the cost of capital. It's what a junior analyst would start from before
 * reading guidance or the call transcript. Phase 3's LLM analyst overrides it, citing sources.
 */

export const MARKET_DEFAULTS = {
  /** Long-run nominal risk-free proxy (10Y UST). Override with a live rate when available. */
  riskFreeRate: 0.0425,
  /** Mature-market implied equity risk premium (Damodaran-style). */
  equityRiskPremium: 0.045,
  statutoryTaxRate: 0.21,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function mean(xs: number[]): number | null {
  const v = xs.filter(isNum);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function ratioSeries(periods: FinancialPeriod[], num: (p: FinancialPeriod) => number | undefined, den: (p: FinancialPeriod) => number | undefined) {
  return periods.map((p) => {
    const n = num(p);
    const d = den(p);
    return isNum(n) && isNum(d) && d !== 0 ? n / d : NaN;
  });
}

export class ModelDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelDataError";
  }
}

export interface BaselineInputs {
  history: FinancialHistory;
  template: TemplateConfig;
  years: number;
}

export interface Baseline {
  base: BaseYear;
  assumptions: ModelAssumptions;
  notes: AssumptionNote[];
  warnings: string[];
  /** Reported quarters of the first forecast year, used for the quarterly outlook. */
  ytdQuarters: FinancialPeriod[];
}

export function buildBaseline({ history, template, years }: BaselineInputs): Baseline {
  const notes: AssumptionNote[] = [];
  const warnings: string[] = [];
  const note = (key: string, value: string, basis: string, source: AssumptionNote["source"] = "baseline") =>
    notes.push({ key, value, basis, source });

  const annual = history.annual.filter((p) => isNum(p.values.revenue) && (p.values.revenue as number) > 0);
  if (annual.length === 0) throw new ModelDataError("No fiscal year with positive revenue in the SEC history.");
  const fy0 = annual[annual.length - 1];
  const last3 = annual.slice(-3);
  const v0 = fy0.values;
  const revenue0 = v0.revenue as number;

  // ── Base-year balance sheet (residuals keep it balanced whatever the data quirks) ──
  const cash = (v0.cash ?? 0) + (v0.shortTermInvestments ?? 0);
  const receivables = v0.receivables ?? 0;
  const inventory = v0.inventory ?? 0;
  const ppe = v0.ppe ?? 0;
  const totalAssets = v0.totalAssets ?? cash + receivables + inventory + ppe;
  const payables = v0.accountsPayable ?? 0;
  const debt = v0.totalDebt ?? 0;
  const equity = v0.equityInclNci ?? v0.equity ?? 0;
  const ebit0 = v0.operatingIncome ?? (isNum(v0.pretaxIncome) ? v0.pretaxIncome + (v0.interestExpense ?? 0) : NaN);
  if (!isNum(ebit0)) throw new ModelDataError(`${fy0.id} has no operating income or pre-tax income.`);
  if (!isNum(v0.totalAssets)) warnings.push(`${fy0.id} total assets missing; base balance sheet is approximate.`);
  if (!isNum(v0.ppe)) warnings.push("PP&E not reported; D&A is charged against a zero PP&E base (affects the balance sheet only).");

  const dilutedShares = v0.dilutedShares ?? history.latestSharesOutstanding?.value;
  if (!isNum(dilutedShares) || dilutedShares <= 0) {
    throw new ModelDataError("No diluted share count or cover-page shares outstanding in SEC data.");
  }

  const base: BaseYear = {
    fiscalYear: fy0.fiscalYear,
    periodId: fy0.id,
    end: fy0.end,
    revenue: revenue0,
    cogs: isNum(v0.costOfRevenue) ? v0.costOfRevenue : null,
    ebit: ebit0,
    cash,
    receivables,
    inventory,
    ppe,
    otherAssets: totalAssets - cash - receivables - inventory - ppe,
    payables,
    debt,
    otherLiabilities: totalAssets - equity - payables - debt,
    equity,
    dilutedShares,
  };

  // ── Revenue growth: year 1 anchored to reported year-to-date quarters when available ──
  const growthSeries = annual.slice(1).map((p, i) => (p.values.revenue as number) / (annual[i].values.revenue as number) - 1);
  const lastGrowth = growthSeries[growthSeries.length - 1];
  const first = annual[Math.max(0, annual.length - 4)];
  const span = annual.length - 1 - annual.indexOf(first);
  const cagr3 = span > 0 ? Math.pow(revenue0 / (first.values.revenue as number), 1 / span) - 1 : NaN;

  const ytdQuarters = history.quarterly.filter((q) => q.fiscalYear === fy0.fiscalYear + 1 && isNum(q.values.revenue));
  const priorSame = ytdQuarters.map((q) =>
    history.quarterly.find((p) => p.fiscalYear === fy0.fiscalYear && p.fiscalQuarter === q.fiscalQuarter)
  );
  let g1: number;
  if (ytdQuarters.length > 0 && priorSame.every((p) => p && isNum(p.values.revenue))) {
    const ytd = ytdQuarters.reduce((a, q) => a + (q.values.revenue as number), 0);
    const prior = priorSame.reduce((a, p) => a + (p!.values.revenue as number), 0);
    g1 = ytd / prior - 1;
    note(
      "revenueGrowth[1]",
      pct(g1),
      `Year-to-date: ${ytdQuarters.map((q) => q.id).join(", ")} revenue vs the same quarters a year earlier.`
    );
  } else if (isNum(lastGrowth)) {
    g1 = isNum(cagr3) ? 0.6 * lastGrowth + 0.4 * cagr3 : lastGrowth;
    note("revenueGrowth[1]", pct(g1), `Blend of last-year growth (${pct(lastGrowth)}) and ${span}-year CAGR (${isNum(cagr3) ? pct(cagr3) : "n/a"}).`);
  } else {
    g1 = template.terminalGrowth;
    note("revenueGrowth[1]", pct(g1), "Single year of history; terminal growth used.");
  }
  if (Math.abs(g1) > 0.3) {
    warnings.push(
      `Year-1 revenue growth of ${pct(g1)} is unusual; check year-to-date comparability (M&A, spin-offs, discontinued operations, restatements).`
    );
  }
  g1 = clamp(g1, -0.25, 0.8);
  const tg = Math.min(template.terminalGrowth, MARKET_DEFAULTS.riskFreeRate);
  const oldest = annual[0];
  const longSpan = annual.length - 1;
  const cagrLong = longSpan >= 4 ? Math.pow(revenue0 / (oldest.values.revenue as number), 1 / longSpan) - 1 : NaN;
  const midRaw = template.cyclical && isNum(cagrLong)
    ? 0.3 * g1 + 0.7 * cagrLong
    : isNum(cagr3) ? 0.5 * g1 + 0.5 * cagr3 : g1;
  const mid = clamp(midRaw, -0.15, 0.4);
  const revenueGrowth = Array.from({ length: years }, (_, i) => {
    if (i === 0) return g1;
    const t = years > 2 ? (i - 1) / (years - 2) : 1;
    return mid + (tg - mid) * t;
  });
  note(
    "revenueGrowth[2..N]",
    `${pct(mid)} → ${pct(tg)}`,
    `${template.cyclical && isNum(cagrLong) ? `Cyclical: year 2 blends year-1 growth with the ${longSpan}-year CAGR (${pct(cagrLong)}); ` : "Year 2 blends year-1 growth with the 3-year CAGR (capped at 40%); "}linear fade to the ${template.id} terminal rate by year ${years}.`
  );

  // ── Margins ──
  const ebitMargins = ratioSeries(last3, (p) => p.values.operatingIncome ?? (isNum(p.values.pretaxIncome) ? p.values.pretaxIncome + (p.values.interestExpense ?? 0) : undefined), (p) => p.values.revenue);
  const avgMargin = mean(ebitMargins) ?? ebit0 / revenue0;
  let margin = (2 / 3) * (ebit0 / revenue0) + (1 / 3) * avgMargin;
  const ytdEbit = ytdQuarters.every((q) => isNum(q.values.operatingIncome)) && ytdQuarters.length >= 2;
  let margin1 = margin;
  if (ytdEbit) {
    margin1 =
      ytdQuarters.reduce((a, q) => a + (q.values.operatingIncome as number), 0) /
      ytdQuarters.reduce((a, q) => a + (q.values.revenue as number), 0);
  }
  margin = clamp(margin, ...template.ebitMarginBounds);
  margin1 = clamp(margin1, ...template.ebitMarginBounds);
  const y1Basis = ytdEbit ? "Y1 from YTD operating margin; " : "";
  let ebitMargin = Array.from({ length: years }, (_, i) => (i === 0 ? margin1 : margin));
  let marginBasis = `${y1Basis}later years 2/3 latest FY + 1/3 three-year average.`;
  let marginEnd = margin;

  const allMargins = ratioSeries(annual, (p) => p.values.operatingIncome ?? (isNum(p.values.pretaxIncome) ? p.values.pretaxIncome + (p.values.interestExpense ?? 0) : undefined), (p) => p.values.revenue)
    .filter(isNum)
    .sort((a, b) => a - b);
  if (template.cyclical && allMargins.length >= 5) {
    // Through-cycle: median margin across the full history, reached by year 5.
    const median = clamp(allMargins[Math.floor(allMargins.length / 2)], ...template.ebitMarginBounds);
    const fadeYears = Math.min(4, years - 1);
    ebitMargin = Array.from({ length: years }, (_, i) => (i === 0 ? margin1 : i >= fadeYears ? median : margin1 + ((median - margin1) * i) / fadeYears));
    marginBasis = `${y1Basis}cyclical: fades to the ${allMargins.length}-year median operating margin (${pct(median)}) by year ${fadeYears + 1}.`;
    marginEnd = median;
    if (median > 0 && margin1 > 1.5 * median) {
      warnings.push(
        `Cyclical peak: year-1 EBIT margin ${pct(margin1)} is ${(margin1 / median).toFixed(1)}x the through-cycle median; revenue is not mean-reverted, so the baseline likely overstates value.`
      );
    }
  } else if (template.matureEbitMargin !== null && margin < template.matureEbitMargin && g1 >= 0.1) {
    // Sub-scale growth company: operating leverage toward a sector steady-state margin.
    const target = template.matureEbitMargin;
    ebitMargin = Array.from({ length: years }, (_, i) => (i === 0 ? margin1 : margin + ((target - margin) * i) / (years - 1)));
    marginBasis = `${y1Basis}growing ${pct(g1)} below scale: fades linearly to the ${template.id} mature margin (${pct(target)}) by year ${years}.`;
    marginEnd = target;
  }
  note("ebitMargin", `${pct(margin1)} (Y1) → ${pct(marginEnd)}`, marginBasis, marginBasis.includes("mature") || marginBasis.includes("cyclical") ? "template" : "baseline");

  const gms = ratioSeries(last3, (p) => (isNum(p.values.grossProfit) ? p.values.grossProfit : undefined), (p) => p.values.revenue);
  const gm = base.cogs !== null ? mean(gms) ?? 1 - base.cogs / revenue0 : NaN;

  const daPct = mean(ratioSeries(last3, (p) => p.values.depreciationAmortization, (p) => p.values.revenue));
  const daPctValue = daPct ?? 0.03;
  note("daPctRevenue", pct(daPctValue), daPct !== null ? "Three-year average D&A / revenue." : "D&A not reported; 3% of revenue assumed.");

  let capexPct = mean(ratioSeries(last3, (p) => p.values.capex, (p) => p.values.revenue));
  let capexBasis = "Three-year average capex / revenue.";
  if (capexPct === null) {
    // Estimate from the PP&E roll-forward: capex ≈ ΔPP&E + D&A.
    const est = last3.slice(1).map((p, i) => {
      const prevPpe = last3[i].values.ppe;
      const v = p.values;
      return isNum(v.ppe) && isNum(prevPpe) && isNum(v.depreciationAmortization) && isNum(v.revenue)
        ? (v.ppe - prevPpe + v.depreciationAmortization) / v.revenue
        : NaN;
    });
    capexPct = mean(est);
    capexBasis = "Capex not reported in standard XBRL; estimated from the PP&E roll-forward (ΔPP&E + D&A).";
    if (capexPct === null) {
      capexPct = daPctValue * 1.1;
      capexBasis = "Capex and PP&E roll-forward unavailable; set to 1.1x D&A.";
    }
    warnings.push(capexBasis);
  }
  // Steady state: capex = D&A + g · PP&E (just enough to grow the asset base at the terminal rate).
  const steadyCapex = daPctValue + tg * (ppe > 0 ? ppe / revenue0 : 0);
  const capexStart = capexPct;
  const capexPath = Array.from({ length: years }, (_, i) =>
    capexStart > steadyCapex && years > 1 ? capexStart + ((steadyCapex - capexStart) * i) / (years - 1) : capexStart
  );
  note(
    "capexPctRevenue",
    capexStart > steadyCapex ? `${pct(capexStart)} → ${pct(steadyCapex)}` : pct(capexStart),
    capexStart > steadyCapex
      ? `${capexBasis} Fades to steady-state reinvestment (D&A + terminal growth × PP&E/revenue) by year ${years}.`
      : capexBasis
  );

  const sbcPct = mean(ratioSeries(last3, (p) => p.values.stockBasedCompensation, (p) => p.values.revenue)) ?? 0;
  note("sbcPctRevenue", pct(sbcPct), "Three-year average SBC / revenue.");

  const taxes = ratioSeries(last3, (p) => p.values.incomeTax, (p) => (isNum(p.values.pretaxIncome) && p.values.pretaxIncome > 0 ? p.values.pretaxIncome : undefined));
  const taxAvg = mean(taxes);
  const taxRate = taxAvg !== null ? clamp(taxAvg, 0.05, 0.35) : MARKET_DEFAULTS.statutoryTaxRate;
  note("taxRate", pct(taxRate), taxAvg !== null ? "Three-year average effective tax rate (bounded 5–35%)." : "Statutory 21% (no positive pre-tax history).");

  const costBase0 = base.cogs ?? revenue0;
  const dso = (receivables / revenue0) * 365;
  const dio = (inventory / costBase0) * 365;
  const dpo = (payables / costBase0) * 365;
  note("dso/dio/dpo", `${dso.toFixed(0)} / ${dio.toFixed(0)} / ${dpo.toFixed(0)} days`, `${fy0.id} working-capital days (inventory and payables on ${base.cogs !== null ? "cost of revenue" : "revenue"}).`);

  const ni0 = v0.netIncome;
  const payout = isNum(v0.dividendsPaid) && isNum(ni0) && ni0 > 0 ? clamp(v0.dividendsPaid / ni0, 0, 1) : 0;
  note("dividendPayout", pct(payout), `${fy0.id} dividends / net income.`);

  const bbRatios = last3.map((p) => {
    const fcf = p.values.freeCashFlow;
    const div = p.values.dividendsPaid ?? 0;
    const bb = p.values.shareRepurchases;
    return isNum(fcf) && isNum(bb) && fcf - div > 0 ? bb / (fcf - div) : NaN;
  });
  const buyback = clamp(mean(bbRatios) ?? 0, 0, 1);
  note("buybackPctOfFcf", pct(buyback), "Three-year average buybacks / (FCF − dividends), capped at 100%.");

  const sharesFirst = first.values.dilutedShares;
  const shareCagr = isNum(sharesFirst) && span > 0 && sharesFirst > 0 ? Math.pow(dilutedShares / sharesFirst, 1 / span) - 1 : 0;
  const shareChange = clamp(shareCagr, -0.05, 0.03);
  note("shareCountChange", pct(shareChange), `${span}-year diluted share CAGR (bounded −5% to +3%), halved after year 5.`);

  const debtSeries = last3.map((p) => p.values.totalDebt);
  const avgDebt = mean(debtSeries.filter(isNum)) ?? 0;
  const ir = isNum(v0.interestExpense) && avgDebt > 0 ? clamp(v0.interestExpense / avgDebt, 0.01, 0.12) : 0.05;
  note("interestRateOnDebt", pct(ir), isNum(v0.interestExpense) && avgDebt > 0 ? "Interest expense / average gross debt (bounded 1–12%)." : "5% default.");

  const fill = (x: number) => Array.from({ length: years }, () => x);
  const drivers: DriverPaths = {
    revenueGrowth,
    ebitMargin,
    grossMargin: fill(gm),
    daPctRevenue: fill(daPctValue),
    capexPctRevenue: capexPath,
    sbcPctRevenue: fill(sbcPct),
    taxRate: fill(taxRate),
    dso: fill(dso),
    dio: fill(dio),
    dpo: fill(dpo),
    dividendPayout: fill(payout),
    buybackPctOfFcf: fill(buyback),
    shareCountChange: Array.from({ length: years }, (_, i) => (i < 5 ? shareChange : shareChange / 2)),
  };

  const rf = MARKET_DEFAULTS.riskFreeRate;
  const assumptions: ModelAssumptions = {
    years,
    drivers,
    financing: {
      interestRateOnDebt: ir,
      interestRateOnCash: Math.max(0, rf - 0.01),
      minCashPctRevenue: clamp(revenue0 > 0 ? cash / revenue0 : 0.03, 0.01, 0.05),
      debtChange: fill(0),
    },
    valuation: {
      riskFreeRate: rf,
      equityRiskPremium: MARKET_DEFAULTS.equityRiskPremium,
      unleveredBeta: template.unleveredBeta,
      targetDebtWeight: template.targetDebtWeight,
      preTaxCostOfDebt: Math.max(rf + 0.01, ir),
      terminalGrowth: tg,
      terminalRonic: NaN, // set from WACC + template spread once WACC is known
      sbcTreatment: template.sbcTreatment,
    },
  };
  note("riskFreeRate / ERP", `${pct(rf)} / ${pct(MARKET_DEFAULTS.equityRiskPremium)}`, "House defaults; no live rates feed yet.", "template");
  note("unleveredBeta", template.unleveredBeta.toFixed(2), `Approximate ${template.id} sector unlevered beta (relevered at the capital structure).`, "template");
  note("terminalGrowth", pct(tg), `${template.id} template default, capped at the risk-free rate.`, "template");
  if (template.note) warnings.push(template.note);

  return { base, assumptions, notes, warnings, ytdQuarters };
}
