import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import {
  AgentDebateTurn,
  AnalysisRequestPayload,
  CioInvestmentMemo,
  CompleteAnalysisResult,
  DcfResult,
  MacroShockScenarioResult,
  MonteCarloResult,
  PortfolioMetrics,
  StreamEvent,
  ToolCallRecord,
} from "./types";
import {
  analyzePortfolioMetrics,
  runDcfValuation,
  runMonteCarloSimulation,
  stressTestMacroShocks,
} from "./quant-engine";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const QUANT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "run_dcf_valuation",
    description:
      "Runs a 5-year Discounted Cash Flow (DCF) intrinsic valuation model with WACC and terminal growth sensitivity analysis.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        waccAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional adjustment to WACC in percentage points (e.g. -0.5 for bull case, +1.0 for bear case).",
        },
        growthAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional adjustment to 5-year FCF growth rate in percentage points.",
        },
      },
    },
  },
  {
    name: "run_monte_carlo_simulation",
    description:
      "Runs an 800-path Geometric Brownian Motion Monte Carlo simulation to project P10/P50/P90 portfolio wealth and probability of doubling.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        horizonYears: {
          type: Type.NUMBER,
          description: "Investment horizon in years.",
        },
      },
    },
  },
  {
    name: "analyze_portfolio_metrics",
    description:
      "Computes portfolio weighted beta, expected return, annualized volatility, Sharpe ratio, max drawdown estimate, and HHI concentration index.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeSectorBreakdown: {
          type: Type.BOOLEAN,
          description: "Whether to include sector weight breakdown.",
        },
      },
    },
  },
  {
    name: "stress_test_macro_shock",
    description:
      "Stress-tests the portfolio across 4 macro regimes: +100bps Rate Shock, AI Capex Pause, Hard Landing Recession, and Critical Minerals Supercycle.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        focusRegime: {
          type: Type.STRING,
          description: "Optional focus macro regime id.",
        },
      },
    },
  },
];

const CIO_MEMO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    rating: {
      type: Type.STRING,
      enum: ["STRONG BUY", "BUY", "HOLD", "TRIM", "AVOID"],
    },
    convictionScore: { type: Type.INTEGER },
    executiveSummary: { type: Type.STRING },
    valuationVerdict: { type: Type.STRING },
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
          action: { type: Type.STRING, enum: ["ADD", "HOLD", "TRIM", "HEDGE"] },
          targetWeightPct: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
        },
        required: ["ticker", "action", "targetWeightPct", "rationale"],
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
 * Executes a deterministic quant tool requested by Gemini Function Calling
 */
function executeQuantTool(
  name: string,
  args: Record<string, unknown>,
  request: AnalysisRequestPayload,
  baseMetrics: PortfolioMetrics,
  baseDcf: DcfResult,
  baseMc: MonteCarloResult,
  baseShocks: MacroShockScenarioResult[]
): { payload: Record<string, unknown>; summary: string } {
  if (name === "run_dcf_valuation") {
    const waccAdj = typeof args.waccAdjustmentPct === "number" ? args.waccAdjustmentPct : 0;
    const growthAdj = typeof args.growthAdjustmentPct === "number" ? args.growthAdjustmentPct : 0;
    const res =
      waccAdj !== 0 || growthAdj !== 0
        ? runDcfValuation({
            ...request.dcfInputs,
            waccPct: Math.max(5, request.dcfInputs.waccPct + waccAdj),
            revenueGrowthYear1To5Pct: Math.max(
              -5,
              request.dcfInputs.revenueGrowthYear1To5Pct + growthAdj
            ),
          })
        : baseDcf;
    return {
      payload: {
        ticker: res.ticker,
        currentPrice: res.currentPrice,
        impliedSharePrice: res.impliedSharePrice,
        upsidePct: res.upsidePct,
        waccPct: res.waccPct,
        terminalGrowthPct: res.terminalGrowthPct,
        enterpriseValueBillions: res.enterpriseValueBillions,
      },
      summary: `${res.ticker} DCF Fair Value: $${res.impliedSharePrice} vs $${res.currentPrice} (${res.upsidePct >= 0 ? "+" : ""}${res.upsidePct}% upside @ ${res.waccPct}% WACC)`,
    };
  }

  if (name === "run_monte_carlo_simulation") {
    const horizon =
      typeof args.horizonYears === "number" ? args.horizonYears : request.horizonYears;
    const res =
      horizon !== request.horizonYears
        ? runMonteCarloSimulation({
            initialCapital: request.capital,
            monthlyContribution: request.monthlyContribution,
            horizonYears: horizon,
            expectedReturnPct: baseMetrics.expectedAnnualReturnPct,
            volatilityPct: baseMetrics.annualVolatilityPct,
          })
        : baseMc;
    return {
      payload: {
        horizonYears: res.horizonYears,
        medianEndingValue: res.medianEndingValue,
        downsideP10Value: res.downsideP10Value,
        upsideP90Value: res.upsideP90Value,
        probabilityOfDoublingPct: res.probabilityOfDoublingPct,
        probabilityOfLossPct: res.probabilityOfLossPct,
      },
      summary: `${res.horizonYears}Y Monte Carlo (${res.simulations} paths): Median ${formatCurrency(res.medianEndingValue)} | P10 ${formatCurrency(res.downsideP10Value)} | P90 ${formatCurrency(res.upsideP90Value)}`,
    };
  }

  if (name === "analyze_portfolio_metrics") {
    return {
      payload: { ...baseMetrics },
      summary: `Beta ${baseMetrics.weightedBeta} | Exp Return ${baseMetrics.expectedAnnualReturnPct}% | Vol ${baseMetrics.annualVolatilityPct}% | Sharpe ${baseMetrics.sharpeRatio} | HHI ${baseMetrics.concentrationHhi} (${baseMetrics.concentrationLabel})`,
    };
  }

  if (name === "stress_test_macro_shock") {
    const worst = [...baseShocks].sort((a, b) => a.portfolioImpactPct - b.portfolioImpactPct)[0];
    const best = [...baseShocks].sort((a, b) => b.portfolioImpactPct - a.portfolioImpactPct)[0];
    return {
      payload: { scenarios: baseShocks },
      summary: `Worst shock: ${worst.name} (${worst.portfolioImpactPct}%, ${formatCurrency(worst.dollarImpact)}) | Tailwind: ${best.name} (${best.portfolioImpactPct >= 0 ? "+" : ""}${best.portfolioImpactPct}%)`,
    };
  }

  return {
    payload: { error: `Unknown tool: ${name}` },
    summary: `Unknown tool ${name}`,
  };
}

/**
 * Runs a single Gemini agent with real multi-turn Function Calling support
 */
async function runGeminiAgentWithTools(params: {
  ai: GoogleGenAI;
  model: string;
  systemInstruction: string;
  userPrompt: string;
  allowedToolNames: string[];
  request: AnalysisRequestPayload;
  baseMetrics: PortfolioMetrics;
  baseDcf: DcfResult;
  baseMc: MonteCarloResult;
  baseShocks: MacroShockScenarioResult[];
}): Promise<{ text: string; toolCalls: ToolCallRecord[] }> {
  const { ai, model, systemInstruction, userPrompt, allowedToolNames } = params;
  const declarations = QUANT_TOOL_DECLARATIONS.filter((d) =>
    allowedToolNames.includes(d.name ?? "")
  );

  const toolCalls: ToolCallRecord[] = [];
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: "user", parts: [{ text: userPrompt }] },
  ];

  // Up to 2 tool-call rounds so Gemini always grounds its numbers in our deterministic quant engine
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
        const exec = executeQuantTool(
          toolName,
          args,
          params.request,
          params.baseMetrics,
          params.baseDcf,
          params.baseMc,
          params.baseShocks
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

  // Final synthesis pass if loop hit round limit
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
 * Deterministic high-craft simulation fallback (when no GEMINI_API_KEY is supplied yet)
 * Still executes 100% real quant math from quant-engine.ts!
 */
async function runDemoSimulation(
  request: AnalysisRequestPayload,
  metrics: PortfolioMetrics,
  dcf: DcfResult,
  mc: MonteCarloResult,
  shocks: MacroShockScenarioResult[],
  emit: (event: StreamEvent) => void
): Promise<CompleteAnalysisResult> {
  const modelUsed = "gemini-2.5-flash (Interactive Demo Trace)";
  emit({
    type: "status",
    message: "Running Quantitative Engine & Demo Investment Committee...",
    mode: "demo-simulation",
    model: modelUsed,
  });

  emit({
    type: "quant_ready",
    portfolioMetrics: metrics,
    dcfResult: dcf,
    monteCarlo: mc,
    macroShocks: shocks,
  });

  const topHolding = [...request.holdings].sort((a, b) => b.weightPct - a.weightPct)[0];
  const worstShock = [...shocks].sort((a, b) => a.portfolioImpactPct - b.portfolioImpactPct)[0];
  const bestShock = [...shocks].sort((a, b) => b.portfolioImpactPct - a.portfolioImpactPct)[0];

  await sleep(320);
  const extractorTurn: AgentDebateTurn = {
    id: "turn-extractor",
    role: "extractor",
    agentName: "Agent 1 · Filing & Multimodal Extractor",
    title: request.attachmentName
      ? `Parsed ${request.attachmentName} & Portfolio Structure`
      : "Parsed Thesis & Portfolio Exposure",
    timestamp: nowTime(),
    status: "complete",
    summary: `Mapped ${request.holdings.length} positions totaling ${formatCurrency(request.capital)} (${request.riskProfile} mandate, ${request.horizonYears}-year horizon). Largest exposure is ${topHolding?.ticker ?? "N/A"} at ${topHolding?.weightPct ?? 0}%, with top sector ${metrics.sectorBreakdown[0]?.sector ?? "Mixed"} (${metrics.sectorBreakdown[0]?.weightPct ?? 0}%).`,
    keyPoints: [
      `Portfolio weighted beta is ${metrics.weightedBeta} with ${metrics.weightedDividendYieldPct}% annual dividend yield.`,
      `Primary DCF anchor ticker is ${dcf.ticker} currently trading at $${dcf.currentPrice}.`,
      request.attachmentName
        ? `Multimodal attachment "${request.attachmentName}" queued for financial signal extraction.`
        : `No document attached — extracted structured thesis parameters directly from prompt & holdings.`,
    ],
    toolCalls: [
      {
        id: "tc-extract-1",
        toolName: "analyze_portfolio_metrics",
        args: { includeSectorBreakdown: true },
        resultSummary: `Beta ${metrics.weightedBeta} | Exp Return ${metrics.expectedAnnualReturnPct}% | Sharpe ${metrics.sharpeRatio} | HHI ${metrics.concentrationHhi}`,
        durationMs: 11,
      },
    ],
    confidencePct: 94,
  };
  emit({ type: "agent_turn", turn: extractorTurn });

  await sleep(420);
  const bullTurn: AgentDebateTurn = {
    id: "turn-bull",
    role: "bull",
    agentName: "Agent 2 · Bull Thesis Strategist",
    title: "Compounding & Valuation Upside Case",
    timestamp: nowTime(),
    status: "complete",
    summary: `Monte Carlo modeling across ${mc.simulations} paths projects a ${request.horizonYears}-year median wealth of ${formatCurrency(mc.medianEndingValue)} (P90 upside: ${formatCurrency(mc.upsideP90Value)}) with a ${mc.probabilityOfDoublingPct}% probability of doubling total contributed capital.`,
    keyPoints: [
      `${dcf.ticker} 5-year DCF implies $${dcf.impliedSharePrice}/share (${dcf.upsidePct >= 0 ? "+" : ""}${dcf.upsidePct}% vs. $${dcf.currentPrice} market price) at ${dcf.waccPct}% WACC.`,
      `Risk-adjusted return efficiency is solid with a Sharpe ratio of ${metrics.sharpeRatio} and ${metrics.expectedAnnualReturnPct}% expected CAGR.`,
      `Under the "${bestShock.name}" regime, the portfolio gains ${bestShock.portfolioImpactPct >= 0 ? "+" : ""}${bestShock.portfolioImpactPct}% (${formatCurrency(bestShock.dollarImpact)}), led by ${bestShock.bestHedgeHolding}.`,
    ],
    toolCalls: [
      {
        id: "tc-bull-1",
        toolName: "run_dcf_valuation",
        args: { waccAdjustmentPct: 0, growthAdjustmentPct: 0 },
        resultSummary: `${dcf.ticker} DCF Fair Value: $${dcf.impliedSharePrice} vs $${dcf.currentPrice} (${dcf.upsidePct >= 0 ? "+" : ""}${dcf.upsidePct}%)`,
        durationMs: 8,
      },
      {
        id: "tc-bull-2",
        toolName: "run_monte_carlo_simulation",
        args: { horizonYears: request.horizonYears },
        resultSummary: `Median ${formatCurrency(mc.medianEndingValue)} | P10 ${formatCurrency(mc.downsideP10Value)} | P90 ${formatCurrency(mc.upsideP90Value)}`,
        durationMs: 19,
      },
    ],
    confidencePct: dcf.upsidePct > 5 ? 84 : 68,
  };
  emit({ type: "agent_turn", turn: bullTurn });

  await sleep(450);
  const bearTurn: AgentDebateTurn = {
    id: "turn-bear",
    role: "bear",
    agentName: "Agent 3 · Bear & Risk Auditor",
    title: "Drawdown, Concentration & Macro Tail-Risk Audit",
    timestamp: nowTime(),
    status: "complete",
    summary: `Stress-testing reveals meaningful vulnerability to "${worstShock.name}" with a projected ${worstShock.portfolioImpactPct}% drawdown (${formatCurrency(worstShock.dollarImpact)}). Annualized volatility sits at ${metrics.annualVolatilityPct}% with an estimated 99% max drawdown of -${metrics.estimatedMaxDrawdownPct}%.`,
    keyPoints: [
      `Concentration HHI is ${metrics.concentrationHhi} (${metrics.concentrationLabel}); top sector (${metrics.sectorBreakdown[0]?.sector}) represents ${metrics.sectorBreakdown[0]?.weightPct}% of capital.`,
      `Worst single-name shock contributor is ${worstShock.worstHitHolding}; P10 downside wealth over ${request.horizonYears} years falls to ${formatCurrency(mc.downsideP10Value)}.`,
      `Recommended institutional hedge: ${worstShock.recommendedHedge}`,
    ],
    toolCalls: [
      {
        id: "tc-bear-1",
        toolName: "stress_test_macro_shock",
        args: { focusRegime: worstShock.id },
        resultSummary: `Worst shock: ${worstShock.name} (${worstShock.portfolioImpactPct}%, ${formatCurrency(worstShock.dollarImpact)})`,
        durationMs: 9,
      },
    ],
    confidencePct: 81,
  };
  emit({ type: "agent_turn", turn: bearTurn });

  await sleep(420);
  const convictionScore = Math.max(
    42,
    Math.min(
      91,
      Math.round(
        62 +
          (dcf.upsidePct > 0 ? Math.min(15, dcf.upsidePct * 0.5) : Math.max(-15, dcf.upsidePct * 0.5)) +
          (metrics.sharpeRatio - 0.35) * 18 -
          (metrics.concentrationHhi > 2800 ? 8 : 0)
      )
    )
  );
  const rating: CioInvestmentMemo["rating"] =
    convictionScore >= 80
      ? "STRONG BUY"
      : convictionScore >= 68
      ? "BUY"
      : convictionScore >= 54
      ? "HOLD"
      : "TRIM";

  const cioMemo: CioInvestmentMemo = {
    headline: `${request.title}: ${rating} (${convictionScore}/100 Conviction)`,
    rating,
    convictionScore,
    executiveSummary: `The Investment Committee assigns a ${rating} rating with ${convictionScore}/100 conviction. Quantitative modeling confirms attractive ${metrics.expectedAnnualReturnPct}% expected annual compounding (Sharpe ${metrics.sharpeRatio}, ${request.horizonYears}Y median ${formatCurrency(mc.medianEndingValue)}), balanced against a ${worstShock.portfolioImpactPct}% tail risk under "${worstShock.name}".`,
    valuationVerdict: `${dcf.ticker} trades at $${dcf.currentPrice} vs. a 5-year DCF fair value of $${dcf.impliedSharePrice} (${dcf.upsidePct >= 0 ? "+" : ""}${dcf.upsidePct}% margin of safety at ${dcf.waccPct}% WACC and ${dcf.terminalGrowthPct}% terminal growth).`,
    bullThesisHighlights: [
      `Strong ${request.horizonYears}-year wealth compounding: ${formatCurrency(mc.medianEndingValue)} median outcome with ${mc.probabilityOfDoublingPct}% odds of 2x contributed capital.`,
      `Direct upside leverage to "${bestShock.name}" (${bestShock.portfolioImpactPct >= 0 ? "+" : ""}${bestShock.portfolioImpactPct}%).`,
      `Portfolio generates ${metrics.weightedDividendYieldPct}% blended dividend yield while maintaining growth exposure.`,
    ],
    bearRiskFlags: [
      `Severe drawdown exposure (${worstShock.portfolioImpactPct}% / ${formatCurrency(worstShock.dollarImpact)}) during "${worstShock.name}".`,
      `${metrics.concentrationLabel} portfolio concentration (HHI ${metrics.concentrationHhi}) with ${metrics.sectorBreakdown[0]?.sector} at ${metrics.sectorBreakdown[0]?.weightPct}%.`,
      `Estimated worst-year drawdown of -${metrics.estimatedMaxDrawdownPct}% requires discipline during volatility spikes.`,
    ],
    catalysts: [
      `Upcoming quarterly free cash flow & capex guidance for ${dcf.ticker} and core holdings.`,
      `Central bank rate path and real-yield direction affecting growth vs. commodity multiples.`,
      `Electrification, AI infrastructure spend, and supply-demand tightness across core sectors.`,
    ],
    rebalancePlan: request.holdings.map((h) => {
      const isOverweight = h.weightPct > 28;
      const isBond = h.sector === "Fixed Income";
      const action: "ADD" | "HOLD" | "TRIM" | "HEDGE" = isOverweight
        ? "TRIM"
        : isBond && metrics.annualVolatilityPct > 22
        ? "ADD"
        : h.beta > 1.35
        ? "HEDGE"
        : "HOLD";
      const targetWeightPct = isOverweight
        ? Math.max(20, h.weightPct - 6)
        : isBond && metrics.annualVolatilityPct > 22
        ? Math.min(25, h.weightPct + 5)
        : h.weightPct;
      return {
        ticker: h.ticker,
        action,
        targetWeightPct,
        rationale:
          action === "TRIM"
            ? `Cap single-name concentration below 25% to lower HHI and drawdown risk.`
            : action === "ADD"
            ? `Build dry powder & ballast to cushion a ${worstShock.portfolioImpactPct}% macro shock.`
            : action === "HEDGE"
            ? `High beta (${h.beta}); keep core upside while pairing with defensive ballast.`
            : `Maintain target allocation; risk/reward aligns with ${request.riskProfile} mandate.`,
      };
    }),
    timeHorizonNote: `Calibrated for a ${request.horizonYears}-year ${request.riskProfile} investor contributing ${formatCurrency(request.monthlyContribution)}/month. Connect a free Google Gemini API key in Settings to run live multi-agent Gemini reasoning & multimodal chart/PDF parsing.`,
  };

  const cioTurn: AgentDebateTurn = {
    id: "turn-cio",
    role: "cio",
    agentName: "Agent 4 · Chief Investment Officer (CIO)",
    title: `Final Committee Verdict: ${cioMemo.rating}`,
    timestamp: nowTime(),
    status: "complete",
    summary: cioMemo.executiveSummary,
    keyPoints: [
      `Conviction Score: ${cioMemo.convictionScore}/100 (${cioMemo.rating})`,
      cioMemo.valuationVerdict,
      `Actionable Rebalance Plan generated across all ${request.holdings.length} holdings.`,
    ],
    toolCalls: [],
    confidencePct: cioMemo.convictionScore,
  };
  emit({ type: "agent_turn", turn: cioTurn });
  emit({ type: "cio_memo", memo: cioMemo });

  const completeResult: CompleteAnalysisResult = {
    id: `memo-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode: "demo-simulation",
    modelUsed,
    title: request.title,
    request,
    portfolioMetrics: metrics,
    dcfResult: dcf,
    monteCarlo: mc,
    macroShocks: shocks,
    debateTurns: [extractorTurn, bullTurn, bearTurn, cioTurn],
    cioMemo,
  };

  emit({ type: "complete", result: completeResult });
  return completeResult;
}

/**
 * Main Orchestrator: Runs the Live Google Gemini Multi-Agent Investment Committee
 * (or Demo Simulation if no API key is present)
 */
export async function runInvestmentCommittee(
  request: AnalysisRequestPayload,
  apiKey: string | undefined,
  emit: (event: StreamEvent) => void
): Promise<CompleteAnalysisResult> {
  // Always compute baseline deterministic quant metrics first (zero hallucinated math!)
  const metrics = analyzePortfolioMetrics(request.holdings, request.capital);
  const dcf = runDcfValuation(request.dcfInputs);
  const mc = runMonteCarloSimulation({
    initialCapital: request.capital,
    monthlyContribution: request.monthlyContribution,
    horizonYears: request.horizonYears,
    expectedReturnPct: metrics.expectedAnnualReturnPct,
    volatilityPct: metrics.annualVolatilityPct,
  });
  const shocks = stressTestMacroShocks(request.holdings, request.capital);

  const effectiveKey = apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!effectiveKey || request.forceDemoMode) {
    return runDemoSimulation(request, metrics, dcf, mc, shocks, emit);
  }

  const ai = new GoogleGenAI({ apiKey: effectiveKey });
  const model = DEFAULT_MODEL;

  emit({
    type: "status",
    message: `Connected to Google Gemini (${model}). Convening 4-agent Investment Committee...`,
    mode: "live-gemini",
    model,
  });

  emit({
    type: "quant_ready",
    portfolioMetrics: metrics,
    dcfResult: dcf,
    monteCarlo: mc,
    macroShocks: shocks,
  });

  const holdingsSummary = request.holdings
    .map(
      (h) =>
        `- ${h.ticker} (${h.name}): ${h.weightPct}% weight, Sector=${h.sector}, Price=$${h.currentPrice}, Beta=${h.beta}, ExpReturn=${h.expectedAnnualReturnPct}%, Vol=${h.annualVolatilityPct}%`
    )
    .join("\n");

  const debateTurns: AgentDebateTurn[] = [];

  // ── AGENT 1: Multimodal Filing & Portfolio Extractor ──
  const extractorParts: Array<Record<string, unknown>> = [
    {
      text: `You are Agent 1 (Filing & Portfolio Extractor) on an institutional investment committee.
Analyze the user's thesis, portfolio holdings, and any attached financial document/chart image.
Provide a crisp 1-paragraph summary followed by 3 bullet points of key extracted facts, exposures, and thesis assumptions.

Title: ${request.title}
User Thesis: ${request.thesisPrompt}
Capital: $${request.capital} | Monthly Contribution: $${request.monthlyContribution} | Horizon: ${request.horizonYears}y | Risk Profile: ${request.riskProfile}
Holdings:
${holdingsSummary}`,
    },
  ];

  if (request.attachmentBase64 && request.attachmentMimeType) {
    extractorParts.push({
      inlineData: {
        mimeType: request.attachmentMimeType,
        data: request.attachmentBase64,
      },
    });
  }

  const extractorResp = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: extractorParts }],
    config: { temperature: 0.25 },
  });
  const extractorText = extractorResp.text?.trim() || "Portfolio thesis extracted.";
  const extractorTurn: AgentDebateTurn = {
    id: "turn-extractor",
    role: "extractor",
    agentName: "Agent 1 · Filing & Multimodal Extractor",
    title: request.attachmentName
      ? `Multimodal Vision Extraction: ${request.attachmentName}`
      : "Structured Thesis & Exposure Extraction",
    timestamp: nowTime(),
    status: "complete",
    summary: extractorText.split("\n")[0] || extractorText.slice(0, 260),
    keyPoints: extractBullets(extractorText),
    toolCalls: [],
    confidencePct: 92,
  };
  debateTurns.push(extractorTurn);
  emit({ type: "agent_turn", turn: extractorTurn });

  // ── AGENT 2: Bull Thesis Strategist (with Gemini Function Calling) ──
  const bullRes = await runGeminiAgentWithTools({
    ai,
    model,
    systemInstruction:
      "You are Agent 2 (Bull Thesis Strategist) on an institutional investment committee. You MUST call run_dcf_valuation and run_monte_carlo_simulation tools first to ground your bull case in real numbers. Then write a sharp 2-sentence thesis summary followed by 3 concise bullet points citing exact numbers from the tool outputs.",
    userPrompt: `Build the Bull Case for "${request.title}".
User Thesis: ${request.thesisPrompt}
Extractor Brief: ${extractorText}
DCF Anchor Ticker: ${request.dcfInputs.ticker} (Price $${request.dcfInputs.currentPrice}, Base FCF $${request.dcfInputs.baseFreeCashFlowBillions}B, Growth ${request.dcfInputs.revenueGrowthYear1To5Pct}%).`,
    allowedToolNames: ["run_dcf_valuation", "run_monte_carlo_simulation"],
    request,
    baseMetrics: metrics,
    baseDcf: dcf,
    baseMc: mc,
    baseShocks: shocks,
  });

  const bullTurn: AgentDebateTurn = {
    id: "turn-bull",
    role: "bull",
    agentName: "Agent 2 · Bull Thesis Strategist",
    title: "Growth, DCF Upside & Compounding Case",
    timestamp: nowTime(),
    status: "complete",
    summary: bullRes.text.split("\n")[0] || bullRes.text.slice(0, 260),
    keyPoints: extractBullets(bullRes.text),
    toolCalls: bullRes.toolCalls,
    confidencePct: 82,
  };
  debateTurns.push(bullTurn);
  emit({ type: "agent_turn", turn: bullTurn });

  // ── AGENT 3: Bear & Risk Auditor (with Gemini Function Calling) ──
  const bearRes = await runGeminiAgentWithTools({
    ai,
    model,
    systemInstruction:
      "You are Agent 3 (Bear & Risk Auditor) on an institutional investment committee. You MUST call analyze_portfolio_metrics and stress_test_macro_shock tools first to expose concentration, drawdown, and macro risks. Then write a sharp 2-sentence risk critique followed by 3 concise bullet points citing exact numbers from the tools.",
    userPrompt: `Critique and stress-test "${request.title}" and challenge the Bull Case.
Bull Case: ${bullRes.text}
Risk Profile: ${request.riskProfile} | Capital: $${request.capital}.`,
    allowedToolNames: ["analyze_portfolio_metrics", "stress_test_macro_shock"],
    request,
    baseMetrics: metrics,
    baseDcf: dcf,
    baseMc: mc,
    baseShocks: shocks,
  });

  const bearTurn: AgentDebateTurn = {
    id: "turn-bear",
    role: "bear",
    agentName: "Agent 3 · Bear & Risk Auditor",
    title: "Macro Shock, Concentration & Valuation Audit",
    timestamp: nowTime(),
    status: "complete",
    summary: bearRes.text.split("\n")[0] || bearRes.text.slice(0, 260),
    keyPoints: extractBullets(bearRes.text),
    toolCalls: bearRes.toolCalls,
    confidencePct: 80,
  };
  debateTurns.push(bearTurn);
  emit({ type: "agent_turn", turn: bearTurn });

  // ── AGENT 4: Chief Investment Officer (Structured JSON Output) ──
  const cioResp = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are Agent 4 (Chief Investment Officer). Weigh the Extractor, Bull Strategist, Bear Auditor, and deterministic quantitative outputs to produce a final structured Investment Committee Memo.

Title: ${request.title}
Holdings:
${holdingsSummary}

Deterministic Quant Summary:
- Portfolio Expected Return: ${metrics.expectedAnnualReturnPct}%, Vol: ${metrics.annualVolatilityPct}%, Sharpe: ${metrics.sharpeRatio}, Beta: ${metrics.weightedBeta}, HHI: ${metrics.concentrationHhi} (${metrics.concentrationLabel})
- DCF (${dcf.ticker}): Implied $${dcf.impliedSharePrice} vs Current $${dcf.currentPrice} (${dcf.upsidePct}% upside)
- Monte Carlo (${mc.horizonYears}Y): Median $${mc.medianEndingValue}, P10 $${mc.downsideP10Value}, P90 $${mc.upsideP90Value}
- Macro Shocks: ${shocks.map((s) => `${s.name}: ${s.portfolioImpactPct}%`).join(" | ")}

Bull Strategist Argument:
${bullRes.text}

Bear Auditor Critique:
${bearRes.text}

Return strict JSON matching the schema. Include one rebalancePlan entry for each ticker in the portfolio.`,
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
    agentName: "Agent 4 · Chief Investment Officer (CIO)",
    title: `Final Committee Verdict: ${parsedMemo.rating}`,
    timestamp: nowTime(),
    status: "complete",
    summary: parsedMemo.executiveSummary,
    keyPoints: [
      `Conviction Score: ${parsedMemo.convictionScore}/100 (${parsedMemo.rating})`,
      parsedMemo.valuationVerdict,
      `Generated ${parsedMemo.rebalancePlan?.length ?? 0} actionable position-sizing recommendations.`,
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
    portfolioMetrics: metrics,
    dcfResult: dcf,
    monteCarlo: mc,
    macroShocks: shocks,
    debateTurns,
    cioMemo: parsedMemo,
  };

  emit({ type: "complete", result: completeResult });
  return completeResult;
}
