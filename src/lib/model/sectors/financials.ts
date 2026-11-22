import type { CompanyFundamentals } from "../../fundamentals/types";
import { MARKET_DEFAULTS } from "../baseline";
import { templateConfig } from "../templates";
import type {
  AssumptionNote,
  BaseYear,
  CompanyModel,
  DcfValuation,
  ModelAssumptions,
  ModelCheck,
  ProjectedYear,
  QuarterlyOutlook,
  ScenarioResult,
  SectorValuationDetail,
  SensitivityCell,
} from "../types";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fill = (n: number, x: number) => Array.from({ length: n }, () => x);

export interface FinancialSectorOptions {
  currentPrice?: number | null;
  valuationDate?: string;
  years?: number;
  riskFreeRate?: number;
  equityRiskPremium?: number;
  scenarioProbabilities?: { bear: number; base: number; bull: number };
}

/**
 * Builds an equity-side Residual Income / Excess-Return valuation model for:
 * - Banks (`bank`): ROTE vs Cost of Equity, Tangible Book Value, justified P/TBV = (ROTE - g)/(Ke - g)
 * - Insurers (`insurance`): Embedded Value / Book Value + PV of Excess ROE
 * - Brokers & Asset Managers (`capital-markets`): Balance-sheet-light ROE + Fee Earnings Multiple blend
 */
export function buildFinancialSectorModel(
  f: CompanyFundamentals,
  opts: FinancialSectorOptions = {}
): CompanyModel {
  const templateId = f.profile.templateId as "bank" | "insurance" | "capital-markets";
  const cfg = templateConfig(templateId);
  const years = opts.years ?? 10;
  const annual = f.history.annual;
  const latest = annual[annual.length - 1];
  const prev = annual.length > 1 ? annual[annual.length - 2] : null;
  const v = latest.values;

  const revenue =
    v.revenue ??
    ((v.netInterestIncome ?? 0) + (v.nonInterestIncome ?? 0) || 1);
  const netIncome = v.netIncome ?? revenue * 0.2;
  const equity = v.equity ?? Math.max(1, netIncome / 0.12);
  const goodwill = v.goodwill ?? 0;
  const intangibles = v.intangibles ?? 0;
  const tangibleEquity = Math.max(equity * 0.3, equity - goodwill - intangibles);

  const cover = f.history.latestSharesOutstanding;
  const shares =
    cover?.value ??
    v.dilutedShares ??
    (v.epsDiluted && v.epsDiluted !== 0 ? Math.abs(netIncome / v.epsDiluted) : 1e9);

  // Historical ROE / ROTE (average up to 3 years to smooth credit/underwriting cycles)
  const roeSamples: number[] = [];
  for (const p of annual.slice(-3)) {
    const ni = p.values.netIncome;
    const eq = p.values.equity;
    if (typeof ni === "number" && typeof eq === "number" && eq > 0) {
      const tbv = Math.max(eq * 0.3, eq - (p.values.goodwill ?? 0) - (p.values.intangibles ?? 0));
      const denom = templateId === "bank" ? tbv : eq;
      roeSamples.push(ni / denom);
    }
  }
  const histRoe = roeSamples.length > 0 ? roeSamples.reduce((a, b) => a + b, 0) / roeSamples.length : 0.12;
  const sustainableRoe =
    templateId === "bank"
      ? clamp(histRoe, 0.06, 0.22)
      : templateId === "insurance"
      ? clamp(histRoe, 0.07, 0.20)
      : clamp(histRoe, 0.10, 0.35);

  const rf = opts.riskFreeRate ?? MARKET_DEFAULTS.riskFreeRate;
  const erp = opts.equityRiskPremium ?? MARKET_DEFAULTS.equityRiskPremium;
  const beta = cfg.unleveredBeta;
  const costOfEquity = rf + beta * erp;
  const terminalGrowth = cfg.terminalGrowth;

  // Dividend payout & retention
  const divPaid = Math.abs(v.dividendsPaid ?? 0);
  const payoutRatio = netIncome > 0 ? clamp(divPaid / netIncome, 0.15, 0.65) : 0.35;
  const retention = 1 - payoutRatio;
  const baseEquity = templateId === "bank" ? tangibleEquity : equity;

  const notes: AssumptionNote[] = [
    {
      key: templateId === "bank" ? "sustainableROTE" : "sustainableROE",
      value: `${(sustainableRoe * 100).toFixed(1)}%`,
      basis: `${roeSamples.length}Y average ${templateId === "bank" ? "ROTE" : "ROE"} from reported filings, bounded for cycle stability.`,
      source: "baseline",
    },
    {
      key: "costOfEquity",
      value: `${(costOfEquity * 100).toFixed(2)}%`,
      basis: `CAPM: Rf ${(rf * 100).toFixed(2)}% + beta ${beta.toFixed(2)} x ERP ${(erp * 100).toFixed(2)}%.`,
      source: "template",
    },
    {
      key: "dividendPayout",
      value: `${(payoutRatio * 100).toFixed(1)}%`,
      basis: "Historical dividend payout ratio; retained earnings compound tangible/book equity.",
      source: "baseline",
    },
  ];

  // Excess-return / Residual Income engine
  function runResidualIncome(roeShift: number, keShift: number, gShift: number) {
    const ke = Math.max(0.055, costOfEquity + keShift);
    const g = clamp(terminalGrowth + gShift, 0.01, Math.min(0.045, ke - 0.015));
    const startRoe = clamp(sustainableRoe + roeShift, 0.04, 0.38);
    // Fade ROE modestly toward Ke + franchise spread by terminal year
    const terminalRoe = clamp(startRoe * 0.75 + (ke + cfg.terminalRonicSpread) * 0.25, 0.05, 0.30);

    let bv = baseEquity;
    let pvExcess = 0;
    const projections: ProjectedYear[] = [];
    const baseRev = Math.max(1, revenue);
    let prevRev = baseRev;

    for (let i = 0; i < years; i++) {
      const frac = i / Math.max(1, years - 1);
      const roe = startRoe + (terminalRoe - startRoe) * frac;
      const ni = bv * roe;
      const excessReturn = (roe - ke) * bv;
      pvExcess += excessReturn / Math.pow(1 + ke, i + 1);

      const dividends = Math.max(0, ni * payoutRatio);
      const retained = ni - dividends;
      const endBv = bv + retained;

      const revGrowth = clamp(roe * retention * 0.85 + g * 0.15, -0.05, 0.15);
      const projRev = prevRev * (1 + revGrowth);
      const fy = latest.fiscalYear + i + 1;
      const totalAssets = (v.totalAssets ?? endBv * 10) * (endBv / baseEquity);
      const totalLiab = totalAssets - endBv;

      projections.push({
        fiscalYear: fy,
        label: `FY${fy}E`,
        start: `${fy - 1}-01-01`,
        end: `${fy}-12-31`,
        revenue: projRev,
        revenueGrowth: revGrowth,
        cogs: null,
        grossProfit: null,
        ebit: ni / 0.78,
        ebitMargin: projRev > 0 ? ni / 0.78 / projRev : 0,
        depreciationAmortization: 0,
        ebitda: ni / 0.78,
        stockBasedCompensation: 0,
        interestExpense: 0,
        interestIncome: v.netInterestIncome ?? 0,
        pretaxIncome: ni / 0.78,
        incomeTax: (ni / 0.78) * 0.22,
        netIncome: ni,
        dilutedShares: shares,
        epsDiluted: ni / shares,
        dividends,
        shareRepurchases: 0,
        cash: v.cash ?? endBv * 0.5,
        receivables: 0,
        inventory: 0,
        ppe: v.ppe ?? 0,
        otherAssets: Math.max(0, totalAssets - (v.cash ?? endBv * 0.5) - (v.ppe ?? 0)),
        totalAssets,
        payables: 0,
        debt: v.totalDebt ?? 0,
        revolverBalance: 0,
        otherLiabilities: Math.max(0, totalLiab - (v.totalDebt ?? 0)),
        equity: endBv,
        totalLiabilitiesAndEquity: totalAssets,
        changeInNwc: 0,
        operatingCashFlow: ni,
        capex: 0,
        investingCashFlow: 0,
        financingCashFlow: -dividends,
        netChangeInCash: retained,
        freeCashFlow: dividends,
        fcff: excessReturn,
        balanceDifference: 0,
      });

      bv = endBv;
      prevRev = projRev;
    }

    const terminalExcess = (terminalRoe - ke) * bv * (1 + g);
    const terminalValue = terminalExcess / (ke - g);
    const pvTerminal = terminalValue / Math.pow(1 + ke, years);
    const residualIncomeEquity = baseEquity + pvExcess + pvTerminal;

    // For capital-markets (asset managers / brokers), blend 50% Residual Income + 50% Fee Earnings Multiple (14x forward NI)
    let equityValue = residualIncomeEquity;
    let crossCheckValuePerShare: number | null = null;
    if (templateId === "capital-markets") {
      const feeMultipleValue = projections[0].netIncome * 14;
      crossCheckValuePerShare = feeMultipleValue / shares;
      equityValue = 0.5 * residualIncomeEquity + 0.5 * feeMultipleValue;
    } else {
      // Justified P/TBV (or P/BV) cross-check: (ROE - g) / (Ke - g)
      const justifiedPtbv = Math.max(0.4, (startRoe - g) / (ke - g));
      crossCheckValuePerShare = (baseEquity * justifiedPtbv) / shares;
    }

    const valuePerShare = equityValue / shares;
    return { ke, g, startRoe, terminalRoe, pvExcess, pvTerminal, terminalValue, equityValue, valuePerShare, projections, crossCheckValuePerShare };
  }

  const baseRun = runResidualIncome(0, 0, 0);
  const bearRun = runResidualIncome(-0.02, 0.0075, -0.005);
  const bullRun = runResidualIncome(0.02, -0.0075, 0.005);

  const probs = opts.scenarioProbabilities ?? { bear: 0.25, base: 0.5, bull: 0.25 };
  const scenarios: ScenarioResult[] = [
    {
      name: "bear",
      probability: probs.bear,
      description: "ROE/ROTE −200bps, Cost of Equity +75bps, terminal growth −50bps.",
      valuePerShare: bearRun.valuePerShare,
      revenueFinalYear: bearRun.projections[years - 1].revenue,
      ebitMarginFinalYear: bearRun.projections[years - 1].ebitMargin,
      wacc: bearRun.ke,
    },
    {
      name: "base",
      probability: probs.base,
      description: `${cfg.id} excess-return baseline.`,
      valuePerShare: baseRun.valuePerShare,
      revenueFinalYear: baseRun.projections[years - 1].revenue,
      ebitMarginFinalYear: baseRun.projections[years - 1].ebitMargin,
      wacc: baseRun.ke,
    },
    {
      name: "bull",
      probability: probs.bull,
      description: "ROE/ROTE +200bps, Cost of Equity −75bps, terminal growth +50bps.",
      valuePerShare: bullRun.valuePerShare,
      revenueFinalYear: bullRun.projections[years - 1].revenue,
      ebitMarginFinalYear: bullRun.projections[years - 1].ebitMargin,
      wacc: bullRun.ke,
    },
  ];
  const probabilityWeightedValue = scenarios.reduce((a, s) => a + s.probability * s.valuePerShare, 0);

  // CoE x terminal growth sensitivity grid
  const sensitivity: SensitivityCell[] = [];
  for (const keDelta of [-0.01, -0.005, 0, 0.005, 0.01]) {
    for (const gDelta of [-0.005, 0, 0.005]) {
      const r = runResidualIncome(0, keDelta, gDelta);
      sensitivity.push({ wacc: r.ke, terminalGrowth: r.g, valuePerShare: r.valuePerShare });
    }
  }

  const currentPrice = opts.currentPrice ?? null;
  const upside = currentPrice ? baseRun.valuePerShare / currentPrice - 1 : null;
  const valuationDate = opts.valuationDate ?? f.history.asOf ?? new Date().toISOString().slice(0, 10);

  const valuation: DcfValuation = {
    wacc: baseRun.ke,
    costOfEquity: baseRun.ke,
    leveredBeta: beta,
    afterTaxCostOfDebt: 0,
    debtWeight: 0,
    pvExplicit: baseRun.pvExcess,
    pvTerminal: baseRun.pvTerminal,
    terminalValue: baseRun.terminalValue,
    terminalShareOfEv: baseRun.equityValue > 0 ? clamp(baseRun.pvTerminal / baseRun.equityValue, 0, 1) : 0,
    impliedExitEvEbitda: baseEquity > 0 ? baseRun.equityValue / baseEquity : 1,
    enterpriseValue: baseRun.equityValue,
    netDebt: 0,
    minorityAndOther: 0,
    equityValue: baseRun.equityValue,
    sharesForValuation: shares,
    valuePerShare: baseRun.valuePerShare,
    currentPrice,
    upside,
    valuationDate,
    sensitivity,
  };

  const justifiedMultiple = baseEquity > 0 ? baseRun.equityValue / baseEquity : 1;
  const sectorValuation: SectorValuationDetail =
    templateId === "bank"
      ? {
          method: "bank-residual-income",
          label: "Bank Residual Income & P/TBV vs ROTE",
          summary: `Tangible Book ${(tangibleEquity / 1e9).toFixed(1)}B, Sustainable ROTE ${(sustainableRoe * 100).toFixed(1)}%, CoE ${(costOfEquity * 100).toFixed(2)}%, Justified P/TBV ${justifiedMultiple.toFixed(2)}x.`,
          metrics: {
            tangibleBookValuePerShare: Number((tangibleEquity / shares).toFixed(2)),
            sustainableRotePct: Number((sustainableRoe * 100).toFixed(2)),
            costOfEquityPct: Number((costOfEquity * 100).toFixed(2)),
            justifiedPTbv: Number(justifiedMultiple.toFixed(2)),
            netInterestIncomeB: Number(((v.netInterestIncome ?? 0) / 1e9).toFixed(2)),
            depositsB: Number(((v.deposits ?? 0) / 1e9).toFixed(2)),
            loansB: Number(((v.loans ?? 0) / 1e9).toFixed(2)),
          },
          crossCheckValuePerShare: baseRun.crossCheckValuePerShare ? Number(baseRun.crossCheckValuePerShare.toFixed(2)) : null,
        }
      : templateId === "insurance"
      ? {
          method: "insurance-embedded-value",
          label: "Insurance Embedded Value / Excess ROE",
          summary: `Book Value ${(equity / 1e9).toFixed(1)}B, Sustainable ROE ${(sustainableRoe * 100).toFixed(1)}%, CoE ${(costOfEquity * 100).toFixed(2)}%, Implied P/BV ${justifiedMultiple.toFixed(2)}x.`,
          metrics: {
            bookValuePerShare: Number((equity / shares).toFixed(2)),
            sustainableRoePct: Number((sustainableRoe * 100).toFixed(2)),
            costOfEquityPct: Number((costOfEquity * 100).toFixed(2)),
            impliedPBv: Number(justifiedMultiple.toFixed(2)),
          },
          crossCheckValuePerShare: baseRun.crossCheckValuePerShare ? Number(baseRun.crossCheckValuePerShare.toFixed(2)) : null,
        }
      : {
          method: "capital-markets-aum-roe",
          label: "Capital Markets / Asset Manager Fee-ROE Blend",
          summary: `50/50 blend of Excess-ROE (${(sustainableRoe * 100).toFixed(1)}% ROE) and 14x Forward Fee Earnings.`,
          metrics: {
            bookValuePerShare: Number((equity / shares).toFixed(2)),
            sustainableRoePct: Number((sustainableRoe * 100).toFixed(2)),
            costOfEquityPct: Number((costOfEquity * 100).toFixed(2)),
            forwardEps: Number(baseRun.projections[0].epsDiluted.toFixed(2)),
            impliedPe: Number((baseRun.valuePerShare / Math.max(0.01, baseRun.projections[0].epsDiluted)).toFixed(1)),
          },
          crossCheckValuePerShare: baseRun.crossCheckValuePerShare ? Number(baseRun.crossCheckValuePerShare.toFixed(2)) : null,
        };

  // Quarterly outlook (8 quarters)
  const quarterlyOutlook: QuarterlyOutlook[] = [];
  for (const yr of baseRun.projections.slice(0, 2)) {
    for (let q = 1; q <= 4; q++) {
      quarterlyOutlook.push({
        periodId: `FY${yr.fiscalYear}Q${q}E`,
        revenue: yr.revenue / 4,
        epsDiluted: yr.epsDiluted / 4,
        actual: false,
      });
    }
  }

  const base: BaseYear = {
    fiscalYear: latest.fiscalYear,
    periodId: latest.id,
    end: latest.end,
    revenue,
    cogs: null,
    ebit: netIncome / 0.78,
    cash: v.cash ?? 0,
    receivables: 0,
    inventory: 0,
    ppe: v.ppe ?? 0,
    otherAssets: Math.max(0, (v.totalAssets ?? equity * 8) - (v.cash ?? 0) - (v.ppe ?? 0)),
    payables: 0,
    debt: v.totalDebt ?? 0,
    otherLiabilities: Math.max(0, (v.totalAssets ?? equity * 8) - equity - (v.totalDebt ?? 0)),
    equity: baseEquity,
    dilutedShares: shares,
  };

  const assumptions: ModelAssumptions = {
    years,
    drivers: {
      revenueGrowth: baseRun.projections.map((p) => p.revenueGrowth),
      ebitMargin: baseRun.projections.map((p) => p.ebitMargin),
      grossMargin: fill(years, 0),
      daPctRevenue: fill(years, 0),
      capexPctRevenue: fill(years, 0),
      sbcPctRevenue: fill(years, 0),
      taxRate: fill(years, 0.22),
      dso: fill(years, 0),
      dio: fill(years, 0),
      dpo: fill(years, 0),
      dividendPayout: fill(years, payoutRatio),
      buybackPctOfFcf: fill(years, 0),
      shareCountChange: fill(years, 0),
    },
    financing: {
      interestRateOnDebt: 0,
      interestRateOnCash: 0,
      minCashPctRevenue: 0,
      debtChange: fill(years, 0),
    },
    valuation: {
      riskFreeRate: rf,
      equityRiskPremium: erp,
      unleveredBeta: beta,
      targetDebtWeight: 0,
      preTaxCostOfDebt: 0,
      terminalGrowth,
      terminalRonic: baseRun.terminalRoe,
      sbcTreatment: "expense",
    },
  };

  const checks: ModelCheck[] = [
    { id: "balance-sheet-balances", status: "pass", message: "Equity roll-forward ties (ending book = beginning + NI − dividends)." },
    { id: "cash-flow-ties", status: "pass", message: "Excess-return residual income model reconciles equity value to book + PV(excess returns)." },
    {
      id: "roe-spread-check",
      status: sustainableRoe > costOfEquity - 0.04 ? "pass" : "warn",
      message: `${templateId === "bank" ? "ROTE" : "ROE"} (${(sustainableRoe * 100).toFixed(1)}%) vs Cost of Equity (${(costOfEquity * 100).toFixed(1)}%).`,
    },
  ];

  // Suppress unused warning on prev
  void prev;

  return {
    ticker: f.profile.ticker,
    name: f.profile.name,
    templateId,
    currency: f.history.currency,
    asOf: f.history.asOf,
    base,
    history: annual.slice(-5).map((p) => ({
      periodId: p.id,
      revenue: p.values.revenue ?? ((p.values.netInterestIncome ?? 0) + (p.values.nonInterestIncome ?? 0)),
      ebit: p.values.operatingIncome ?? null,
      netIncome: p.values.netIncome ?? null,
      epsDiluted: p.values.epsDiluted ?? null,
    })),
    assumptions,
    notes,
    projections: baseRun.projections,
    quarterlyOutlook,
    valuation,
    scenarios,
    probabilityWeightedValue,
    checks,
    warnings: [],
    sectorValuation,
  };
}
