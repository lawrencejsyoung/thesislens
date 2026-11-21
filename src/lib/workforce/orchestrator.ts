import { GoogleGenAI, Type } from "@google/genai";
import {
  AccessChecklistItem,
  AgentDebateTurn,
  AnalysisMode,
  AnalysisRequestPayload,
  AssetClass,
  CioInvestmentMemo,
  CompleteAnalysisResult,
  ExpressionVehicle,
  Jurisdiction,
  LiveMarketQuote,
  RoutingPlan,
  StreamEvent,
  ToolCallRecord,
  UniversalQuantBundle,
} from "../types";
import {
  analyzeBondDuration,
  analyzePortfolioMetrics,
  analyzeRealEstateDeal,
  evaluatePredictionBet,
  priceOptionStrategy,
  runDcfValuation,
  runMonteCarloSimulation,
  simulateVenturePowerLaw,
  stressTestMacroShocks,
} from "../quant-engine";
import {
  executeUniversalQuantTool,
  UNIVERSAL_QUANT_TOOLS,
} from "../quant/tool-registry";
import { searchPredictionMarkets } from "../adapters/market-data";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const CIO_MEMO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    rating: {
      type: Type.STRING,
      enum: ["STRONG BUY", "BUY", "HOLD", "TRIM", "AVOID", "STRONG BET", "HEDGE", "PASS"],
    },
    convictionScore: { type: Type.INTEGER },
    executiveSummary: { type: Type.STRING },
    valuationVerdict: { type: Type.STRING },
    recommendedExpressionSummary: { type: Type.STRING },
    bullThesisHighlights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    bearRiskFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    catalysts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    rebalancePlan: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ticker: { type: Type.STRING },
          action: {
            type: Type.STRING,
            enum: ["ADD", "HOLD", "TRIM", "HEDGE", "BET", "PASS"],
          },
          targetWeightPct: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
        },
        required: ["ticker", "action", "targetWeightPct", "rationale"],
      },
    },
    accessChecklist: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.STRING },
          venue: { type: Type.STRING },
          accountNote: { type: Type.STRING },
          invalidationTrigger: { type: Type.STRING },
        },
        required: ["step", "venue", "accountNote", "invalidationTrigger"],
      },
    },
    timeHorizonNote: { type: Type.STRING },
  },
  required: [
    "headline",
    "rating",
    "convictionScore",
    "executiveSummary",
    "valuationVerdict",
    "bullThesisHighlights",
    "bearRiskFlags",
    "catalysts",
    "rebalancePlan",
    "timeHorizonNote",
  ],
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function extractBullets(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((l) => l.length > 18);
  return lines.slice(0, 4);
}

/**
 * Infers the effective AnalysisMode from explicit mode or prompt/inputs
 */
function resolveAnalysisMode(request: AnalysisRequestPayload): AnalysisMode {
  if (request.analysisMode) return request.analysisMode;
  if (request.ventureInputs) return "venture";
  if (request.realEstateInputs) return "real_assets";
  if (request.predictionInputs) return "prediction";
  if (request.optionInputs) return "options";
  const lower = `${request.title} ${request.thesisPrompt}`.toLowerCase();
  if (/(polymarket|kalshi|odds|probability|will .* hit|before 202|bet on|outcome)/.test(lower)) {
    return "any_outcome";
  }
  return "portfolio";
}

/**
 * Computes all relevant deterministic quant models upfront (zero hallucinated math)
 */
export function computeUniversalQuantBundle(
  request: AnalysisRequestPayload,
  mode: AnalysisMode
): UniversalQuantBundle {
  const portfolioMetrics = analyzePortfolioMetrics(request.holdings, request.capital);
  const dcfResult = runDcfValuation(request.dcfInputs);
  const monteCarlo = runMonteCarloSimulation({
    initialCapital: request.capital,
    monthlyContribution: request.monthlyContribution,
    horizonYears: request.horizonYears,
    expectedReturnPct: portfolioMetrics.expectedAnnualReturnPct,
    volatilityPct: portfolioMetrics.annualVolatilityPct,
  });
  const macroShocks = stressTestMacroShocks(request.holdings, request.capital);

  const bundle: UniversalQuantBundle = {
    portfolioMetrics,
    dcfResult,
    monteCarlo,
    macroShocks,
  };

  if (request.predictionInputs || mode === "prediction" || mode === "any_outcome") {
    bundle.predictionValuation = evaluatePredictionBet(
      request.predictionInputs ?? {
        question: request.title,
        venue: "Polymarket / Kalshi",
        side: "YES",
        yesPriceCents: 38,
        noPriceCents: 64,
        estimatedTrueProbPct: 54,
        feePct: 1.5,
        oracleRiskHaircutPct: 10,
        stakeCapital: request.capital,
        resolutionDate: "2027-12-31",
      }
    );
  }

  if (request.optionInputs || mode === "options" || mode === "any_outcome") {
    bundle.optionsValuation = priceOptionStrategy(
      request.optionInputs ?? {
        underlying: request.dcfInputs.ticker,
        strategy: "bull_call_spread",
        spotPrice: request.dcfInputs.currentPrice,
        strikePrice: Math.round(request.dcfInputs.currentPrice * 1.02),
        upperStrikePrice: Math.round(request.dcfInputs.currentPrice * 1.25),
        daysToExpiry: 180,
        impliedVolatilityPct: 38,
        riskFreeRatePct: 4.2,
        contracts: Math.max(1, Math.round((request.capital * 0.15) / Math.max(100, request.dcfInputs.currentPrice * 10))),
      }
    );
  }

  if (request.realEstateInputs || mode === "real_assets") {
    bundle.realAssetValuation = analyzeRealEstateDeal(
      request.realEstateInputs ?? {
        propertyName: request.title,
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
      }
    );
  }

  if (request.bondInputs || mode === "real_assets" || mode === "prediction") {
    bundle.bondValuation = analyzeBondDuration(
      request.bondInputs ?? {
        issuer: "10Y Sovereign Treasury Benchmark",
        faceValue: 1000,
        couponRatePct: 4.25,
        ytmPct: 4.4,
        yearsToMaturity: 10,
        paymentsPerYear: 2,
      }
    );
  }

  if (request.ventureInputs || mode === "venture") {
    bundle.ventureValuation = simulateVenturePowerLaw(
      request.ventureInputs ?? {
        companyName: request.title,
        stage: "Seed",
        investmentAmount: Math.min(request.capital, 25000),
        valuationCap: 15000000,
        expectedDilutionPct: 45,
        failureProbPct: 58,
        modestExitProbPct: 24,
        breakoutProbPct: 13,
        powerLawProbPct: 5,
        holdYears: 8,
      }
    );
  }

  return bundle;
}

/**
 * Builds the dynamic specialist routing plan for the user's thesis & mode
 */
function buildRoutingPlan(
  request: AnalysisRequestPayload,
  mode: AnalysisMode,
  liveMarketsUsed: boolean
): RoutingPlan {
  const jurisdiction: Jurisdiction = request.jurisdiction ?? "Canada";
  const detectedAssetClasses: AssetClass[] = [];

  if (mode === "portfolio" || request.holdings.length > 0) {
    detectedAssetClasses.push("equity", "etf");
  }
  if (mode === "prediction" || mode === "any_outcome" || request.predictionInputs) {
    detectedAssetClasses.push("prediction_market");
  }
  if (mode === "options" || mode === "any_outcome" || request.optionInputs) {
    detectedAssetClasses.push("option");
  }
  if (mode === "real_assets" || request.realEstateInputs) {
    detectedAssetClasses.push("real_estate", "fixed_income");
  }
  if (mode === "venture" || request.ventureInputs) {
    detectedAssetClasses.push("private_venture");
  }
  if (mode === "any_outcome") {
    detectedAssetClasses.push("commodity_future", "custom_outcome");
  }

  const activatedSpecialists: RoutingPlan["activatedSpecialists"] = [
    {
      role: "router",
      label: "Intake Router & Multimodal Extractor",
      reason: "Decompose thesis, detect asset classes & jurisdiction rules",
      parallel: false,
    },
    {
      role: "access_scout",
      label: "Market Access & Expression Scout",
      reason: `Rank every way to bet/access this outcome for ${jurisdiction} investors`,
      parallel: true,
    },
  ];

  if (mode === "portfolio" || mode === "any_outcome" || mode === "options") {
    activatedSpecialists.push({
      role: "equity_quant",
      label: "Equity & Cashflow Quant",
      reason: `Run 5Y DCF on ${request.dcfInputs.ticker} & portfolio factor analysis`,
      parallel: true,
    });
  }
  if (mode === "prediction" || mode === "any_outcome") {
    activatedSpecialists.push({
      role: "superforecaster",
      label: "Superforecaster & Probability Analyst",
      reason: "Strip vig, calibrate base rates, compute EV & Risk-Adjusted Kelly %",
      parallel: true,
    });
  }
  if (mode === "options" || mode === "any_outcome") {
    activatedSpecialists.push({
      role: "derivatives_quant",
      label: "Derivatives & Convexity Structurer",
      reason: "Price Black-Scholes options, Greeks, breakevens & asymmetric payoff",
      parallel: true,
    });
  }
  if (mode === "real_assets" || mode === "venture" || request.bondInputs) {
    activatedSpecialists.push({
      role: "real_assets_quant",
      label:
        mode === "venture"
          ? "Venture Power-Law & Private Deals Analyst"
          : "Real Assets & Credit Duration Analyst",
      reason:
        mode === "venture"
          ? "Run 1,200-path Power-Law dilution waterfall & breakeven exit math"
          : "Compute NOI, DSCR, Levered IRR & Bond Duration rate sensitivity",
      parallel: true,
    });
  }

  activatedSpecialists.push(
    {
      role: "bull",
      label: "Bull Strategist & Asymmetric Edge Hunter",
      reason: "Synthesize highest-EV expression & compounding upside",
      parallel: false,
    },
    {
      role: "bear",
      label: "Bear Auditor & Microstructure Skeptic",
      reason: "Audit tail-risk, oracle ambiguity, vig/theta drag & liquidity traps",
      parallel: false,
    },
    {
      role: "cio",
      label: "Chief Investment Officer (CIO)",
      reason: "Final Kelly allocation, rebalance plan & execution access playbook",
      parallel: false,
    }
  );

  return {
    analysisMode: mode,
    jurisdiction,
    detectedAssetClasses: Array.from(new Set(detectedAssetClasses)),
    outcomeQuestion: request.predictionInputs?.question || request.title,
    activatedSpecialists,
    liveMarketDataUsed: liveMarketsUsed,
  };
}

/**
 * Synthesizes ranked Expression Vehicles ("Every Way to Bet on This Outcome")
 */
function buildExpressionVehicles(
  request: AnalysisRequestPayload,
  quant: UniversalQuantBundle,
  liveMarkets: LiveMarketQuote[]
): ExpressionVehicle[] {
  const jurisdiction: Jurisdiction = request.jurisdiction ?? "Canada";
  const topHolding = [...request.holdings].sort((a, b) => b.weightPct - a.weightPct)[0];
  const vehicles: ExpressionVehicle[] = [];

  // 1. Direct Prediction Market Contract (live or modeled)
  if (quant.predictionValuation) {
    const pv = quant.predictionValuation;
    const matchedLive = liveMarkets[0];
    vehicles.push({
      id: "veh-prediction",
      name: matchedLive ? `${matchedLive.venue}: ${pv.side} Contract` : `${pv.venue} Binary Event Bet`,
      venue: matchedLive ? matchedLive.venue : pv.venue,
      assetClass: "prediction_market",
      instrumentSummary: `Buy ${pv.side} @ ${pv.rawMarketPriceCents}¢ (Fair ${pv.fairImpliedProbPct}% vs Model ${pv.estimatedTrueProbPct}%)`,
      impliedProbabilityOrReturn: `${pv.expectedRoiPct >= 0 ? "+" : ""}${pv.expectedRoiPct}% EV ROI`,
      capitalEfficiencyScore: 92,
      convexityScore: pv.rawMarketPriceCents < 45 ? 88 : 66,
      liquidityScore: matchedLive && matchedLive.liquidityUsd > 500_000 ? 78 : 64,
      estimatedFeeOrVigPct: Number((pv.overroundPct / 2 + (request.predictionInputs?.feePct ?? 1.5)).toFixed(1)),
      jurisdictionAccess:
        matchedLive?.venue === "Kalshi" ? "US Regulated" : "Global / DeFi",
      keyRisk: "Binary 100% stake loss & oracle resolution criteria ambiguity",
      recommendedKellyPct: pv.riskAdjustedKellyPct,
      accessUrl: matchedLive?.url || "https://polymarket.com",
      dataProvenance: matchedLive?.live ? "LIVE" : "SYNTHETIC",
    });
  }

  // 2. Options / Convexity Structure
  if (quant.optionsValuation) {
    const ov = quant.optionsValuation;
    vehicles.push({
      id: "veh-options",
      name: `${ov.underlying} ${ov.strategy.replace(/_/g, " ").toUpperCase()}`,
      venue: jurisdiction === "Canada" ? "CBOE / Montreal Exchange (IBKR / Questrade)" : "CBOE Options",
      assetClass: "option",
      instrumentSummary: `${ov.daysToExpiry}DTE K=$${ov.strikePrice}${ov.upperStrikePrice ? `/$${ov.upperStrikePrice}` : ""} @ $${ov.netDebitPerShare}/sh debit`,
      impliedProbabilityOrReturn: `PoP ${ov.probabilityOfProfitPct}% · Δ=${ov.greeks.delta}`,
      capitalEfficiencyScore: 90,
      convexityScore: 94,
      liquidityScore: 86,
      estimatedFeeOrVigPct: 1.2,
      jurisdictionAccess: "Canada & US",
      keyRisk: `Theta decay (${ov.greeks.thetaPerDay}/day) & IV crush if catalyst delays`,
      recommendedKellyPct: Math.min(12, Math.max(2, Math.round(ov.probabilityOfProfitPct * 0.16))),
      dataProvenance: "SYNTHETIC",
    });
  }

  // 3. Real Estate / Hard Asset
  if (quant.realAssetValuation) {
    const re = quant.realAssetValuation;
    vehicles.push({
      id: "veh-real-estate",
      name: `Direct Levered Property (${re.propertyName.slice(0, 26)})`,
      venue: jurisdiction === "Canada" ? "Direct MLS / CMHC Insured Mortgage" : "Direct Real Estate",
      assetClass: "real_estate",
      instrumentSummary: `20% Down (${formatCurrency(re.totalCashInvested)} cash) · Cap ${re.goingInCapRatePct}% · DSCR ${re.dscr}x`,
      impliedProbabilityOrReturn: `${re.leveredIrrPct}% Levered IRR`,
      capitalEfficiencyScore: 76,
      convexityScore: 72,
      liquidityScore: 28,
      estimatedFeeOrVigPct: 4.5,
      jurisdictionAccess: "Canada & US",
      keyRisk: "Illiquidity, refinancing rate reset risk & tenant/capex shocks",
      recommendedKellyPct: re.dscr >= 1.2 ? 25 : 10,
      dataProvenance: "SYNTHETIC",
    });
  }

  // 4. Venture SAFE / Private Deal
  if (quant.ventureValuation) {
    const vc = quant.ventureValuation;
    vehicles.push({
      id: "veh-venture",
      name: `${vc.stage} SAFE (${vc.companyName.slice(0, 24)})`,
      venue: "AngelList / Direct SAFE / Private SPV",
      assetClass: "private_venture",
      instrumentSummary: `${formatCurrency(vc.investmentAmount)} @ ${formatCurrency(request.ventureInputs?.valuationCap ?? 15_000_000)} Cap (${vc.dilutedOwnershipPct}% diluted)`,
      impliedProbabilityOrReturn: `${vc.meanMoic}x Mean (${vc.expectedIrrPct}% IRR)`,
      capitalEfficiencyScore: 82,
      convexityScore: 98,
      liquidityScore: 12,
      estimatedFeeOrVigPct: 2.0,
      jurisdictionAccess: "Accredited Only",
      keyRisk: `${vc.probabilityOfLossPct}% probability of <1x loss & 7–10Y zero-liquidity lockup`,
      recommendedKellyPct: 5,
      dataProvenance: "SYNTHETIC",
    });
  }

  // 5. Public Equity / Liquid Proxy Basket (Always available)
  vehicles.push({
    id: "veh-equity-basket",
    name: `Liquid Equity & ETF Proxy (${topHolding?.ticker ?? request.dcfInputs.ticker} Core)`,
    venue:
      jurisdiction === "Canada"
        ? "TSX / NYSE (TFSA / RRSP Eligible)"
        : "NYSE / NASDAQ",
    assetClass: "equity",
    instrumentSummary: `${request.holdings.length}-asset liquid basket anchored by ${request.dcfInputs.ticker} (${quant.dcfResult.upsidePct >= 0 ? "+" : ""}${quant.dcfResult.upsidePct}% DCF upside)`,
    impliedProbabilityOrReturn: `${quant.portfolioMetrics.expectedAnnualReturnPct}% Exp CAGR`,
    capitalEfficiencyScore: 74,
    convexityScore: 62,
    liquidityScore: 97,
    estimatedFeeOrVigPct: 0.15,
    jurisdictionAccess: "Canada & US",
    keyRisk: `Equity beta (${quant.portfolioMetrics.weightedBeta}) & -${quant.portfolioMetrics.estimatedMaxDrawdownPct}% tail drawdown`,
    recommendedKellyPct: Math.min(45, Math.max(15, Math.round(quant.portfolioMetrics.sharpeRatio * 45))),
    dataProvenance: "SYNTHETIC",
  });

  // 6. Bond / Rate Duration Ballast (if computed)
  if (quant.bondValuation) {
    const bv = quant.bondValuation;
    vehicles.push({
      id: "veh-bond-ballast",
      name: `Sovereign Duration Hedge (${bv.issuer.slice(0, 24)})`,
      venue: jurisdiction === "Canada" ? "TSX Bond ETF / Direct Strip (TFSA)" : "US TreasuryDirect / TLT",
      assetClass: "fixed_income",
      instrumentSummary: `YTM ${bv.ytmPct}% · Mod Duration ${bv.modifiedDuration}y · Convexity ${bv.convexity}`,
      impliedProbabilityOrReturn: `${bv.ytmPct}% Carry + Rate Convexity`,
      capitalEfficiencyScore: 68,
      convexityScore: 58,
      liquidityScore: 95,
      estimatedFeeOrVigPct: 0.1,
      jurisdictionAccess: "Canada & US",
      keyRisk: `+100bps rate shock causes ${bv.rateShocks.find((s) => s.bpsChange === 100)?.pctChange ?? -8}% price drop`,
      recommendedKellyPct: 18,
      dataProvenance: "SYNTHETIC",
    });
  }

  return vehicles.slice(0, 5);
}

/**
 * Runs a single Gemini agent with multi-turn Function Calling into UNIVERSAL_QUANT_TOOLS
 */
async function runGeminiAgentWithTools(params: {
  ai: GoogleGenAI;
  model: string;
  systemInstruction: string;
  userPrompt: string;
  allowedToolNames: string[];
  request: AnalysisRequestPayload;
  quant: UniversalQuantBundle;
}): Promise<{ text: string; toolCalls: ToolCallRecord[] }> {
  const { ai, model, systemInstruction, userPrompt, allowedToolNames } = params;
  const declarations = UNIVERSAL_QUANT_TOOLS.filter((d) =>
    allowedToolNames.includes(d.name ?? "")
  );

  const toolCalls: ToolCallRecord[] = [];
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: "user", parts: [{ text: userPrompt }] },
  ];

  for (let round = 0; round < 2; round++) {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.35,
        tools: declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined,
      },
    });

    const calls = response.functionCalls;
    if (calls && calls.length > 0) {
      const modelParts: Array<Record<string, unknown>> = calls.map((fc) => ({
        functionCall: { name: fc.name, args: fc.args ?? {} },
      }));
      contents.push({ role: "model", parts: modelParts });

      const responseParts: Array<Record<string, unknown>> = [];
      for (const fc of calls) {
        const t0 = Date.now();
        const toolName = fc.name ?? "unknown";
        const args = (fc.args ?? {}) as Record<string, unknown>;
        const exec = executeUniversalQuantTool(
          toolName,
          args,
          params.request,
          params.quant
        );
        toolCalls.push({
          id: `${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          toolName,
          args,
          resultSummary: exec.summary,
          durationMs: Math.max(4, Date.now() - t0),
        });
        responseParts.push({
          functionResponse: {
            name: toolName,
            response: exec.payload,
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    return {
      text: response.text?.trim() || "Analysis completed.",
      toolCalls,
    };
  }

  const finalResp = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      temperature: 0.35,
    },
  });

  return {
    text: finalResp.text?.trim() || "Analysis completed.",
    toolCalls,
  };
}

/**
 * Deterministic Interactive Demo Trace (executes 100% real quant math across all asset classes!)
 */
async function runUniversalDemoTrace(
  request: AnalysisRequestPayload,
  routingPlan: RoutingPlan,
  quant: UniversalQuantBundle,
  vehicles: ExpressionVehicle[],
  emit: (event: StreamEvent) => void
): Promise<CompleteAnalysisResult> {
  const modelUsed = "gemini-2.5-flash (Universal Workforce Demo Trace)";
  emit({
    type: "status",
    message: `Convening ${routingPlan.activatedSpecialists.length}-Agent Universal Workforce (${routingPlan.jurisdiction} Mandate)...`,
    mode: "demo-simulation",
    model: modelUsed,
  });

  emit({ type: "routing_plan", plan: routingPlan });
  emit({
    type: "quant_ready",
    portfolioMetrics: quant.portfolioMetrics,
    dcfResult: quant.dcfResult,
    monteCarlo: quant.monteCarlo,
    macroShocks: quant.macroShocks,
  });
  emit({ type: "universal_quant_ready", quant });
  emit({ type: "access_vehicles", vehicles });

  const turns: AgentDebateTurn[] = [];
  const worstShock = [...quant.macroShocks].sort(
    (a, b) => a.portfolioImpactPct - b.portfolioImpactPct
  )[0];
  const bestShock = [...quant.macroShocks].sort(
    (a, b) => b.portfolioImpactPct - a.portfolioImpactPct
  )[0];
  const topVehicle = vehicles[0];

  // Stage 1: Router
  await sleep(220);
  const routerTurn: AgentDebateTurn = {
    id: "turn-router",
    role: "router",
    agentName: "Agent 0 · Intake Router & Multimodal Extractor",
    title: `Classified "${routingPlan.analysisMode.replace("_", " ").toUpperCase()}" · Activated ${routingPlan.activatedSpecialists.length} Agents`,
    timestamp: nowTime(),
    status: "complete",
    summary: `Decomposed thesis for a ${routingPlan.jurisdiction} investor (${formatCurrency(request.capital)} capital, ${request.riskProfile} mandate, ${request.horizonYears}Y horizon). Detected asset classes: ${routingPlan.detectedAssetClasses.join(", ")}.`,
    keyPoints: [
      `Primary outcome/thesis question: "${routingPlan.outcomeQuestion}".`,
      `Spawning parallel specialist fan-out: ${routingPlan.activatedSpecialists
        .filter((s) => s.parallel)
        .map((s) => s.label)
        .join(" + ")}.`,
      request.attachmentName
        ? `Multimodal document "${request.attachmentName}" parsed into structured parameters.`
        : `All quantitative inputs routed directly to deterministic TypeScript valuation engines.`,
    ],
    toolCalls: [
      {
        id: "tc-router-1",
        toolName: "analyze_portfolio_metrics",
        args: { includeSectorBreakdown: true },
        resultSummary: `Beta ${quant.portfolioMetrics.weightedBeta} | Exp Return ${quant.portfolioMetrics.expectedAnnualReturnPct}% | Sharpe ${quant.portfolioMetrics.sharpeRatio} | HHI ${quant.portfolioMetrics.concentrationHhi}`,
        durationMs: 9,
      },
    ],
    confidencePct: 95,
  };
  turns.push(routerTurn);
  emit({ type: "agent_turn", turn: routerTurn });

  // Stage 2: Market Access Scout (Parallel Group A)
  await sleep(260);
  const scoutTurn: AgentDebateTurn = {
    id: "turn-access-scout",
    role: "access_scout",
    agentName: "Agent 1 · Market Access & Expression Scout",
    title: `Mapped ${vehicles.length} Ways to Bet/Access This Outcome (${routingPlan.jurisdiction})`,
    timestamp: nowTime(),
    status: "complete",
    parallelGroup: "Stage 2 · Parallel Specialists",
    summary: `Evaluated ${vehicles.length} cross-venue expression pathways. Top capital-efficiency vehicle is ${topVehicle?.name ?? "Liquid Equity Basket"} via ${topVehicle?.venue ?? "TSX/NYSE"} (${topVehicle?.impliedProbabilityOrReturn ?? "N/A"}), carrying ${topVehicle?.estimatedFeeOrVigPct ?? 0}% estimated fee/vig drag.`,
    keyPoints: vehicles.slice(0, 3).map(
      (v) =>
        `${v.name} (${v.venue}, ${v.jurisdictionAccess}): ${v.instrumentSummary} — Convexity ${v.convexityScore}/100, Liquidity ${v.liquidityScore}/100.`
    ),
    toolCalls: [],
    confidencePct: 90,
  };
  turns.push(scoutTurn);
  emit({ type: "agent_turn", turn: scoutTurn });

  // Stage 2 Dynamic Specialists
  if (quant.predictionValuation) {
    await sleep(220);
    const pv = quant.predictionValuation;
    const sfTurn: AgentDebateTurn = {
      id: "turn-superforecaster",
      role: "superforecaster",
      agentName: "Specialist · Superforecaster & Probability Analyst",
      title: `Bayesian Edge & Kelly Audit (${pv.side} @ ${pv.rawMarketPriceCents}¢)`,
      timestamp: nowTime(),
      status: "complete",
      parallelGroup: "Stage 2 · Parallel Specialists",
      summary: `Stripping ${pv.overroundPct}% venue overround reveals a fair market implied probability of ${pv.fairImpliedProbPct}% vs. calibrated model probability of ${pv.estimatedTrueProbPct}% (${pv.edgePct >= 0 ? "+" : ""}${pv.edgePct}% edge).`,
      keyPoints: [
        `Net Expected Value is ${pv.expectedRoiPct >= 0 ? "+" : ""}${pv.expectedRoiPct}% ROI per dollar risked (breakeven probability: ${pv.breakevenProbPct}%).`,
        `Full Kelly suggests ${pv.fullKellyPct}%, reduced to ${pv.riskAdjustedKellyPct}% (${formatCurrency(pv.recommendedDollarStake)}) after Half-Kelly & oracle-ambiguity haircut.`,
        `Expected dollar profit on recommended Kelly stake: ${formatCurrency(pv.expectedDollarProfit)}.`,
      ],
      toolCalls: [
        {
          id: "tc-pred-1",
          toolName: "evaluate_prediction_bet",
          args: { estimatedTrueProbPct: pv.estimatedTrueProbPct },
          resultSummary: `${pv.side} @ ${pv.rawMarketPriceCents}¢ → Edge ${pv.edgePct >= 0 ? "+" : ""}${pv.edgePct}% | EV ROI ${pv.expectedRoiPct}% | Risk-Adj Kelly ${pv.riskAdjustedKellyPct}%`,
          durationMs: 6,
        },
      ],
      confidencePct: pv.edgePct > 5 ? 85 : 68,
    };
    turns.push(sfTurn);
    emit({ type: "agent_turn", turn: sfTurn });
  }

  if (quant.optionsValuation) {
    await sleep(220);
    const ov = quant.optionsValuation;
    const optTurn: AgentDebateTurn = {
      id: "turn-derivatives",
      role: "derivatives_quant",
      agentName: "Specialist · Derivatives & Convexity Structurer",
      title: `Black-Scholes Pricing & Greeks (${ov.underlying} ${ov.strategy.replace(/_/g, " ")})`,
      timestamp: nowTime(),
      status: "complete",
      parallelGroup: "Stage 2 · Parallel Specialists",
      summary: `Priced ${ov.underlying} ${ov.strategy.replace(/_/g, " ")} (${ov.daysToExpiry} DTE, ${ov.impliedVolatilityPct}% IV) at $${ov.netDebitPerShare}/share debit (${formatCurrency(ov.totalCapitalAtRisk)} total risk) with ${ov.probabilityOfProfitPct}% lognormal Probability of Profit.`,
      keyPoints: [
        `Greeks profile: Delta ${ov.greeks.delta}, Gamma ${ov.greeks.gamma}, Theta ${ov.greeks.thetaPerDay}/day, Vega ${ov.greeks.vegaPer1PctIv} per +1% IV.`,
        `Max loss strictly capped at ${formatCurrency(ov.maxLoss)}; max profit ${ov.maxProfit === null ? "Unlimited" : formatCurrency(ov.maxProfit)}.`,
        `Breakeven spot price(s): ${ov.breakevens.map((b) => `$${b}`).join(" & ")} vs. current spot $${ov.spotPrice}.`,
      ],
      toolCalls: [
        {
          id: "tc-opt-1",
          toolName: "price_option_strategy",
          args: { daysToExpiry: ov.daysToExpiry },
          resultSummary: `Debit $${ov.netDebitPerShare} | MaxLoss ${formatCurrency(ov.maxLoss)} | PoP ${ov.probabilityOfProfitPct}% | Δ=${ov.greeks.delta}`,
          durationMs: 7,
        },
      ],
      confidencePct: 86,
    };
    turns.push(optTurn);
    emit({ type: "agent_turn", turn: optTurn });
  }

  if (quant.realAssetValuation || quant.ventureValuation) {
    await sleep(220);
    if (quant.ventureValuation) {
      const vc = quant.ventureValuation;
      const vcTurn: AgentDebateTurn = {
        id: "turn-real-assets",
        role: "real_assets_quant",
        agentName: "Specialist · Venture Power-Law & Private Deals Analyst",
        title: `Power-Law Monte Carlo & Dilution Waterfall (${vc.stage})`,
        timestamp: nowTime(),
        status: "complete",
        parallelGroup: "Stage 2 · Parallel Specialists",
        summary: `Simulated 1,200 power-law paths on ${formatCurrency(vc.investmentAmount)} SAFE: Mean MOIC is ${vc.meanMoic}x (${vc.expectedIrrPct}% expected IRR) while Median MOIC is ${vc.medianMoic}x — demonstrating classic venture skewness.`,
        keyPoints: [
          `Post-dilution ownership settles at ${vc.dilutedOwnershipPct}% (from ${vc.initialOwnershipPct}% initial); breakeven exit requires ${formatCurrency(vc.breakevenExitValuation)} valuation.`,
          `Probability of returning < 1.0x capital is ${vc.probabilityOfLossPct}%, offset by P90 upside of ${vc.p90Moic}x.`,
          `Portfolio sizing must cap single illiquid angel bets at <= 5% of total net worth.`,
        ],
        toolCalls: [
          {
            id: "tc-vc-1",
            toolName: "simulate_venture_powerlaw",
            args: {},
            resultSummary: `Mean ${vc.meanMoic}x vs Median ${vc.medianMoic}x | Exp IRR ${vc.expectedIrrPct}% | Loss Odds ${vc.probabilityOfLossPct}%`,
            durationMs: 14,
          },
        ],
        confidencePct: 82,
      };
      turns.push(vcTurn);
      emit({ type: "agent_turn", turn: vcTurn });
    } else if (quant.realAssetValuation) {
      const re = quant.realAssetValuation;
      const reTurn: AgentDebateTurn = {
        id: "turn-real-assets",
        role: "real_assets_quant",
        agentName: "Specialist · Real Assets & Credit Duration Analyst",
        title: `Property Pro Forma, DSCR & Levered IRR Audit`,
        timestamp: nowTime(),
        status: "complete",
        parallelGroup: "Stage 2 · Parallel Specialists",
        summary: `Modeled ${formatCurrency(re.totalCashInvested)} equity deployment: Year-1 NOI is ${formatCurrency(re.year1Noi)} (${re.goingInCapRatePct}% going-in Cap Rate) with a ${re.dscr}x DSCR and ${re.leveredIrrPct}% projected Levered IRR (${re.equityMultiple}x equity multiple).`,
        keyPoints: [
          `Year-1 Net Cash Flow after debt service (${formatCurrency(re.annualDebtService)}/yr) is ${formatCurrency(re.year1CashFlow)} (${re.cashOnCashPct}% Cash-on-Cash).`,
          `Projected exit value is ${formatCurrency(re.projectedExitValue)} vs. ${formatCurrency(re.remainingLoanAtExit)} remaining mortgage balance.`,
          quant.bondValuation
            ? `Benchmark 10Y Bond Duration sits at ${quant.bondValuation.modifiedDuration}y (YTM ${quant.bondValuation.ytmPct}%), framing the risk-free hurdle rate.`
            : `Compare levered illiquidity against liquid REIT ETFs yielding ~5.5% with zero tenant overhead.`,
        ],
        toolCalls: [
          {
            id: "tc-re-1",
            toolName: "analyze_real_estate_deal",
            args: {},
            resultSummary: `Cap ${re.goingInCapRatePct}% | DSCR ${re.dscr}x | CoC ${re.cashOnCashPct}% | Levered IRR ${re.leveredIrrPct}%`,
            durationMs: 8,
          },
        ],
        confidencePct: 87,
      };
      turns.push(reTurn);
      emit({ type: "agent_turn", turn: reTurn });
    }
  }

  // Stage 3: Bull & Bear Debate
  await sleep(260);
  const bullTurn: AgentDebateTurn = {
    id: "turn-bull",
    role: "bull",
    agentName: "Agent 3 · Bull Strategist & Asymmetric Edge Hunter",
    title: "Asymmetric Upside, Compounding & Optimal Expression Case",
    timestamp: nowTime(),
    status: "complete",
    summary: `Across ${quant.monteCarlo.simulations} Monte Carlo paths, median ${request.horizonYears}-year wealth reaches ${formatCurrency(quant.monteCarlo.medianEndingValue)} (P90: ${formatCurrency(quant.monteCarlo.upsideP90Value)}) with ${quant.monteCarlo.probabilityOfDoublingPct}% odds of 2x contributed capital.`,
    keyPoints: [
      `${quant.dcfResult.ticker} 5-year DCF implies $${quant.dcfResult.impliedSharePrice}/share (${quant.dcfResult.upsidePct >= 0 ? "+" : ""}${quant.dcfResult.upsidePct}% vs. $${quant.dcfResult.currentPrice}) at ${quant.dcfResult.waccPct}% WACC.`,
      `Best macro tailwind is "${bestShock.name}" (${bestShock.portfolioImpactPct >= 0 ? "+" : ""}${bestShock.portfolioImpactPct}% / ${formatCurrency(bestShock.dollarImpact)}).`,
      `Combining core liquid exposure with ${topVehicle?.name ?? "convex overlays"} maximizes risk-adjusted upside without uncapped downside.`,
    ],
    toolCalls: [
      {
        id: "tc-bull-1",
        toolName: "run_dcf_valuation",
        args: { waccAdjustmentPct: 0, growthAdjustmentPct: 0 },
        resultSummary: `${quant.dcfResult.ticker} DCF: $${quant.dcfResult.impliedSharePrice} vs $${quant.dcfResult.currentPrice} (${quant.dcfResult.upsidePct >= 0 ? "+" : ""}${quant.dcfResult.upsidePct}%)`,
        durationMs: 6,
      },
      {
        id: "tc-bull-2",
        toolName: "run_monte_carlo_simulation",
        args: { horizonYears: request.horizonYears },
        resultSummary: `Median ${formatCurrency(quant.monteCarlo.medianEndingValue)} | P10 ${formatCurrency(quant.monteCarlo.downsideP10Value)} | P90 ${formatCurrency(quant.monteCarlo.upsideP90Value)}`,
        durationMs: 14,
      },
    ],
    confidencePct: 83,
  };
  turns.push(bullTurn);
  emit({ type: "agent_turn", turn: bullTurn });

  await sleep(260);
  const bearTurn: AgentDebateTurn = {
    id: "turn-bear",
    role: "bear",
    agentName: "Agent 4 · Bear Auditor & Microstructure Skeptic",
    title: "Cross-Asset Tail-Risk, Vig/Theta & Counterparty Audit",
    timestamp: nowTime(),
    status: "complete",
    summary: `6-regime cross-asset stress testing flags severe exposure to "${worstShock.name}" (${worstShock.portfolioImpactPct}% / ${formatCurrency(worstShock.dollarImpact)}). Annualized volatility is ${quant.portfolioMetrics.annualVolatilityPct}% with a -${quant.portfolioMetrics.estimatedMaxDrawdownPct}% 99% tail-year drawdown.`,
    keyPoints: [
      `Concentration HHI is ${quant.portfolioMetrics.concentrationHhi} (${quant.portfolioMetrics.concentrationLabel}); worst single-name shock is ${worstShock.worstHitHolding}.`,
      quant.predictionValuation
        ? `Prediction contract carries ${quant.predictionValuation.overroundPct}% overround plus oracle-resolution risk; never exceed Half-Kelly (${quant.predictionValuation.riskAdjustedKellyPct}%).`
        : quant.optionsValuation
        ? `Option structure bleeds ${quant.optionsValuation.greeks.thetaPerDay}/day in theta and faces IV crush if the thesis takes longer than ${quant.optionsValuation.daysToExpiry} days.`
        : `P10 downside wealth over ${request.horizonYears} years drops to ${formatCurrency(quant.monteCarlo.downsideP10Value)}.`,
      `Recommended institutional hedge: ${worstShock.recommendedHedge}`,
    ],
    toolCalls: [
      {
        id: "tc-bear-1",
        toolName: "stress_test_cross_asset_shocks",
        args: { focusRegime: worstShock.id },
        resultSummary: `Worst shock: ${worstShock.name} (${worstShock.portfolioImpactPct}%, ${formatCurrency(worstShock.dollarImpact)})`,
        durationMs: 8,
      },
    ],
    confidencePct: 81,
  };
  turns.push(bearTurn);
  emit({ type: "agent_turn", turn: bearTurn });

  // Stage 4: CIO Synthesis
  await sleep(240);
  let baseScore =
    64 +
    (quant.dcfResult.upsidePct > 0
      ? Math.min(12, quant.dcfResult.upsidePct * 0.4)
      : Math.max(-12, quant.dcfResult.upsidePct * 0.4)) +
    (quant.portfolioMetrics.sharpeRatio - 0.35) * 16 -
    (quant.portfolioMetrics.concentrationHhi > 2800 ? 7 : 0);

  if (quant.predictionValuation) {
    baseScore += Math.min(14, Math.max(-18, quant.predictionValuation.edgePct * 0.9));
  }
  if (quant.realAssetValuation) {
    baseScore += quant.realAssetValuation.dscr >= 1.25 ? 8 : -8;
  }
  if (quant.ventureValuation) {
    baseScore += quant.ventureValuation.meanMoic >= 3.0 ? 7 : -6;
  }

  const convictionScore = Math.max(38, Math.min(93, Math.round(baseScore)));
  const isEventMode =
    routingPlan.analysisMode === "prediction" ||
    routingPlan.analysisMode === "any_outcome";
  const rating: CioInvestmentMemo["rating"] =
    convictionScore >= 80
      ? isEventMode
        ? "STRONG BET"
        : "STRONG BUY"
      : convictionScore >= 67
      ? "BUY"
      : convictionScore >= 53
      ? "HOLD"
      : isEventMode
      ? "PASS"
      : "TRIM";

  const accessChecklist: AccessChecklistItem[] = vehicles.slice(0, 3).map((v, idx) => ({
    step: `${idx + 1}. Deploy up to ${v.recommendedKellyPct}% via ${v.name}`,
    venue: v.venue,
    accountNote: `${v.jurisdictionAccess} · Est. fee/vig ${v.estimatedFeeOrVigPct}%`,
    invalidationTrigger: v.keyRisk,
  }));

  const cioMemo: CioInvestmentMemo = {
    headline: `${request.title}: ${rating} (${convictionScore}/100 Conviction)`,
    rating,
    convictionScore,
    executiveSummary: `The ${routingPlan.activatedSpecialists.length}-agent Universal Workforce assigns a ${rating} verdict (${convictionScore}/100 conviction) for a ${routingPlan.jurisdiction} mandate. Expected portfolio CAGR is ${quant.portfolioMetrics.expectedAnnualReturnPct}% (Sharpe ${quant.portfolioMetrics.sharpeRatio}), balanced against ${worstShock.portfolioImpactPct}% drawdown risk under "${worstShock.name}".`,
    valuationVerdict: quant.predictionValuation
      ? `Prediction Contract (${quant.predictionValuation.side} @ ${quant.predictionValuation.rawMarketPriceCents}¢) offers ${quant.predictionValuation.edgePct >= 0 ? "+" : ""}${quant.predictionValuation.edgePct}% edge (${quant.predictionValuation.expectedRoiPct}% EV ROI, Risk-Adjusted Kelly ${quant.predictionValuation.riskAdjustedKellyPct}%). Equity anchor ${quant.dcfResult.ticker} DCF fair value is $${quant.dcfResult.impliedSharePrice} (${quant.dcfResult.upsidePct >= 0 ? "+" : ""}${quant.dcfResult.upsidePct}%).`
      : quant.optionsValuation
      ? `${quant.optionsValuation.underlying} ${quant.optionsValuation.strategy.replace(/_/g, " ")} risks ${formatCurrency(quant.optionsValuation.totalCapitalAtRisk)} with ${quant.optionsValuation.probabilityOfProfitPct}% PoP and Δ=${quant.optionsValuation.greeks.delta}.`
      : quant.realAssetValuation
      ? `Real Asset Pro Forma yields ${quant.realAssetValuation.goingInCapRatePct}% Cap Rate, ${quant.realAssetValuation.dscr}x DSCR, and ${quant.realAssetValuation.leveredIrrPct}% Levered IRR (${quant.realAssetValuation.equityMultiple}x EM).`
      : quant.ventureValuation
      ? `Venture SAFE models ${quant.ventureValuation.meanMoic}x Mean MOIC (${quant.ventureValuation.expectedIrrPct}% IRR) vs. ${quant.ventureValuation.medianMoic}x Median MOIC; requires ${formatCurrency(quant.ventureValuation.breakevenExitValuation)} exit to break even.`
      : `${quant.dcfResult.ticker} trades at $${quant.dcfResult.currentPrice} vs. 5-year DCF fair value of $${quant.dcfResult.impliedSharePrice} (${quant.dcfResult.upsidePct >= 0 ? "+" : ""}${quant.dcfResult.upsidePct}%).`,
    recommendedExpressionSummary: `Optimal Expression Stack (${routingPlan.jurisdiction}): Anchor core capital in ${vehicles[vehicles.length - 1]?.name ?? "liquid equities"}, and express asymmetric convexity via ${topVehicle?.name ?? "options/event contracts"} sized strictly at <= ${topVehicle?.recommendedKellyPct ?? 8}% Risk-Adjusted Kelly.`,
    bullThesisHighlights: [
      `Projected ${request.horizonYears}Y median wealth: ${formatCurrency(quant.monteCarlo.medianEndingValue)} (${quant.monteCarlo.probabilityOfDoublingPct}% odds of 2x contributed capital).`,
      `Direct upside leverage to "${bestShock.name}" (${bestShock.portfolioImpactPct >= 0 ? "+" : ""}${bestShock.portfolioImpactPct}%).`,
      `${vehicles.length} distinct cross-venue access vehicles mapped and scored for capital efficiency & convexity.`,
    ],
    bearRiskFlags: [
      `Worst 6-regime stress shock: "${worstShock.name}" (${worstShock.portfolioImpactPct}% / ${formatCurrency(worstShock.dollarImpact)}).`,
      `${quant.portfolioMetrics.concentrationLabel} concentration (HHI ${quant.portfolioMetrics.concentrationHhi}) with -${quant.portfolioMetrics.estimatedMaxDrawdownPct}% est. tail drawdown.`,
      topVehicle?.keyRisk ?? "Monitor liquidity and execution slippage across venues.",
    ],
    catalysts: [
      `Upcoming macro/policy decision dates and resolution milestones for "${routingPlan.outcomeQuestion}".`,
      `Quarterly FCF, capex guidance, and implied volatility shifts on ${quant.dcfResult.ticker}.`,
      `Real-yield trajectory and credit spreads across ${routingPlan.jurisdiction} & US markets.`,
    ],
    rebalancePlan: request.holdings.map((h) => {
      const isOverweight = h.weightPct > 28;
      const isBond = h.sector === "Fixed Income";
      const isEvent = h.sector === "Event Contract";
      const action: CioInvestmentMemo["rebalancePlan"][number]["action"] = isEvent
        ? "BET"
        : isOverweight
        ? "TRIM"
        : isBond && quant.portfolioMetrics.annualVolatilityPct > 22
        ? "ADD"
        : h.beta > 1.35
        ? "HEDGE"
        : "HOLD";
      const targetWeightPct = isEvent
        ? Math.min(15, quant.predictionValuation?.riskAdjustedKellyPct ?? h.weightPct)
        : isOverweight
        ? Math.max(20, h.weightPct - 6)
        : isBond && quant.portfolioMetrics.annualVolatilityPct > 22
        ? Math.min(25, h.weightPct + 5)
        : h.weightPct;
      return {
        ticker: h.ticker,
        action,
        targetWeightPct: Math.round(targetWeightPct * 10) / 10,
        rationale:
          action === "BET"
            ? `Cap binary event bet at Risk-Adjusted Half-Kelly to protect bankroll from oracle/resolution tail risk.`
            : action === "TRIM"
            ? `Reduce single-position concentration below 25% to lower HHI and tail drawdown.`
            : action === "ADD"
            ? `Strengthen defensive ballast against a ${worstShock.portfolioImpactPct}% macro shock.`
            : action === "HEDGE"
            ? `High beta (${h.beta}); pair with defined-risk put spreads or uncorrelated event hedges.`
            : `Maintain target allocation aligned with ${request.riskProfile} mandate.`,
      };
    }),
    accessChecklist,
    timeHorizonNote: `Calibrated for a ${request.horizonYears}-year ${request.riskProfile} ${routingPlan.jurisdiction} investor (${formatCurrency(request.monthlyContribution)}/mo). Add a free Google Gemini API key in Settings for live multi-agent Gemini reasoning & multimodal vision extraction.`,
  };

  const cioTurn: AgentDebateTurn = {
    id: "turn-cio",
    role: "cio",
    agentName: "Agent 5 · Chief Investment Officer (CIO)",
    title: `Final Committee Verdict: ${cioMemo.rating}`,
    timestamp: nowTime(),
    status: "complete",
    summary: cioMemo.executiveSummary,
    keyPoints: [
      `Conviction Score: ${cioMemo.convictionScore}/100 (${cioMemo.rating})`,
      cioMemo.recommendedExpressionSummary ?? cioMemo.valuationVerdict,
      `Generated ${accessChecklist.length}-step Venue Access & Execution Checklist for ${routingPlan.jurisdiction}.`,
    ],
    toolCalls: [],
    confidencePct: cioMemo.convictionScore,
  };
  turns.push(cioTurn);
  emit({ type: "agent_turn", turn: cioTurn });
  emit({ type: "cio_memo", memo: cioMemo });

  const completeResult: CompleteAnalysisResult = {
    id: `memo-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode: "demo-simulation",
    modelUsed,
    title: request.title,
    request,
    routingPlan,
    expressionVehicles: vehicles,
    portfolioMetrics: quant.portfolioMetrics,
    dcfResult: quant.dcfResult,
    monteCarlo: quant.monteCarlo,
    macroShocks: quant.macroShocks,
    universalQuant: quant,
    debateTurns: turns,
    cioMemo,
  };

  emit({ type: "complete", result: completeResult });
  return completeResult;
}

/**
 * Main Entrypoint: Runs the Universal Multi-Agent Investment & Future-Outcome Workforce
 */
export async function runUniversalWorkforce(
  request: AnalysisRequestPayload,
  apiKey: string | undefined,
  emit: (event: StreamEvent) => void
): Promise<CompleteAnalysisResult> {
  const mode = resolveAnalysisMode(request);
  const quant = computeUniversalQuantBundle(request, mode);

  // Attempt read-only live prediction market discovery for relevant modes (non-blocking 3s timeout)
  let liveMarkets: LiveMarketQuote[] = [];
  let liveMarketsUsed = false;
  if (mode === "any_outcome" || mode === "prediction") {
    try {
      const searchRes = await searchPredictionMarkets(
        request.predictionInputs?.question || request.title
      );
      liveMarkets = searchRes.markets;
      liveMarketsUsed = searchRes.liveCount > 0;
    } catch {
      liveMarkets = [];
    }
  }

  const routingPlan = buildRoutingPlan(request, mode, liveMarketsUsed);
  const vehicles = buildExpressionVehicles(request, quant, liveMarkets);

  const effectiveKey = apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!effectiveKey || request.forceDemoMode) {
    return runUniversalDemoTrace(request, routingPlan, quant, vehicles, emit);
  }

  const ai = new GoogleGenAI({ apiKey: effectiveKey });
  const model = DEFAULT_MODEL;

  emit({
    type: "status",
    message: `Connected to Google Gemini (${model}). Routing ${routingPlan.activatedSpecialists.length}-Agent Universal Workforce...`,
    mode: "live-gemini",
    model,
  });

  emit({ type: "routing_plan", plan: routingPlan });
  emit({
    type: "quant_ready",
    portfolioMetrics: quant.portfolioMetrics,
    dcfResult: quant.dcfResult,
    monteCarlo: quant.monteCarlo,
    macroShocks: quant.macroShocks,
  });
  emit({ type: "universal_quant_ready", quant });
  emit({ type: "access_vehicles", vehicles });

  const holdingsSummary = request.holdings
    .map(
      (h) =>
        `- ${h.ticker} (${h.name}): ${h.weightPct}% weight, Sector=${h.sector}, Price=$${h.currentPrice}, Beta=${h.beta}, ExpReturn=${h.expectedAnnualReturnPct}%, Vol=${h.annualVolatilityPct}%`
    )
    .join("\n");

  const vehiclesSummary = vehicles
    .map(
      (v) =>
        `- ${v.name} (${v.venue}, ${v.jurisdictionAccess}): ${v.instrumentSummary} | Return/Prob: ${v.impliedProbabilityOrReturn} | Convexity ${v.convexityScore}, Liquidity ${v.liquidityScore}, Fee/Vig ${v.estimatedFeeOrVigPct}%, Kelly ${v.recommendedKellyPct}%`
    )
    .join("\n");

  const debateTurns: AgentDebateTurn[] = [];

  // ── STAGE 1: Agent 0 · Intake Router & Multimodal Extractor ──
  const routerParts: Array<Record<string, unknown>> = [
    {
      text: `You are Agent 0 (Intake Router & Multimodal Extractor) of a Universal Investment & Future-Outcome Valuation Workforce.
Analyze the user's thesis, jurisdiction (${routingPlan.jurisdiction}), mode (${mode}), holdings, and any attached image/PDF.
Write a crisp 2-sentence routing brief followed by 3 bullet points of key extracted assumptions and outcome catalysts.

Title: ${request.title}
Thesis: ${request.thesisPrompt}
Capital: $${request.capital} | Monthly Add: $${request.monthlyContribution} | Horizon: ${request.horizonYears}y | Risk: ${request.riskProfile}
Holdings:
${holdingsSummary}`,
    },
  ];
  if (request.attachmentBase64 && request.attachmentMimeType) {
    routerParts.push({
      inlineData: {
        mimeType: request.attachmentMimeType,
        data: request.attachmentBase64,
      },
    });
  }

  const routerResp = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: routerParts }],
    config: { temperature: 0.25 },
  });
  const routerText = routerResp.text?.trim() || "Thesis decomposed and routed.";
  const routerTurn: AgentDebateTurn = {
    id: "turn-router",
    role: "router",
    agentName: "Agent 0 · Intake Router & Multimodal Extractor",
    title: request.attachmentName
      ? `Multimodal Extraction: ${request.attachmentName}`
      : `Routed ${routingPlan.activatedSpecialists.length} Specialists (${routingPlan.jurisdiction})`,
    timestamp: nowTime(),
    status: "complete",
    summary: routerText.split("\n")[0] || routerText.slice(0, 260),
    keyPoints: extractBullets(routerText),
    toolCalls: [],
    confidencePct: 94,
  };
  debateTurns.push(routerTurn);
  emit({ type: "agent_turn", turn: routerTurn });

  // ── STAGE 2: Parallel Specialist Fan-Out (Promise.all) ──
  const stage2Tasks: Array<Promise<{ turn: AgentDebateTurn; rawText: string }>> = [];

  // 2A. Market Access & Expression Scout
  stage2Tasks.push(
    (async () => {
      const scoutResp = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are Agent 1 (Market Access & Expression Scout) for a ${routingPlan.jurisdiction} investor.
Compare the following concrete ways to access/bet on "${request.title}" and identify which vehicle gives the highest capital efficiency and cleanest access for ${routingPlan.jurisdiction} residents.
Write a sharp 2-sentence recommendation followed by 3 concise bullets comparing fees/vig, liquidity, and jurisdiction eligibility.

Candidate Vehicles:
${vehiclesSummary}`,
              },
            ],
          },
        ],
        config: { temperature: 0.3 },
      });
      const text = scoutResp.text?.trim() || "Cross-venue access pathways ranked.";
      return {
        rawText: text,
        turn: {
          id: "turn-access-scout",
          role: "access_scout",
          agentName: "Agent 1 · Market Access & Expression Scout",
          title: `Cross-Venue Access & Expression Ranking (${routingPlan.jurisdiction})`,
          timestamp: nowTime(),
          status: "complete",
          parallelGroup: "Stage 2 · Parallel Specialists",
          summary: text.split("\n")[0] || text.slice(0, 260),
          keyPoints: extractBullets(text),
          toolCalls: [],
          confidencePct: 90,
        },
      };
    })()
  );

  // 2B. Superforecaster (when prediction/any_outcome)
  if (quant.predictionValuation) {
    stage2Tasks.push(
      (async () => {
        const res = await runGeminiAgentWithTools({
          ai,
          model,
          systemInstruction:
            "You are a Superforecaster & Prediction Market Analyst. You MUST call evaluate_prediction_bet first to ground your numbers. Write 2 sharp sentences on base-rate calibration & edge, followed by 3 concise bullets citing exact EV, overround, and Risk-Adjusted Kelly numbers.",
          userPrompt: `Evaluate the prediction/outcome bet for "${request.title}".
Thesis: ${request.thesisPrompt}
Router Brief: ${routerText}`,
          allowedToolNames: ["evaluate_prediction_bet"],
          request,
          quant,
        });
        return {
          rawText: res.text,
          turn: {
            id: "turn-superforecaster",
            role: "superforecaster",
            agentName: "Specialist · Superforecaster & Probability Analyst",
            title: "Bayesian Calibration, EV & Fractional Kelly Audit",
            timestamp: nowTime(),
            status: "complete",
            parallelGroup: "Stage 2 · Parallel Specialists",
            summary: res.text.split("\n")[0] || res.text.slice(0, 260),
            keyPoints: extractBullets(res.text),
            toolCalls: res.toolCalls,
            confidencePct: 84,
          },
        };
      })()
    );
  }

  // 2C. Derivatives & Convexity Structurer (when options/any_outcome)
  if (quant.optionsValuation) {
    stage2Tasks.push(
      (async () => {
        const res = await runGeminiAgentWithTools({
          ai,
          model,
          systemInstruction:
            "You are a Derivatives & Convexity Structurer. You MUST call price_option_strategy first. Write 2 sharp sentences evaluating asymmetric payoff & Greeks, followed by 3 bullets citing exact debit, breakeven, Delta, Theta, and Probability of Profit.",
          userPrompt: `Price and critique the options convexity expression for "${request.title}".
Thesis: ${request.thesisPrompt}`,
          allowedToolNames: ["price_option_strategy"],
          request,
          quant,
        });
        return {
          rawText: res.text,
          turn: {
            id: "turn-derivatives",
            role: "derivatives_quant",
            agentName: "Specialist · Derivatives & Convexity Structurer",
            title: "Black-Scholes Greeks & Convex Payoff Engineering",
            timestamp: nowTime(),
            status: "complete",
            parallelGroup: "Stage 2 · Parallel Specialists",
            summary: res.text.split("\n")[0] || res.text.slice(0, 260),
            keyPoints: extractBullets(res.text),
            toolCalls: res.toolCalls,
            confidencePct: 85,
          },
        };
      })()
    );
  }

  // 2D. Real Assets / Credit / Venture Specialist
  if (quant.realAssetValuation || quant.ventureValuation) {
    const isVenture = Boolean(quant.ventureValuation);
    stage2Tasks.push(
      (async () => {
        const res = await runGeminiAgentWithTools({
          ai,
          model,
          systemInstruction: isVenture
            ? "You are a Venture Power-Law & Private Deals Analyst. You MUST call simulate_venture_powerlaw first. Write 2 sharp sentences on power-law skewness & dilution, followed by 3 bullets citing exact Mean vs Median MOIC, IRR, and breakeven exit valuation."
            : "You are a Real Assets & Credit Duration Analyst. You MUST call analyze_real_estate_deal and analyze_bond_duration first. Write 2 sharp sentences on cash-flow durability & levered IRR vs bond yields, followed by 3 bullets citing exact Cap Rate, DSCR, IRR, and Bond Duration.",
          userPrompt: `Underwrite the deal for "${request.title}".
Thesis: ${request.thesisPrompt}`,
          allowedToolNames: isVenture
            ? ["simulate_venture_powerlaw"]
            : ["analyze_real_estate_deal", "analyze_bond_duration"],
          request,
          quant,
        });
        return {
          rawText: res.text,
          turn: {
            id: "turn-real-assets",
            role: "real_assets_quant",
            agentName: isVenture
              ? "Specialist · Venture Power-Law & Private Deals Analyst"
              : "Specialist · Real Assets & Credit Duration Analyst",
            title: isVenture
              ? "Power-Law Dilution Waterfall & Exit Skew Audit"
              : "NOI, DSCR, Levered IRR & Bond Duration Audit",
            timestamp: nowTime(),
            status: "complete",
            parallelGroup: "Stage 2 · Parallel Specialists",
            summary: res.text.split("\n")[0] || res.text.slice(0, 260),
            keyPoints: extractBullets(res.text),
            toolCalls: res.toolCalls,
            confidencePct: 85,
          },
        };
      })()
    );
  }

  const stage2Results = await Promise.all(stage2Tasks);
  for (const item of stage2Results) {
    debateTurns.push(item.turn);
    emit({ type: "agent_turn", turn: item.turn });
  }
  const specialistDigest = stage2Results
    .map((r) => `[${r.turn.agentName}]: ${r.rawText}`)
    .join("\n\n");

  // ── STAGE 3: Bull & Bear Adversarial Debate ──
  const bullRes = await runGeminiAgentWithTools({
    ai,
    model,
    systemInstruction:
      "You are Agent 3 (Bull Strategist & Asymmetric Edge Hunter). You MUST call run_dcf_valuation and run_monte_carlo_simulation first to ground your bull case. Write 2 sharp sentences on compounding & asymmetric edge, followed by 3 concise bullets citing exact tool numbers.",
    userPrompt: `Build the Bull Case for "${request.title}".
Thesis: ${request.thesisPrompt}
Specialist Findings:
${specialistDigest}`,
    allowedToolNames: ["run_dcf_valuation", "run_monte_carlo_simulation"],
    request,
    quant,
  });
  const bullTurn: AgentDebateTurn = {
    id: "turn-bull",
    role: "bull",
    agentName: "Agent 3 · Bull Strategist & Asymmetric Edge Hunter",
    title: "Compounding, DCF Upside & Asymmetric Expression Case",
    timestamp: nowTime(),
    status: "complete",
    summary: bullRes.text.split("\n")[0] || bullRes.text.slice(0, 260),
    keyPoints: extractBullets(bullRes.text),
    toolCalls: bullRes.toolCalls,
    confidencePct: 82,
  };
  debateTurns.push(bullTurn);
  emit({ type: "agent_turn", turn: bullTurn });

  const bearRes = await runGeminiAgentWithTools({
    ai,
    model,
    systemInstruction:
      "You are Agent 4 (Bear Auditor & Microstructure Skeptic). You MUST call analyze_portfolio_metrics and stress_test_cross_asset_shocks first. Challenge the Bull Case across valuation, macro tail-risk, oracle/resolution risk, vig/theta decay, and illiquidity. Write 2 sharp sentences followed by 3 concise bullets citing exact numbers.",
    userPrompt: `Audit and stress-test "${request.title}".
Bull Case: ${bullRes.text}
Specialist Findings: ${specialistDigest}
Jurisdiction: ${routingPlan.jurisdiction} | Risk Profile: ${request.riskProfile}`,
    allowedToolNames: ["analyze_portfolio_metrics", "stress_test_cross_asset_shocks"],
    request,
    quant,
  });
  const bearTurn: AgentDebateTurn = {
    id: "turn-bear",
    role: "bear",
    agentName: "Agent 4 · Bear Auditor & Microstructure Skeptic",
    title: "Cross-Asset Tail-Risk, Microstructure & Drawdown Audit",
    timestamp: nowTime(),
    status: "complete",
    summary: bearRes.text.split("\n")[0] || bearRes.text.slice(0, 260),
    keyPoints: extractBullets(bearRes.text),
    toolCalls: bearRes.toolCalls,
    confidencePct: 80,
  };
  debateTurns.push(bearTurn);
  emit({ type: "agent_turn", turn: bearTurn });

  // ── STAGE 4: Agent 5 · Chief Investment Officer (Structured JSON) ──
  const cioResp = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are Agent 5 (Chief Investment Officer). Synthesize all specialist outputs, expression vehicles, Bull/Bear debate, and deterministic quant numbers into a final Investment Committee Memo for a ${routingPlan.jurisdiction} investor.

Title: ${request.title}
Holdings:
${holdingsSummary}

Candidate Expression Vehicles:
${vehiclesSummary}

Deterministic Quant Summary:
- Portfolio: ExpReturn ${quant.portfolioMetrics.expectedAnnualReturnPct}%, Vol ${quant.portfolioMetrics.annualVolatilityPct}%, Sharpe ${quant.portfolioMetrics.sharpeRatio}, Beta ${quant.portfolioMetrics.weightedBeta}, HHI ${quant.portfolioMetrics.concentrationHhi}
- DCF (${quant.dcfResult.ticker}): Implied $${quant.dcfResult.impliedSharePrice} vs $${quant.dcfResult.currentPrice} (${quant.dcfResult.upsidePct}%)
- Monte Carlo (${quant.monteCarlo.horizonYears}Y): Median $${quant.monteCarlo.medianEndingValue}, P10 $${quant.monteCarlo.downsideP10Value}, P90 $${quant.monteCarlo.upsideP90Value}
- 6-Regime Macro Shocks: ${quant.macroShocks.map((s) => `${s.name}: ${s.portfolioImpactPct}%`).join(" | ")}
${quant.predictionValuation ? `- Prediction Bet: ${quant.predictionValuation.side} @ ${quant.predictionValuation.rawMarketPriceCents}¢, Edge ${quant.predictionValuation.edgePct}%, EV ROI ${quant.predictionValuation.expectedRoiPct}%, Risk-Adj Kelly ${quant.predictionValuation.riskAdjustedKellyPct}%` : ""}
${quant.optionsValuation ? `- Options: ${quant.optionsValuation.underlying} ${quant.optionsValuation.strategy}, Debit $${quant.optionsValuation.netDebitPerShare}, PoP ${quant.optionsValuation.probabilityOfProfitPct}%, Δ=${quant.optionsValuation.greeks.delta}` : ""}
${quant.realAssetValuation ? `- Real Estate: Cap ${quant.realAssetValuation.goingInCapRatePct}%, DSCR ${quant.realAssetValuation.dscr}x, Levered IRR ${quant.realAssetValuation.leveredIrrPct}%` : ""}
${quant.ventureValuation ? `- Venture SAFE: Mean ${quant.ventureValuation.meanMoic}x vs Median ${quant.ventureValuation.medianMoic}x MOIC, IRR ${quant.ventureValuation.expectedIrrPct}%` : ""}

Specialist Digest:
${specialistDigest}

Bull Case: ${bullRes.text}
Bear Critique: ${bearRes.text}

Return strict JSON matching the schema. Include rebalancePlan for every holding and a 3-step accessChecklist tailored to ${routingPlan.jurisdiction}.`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.25,
      responseMimeType: "application/json",
      responseSchema: CIO_MEMO_SCHEMA,
    },
  });

  const parsedMemo = JSON.parse(cioResp.text || "{}") as CioInvestmentMemo;
  const cioTurn: AgentDebateTurn = {
    id: "turn-cio",
    role: "cio",
    agentName: "Agent 5 · Chief Investment Officer (CIO)",
    title: `Final Committee Verdict: ${parsedMemo.rating}`,
    timestamp: nowTime(),
    status: "complete",
    summary: parsedMemo.executiveSummary,
    keyPoints: [
      `Conviction Score: ${parsedMemo.convictionScore}/100 (${parsedMemo.rating})`,
      parsedMemo.recommendedExpressionSummary || parsedMemo.valuationVerdict,
      `Actionable Rebalance & Access Playbook generated across ${parsedMemo.rebalancePlan?.length ?? request.holdings.length} positions.`,
    ],
    toolCalls: [],
    confidencePct: parsedMemo.convictionScore,
  };
  debateTurns.push(cioTurn);
  emit({ type: "agent_turn", turn: cioTurn });
  emit({ type: "cio_memo", memo: parsedMemo });

  const completeResult: CompleteAnalysisResult = {
    id: `memo-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode: "live-gemini",
    modelUsed: model,
    title: request.title,
    request,
    routingPlan,
    expressionVehicles: vehicles,
    portfolioMetrics: quant.portfolioMetrics,
    dcfResult: quant.dcfResult,
    monteCarlo: quant.monteCarlo,
    macroShocks: quant.macroShocks,
    universalQuant: quant,
    debateTurns,
    cioMemo: parsedMemo,
  };

  emit({ type: "complete", result: completeResult });
  return completeResult;
}
