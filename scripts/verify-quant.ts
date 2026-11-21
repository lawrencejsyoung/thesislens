import assert from "node:assert/strict";
import {
  analyzeBondDuration,
  analyzeRealEstateDeal,
  evaluatePredictionBet,
  priceBlackScholesOption,
  priceOptionStrategy,
  simulateVenturePowerLaw,
} from "../src/lib/quant-engine";
import { PRESET_SCENARIOS } from "../src/lib/demo-scenarios";
import { runUniversalWorkforce } from "../src/lib/workforce/orchestrator";
import { StreamEvent } from "../src/lib/types";

async function main() {
  console.log("1. Verifying Black-Scholes Put-Call Parity & Greeks...");
  const S = 100;
  const K = 105;
  const T = 0.5;
  const r = 0.042;
  const sigma = 0.35;
  const call = priceBlackScholesOption({ type: "call", spot: S, strike: K, timeYears: T, volatility: sigma, riskFreeRate: r });
  const put = priceBlackScholesOption({ type: "put", spot: S, strike: K, timeYears: T, volatility: sigma, riskFreeRate: r });
  const parityDiff = Math.abs(call.price - put.price - (S - K * Math.exp(-r * T)));
  assert(parityDiff < 0.01, `Put-call parity failed: diff=${parityDiff}`);
  assert(call.delta > 0 && call.delta < 1, "Call delta out of bounds");
  assert(put.delta < 0 && put.delta > -1, "Put delta out of bounds");
  assert(call.gamma > 0 && call.vegaPer1PctIv > 0, "Gamma/Vega must be positive");

  const spread = priceOptionStrategy({
    underlying: "NVDA",
    strategy: "bull_call_spread",
    spotPrice: 142,
    strikePrice: 145,
    upperStrikePrice: 175,
    daysToExpiry: 120,
    impliedVolatilityPct: 48,
    riskFreeRatePct: 4.2,
    contracts: 5,
  });
  assert(spread.payoffCurve.length === 21, "Payoff curve should have 21 points");
  assert(spread.maxProfit !== null && spread.maxProfit > 0, "Bull call spread maxProfit should be positive");
  console.log("   PASS: Black-Scholes parity diff =", parityDiff.toFixed(6));

  console.log("2. Verifying Prediction Market Vig Stripping & Kelly Bounds...");
  const negEdge = evaluatePredictionBet({
    question: "No-edge test",
    venue: "Polymarket",
    side: "YES",
    yesPriceCents: 60,
    noPriceCents: 42,
    estimatedTrueProbPct: 50,
    feePct: 1.5,
    oracleRiskHaircutPct: 10,
    stakeCapital: 10000,
    resolutionDate: "2027-12-31",
  });
  assert(negEdge.fullKellyPct === 0 && negEdge.riskAdjustedKellyPct === 0, "Negative EV must size to 0 Kelly");

  const posEdge = evaluatePredictionBet({
    question: "Copper > $15k/t",
    venue: "Polymarket",
    side: "YES",
    yesPriceCents: 38,
    noPriceCents: 64,
    estimatedTrueProbPct: 54,
    feePct: 1.5,
    oracleRiskHaircutPct: 10,
    stakeCapital: 50000,
    resolutionDate: "2027-12-31",
  });
  assert(posEdge.overroundPct === 2, "Overround should be 2%");
  assert(posEdge.edgePct > 10 && posEdge.expectedRoiPct > 30, "Positive EV expected");
  assert(posEdge.riskAdjustedKellyPct > 0 && posEdge.riskAdjustedKellyPct <= 25, "Risk-adj Kelly within (0, 25]");
  console.log("   PASS: Prediction EV ROI =", posEdge.expectedRoiPct, "% | Risk-Adj Kelly =", posEdge.riskAdjustedKellyPct, "%");

  console.log("3. Verifying Real Estate Pro Forma & Bond Duration...");
  const re = analyzeRealEstateDeal({
    propertyName: "Sudbury Fourplex",
    purchasePrice: 680000,
    downPaymentPct: 20,
    closingCostsPct: 3,
    grossAnnualRent: 67200,
    vacancyRatePct: 4.5,
    operatingExpenseRatioPct: 32,
    mortgageRatePct: 5.15,
    amortizationYears: 25,
    annualRentGrowthPct: 3.0,
    holdYears: 7,
    exitCapRatePct: 6.25,
  });
  assert(re.goingInCapRatePct > 5 && re.goingInCapRatePct < 8, "Cap rate sanity check");
  assert(re.dscr > 1.0, "DSCR should exceed 1.0");
  assert(re.sensitivityGrid.length === 9, "Real estate sensitivity grid should be 3x3");

  const bond = analyzeBondDuration({
    issuer: "GoC 10Y",
    faceValue: 1000,
    couponRatePct: 4.0,
    ytmPct: 4.0,
    yearsToMaturity: 10,
    paymentsPerYear: 2,
  });
  assert(Math.abs(bond.fairPrice - 1000) < 0.5, "Par bond must price near 1000");
  assert(bond.modifiedDuration > 7.5 && bond.modifiedDuration < 9.0, "10Y 4% bond mod duration sanity check");
  console.log("   PASS: Real Estate IRR =", re.leveredIrrPct, "% | Bond Mod Duration =", bond.modifiedDuration, "y");

  console.log("4. Verifying Venture Power-Law Seeded Reproducibility & Skewness...");
  const vc1 = simulateVenturePowerLaw({
    companyName: "Test AI",
    stage: "Seed",
    investmentAmount: 25000,
    valuationCap: 15000000,
    expectedDilutionPct: 45,
    failureProbPct: 58,
    modestExitProbPct: 24,
    breakoutProbPct: 13,
    powerLawProbPct: 5,
    holdYears: 8,
  });
  const vc2 = simulateVenturePowerLaw({
    companyName: "Test AI",
    stage: "Seed",
    investmentAmount: 25000,
    valuationCap: 15000000,
    expectedDilutionPct: 45,
    failureProbPct: 58,
    modestExitProbPct: 24,
    breakoutProbPct: 13,
    powerLawProbPct: 5,
    holdYears: 8,
  });
  assert.deepEqual(vc1, vc2, "Seeded Venture Monte Carlo must be deterministic");
  assert(vc1.meanMoic > vc1.medianMoic, "Power-law distribution must have Mean > Median");
  console.log("   PASS: Venture Mean MOIC =", vc1.meanMoic, "x vs Median =", vc1.medianMoic, "x");

  console.log("5. Verifying Universal Workforce Orchestrator across all 6 presets...");
  for (const preset of PRESET_SCENARIOS) {
    const events: StreamEvent[] = [];
    const res = await runUniversalWorkforce(
      { ...preset.payload, forceDemoMode: true },
      undefined,
      (ev) => events.push(ev)
    );
    const types = new Set(events.map((e) => e.type));
    assert(types.has("routing_plan"), `${preset.id} missing routing_plan`);
    assert(types.has("universal_quant_ready"), `${preset.id} missing universal_quant_ready`);
    assert(types.has("access_vehicles"), `${preset.id} missing access_vehicles`);
    assert(types.has("cio_memo"), `${preset.id} missing cio_memo`);
    assert(types.has("complete"), `${preset.id} missing complete`);
    assert((res.expressionVehicles?.length ?? 0) >= 1, `${preset.id} must produce access vehicles`);
    console.log(
      `   PASS [${preset.id}]: ${res.debateTurns.length} agents, ${res.expressionVehicles?.length} vehicles, Verdict=${res.cioMemo.rating} (${res.cioMemo.convictionScore}/100)`
    );
  }

  console.log("\nALL UNIVERSAL QUANT & WORKFORCE CHECKS PASSED!");
}

main().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
