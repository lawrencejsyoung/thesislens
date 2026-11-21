import assert from "node:assert/strict";
import {
  analyzeBondDuration,
  analyzeHedgeFundRisk,
  analyzeRealEstateDeal,
  buildDefaultForensicInputs,
  evaluatePredictionBet,
  priceBlackScholesOption,
  priceOptionStrategy,
  runCfaForensicAnalysis,
  runLiquidityAndComplianceCheck,
  simulateVenturePowerLaw,
} from "../src/lib/quant-engine";
import {
  ingestCustomIntelligence,
  parseRssOrPodcastXml,
} from "../src/lib/adapters/intel-ingestion";
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

  console.log("5. Verifying CFA Forensic Accounting, $100M Hedge Fund Risk & Compliance...");
  const hfPreset = PRESET_SCENARIOS[0];
  assert(hfPreset.id === "sudbury-100m-hedge-fund", "First preset should be $100M Hedge Fund");
  const cleanForensic = runCfaForensicAnalysis(
    hfPreset.payload.cfaForensicInputs ?? buildDefaultForensicInputs("ETN", 136)
  );
  assert(cleanForensic.beneishFlag === "CLEAN", "Healthy ETN should pass Beneish M-Score");
  assert(cleanForensic.altmanZone === "SAFE", "Healthy ETN should be in Altman Safe Zone");
  assert(cleanForensic.dupontRoe.roePct > 15, "ETN DuPont ROE sanity check");

  const redFlagForensic = runCfaForensicAnalysis({
    ...(hfPreset.payload.cfaForensicInputs ?? buildDefaultForensicInputs("BAD", 10)),
    receivablesCurrent: 12000, // massive receivables spike
    operatingCashFlow: -1500, // negative cash flow despite positive net income
  });
  assert(
    redFlagForensic.beneishFlag === "ELEVATED_MANIPULATION_RISK",
    "Receivables spike + negative OCF must trigger Beneish manipulation flag"
  );

  const hfRisk = analyzeHedgeFundRisk(hfPreset.payload.holdings, 100_000_000);
  assert(hfRisk.longExposurePct === 110 && hfRisk.shortExposurePct === 35, "L/S exposure math check");
  assert(hfRisk.grossExposurePct === 145 && hfRisk.netExposurePct === 75, "Gross/Net math check");
  assert(hfRisk.cvar99MonthlyPct > hfRisk.var95MonthlyPct, "99% CVaR must exceed 95% VaR");

  const comp100M = runLiquidityAndComplianceCheck(
    hfPreset.payload.holdings,
    100_000_000,
    hfRisk,
    cleanForensic,
    15
  );
  const comp5M = runLiquidityAndComplianceCheck(
    hfPreset.payload.holdings,
    5_000_000,
    hfRisk,
    cleanForensic,
    15
  );
  assert(
    comp100M.totalEstimatedSlippageBps > comp5M.totalEstimatedSlippageBps,
    "Almgren-Chriss impact bps must scale up with AUM ($100M > $5M)"
  );
  console.log(
    `   PASS: Beneish M=${cleanForensic.beneishMScore} | Altman Z=${cleanForensic.altmanZScore} | Gross/Net=${hfRisk.grossExposurePct}%/${hfRisk.netExposurePct}% | 99% CVaR=${hfRisk.cvar99MonthlyPct}% | Slippage=${comp100M.totalEstimatedSlippageBps}bps`
  );

  console.log("6. Verifying Intelligence Ingestion (Podcast RSS XML & Newsletter Extraction)...");
  const samplePodcastXml = `<rss><channel><item><title>Macro Voices: Copper Deficit &amp; $VALE Sudbury Outlook</title><description>Accelerating AI grid demand points to a structural copper deficit. Watch ETN and VALE earnings.</description><enclosure url="https://cdn.example.com/ep412.mp3" type="audio/mpeg"/><itunes:duration>48:12</itunes:duration></item></channel></rss>`;
  const podSignals = parseRssOrPodcastXml(samplePodcastXml, "podcast", "Macro Voices", 2);
  assert(podSignals.length === 1 && podSignals[0].sourceType === "podcast", "Podcast RSS parse failed");
  assert(podSignals[0].tickers.includes("VALE") && podSignals[0].tickers.includes("ETN"), "Ticker extraction failed");
  assert(Boolean(podSignals[0].audioUrl), "Podcast audio enclosure URL missing");

  const customNl = await ingestCustomIntelligence({
    sourceType: "newsletter",
    sourceName: "Substack Alpha",
    title: "Uranium Contracting Supercycle",
    rawText: "Utility contracting for $CCJ is surging with record term floors and strong demand.",
  });
  assert(customNl.signals.length === 1 && customNl.signals[0].sentimentScore > 0, "Newsletter extraction failed");
  console.log("   PASS: Parsed Podcast RSS + Custom Newsletter signals cleanly.");

  console.log(`7. Verifying Universal Workforce Orchestrator across all ${PRESET_SCENARIOS.length} presets...`);
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
    assert(types.has("intel_ready"), `${preset.id} missing intel_ready`);
    assert(types.has("cio_memo"), `${preset.id} missing cio_memo`);
    assert(types.has("complete"), `${preset.id} missing complete`);
    assert((res.expressionVehicles?.length ?? 0) >= 1, `${preset.id} must produce access vehicles`);
    if (preset.id === "sudbury-100m-hedge-fund") {
      const roles = new Set(res.debateTurns.map((t) => t.role));
      assert(roles.has("cfa_forensic"), "$100M Hedge Fund must invoke cfa_forensic specialist");
      assert(roles.has("risk_officer"), "$100M Hedge Fund must invoke risk_officer specialist");
      assert(roles.has("intel_analyst"), "$100M Hedge Fund must invoke intel_analyst specialist");
    }
    console.log(
      `   PASS [${preset.id}]: ${res.debateTurns.length} agents, ${res.expressionVehicles?.length} vehicles, ${res.intelSignals?.length ?? 0} intel signals, Verdict=${res.cioMemo.rating} (${res.cioMemo.convictionScore}/100)`
    );
  }

  console.log("\nALL UNIVERSAL QUANT & WORKFORCE CHECKS PASSED!");
}

main().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
