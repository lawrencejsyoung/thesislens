import {
  DcfInputs,
  DcfResult,
  DcfSensitivityCell,
  Holding,
  MacroShockScenarioResult,
  MonteCarloPoint,
  MonteCarloResult,
  PortfolioMetrics,
} from "./types";
import { stressTestCrossAssetShocks } from "./quant/cross-asset-stress";

export { evaluatePredictionBet } from "./quant/prediction-ev";
export { priceOptionStrategy, priceBlackScholesOption } from "./quant/options-bsm";
export { analyzeRealEstateDeal, analyzeBondDuration } from "./quant/real-assets-credit";
export { simulateVenturePowerLaw } from "./quant/venture-powerlaw";
export { stressTestCrossAssetShocks } from "./quant/cross-asset-stress";
export {
  buildDefaultForensicInputs,
  runCfaForensicAnalysis,
  analyzeHedgeFundRisk,
  runLiquidityAndComplianceCheck,
  getSignedWeightPct,
} from "./quant/cfa-institutional";

const RISK_FREE_RATE = 0.042; // 4.2% 10Y Treasury baseline

/**
 * Deterministic seeded PRNG (Mulberry32) so simulations are reproducible
 * for the same inputs while still producing realistic stochastic paths.
 */
function createPrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianRandom(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * 1. Portfolio Quantitative Metrics
 */
export function analyzePortfolioMetrics(
  holdings: Holding[],
  totalCapital: number
): PortfolioMetrics {
  const totalWeight = holdings.reduce((sum, h) => sum + Math.max(0, h.weightPct), 0) || 100;
  const normalized = holdings.map((h) => ({
    ...h,
    w: Math.max(0, h.weightPct) / totalWeight,
  }));

  const weightedBeta = normalized.reduce((s, h) => s + h.w * h.beta, 0);
  const expectedAnnualReturnPct = normalized.reduce(
    (s, h) => s + h.w * h.expectedAnnualReturnPct,
    0
  );
  const weightedDividendYieldPct = normalized.reduce(
    (s, h) => s + h.w * (h.dividendYieldPct ?? 0),
    0
  );

  // Portfolio volatility using simplified cross-sector correlation matrix (0.45 inter-sector, 0.78 intra-sector)
  let variance = 0;
  for (let i = 0; i < normalized.length; i++) {
    for (let j = 0; j < normalized.length; j++) {
      const hi = normalized[i];
      const hj = normalized[j];
      const corr = i === j ? 1 : hi.sector === hj.sector ? 0.78 : 0.42;
      const volI = hi.annualVolatilityPct / 100;
      const volJ = hj.annualVolatilityPct / 100;
      variance += hi.w * hj.w * volI * volJ * corr;
    }
  }
  const annualVolatilityPct = Math.sqrt(Math.max(0.0001, variance)) * 100;

  const sharpeRatio =
    (expectedAnnualReturnPct / 100 - RISK_FREE_RATE) /
    Math.max(0.01, annualVolatilityPct / 100);

  // Parametric 99% worst-year drawdown approximation
  const estimatedMaxDrawdownPct = Math.min(
    75,
    Math.max(8, annualVolatilityPct * 1.85 - expectedAnnualReturnPct * 0.25)
  );

  // Herfindahl-Hirschman Index (0 - 10,000)
  const concentrationHhi = normalized.reduce((s, h) => s + Math.pow(h.w * 100, 2), 0);
  const concentrationLabel =
    concentrationHhi < 1800
      ? "Diversified"
      : concentrationHhi < 3200
      ? "Moderate"
      : "Concentrated";

  const sectorMap = new Map<string, number>();
  for (const h of normalized) {
    sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.w * 100);
  }
  const sectorBreakdown = Array.from(sectorMap.entries())
    .map(([sector, weightPct]) => ({ sector, weightPct: round(weightPct, 1) }))
    .sort((a, b) => b.weightPct - a.weightPct);

  return {
    totalCapital,
    weightedBeta: round(weightedBeta, 2),
    expectedAnnualReturnPct: round(expectedAnnualReturnPct, 2),
    annualVolatilityPct: round(annualVolatilityPct, 2),
    sharpeRatio: round(sharpeRatio, 2),
    estimatedMaxDrawdownPct: round(estimatedMaxDrawdownPct, 1),
    concentrationHhi: Math.round(concentrationHhi),
    concentrationLabel,
    weightedDividendYieldPct: round(weightedDividendYieldPct, 2),
    sectorBreakdown,
  };
}

/**
 * 2. 5-Year Discounted Cash Flow (DCF) Valuation + Sensitivity Matrix
 */
function computeDcfSharePrice(
  baseFcfB: number,
  growthPct: number,
  waccPct: number,
  terminalGrowthPct: number,
  netDebtB: number,
  sharesB: number
): {
  pvFcf: number;
  pvTerminal: number;
  ev: number;
  equityVal: number;
  sharePrice: number;
} {
  const g = growthPct / 100;
  const wacc = Math.max(0.04, waccPct / 100);
  const tg = Math.min(wacc - 0.01, terminalGrowthPct / 100);

  let pvFcf = 0;
  let fcf = baseFcfB;
  for (let year = 1; year <= 5; year++) {
    // Taper growth slightly in years 4-5 toward terminal growth
    const yearGrowth = year <= 3 ? g : g * 0.7 + tg * 0.3;
    fcf = fcf * (1 + yearGrowth);
    pvFcf += fcf / Math.pow(1 + wacc, year);
  }

  const terminalFcf = fcf * (1 + tg);
  const terminalValue = terminalFcf / Math.max(0.01, wacc - tg);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, 5);

  const ev = pvFcf + pvTerminal;
  const equityVal = Math.max(0.1, ev - netDebtB);
  const sharePrice = equityVal / Math.max(0.001, sharesB);

  return { pvFcf, pvTerminal, ev, equityVal, sharePrice };
}

export function runDcfValuation(inputs: DcfInputs): DcfResult {
  const base = computeDcfSharePrice(
    inputs.baseFreeCashFlowBillions,
    inputs.revenueGrowthYear1To5Pct,
    inputs.waccPct,
    inputs.terminalGrowthPct,
    inputs.netDebtBillions,
    inputs.sharesOutstandingBillions
  );

  const upsidePct = ((base.sharePrice - inputs.currentPrice) / inputs.currentPrice) * 100;

  const waccSteps = [-1.5, -0.75, 0, 0.75, 1.5].map((d) => round(inputs.waccPct + d, 2));
  const tgSteps = [-0.75, 0, 0.75].map((d) => round(inputs.terminalGrowthPct + d, 2));

  const sensitivityGrid: DcfSensitivityCell[] = [];
  for (const w of waccSteps) {
    for (const tg of tgSteps) {
      const cell = computeDcfSharePrice(
        inputs.baseFreeCashFlowBillions,
        inputs.revenueGrowthYear1To5Pct,
        w,
        tg,
        inputs.netDebtBillions,
        inputs.sharesOutstandingBillions
      );
      sensitivityGrid.push({
        waccPct: w,
        terminalGrowthPct: tg,
        impliedSharePrice: round(cell.sharePrice, 2),
        upsidePct: round(((cell.sharePrice - inputs.currentPrice) / inputs.currentPrice) * 100, 1),
      });
    }
  }

  return {
    ticker: inputs.ticker,
    currentPrice: round(inputs.currentPrice, 2),
    impliedSharePrice: round(base.sharePrice, 2),
    upsidePct: round(upsidePct, 1),
    enterpriseValueBillions: round(base.ev, 2),
    equityValueBillions: round(base.equityVal, 2),
    pvOfCashFlowsBillions: round(base.pvFcf, 2),
    pvOfTerminalValueBillions: round(base.pvTerminal, 2),
    waccPct: inputs.waccPct,
    terminalGrowthPct: inputs.terminalGrowthPct,
    sensitivityGrid,
  };
}

/**
 * 3. Monte Carlo Wealth Simulation (1,000 Geometric Brownian Motion Paths)
 */
export function runMonteCarloSimulation(params: {
  initialCapital: number;
  monthlyContribution: number;
  horizonYears: number;
  expectedReturnPct: number;
  volatilityPct: number;
  simulations?: number;
}): MonteCarloResult {
  const simulations = params.simulations ?? 800;
  const years = Math.max(1, Math.min(30, Math.round(params.horizonYears)));
  const mu = params.expectedReturnPct / 100;
  const sigma = Math.max(0.02, params.volatilityPct / 100);
  const dt = 1 / 12;

  const seed =
    Math.round(params.initialCapital) ^
    Math.round(params.expectedReturnPct * 100) ^
    Math.round(params.volatilityPct * 100) ^
    (years * 7919);
  const rng = createPrng(seed || 42);

  // Store values per year across all simulations
  const yearlyValues: number[][] = Array.from({ length: years + 1 }, () => []);

  for (let sim = 0; sim < simulations; sim++) {
    let wealth = params.initialCapital;
    yearlyValues[0].push(wealth);
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) {
        const z = gaussianRandom(rng);
        const monthlyGrowth = Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
        wealth = wealth * monthlyGrowth + params.monthlyContribution;
      }
      yearlyValues[y].push(Math.max(0, wealth));
    }
  }

  const percentile = (sorted: number[], p: number) => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return Math.round(sorted[idx]);
  };

  const trajectory: MonteCarloPoint[] = [];
  for (let y = 0; y <= years; y++) {
    const sorted = [...yearlyValues[y]].sort((a, b) => a - b);
    trajectory.push({
      year: y,
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
      contributed: Math.round(params.initialCapital + params.monthlyContribution * 12 * y),
    });
  }

  const finalSorted = [...yearlyValues[years]].sort((a, b) => a - b);
  const totalContributed = params.initialCapital + params.monthlyContribution * 12 * years;
  const doubledCount = finalSorted.filter((v) => v >= totalContributed * 2).length;
  const lossCount = finalSorted.filter((v) => v < totalContributed).length;

  return {
    initialCapital: params.initialCapital,
    monthlyContribution: params.monthlyContribution,
    horizonYears: years,
    expectedReturnPct: round(params.expectedReturnPct, 2),
    volatilityPct: round(params.volatilityPct, 2),
    simulations,
    medianEndingValue: percentile(finalSorted, 0.5),
    downsideP10Value: percentile(finalSorted, 0.1),
    upsideP90Value: percentile(finalSorted, 0.9),
    probabilityOfDoublingPct: round((doubledCount / simulations) * 100, 1),
    probabilityOfLossPct: round((lossCount / simulations) * 100, 1),
    trajectory,
  };
}

/**
 * 4. Universal Cross-Asset Macro Shock Stress-Testing Engine (6 Institutional Regimes)
 */
export function stressTestMacroShocks(
  holdings: Holding[],
  totalCapital: number
): MacroShockScenarioResult[] {
  return stressTestCrossAssetShocks(holdings, totalCapital);
}
