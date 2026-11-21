import {
  PredictionBetInputs,
  PredictionSensitivityCell,
  PredictionValuationResult,
} from "../types";

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function computeKellyAndEv(
  trueProbForSide: number,
  entryPriceDollars: number,
  feePct: number,
  oracleHaircutPct: number
) {
  const effectiveCost = clamp(entryPriceDollars * (1 + feePct / 100), 0.01, 0.995);
  const netProfitIfWin = 1 - effectiveCost;
  const b = netProfitIfWin / effectiveCost; // decimal net odds
  const p = clamp(trueProbForSide, 0.01, 0.99);
  const q = 1 - p;

  const evPerDollar = p * b - q;
  const rawKelly = b > 0 ? Math.max(0, (b * p - q) / b) : 0;
  const oracleFactor = clamp(1 - oracleHaircutPct / 100, 0.25, 1);
  const halfKelly = rawKelly * 0.5;
  const quarterKelly = rawKelly * 0.25;
  const riskAdjustedKelly = Math.min(0.25, halfKelly * oracleFactor); // cap at 25% of bankroll

  return {
    effectiveCost,
    evPerDollar,
    expectedRoiPct: evPerDollar * 100,
    fullKellyPct: rawKelly * 100,
    halfKellyPct: halfKelly * 100,
    quarterKellyPct: quarterKelly * 100,
    riskAdjustedKellyPct: riskAdjustedKelly * 100,
    breakevenProbPct: effectiveCost * 100,
  };
}

/**
 * Deterministic Prediction Market & Binary Future-Outcome Valuation Engine
 * Strips vig/overround, computes EV, Fractional Kelly sizing, and Oracle-Risk Haircut.
 */
export function evaluatePredictionBet(
  inputs: PredictionBetInputs
): PredictionValuationResult {
  const yesCents = clamp(inputs.yesPriceCents, 1, 99);
  const noCents = clamp(inputs.noPriceCents, 1, 99);
  const sumCents = yesCents + noCents;
  const overroundPct = Math.max(0, sumCents - 100);

  const fairYesProb = (yesCents / sumCents) * 100;
  const fairSideProb = inputs.side === "YES" ? fairYesProb : 100 - fairYesProb;
  const rawSideCents = inputs.side === "YES" ? yesCents : noCents;
  const trueSideProbPct =
    inputs.side === "YES"
      ? clamp(inputs.estimatedTrueProbPct, 1, 99)
      : clamp(100 - inputs.estimatedTrueProbPct, 1, 99);

  const edgePct = trueSideProbPct - fairSideProb;
  const core = computeKellyAndEv(
    trueSideProbPct / 100,
    rawSideCents / 100,
    Math.max(0, inputs.feePct),
    clamp(inputs.oracleRiskHaircutPct, 0, 50)
  );

  const recommendedDollarStake = Math.round(
    (inputs.stakeCapital * core.riskAdjustedKellyPct) / 100
  );
  const expectedDollarProfit = Math.round(
    recommendedDollarStake * core.evPerDollar
  );

  // 5 x 3 sensitivity matrix: True Prob offsets (-10, -5, 0, +5, +10) x Entry Price offsets (-5¢, 0¢, +5¢)
  const probSteps = [-10, -5, 0, 5, 10].map((d) =>
    round(clamp(trueSideProbPct + d, 5, 95), 1)
  );
  const priceSteps = [-5, 0, 5].map((d) =>
    round(clamp(rawSideCents + d, 5, 95), 1)
  );

  const sensitivityGrid: PredictionSensitivityCell[] = [];
  for (const tp of probSteps) {
    for (const ep of priceSteps) {
      const cell = computeKellyAndEv(
        tp / 100,
        ep / 100,
        Math.max(0, inputs.feePct),
        clamp(inputs.oracleRiskHaircutPct, 0, 50)
      );
      sensitivityGrid.push({
        trueProbPct: tp,
        entryPriceCents: ep,
        expectedRoiPct: round(cell.expectedRoiPct, 1),
        halfKellyPct: round(cell.riskAdjustedKellyPct, 1),
      });
    }
  }

  return {
    question: inputs.question,
    venue: inputs.venue,
    side: inputs.side,
    rawMarketPriceCents: round(rawSideCents, 1),
    overroundPct: round(overroundPct, 2),
    fairImpliedProbPct: round(fairSideProb, 1),
    estimatedTrueProbPct: round(trueSideProbPct, 1),
    edgePct: round(edgePct, 1),
    netExpectedValuePerDollar: round(core.evPerDollar, 3),
    expectedRoiPct: round(core.expectedRoiPct, 1),
    expectedDollarProfit,
    fullKellyPct: round(core.fullKellyPct, 1),
    halfKellyPct: round(core.halfKellyPct, 1),
    quarterKellyPct: round(core.quarterKellyPct, 1),
    riskAdjustedKellyPct: round(core.riskAdjustedKellyPct, 1),
    recommendedDollarStake,
    breakevenProbPct: round(core.breakevenProbPct, 1),
    sensitivityGrid,
  };
}
