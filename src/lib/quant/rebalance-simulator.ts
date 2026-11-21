import {
  Holding,
  Jurisdiction,
  MacroShockScenarioResult,
  RebalanceAction,
  RebalancePositionDelta,
  RebalanceSimulationOptions,
  RebalanceSimulationResult,
  TaxResidencyId,
} from "../types";
import {
  analyzePortfolioMetrics,
  runMonteCarloSimulation,
  stressTestMacroShocks,
} from "../quant-engine";
import { TAX_RESIDENCY_PROFILES } from "./global-tax-engine";

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export function defaultResidencyForJurisdiction(
  jurisdiction?: Jurisdiction
): TaxResidencyId {
  if (jurisdiction === "US") return "us_ca";
  if (jurisdiction === "Global") return "singapore";
  return "canada_on";
}

function buildSyntheticHoldingForNewTicker(
  action: RebalanceAction,
  weightPct: number
): Holding {
  const upper = action.ticker.toUpperCase();
  const isBondOrCash = /(TLT|XBB|AGG|BND|SHV|SGOV|BIL|CASH|BOND)/.test(upper);
  const isGoldOrHedge = /(GLD|IAU|SLV|VIX|UVXY|SQQQ|HEDGE)/.test(upper);
  const isEvent = /(POLY|KALSHI|YES|NO|EVENT)/.test(upper);

  if (isBondOrCash) {
    return {
      ticker: action.ticker,
      name: `${action.ticker} Defensive Fixed Income`,
      sector: "Fixed Income",
      assetClass: "fixed_income",
      side: "LONG",
      weightPct,
      currentPrice: 100,
      beta: 0.12,
      expectedAnnualReturnPct: 4.8,
      annualVolatilityPct: 7.5,
      dividendYieldPct: 4.2,
    };
  }
  if (isGoldOrHedge) {
    return {
      ticker: action.ticker,
      name: `${action.ticker} Macro Hedge`,
      sector: "Mining & Materials",
      assetClass: "commodity_future",
      side: "LONG",
      weightPct,
      currentPrice: 220,
      beta: 0.15,
      expectedAnnualReturnPct: 6.5,
      annualVolatilityPct: 14.5,
      dividendYieldPct: 0,
    };
  }
  if (isEvent) {
    return {
      ticker: action.ticker,
      name: `${action.ticker} Event Contract`,
      sector: "Event Contract",
      assetClass: "prediction_market",
      side: "LONG",
      weightPct,
      currentPrice: 0.45,
      beta: 0.1,
      expectedAnnualReturnPct: 14.0,
      annualVolatilityPct: 38.0,
      dividendYieldPct: 0,
    };
  }
  return {
    ticker: action.ticker,
    name: `${action.ticker} CIO Target Position`,
    sector: "Industrials",
    assetClass: "equity",
    side: "LONG",
    weightPct,
    currentPrice: 100,
    beta: 1.0,
    expectedAnnualReturnPct: 10.2,
    annualVolatilityPct: 22.0,
    dividendYieldPct: 1.4,
  };
}

function findWorstShock(
  shocks: MacroShockScenarioResult[]
): MacroShockScenarioResult | null {
  if (!shocks.length) return null;
  return shocks.reduce((worst, cur) =>
    cur.portfolioImpactPct < worst.portfolioImpactPct ? cur : worst
  );
}

/**
 * Deterministically simulates applying the CIO's Rebalance Plan to the current
 * portfolio and calculates Before vs. After risk/return, Monte Carlo, Macro
 * Shock resilience, and residency-specific Capital Gains Tax Drag.
 */
export function simulateCioRebalance(params: {
  holdings: Holding[];
  rebalancePlan: RebalanceAction[];
  capital: number;
  monthlyContribution: number;
  horizonYears: number;
  options: RebalanceSimulationOptions;
}): RebalanceSimulationResult {
  const {
    holdings,
    rebalancePlan,
    capital,
    monthlyContribution,
    horizonYears,
    options,
  } = params;

  const safeCapital = Math.max(1000, capital || 100_000);
  const residency =
    TAX_RESIDENCY_PROFILES[options.residencyId] ?? TAX_RESIDENCY_PROFILES.canada_on;
  const assumedGainFrac =
    Math.max(0, Math.min(80, options.assumedUnrealizedGainPct)) / 100;
  const effectiveCapGainsRate =
    options.accountWrapper === "tax_sheltered"
      ? 0
      : Math.max(0, residency.ltcgRatePct) / 100;

  // Map CIO actions by normalized ticker
  const actionMap = new Map<string, RebalanceAction>();
  for (const act of rebalancePlan) {
    actionMap.set(act.ticker.trim().toUpperCase(), act);
  }

  // Build raw proposed holdings
  const rawProposed: Holding[] = [];
  const matchedTickers = new Set<string>();

  for (const h of holdings) {
    const key = h.ticker.trim().toUpperCase();
    const act = actionMap.get(key);
    if (act) {
      matchedTickers.add(key);
      const targetW = Math.max(0, Number(act.targetWeightPct) || 0);
      rawProposed.push({
        ...h,
        weightPct: targetW,
      });
    } else {
      rawProposed.push({ ...h });
    }
  }

  // Add any new tickers recommended by CIO that aren't in current holdings
  for (const act of rebalancePlan) {
    const key = act.ticker.trim().toUpperCase();
    if (!matchedTickers.has(key) && act.targetWeightPct > 0 && act.action !== "PASS") {
      rawProposed.push(buildSyntheticHoldingForNewTicker(act, act.targetWeightPct));
    }
  }

  // Normalize proposed positive weights so they sum to 100% if non-zero
  const rawSum = rawProposed.reduce((s, h) => s + Math.max(0, h.weightPct), 0);
  const proposedHoldings: Holding[] =
    rawSum > 0
      ? rawProposed
          .map((h) => ({
            ...h,
            weightPct: round((Math.max(0, h.weightPct) / rawSum) * 100, 1),
          }))
          .filter((h) => h.weightPct > 0)
      : holdings.map((h) => ({ ...h }));

  // Normalize current holdings weights for clean delta math
  const curSum = holdings.reduce((s, h) => s + Math.max(0, h.weightPct), 0) || 100;
  const currentWeightByTicker = new Map<string, number>();
  const holdingMetaByTicker = new Map<string, Holding>();
  for (const h of holdings) {
    const key = h.ticker.trim().toUpperCase();
    currentWeightByTicker.set(key, round((Math.max(0, h.weightPct) / curSum) * 100, 1));
    holdingMetaByTicker.set(key, h);
  }

  const proposedWeightByTicker = new Map<string, number>();
  for (const h of proposedHoldings) {
    const key = h.ticker.trim().toUpperCase();
    proposedWeightByTicker.set(key, h.weightPct);
    if (!holdingMetaByTicker.has(key)) {
      holdingMetaByTicker.set(key, h);
    }
  }

  // Position-by-position trade & tax tickets
  const allKeys = Array.from(
    new Set([...currentWeightByTicker.keys(), ...proposedWeightByTicker.keys()])
  );

  const positionDeltas: RebalancePositionDelta[] = [];
  let totalTrimmedDollars = 0;
  let totalRealizedGainsUsd = 0;
  let totalTaxDragUsd = 0;
  let sumAbsDeltaPct = 0;

  for (const key of allKeys) {
    const curW = currentWeightByTicker.get(key) ?? 0;
    const tgtW = proposedWeightByTicker.get(key) ?? 0;
    const deltaW = round(tgtW - curW, 1);
    const meta = holdingMetaByTicker.get(key)!;
    const act = actionMap.get(key);

    const tradeDollarAmount = round((deltaW / 100) * safeCapital, 0);
    sumAbsDeltaPct += Math.abs(deltaW);

    let estimatedRealizedGainUsd = 0;
    let estimatedTaxDragUsd = 0;

    if (tradeDollarAmount < 0) {
      const soldUsd = Math.abs(tradeDollarAmount);
      totalTrimmedDollars += soldUsd;
      estimatedRealizedGainUsd = round(soldUsd * assumedGainFrac, 0);
      estimatedTaxDragUsd = round(estimatedRealizedGainUsd * effectiveCapGainsRate, 0);
      totalRealizedGainsUsd += estimatedRealizedGainUsd;
      totalTaxDragUsd += estimatedTaxDragUsd;
    }

    const inferredAction: RebalanceAction["action"] =
      act?.action ?? (deltaW > 0.5 ? "ADD" : deltaW < -0.5 ? "TRIM" : "HOLD");

    positionDeltas.push({
      ticker: meta.ticker,
      name: meta.name,
      sector: meta.sector,
      action: inferredAction,
      currentWeightPct: curW,
      targetWeightPct: tgtW,
      deltaWeightPct: deltaW,
      tradeDollarAmount,
      estimatedRealizedGainUsd,
      estimatedTaxDragUsd,
      rationale:
        act?.rationale ??
        (deltaW === 0
          ? "Maintain current allocation."
          : deltaW > 0
          ? "Increase weight per CIO risk-adjusted target."
          : "Trim position to reduce concentration and fund higher-conviction adds."),
    });
  }

  positionDeltas.sort((a, b) => Math.abs(b.deltaWeightPct) - Math.abs(a.deltaWeightPct));

  // Before vs. After deterministic quant suite
  const beforeMetrics = analyzePortfolioMetrics(holdings, safeCapital);
  const afterMetrics = analyzePortfolioMetrics(proposedHoldings, safeCapital);

  const beforeMonteCarlo = runMonteCarloSimulation({
    initialCapital: safeCapital,
    monthlyContribution,
    horizonYears,
    expectedReturnPct: beforeMetrics.expectedAnnualReturnPct,
    volatilityPct: beforeMetrics.annualVolatilityPct,
  });

  // In taxable accounts, deduct estimated tax drag from starting investable capital
  const afterInitialCapital = Math.max(1000, safeCapital - totalTaxDragUsd);
  const afterMonteCarlo = runMonteCarloSimulation({
    initialCapital: afterInitialCapital,
    monthlyContribution,
    horizonYears,
    expectedReturnPct: afterMetrics.expectedAnnualReturnPct,
    volatilityPct: afterMetrics.annualVolatilityPct,
  });

  const beforeShocks = stressTestMacroShocks(holdings, safeCapital);
  const afterShocks = stressTestMacroShocks(proposedHoldings, afterInitialCapital);
  const beforeWorstShock = findWorstShock(beforeShocks);
  const afterWorstShock = findWorstShock(afterShocks);

  const expectedReturnDeltaPct = round(
    afterMetrics.expectedAnnualReturnPct - beforeMetrics.expectedAnnualReturnPct,
    2
  );
  const volatilityDeltaPct = round(
    afterMetrics.annualVolatilityPct - beforeMetrics.annualVolatilityPct,
    2
  );
  const sharpeDelta = round(afterMetrics.sharpeRatio - beforeMetrics.sharpeRatio, 2);
  const betaDelta = round(afterMetrics.weightedBeta - beforeMetrics.weightedBeta, 2);
  const hhiDelta = Math.round(
    afterMetrics.concentrationHhi - beforeMetrics.concentrationHhi
  );
  const maxDrawdownDeltaPct = round(
    afterMetrics.estimatedMaxDrawdownPct - beforeMetrics.estimatedMaxDrawdownPct,
    2
  );
  const medianEndingValueDeltaUsd = Math.round(
    afterMonteCarlo.medianEndingValue - beforeMonteCarlo.medianEndingValue
  );
  const downsideP10DeltaUsd = Math.round(
    afterMonteCarlo.downsideP10Value - beforeMonteCarlo.downsideP10Value
  );
  const worstShockImprovementPct =
    beforeWorstShock && afterWorstShock
      ? round(
          afterWorstShock.portfolioImpactPct - beforeWorstShock.portfolioImpactPct,
          2
        )
      : 0;

  // Tax-efficiency verdict & payback
  const totalTurnoverPct = round(sumAbsDeltaPct / 2, 1);
  const taxDragBps = round((totalTaxDragUsd / safeCapital) * 10_000, 1);
  // Value risk-reduction benefit (vol reduction * 0.35 Sharpe proxy) + direct return delta
  const riskAdjustedAnnualBenefitPct =
    expectedReturnDeltaPct + Math.max(0, -volatilityDeltaPct) * 0.25;
  const annualExpectedAlphaGainUsd = Math.round(
    (riskAdjustedAnnualBenefitPct / 100) * safeCapital
  );

  let paybackMonths: number | null = null;
  if (totalTaxDragUsd <= 0) {
    paybackMonths = 0;
  } else if (annualExpectedAlphaGainUsd > 0) {
    paybackMonths = round((totalTaxDragUsd / annualExpectedAlphaGainUsd) * 12, 1);
  }

  let verdict: RebalanceSimulationResult["taxImpact"]["verdict"];
  let verdictExplanation: string;

  if (options.accountWrapper === "tax_sheltered" || totalTaxDragUsd === 0) {
    verdict = "TAX_FREE_WRAPPER";
    verdictExplanation =
      options.accountWrapper === "tax_sheltered"
        ? `Zero capital gains friction inside ${residency.keyAccounts[0] ?? "tax-sheltered"} wrapper — execute full CIO rebalance immediately.`
        : `Zero estimated capital gains drag under ${residency.label} (${residency.ltcgRatePct}% LTCG rate) — execute cleanly.`;
  } else if (
    (paybackMonths !== null && paybackMonths <= 18) ||
    taxDragBps <= 35 ||
    (sharpeDelta >= 0.08 && taxDragBps <= 90)
  ) {
    verdict = "TAX_EFFICIENT";
    verdictExplanation = `Estimated ${taxDragBps} bps (${residency.label} ${residency.ltcgRatePct}% LTCG) tax drag is justified by ${
      sharpeDelta >= 0 ? `+${sharpeDelta} Sharpe` : "risk reduction"
    }${paybackMonths ? ` (~${paybackMonths} mo payback)` : ""}.`;
  } else {
    verdict = "USE_NEW_CASH_FLOWS";
    verdictExplanation = `Tax drag of $${totalTaxDragUsd.toLocaleString()} (${taxDragBps} bps) is steep relative to immediate return pickup. Direct new monthly contributions ($${monthlyContribution.toLocaleString()}/mo) to ADD targets or harvest offsetting losses before trimming winners.`;
  }

  return {
    beforeMetrics,
    afterMetrics,
    beforeMonteCarlo,
    afterMonteCarlo,
    beforeWorstShock,
    afterWorstShock,
    proposedHoldings,
    positionDeltas,
    deltas: {
      expectedReturnDeltaPct,
      volatilityDeltaPct,
      sharpeDelta,
      betaDelta,
      hhiDelta,
      maxDrawdownDeltaPct,
      medianEndingValueDeltaUsd,
      downsideP10DeltaUsd,
      worstShockImprovementPct,
    },
    taxImpact: {
      residencyId: residency.id,
      residencyLabel: residency.label,
      accountWrapper: options.accountWrapper,
      ltcgRatePct: residency.ltcgRatePct,
      assumedUnrealizedGainPct: options.assumedUnrealizedGainPct,
      totalTurnoverPct,
      totalTrimmedDollars: Math.round(totalTrimmedDollars),
      estimatedRealizedGainsUsd: Math.round(totalRealizedGainsUsd),
      totalTaxDragUsd: Math.round(totalTaxDragUsd),
      taxDragBps,
      annualExpectedAlphaGainUsd,
      paybackMonths,
      verdict,
      verdictExplanation,
    },
  };
}
