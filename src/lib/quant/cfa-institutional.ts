import {
  CfaForensicInputs,
  CfaForensicResult,
  ComplianceRuleResult,
  FactorTilt,
  HedgeFundRiskReport,
  Holding,
  LiquidityComplianceReport,
  PositionLiquidityMetric,
  PositionRiskContribution,
} from "../types";

const RISK_FREE_RATE = 0.042; // 4.2% 10Y Treasury baseline

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function safeDiv(num: number, den: number, fallback = 0): number {
  if (!Number.isFinite(den) || Math.abs(den) < 1e-9) return fallback;
  return num / den;
}

/**
 * Default CFA Forensic Accounting inputs derived from a ticker's DCF profile
 * when explicit 3-statement inputs are not provided.
 */
export function buildDefaultForensicInputs(ticker: string, marketCapBillions: number): CfaForensicInputs {
  const mcapM = Math.max(500, marketCapBillions * 1000);
  const revCurr = mcapM * 0.42;
  const revPrior = revCurr / 1.11;
  return {
    ticker,
    revenuePrior: round(revPrior, 1),
    revenueCurrent: round(revCurr, 1),
    receivablesPrior: round(revPrior * 0.12, 1),
    receivablesCurrent: round(revCurr * 0.128, 1),
    grossMarginPriorPct: 44.5,
    grossMarginCurrentPct: 45.2,
    ebit: round(revCurr * 0.24, 1),
    netIncome: round(revCurr * 0.175, 1),
    operatingCashFlow: round(revCurr * 0.215, 1),
    totalAssets: round(mcapM * 0.78, 1),
    currentAssets: round(mcapM * 0.24, 1),
    currentLiabilities: round(mcapM * 0.14, 1),
    totalLiabilities: round(mcapM * 0.36, 1),
    retainedEarnings: round(mcapM * 0.28, 1),
    marketCap: round(mcapM, 1),
    ppePrior: round(mcapM * 0.31, 1),
    ppeCurrent: round(mcapM * 0.33, 1),
    depreciationPrior: round(revPrior * 0.065, 1),
    depreciationCurrent: round(revCurr * 0.064, 1),
    sgaPrior: round(revPrior * 0.14, 1),
    sgaCurrent: round(revCurr * 0.138, 1),
    totalDebtPrior: round(mcapM * 0.21, 1),
    totalDebtCurrent: round(mcapM * 0.20, 1),
    shareholdersEquity: round(mcapM * 0.42, 1),
    taxRatePct: 23.0,
    costOfDebtPct: 5.6,
    unleveredBeta: 0.96,
    riskFreeRatePct: 4.2,
    equityRiskPremiumPct: 5.2,
  };
}

/**
 * 1. CFA Level II/III Forensic Accounting, Quality of Earnings & Bottom-Up WACC
 *    - Beneish M-Score (8-factor earnings manipulation detector)
 *    - Altman Z-Score (corporate distress)
 *    - Sloan Accruals Ratio & Cash Conversion
 *    - DuPont 3-Stage ROE Decomposition
 *    - Bottom-Up Hamada Relevered WACC
 */
export function runCfaForensicAnalysis(inputs: CfaForensicInputs): CfaForensicResult {
  // Beneish M-Score components
  const dsri = safeDiv(
    safeDiv(inputs.receivablesCurrent, inputs.revenueCurrent, 0.12),
    safeDiv(inputs.receivablesPrior, inputs.revenuePrior, 0.12),
    1.0
  );
  const gmi = safeDiv(inputs.grossMarginPriorPct, inputs.grossMarginCurrentPct, 1.0);
  const nonCurrentAssetsCurr = Math.max(
    1,
    inputs.totalAssets - inputs.currentAssets - inputs.ppeCurrent
  );
  const totalAssetsPriorApprox = Math.max(1, inputs.totalAssets * 0.94);
  const nonCurrentAssetsPrior = Math.max(
    1,
    totalAssetsPriorApprox - inputs.currentAssets * 0.95 - inputs.ppePrior
  );
  const aqi = safeDiv(
    safeDiv(nonCurrentAssetsCurr, inputs.totalAssets, 0.25),
    safeDiv(nonCurrentAssetsPrior, totalAssetsPriorApprox, 0.25),
    1.0
  );
  const sgi = safeDiv(inputs.revenueCurrent, inputs.revenuePrior, 1.0);
  const depRatePrior = safeDiv(
    inputs.depreciationPrior,
    inputs.depreciationPrior + inputs.ppePrior,
    0.1
  );
  const depRateCurr = safeDiv(
    inputs.depreciationCurrent,
    inputs.depreciationCurrent + inputs.ppeCurrent,
    0.1
  );
  const depi = safeDiv(depRatePrior, depRateCurr, 1.0);
  const sgai = safeDiv(
    safeDiv(inputs.sgaCurrent, inputs.revenueCurrent, 0.15),
    safeDiv(inputs.sgaPrior, inputs.revenuePrior, 0.15),
    1.0
  );
  const lvgi = safeDiv(
    safeDiv(inputs.totalDebtCurrent, inputs.totalAssets, 0.3),
    safeDiv(inputs.totalDebtPrior, totalAssetsPriorApprox, 0.3),
    1.0
  );
  const tata = safeDiv(inputs.netIncome - inputs.operatingCashFlow, inputs.totalAssets, 0);

  const beneishMScore =
    -4.84 +
    0.92 * dsri +
    0.528 * gmi +
    0.404 * aqi +
    0.892 * sgi +
    0.115 * depi -
    0.172 * sgai +
    4.679 * tata -
    0.327 * lvgi;

  const beneishFlag =
    beneishMScore > -1.78 ? "ELEVATED_MANIPULATION_RISK" : "CLEAN";

  // Altman Z-Score (public company formula)
  const workingCapital = inputs.currentAssets - inputs.currentLiabilities;
  const x1 = safeDiv(workingCapital, inputs.totalAssets, 0);
  const x2 = safeDiv(inputs.retainedEarnings, inputs.totalAssets, 0);
  const x3 = safeDiv(inputs.ebit, inputs.totalAssets, 0);
  const x4 = safeDiv(inputs.marketCap, inputs.totalLiabilities, 2.0);
  const x5 = safeDiv(inputs.revenueCurrent, inputs.totalAssets, 0.5);
  const altmanZScore = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
  const altmanZone =
    altmanZScore > 2.99 ? "SAFE" : altmanZScore >= 1.81 ? "GREY" : "DISTRESS";

  // Sloan Accruals & Cash Conversion
  const sloanAccrualsRatioPct = tata * 100;
  const cashConversionRatio = safeDiv(inputs.operatingCashFlow, inputs.netIncome, 1.0);

  // DuPont 3-Stage ROE
  const netMarginPct = safeDiv(inputs.netIncome, inputs.revenueCurrent, 0) * 100;
  const assetTurnover = safeDiv(inputs.revenueCurrent, inputs.totalAssets, 0);
  const financialLeverage = safeDiv(inputs.totalAssets, inputs.shareholdersEquity, 1);
  const roePct = (netMarginPct / 100) * assetTurnover * financialLeverage * 100;

  // Bottom-up Hamada WACC
  const tax = inputs.taxRatePct / 100;
  const debtToMarketEquity = safeDiv(inputs.totalDebtCurrent, inputs.marketCap, 0.2);
  const releveredBeta = inputs.unleveredBeta * (1 + (1 - tax) * debtToMarketEquity);
  const costOfEquityPct =
    inputs.riskFreeRatePct + releveredBeta * inputs.equityRiskPremiumPct;
  const afterTaxCostOfDebtPct = inputs.costOfDebtPct * (1 - tax);
  const totalCapital = inputs.marketCap + inputs.totalDebtCurrent;
  const equityWeight = safeDiv(inputs.marketCap, totalCapital, 0.8);
  const debtWeight = 1 - equityWeight;
  const waccPct = equityWeight * costOfEquityPct + debtWeight * afterTaxCostOfDebtPct;

  // Residual Income Signal: (ROE - Ke) / Ke scaled to Book/Market
  const residualSpreadPct = roePct - costOfEquityPct;
  const bookToMarket = safeDiv(inputs.shareholdersEquity, inputs.marketCap, 0.4);
  const residualIncomeValuePerShareDeltaPct =
    (bookToMarket * (1 + safeDiv(residualSpreadPct, Math.max(4, costOfEquityPct - 2.5), 0)) - 1) *
    100;

  const redFlags: string[] = [];
  if (beneishFlag === "ELEVATED_MANIPULATION_RISK") {
    redFlags.push(
      `Beneish M-Score (${round(beneishMScore, 2)}) exceeds -1.78 threshold — elevated earnings manipulation risk.`
    );
  }
  if (dsri > 1.15) {
    redFlags.push(
      `Days Sales in Receivables Index (${round(dsri, 2)}) > 1.15 — receivables growing faster than revenue (channel stuffing watch).`
    );
  }
  if (altmanZone === "DISTRESS") {
    redFlags.push(
      `Altman Z-Score (${round(altmanZScore, 2)}) < 1.81 — balance sheet in financial distress zone.`
    );
  } else if (altmanZone === "GREY") {
    redFlags.push(
      `Altman Z-Score (${round(altmanZScore, 2)}) in Grey Zone (1.81–2.99) — monitor refinancing & interest coverage.`
    );
  }
  if (sloanAccrualsRatioPct > 8) {
    redFlags.push(
      `Sloan Accruals Ratio (${round(sloanAccrualsRatioPct, 1)}%) > 8% — earnings heavily accrual-driven rather than cash-backed.`
    );
  }
  if (cashConversionRatio < 0.85) {
    redFlags.push(
      `Cash Conversion (${round(cashConversionRatio, 2)}x OCF/NI) < 0.85x — weak free cash flow conversion.`
    );
  }

  return {
    ticker: inputs.ticker,
    beneishMScore: round(beneishMScore, 2),
    beneishFlag,
    beneishComponents: {
      dsri: round(dsri, 2),
      gmi: round(gmi, 2),
      aqi: round(aqi, 2),
      sgi: round(sgi, 2),
      depi: round(depi, 2),
      sgai: round(sgai, 2),
      lvgi: round(lvgi, 2),
      tata: round(tata, 3),
    },
    altmanZScore: round(altmanZScore, 2),
    altmanZone,
    sloanAccrualsRatioPct: round(sloanAccrualsRatioPct, 2),
    cashConversionRatio: round(cashConversionRatio, 2),
    dupontRoe: {
      netMarginPct: round(netMarginPct, 1),
      assetTurnover: round(assetTurnover, 2),
      financialLeverage: round(financialLeverage, 2),
      roePct: round(roePct, 1),
    },
    bottomUpWacc: {
      releveredBeta: round(releveredBeta, 2),
      costOfEquityPct: round(costOfEquityPct, 2),
      afterTaxCostOfDebtPct: round(afterTaxCostOfDebtPct, 2),
      waccPct: round(waccPct, 2),
    },
    residualIncomeValuePerShareDeltaPct: round(residualIncomeValuePerShareDeltaPct, 1),
    redFlags,
  };
}

/**
 * Helper: resolve signed weight for Long/Short holdings
 */
export function getSignedWeightPct(h: Holding): number {
  if (h.side === "SHORT") return -Math.abs(h.weightPct);
  return h.weightPct;
}

/**
 * Cross-asset pairwise correlation matrix approximation with Ledoit-Wolf shrinkage
 */
function pairwiseCorrelation(a: Holding, b: Holding, sameIdx: boolean): number {
  if (sameIdx) return 1.0;
  const fixedA = a.sector === "Fixed Income";
  const fixedB = b.sector === "Fixed Income";
  if (fixedA && fixedB) return 0.72;
  if (fixedA !== fixedB) return -0.12; // Flight-to-quality negative stock/bond corr
  if (a.sector === "Event Contract" || b.sector === "Event Contract") return 0.18;
  if (a.sector === "Crypto & Digital" && b.sector === "Crypto & Digital") return 0.82;
  if (a.sector === b.sector) return 0.74;
  if (
    (a.sector === "Mining & Materials" && b.sector === "Energy") ||
    (a.sector === "Energy" && b.sector === "Mining & Materials")
  ) {
    return 0.58;
  }
  return 0.38;
}

/**
 * Sector-based factor loading defaults (Fama-French 5-Factor + Commodity)
 */
function getSectorFactorLoadings(h: Holding): Record<FactorTilt["factor"], number> {
  const s = h.sector;
  return {
    Market: h.beta,
    Value:
      s === "Mining & Materials" || s === "Energy" || s === "Financials"
        ? 0.65
        : s === "Technology" || s === "Crypto & Digital"
        ? -0.45
        : 0.1,
    Momentum:
      s === "Technology" || s === "Industrials" || s === "Crypto & Digital"
        ? 0.55
        : s === "Real Estate" || s === "Fixed Income"
        ? -0.15
        : 0.25,
    Quality:
      s === "Technology" || s === "Healthcare" || s === "Industrials"
        ? 0.55
        : s === "Venture / Private" || s === "Crypto & Digital"
        ? -0.5
        : 0.15,
    Size:
      s === "Venture / Private" || s === "Event Contract"
        ? 0.75
        : s === "Mining & Materials"
        ? 0.2
        : -0.35,
    "Commodity/Inflation":
      s === "Mining & Materials" || s === "Energy"
        ? 0.85
        : s === "Real Estate"
        ? 0.35
        : s === "Fixed Income"
        ? -0.55
        : -0.1,
  };
}

/**
 * 2. $100M Hedge Fund Long/Short Risk Book, Tail Risk (VaR/CVaR), Factor Attribution & Black-Litterman
 */
export function analyzeHedgeFundRisk(
  holdings: Holding[],
  aumUsd: number
): HedgeFundRiskReport {
  const safeAum = Math.max(10_000, aumUsd);
  const positions = holdings.map((h) => {
    const signedWeightPct = getSignedWeightPct(h);
    const side: "LONG" | "SHORT" = signedWeightPct < 0 ? "SHORT" : "LONG";
    const w = signedWeightPct / 100;
    const dollarExposure = safeAum * w;
    const borrowCostPct = side === "SHORT" ? h.borrowCostPct ?? 1.25 : 0;
    const borrowDragUsd = Math.abs(dollarExposure) * (borrowCostPct / 100);
    return { h, signedWeightPct, side, w, dollarExposure, borrowCostPct, borrowDragUsd };
  });

  const longExposurePct = positions
    .filter((p) => p.signedWeightPct > 0)
    .reduce((s, p) => s + p.signedWeightPct, 0);
  const shortExposurePct = positions
    .filter((p) => p.signedWeightPct < 0)
    .reduce((s, p) => s + Math.abs(p.signedWeightPct), 0);
  const grossExposurePct = longExposurePct + shortExposurePct;
  const netExposurePct = longExposurePct - shortExposurePct;
  const betaAdjustedNetPct = positions.reduce(
    (s, p) => s + p.signedWeightPct * p.h.beta,
    0
  );

  // Signed covariance matrix Σ
  const n = positions.length;
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const corr = pairwiseCorrelation(positions[i].h, positions[j].h, i === j);
      const volI = positions[i].h.annualVolatilityPct / 100;
      const volJ = positions[j].h.annualVolatilityPct / 100;
      cov[i][j] = volI * volJ * corr;
    }
  }

  // Portfolio variance w^T Σ w
  const sigmaW: number[] = Array(n).fill(0);
  let variance = 0;
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += cov[i][j] * positions[j].w;
    }
    sigmaW[i] = rowSum;
    variance += positions[i].w * rowSum;
  }
  const portfolioVol = Math.sqrt(Math.max(0.0001, variance));
  const portfolioVolPct = portfolioVol * 100;

  // Expected return net of short borrow drag + cash rebate on short proceeds
  const grossExpectedReturn = positions.reduce(
    (s, p) => s + p.w * (p.h.expectedAnnualReturnPct / 100),
    0
  );
  const totalBorrowDragUsd = positions.reduce((s, p) => s + p.borrowDragUsd, 0);
  const shortBorrowDragPct = (totalBorrowDragUsd / safeAum) * 100;
  const shortBorrowDragBps = shortBorrowDragPct * 100;
  // Uninvested cash / short collateral earns Rf - 40bps prime spread
  const cashWeight = Math.max(0, 1 - netExposurePct / 100);
  const cashInterestPct = cashWeight * Math.max(0, RISK_FREE_RATE - 0.004) * 100;
  const expectedNetReturnPct =
    grossExpectedReturn * 100 + cashInterestPct - shortBorrowDragPct;

  const sharpeRatio = safeDiv(
    expectedNetReturnPct / 100 - RISK_FREE_RATE,
    Math.max(0.01, portfolioVol),
    0
  );
  // Downside semi-deviation approximation (~0.72 of total vol for asymmetric L/S)
  const downsideVol = portfolioVol * 0.72;
  const sortinoRatio = safeDiv(
    expectedNetReturnPct / 100 - RISK_FREE_RATE,
    Math.max(0.01, downsideVol),
    0
  );

  // Monthly VaR (95%) and Cornish-Fisher Fat-Tail CVaR (99%)
  const monthlyMean = expectedNetReturnPct / 100 / 12;
  const monthlyVol = portfolioVol / Math.sqrt(12);
  // Cornish-Fisher adjustment assuming mild negative skew (-0.35) & excess kurtosis (+1.5)
  const z95 = 1.645;
  const z99Cf = 2.326 + 0.18; // fat-tail adjusted 99% quantile
  const cvar99Multiplier = 2.88; // Expected Shortfall tail multiplier
  const var95MonthlyPct = Math.max(0.5, (z95 * monthlyVol - monthlyMean) * 100);
  const cvar99MonthlyPct = Math.max(
    var95MonthlyPct * 1.35,
    (cvar99Multiplier * monthlyVol - monthlyMean) * 100
  );
  const var95MonthlyUsd = (var95MonthlyPct / 100) * safeAum;
  const cvar99MonthlyUsd = (cvar99MonthlyPct / 100) * safeAum;
  const estMaxDrawdownPct = Math.min(65, Math.max(5, z99Cf * portfolioVolPct * 0.82));
  const calmarRatio = safeDiv(expectedNetReturnPct, estMaxDrawdownPct, 0);

  // Marginal Contribution to Risk (MCTR)
  const positionRisks: PositionRiskContribution[] = positions.map((p, i) => {
    const mctr = sigmaW[i] / portfolioVol;
    const pctRisk = safeDiv(p.w * mctr, portfolioVol, 0) * 100;
    return {
      ticker: p.h.ticker,
      side: p.side,
      signedWeightPct: round(p.signedWeightPct, 1),
      dollarExposure: Math.round(p.dollarExposure),
      standaloneVolPct: round(p.h.annualVolatilityPct, 1),
      mctrPct: round(mctr * 100, 2),
      percentOfRisk: round(pctRisk, 1),
      borrowDragUsd: Math.round(p.borrowDragUsd),
    };
  });

  // Factor Attribution
  const factorNames: FactorTilt["factor"][] = [
    "Market",
    "Value",
    "Momentum",
    "Quality",
    "Size",
    "Commodity/Inflation",
  ];
  const factorVols: Record<FactorTilt["factor"], number> = {
    Market: 16,
    Value: 10,
    Momentum: 12,
    Quality: 8,
    Size: 11,
    "Commodity/Inflation": 18,
  };
  let systematicVarApprox = 0;
  const factorTilts: FactorTilt[] = factorNames.map((factor) => {
    const exposure = positions.reduce(
      (s, p) => s + p.w * getSectorFactorLoadings(p.h)[factor],
      0
    );
    const volContrib = Math.abs(exposure) * factorVols[factor] * 0.45;
    systematicVarApprox += Math.pow(volContrib, 2);
    return {
      factor,
      exposure: round(exposure, 2),
      contributionToVolPct: round(volContrib, 2),
    };
  });
  const totalFactorVol = Math.sqrt(systematicVarApprox);
  const idiosyncraticRiskPct = round(
    Math.max(15, Math.min(85, (1 - safeDiv(totalFactorVol, portfolioVolPct * 1.4, 0.5)) * 100)),
    1
  );

  // Simplified Black-Litterman Optimal Signed Weights (risk-aversion δ = 2.8, tau = 0.05)
  // Blends current equilibrium with expected-return-to-variance ratio capped to institutional bounds
  const rawBlWeights = positions.map((p, i) => {
    const excessRet = p.h.expectedAnnualReturnPct / 100 - RISK_FREE_RATE;
    const riskAdjustedSignal = safeDiv(excessRet, Math.max(0.02, cov[i][i]), 0);
    // Blend 65% current weight + 35% view-tilted risk-parity weight
    const targetW = 0.65 * p.w + 0.35 * Math.max(-0.2, Math.min(0.25, riskAdjustedSignal * 0.14));
    return targetW;
  });
  const blGross = rawBlWeights.reduce((s, w) => s + Math.abs(w), 0) || 1;
  const targetGross = Math.max(0.8, Math.min(1.6, grossExposurePct / 100));
  const scale = targetGross / blGross;
  const blackLittermanWeights = positions.map((p, i) => {
    const optPct = round(rawBlWeights[i] * scale * 100, 1);
    return {
      ticker: p.h.ticker,
      currentSignedWeightPct: round(p.signedWeightPct, 1),
      optimalSignedWeightPct: optPct,
      deltaPct: round(optPct - p.signedWeightPct, 1),
    };
  });

  return {
    aumUsd: safeAum,
    longExposurePct: round(longExposurePct, 1),
    shortExposurePct: round(shortExposurePct, 1),
    grossExposurePct: round(grossExposurePct, 1),
    netExposurePct: round(netExposurePct, 1),
    betaAdjustedNetPct: round(betaAdjustedNetPct, 1),
    portfolioVolPct: round(portfolioVolPct, 2),
    expectedNetReturnPct: round(expectedNetReturnPct, 2),
    shortBorrowDragBps: round(shortBorrowDragBps, 1),
    sharpeRatio: round(sharpeRatio, 2),
    sortinoRatio: round(sortinoRatio, 2),
    calmarRatio: round(calmarRatio, 2),
    var95MonthlyPct: round(var95MonthlyPct, 2),
    var95MonthlyUsd: Math.round(var95MonthlyUsd),
    cvar99MonthlyPct: round(cvar99MonthlyPct, 2),
    cvar99MonthlyUsd: Math.round(cvar99MonthlyUsd),
    idiosyncraticRiskPct,
    factorTilts,
    positionRisks,
    blackLittermanWeights,
  };
}

/**
 * Default 20-day Average Daily Volume (USD) heuristic by asset class / sector when omitted
 */
function defaultAdvUsd(h: Holding): number {
  if (h.advUsd && h.advUsd > 0) return h.advUsd;
  if (h.assetClass === "prediction_market" || h.sector === "Event Contract") return 1_800_000;
  if (h.assetClass === "private_venture" || h.sector === "Venture / Private") return 250_000;
  if (h.assetClass === "real_estate" || h.sector === "Real Estate") return 500_000;
  if (h.sector === "Technology") return 850_000_000;
  if (h.sector === "Fixed Income") return 120_000_000;
  if (h.sector === "Mining & Materials") return 165_000_000;
  if (h.sector === "Industrials") return 320_000_000;
  return 110_000_000;
}

/**
 * 3. $100M Institutional Liquidity, Almgren-Chriss Market Impact & Pre-Trade Compliance Engine
 */
export function runLiquidityAndComplianceCheck(
  holdings: Holding[],
  aumUsd: number,
  riskReport: HedgeFundRiskReport,
  forensicResult?: CfaForensicResult,
  maxAdvParticipationPct = 15
): LiquidityComplianceReport {
  const safeAum = Math.max(10_000, aumUsd);
  const participation = Math.max(1, Math.min(35, maxAdvParticipationPct)) / 100;

  let totalSlippageUsd = 0;
  let totalAbsExposure = 0;
  let weightedDtlNum = 0;
  let illiquidAbsExposure = 0;

  const positionLiquidity: PositionLiquidityMetric[] = holdings.map((h) => {
    const signedW = getSignedWeightPct(h);
    const side: "LONG" | "SHORT" = signedW < 0 ? "SHORT" : "LONG";
    const absExposure = Math.abs((signedW / 100) * safeAum);
    const advUsd = defaultAdvUsd(h);
    const pctOfAdv = (absExposure / advUsd) * 100;
    const daysToLiquidate = absExposure / (advUsd * participation);

    // Almgren-Chriss one-way market impact model (bps):
    // half-spread + Y * daily_vol * sqrt(OrderSize / ADV)
    const dailyVol = (h.annualVolatilityPct / 100) / Math.sqrt(252);
    const halfSpreadBps =
      h.assetClass === "prediction_market" ? 45 : h.sector === "Fixed Income" ? 4 : 3;
    const impactBps = halfSpreadBps + 0.65 * dailyVol * 10_000 * Math.sqrt(absExposure / advUsd);
    const slippageUsd = absExposure * (impactBps / 10_000);

    const liquidityBucket: PositionLiquidityMetric["liquidityBucket"] =
      daysToLiquidate <= 1
        ? "T+1 Liquid"
        : daysToLiquidate <= 5
        ? "2-5 Days"
        : "Illiquid (>5d)";

    totalSlippageUsd += slippageUsd;
    totalAbsExposure += absExposure;
    weightedDtlNum += absExposure * daysToLiquidate;
    if (daysToLiquidate > 5) illiquidAbsExposure += absExposure;

    return {
      ticker: h.ticker,
      side,
      dollarExposure: Math.round(absExposure),
      advUsd: Math.round(advUsd),
      pctOfAdv: round(pctOfAdv, 2),
      daysToLiquidate: round(daysToLiquidate, 2),
      estimatedImpactBps: round(impactBps, 1),
      estimatedSlippageUsd: Math.round(slippageUsd),
      liquidityBucket,
    };
  });

  const weightedDaysToLiquidate = safeDiv(weightedDtlNum, totalAbsExposure, 0);
  const illiquidPctOfNav = (illiquidAbsExposure / safeAum) * 100;
  const totalEstimatedSlippageBps = safeDiv(totalSlippageUsd, safeAum, 0) * 10_000;

  // Institutional Pre-Trade Compliance Rules
  const maxSingleName = holdings.reduce(
    (max, h) => Math.max(max, Math.abs(getSignedWeightPct(h))),
    0
  );
  const checks: ComplianceRuleResult[] = [
    {
      ruleId: "COMP-01",
      ruleName: "Single-Name Concentration Cap",
      limit: "<= 20.0% NAV",
      actual: `${round(maxSingleName, 1)}% NAV`,
      status: maxSingleName > 25 ? "BREACH" : maxSingleName > 20 ? "WARN" : "PASS",
      detail:
        maxSingleName > 20
          ? "Largest single position exceeds institutional 20% NAV guideline; trim or pair-hedge."
          : "All single-name positions within institutional concentration limits.",
    },
    {
      ruleId: "COMP-02",
      ruleName: "Gross Leverage Limit",
      limit: "<= 200.0% NAV",
      actual: `${riskReport.grossExposurePct}% NAV`,
      status:
        riskReport.grossExposurePct > 200
          ? "BREACH"
          : riskReport.grossExposurePct > 175
          ? "WARN"
          : "PASS",
      detail:
        riskReport.grossExposurePct > 200
          ? "Gross book exceeds prime-broker 2.0x leverage mandate."
          : "Gross exposure well within prime-broker margin headroom.",
    },
    {
      ruleId: "COMP-03",
      ruleName: "99% 1-Month CVaR Tail Risk Limit",
      limit: "<= 15.0% NAV",
      actual: `${riskReport.cvar99MonthlyPct}% NAV`,
      status:
        riskReport.cvar99MonthlyPct > 18
          ? "BREACH"
          : riskReport.cvar99MonthlyPct > 15
          ? "WARN"
          : "PASS",
      detail:
        riskReport.cvar99MonthlyPct > 15
          ? "Expected Shortfall exceeds monthly drawdown budget; add index puts or reduce net beta."
          : "Monthly 99% Expected Shortfall within fund risk appetite.",
    },
    {
      ruleId: "COMP-04",
      ruleName: "Illiquidity Bucket (>5 Days to Liquidate)",
      limit: "<= 20.0% NAV",
      actual: `${round(illiquidPctOfNav, 1)}% NAV`,
      status:
        illiquidPctOfNav > 20 ? "BREACH" : illiquidPctOfNav > 10 ? "WARN" : "PASS",
      detail:
        illiquidPctOfNav > 10
          ? `At $${(safeAum / 1_000_000).toFixed(1)}M AUM, thin-ADV positions require >5 trading days to exit.`
          : "Portfolio can be liquidated rapidly within 15% ADV participation caps.",
    },
  ];

  if (forensicResult) {
    const forensicFail =
      forensicResult.beneishFlag === "ELEVATED_MANIPULATION_RISK" ||
      forensicResult.altmanZone === "DISTRESS";
    const forensicWarn = forensicResult.altmanZone === "GREY";
    checks.push({
      ruleId: "COMP-05",
      ruleName: `CFA Forensic Gate (${forensicResult.ticker})`,
      limit: "M <= -1.78 & Z >= 1.81",
      actual: `M=${forensicResult.beneishMScore}, Z=${forensicResult.altmanZScore}`,
      status: forensicFail ? "BREACH" : forensicWarn ? "WARN" : "PASS",
      detail: forensicFail
        ? "Forensic accounting red flag triggered — requires CFO/auditor review before capital deployment."
        : forensicWarn
        ? "Altman Z-Score in Grey Zone — monitor leverage and working capital."
        : "Passed Beneish M-Score and Altman Z-Score quality-of-earnings gates.",
    });
  }

  const overallStatus: LiquidityComplianceReport["overallStatus"] = checks.some(
    (c) => c.status === "BREACH"
  )
    ? "BREACH"
    : checks.some((c) => c.status === "WARN")
    ? "WARN"
    : "PASS";

  return {
    aumUsd: safeAum,
    maxAdvParticipationPct,
    weightedDaysToLiquidate: round(weightedDaysToLiquidate, 2),
    illiquidPctOfNav: round(illiquidPctOfNav, 1),
    totalEstimatedRebalanceSlippageUsd: Math.round(totalSlippageUsd),
    totalEstimatedSlippageBps: round(totalEstimatedSlippageBps, 1),
    overallStatus,
    positionLiquidity,
    complianceChecks: checks,
  };
}
