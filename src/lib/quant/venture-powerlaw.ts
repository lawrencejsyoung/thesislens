import { VentureDealInputs, VentureValuationResult } from "../types";

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

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Deterministic Seeded Power-Law Monte Carlo & Dilution Waterfall Engine
 * Models Venture Capital, Angel SAFEs, and Private Early-Stage Bets.
 */
export function simulateVenturePowerLaw(
  inputs: VentureDealInputs,
  simulations = 1200
): VentureValuationResult {
  const rawTotal =
    inputs.failureProbPct +
    inputs.modestExitProbPct +
    inputs.breakoutProbPct +
    inputs.powerLawProbPct;
  const norm = rawTotal > 0 ? 100 / rawTotal : 1;

  const pFail = (inputs.failureProbPct * norm) / 100;
  const pModest = (inputs.modestExitProbPct * norm) / 100;
  const pBreakout = (inputs.breakoutProbPct * norm) / 100;
  const pPower = Math.max(0, 1 - pFail - pModest - pBreakout);

  const initialOwnershipPct =
    (inputs.investmentAmount / Math.max(100000, inputs.valuationCap)) * 100;
  const dilutionRetention = Math.max(0.15, 1 - inputs.expectedDilutionPct / 100);
  const dilutedOwnershipPct = initialOwnershipPct * dilutionRetention;

  const seed =
    Math.round(inputs.investmentAmount) ^
    Math.round(inputs.valuationCap / 1000) ^
    Math.round(inputs.failureProbPct * 100) ^
    (inputs.holdYears * 104729);
  const rng = createPrng(seed || 1337);

  const moics: number[] = [];
  let failSum = 0;
  let modestSum = 0;
  let modestCount = 0;
  let breakoutSum = 0;
  let breakoutCount = 0;
  let powerSum = 0;
  let powerCount = 0;

  for (let i = 0; i < simulations; i++) {
    const u = rng();
    let grossMultiple = 0;

    if (u < pFail) {
      grossMultiple = rng() < 0.8 ? 0 : rng() * 0.35; // total wipeout or soft acqui-hire
      failSum += grossMultiple * dilutionRetention;
    } else if (u < pFail + pModest) {
      grossMultiple = 1.2 + rng() * 2.8; // 1.2x - 4.0x gross
      const net = grossMultiple * dilutionRetention;
      modestSum += net;
      modestCount++;
      moics.push(net);
      continue;
    } else if (u < pFail + pModest + pBreakout) {
      grossMultiple = 6 + rng() * 14; // 6x - 20x gross
      const net = grossMultiple * dilutionRetention;
      breakoutSum += net;
      breakoutCount++;
      moics.push(net);
      continue;
    } else {
      // Heavy-tail Pareto/Power-law outlier: 25x - 140x gross
      const pareto = Math.pow(1 - Math.min(0.97, rng()), -0.55);
      grossMultiple = Math.min(160, 25 * pareto);
      const net = grossMultiple * dilutionRetention;
      powerSum += net;
      powerCount++;
      moics.push(net);
      continue;
    }

    moics.push(grossMultiple * dilutionRetention);
  }

  const sorted = [...moics].sort((a, b) => a - b);
  const meanMoic = moics.reduce((s, v) => s + v, 0) / simulations;
  const medianMoic = sorted[Math.floor(simulations * 0.5)] ?? 0;
  const p90Moic = sorted[Math.floor(simulations * 0.9)] ?? 0;
  const lossCount = moics.filter((m) => m < 1).length;
  const holdYears = Math.max(1, inputs.holdYears);
  const expectedIrrPct =
    meanMoic > 0 ? (Math.pow(meanMoic, 1 / holdYears) - 1) * 100 : -100;

  // Breakeven exit valuation so diluted stake returns 1.0x initial investment
  const breakevenExitValuation =
    inputs.investmentAmount / Math.max(0.00001, dilutedOwnershipPct / 100);

  const failCount = Math.max(1, simulations - modestCount - breakoutCount - powerCount);

  return {
    companyName: inputs.companyName,
    stage: inputs.stage,
    investmentAmount: Math.round(inputs.investmentAmount),
    initialOwnershipPct: round(initialOwnershipPct, 3),
    dilutedOwnershipPct: round(dilutedOwnershipPct, 3),
    meanMoic: round(meanMoic, 2),
    medianMoic: round(medianMoic, 2),
    p90Moic: round(p90Moic, 2),
    expectedEndingValue: Math.round(inputs.investmentAmount * meanMoic),
    expectedIrrPct: round(expectedIrrPct, 1),
    probabilityOfLossPct: round((lossCount / simulations) * 100, 1),
    breakevenExitValuation: Math.round(breakevenExitValuation),
    exitDistribution: [
      {
        bucket: "Wipeout / Acqui-hire",
        probabilityPct: round(pFail * 100, 1),
        avgMoic: round(failSum / failCount, 2),
      },
      {
        bucket: "Modest Exit (1x–3x)",
        probabilityPct: round(pModest * 100, 1),
        avgMoic: round(modestCount > 0 ? modestSum / modestCount : 1.5, 2),
      },
      {
        bucket: "Breakout (5x–15x)",
        probabilityPct: round(pBreakout * 100, 1),
        avgMoic: round(breakoutCount > 0 ? breakoutSum / breakoutCount : 8.5, 2),
      },
      {
        bucket: "Power-Law Outlier (25x+)",
        probabilityPct: round(pPower * 100, 1),
        avgMoic: round(powerCount > 0 ? powerSum / powerCount : 35, 1),
      },
    ],
  };
}
