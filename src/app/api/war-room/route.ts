import { audienceGuidance } from "@/lib/workspaces";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import {
  ToolCallRecord,
  WarRoomMessage,
  WarRoomRequestPayload,
  WarRoomTargetRole,
} from "@/lib/types";
import {
  executeUniversalQuantTool,
  UNIVERSAL_QUANT_TOOLS,
} from "@/lib/quant/tool-registry";
import {
  defaultResidencyForJurisdiction,
  simulateCioRebalance,
} from "@/lib/quant/rebalance-simulator";
import {
  extractSafeGeminiApiKey,
  logServerError,
  readJsonBodyWithLimit,
} from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ROLE_META: Record<
  WarRoomTargetRole,
  { label: string; systemInstruction: string }
> = {
  cio: {
    label: "Chief Investment Officer (CIO)",
    systemInstruction:
      "You are the Chief Investment Officer chairing the ThesisLens Investment Committee. Defend, refine, or update the CIO Memo rating and conviction score using verified quant tool outputs. Be direct, institutional, and decisive.",
  },
  bull: {
    label: "Bull Thesis Strategist",
    systemInstruction:
      "You are the Bull Thesis Strategist on the Investment Committee. Stress-test upside catalysts, asymmetric compounding, and DCF upside using quant tools. Acknowledge real risks concisely while defending the strongest bull case.",
  },
  bear: {
    label: "Bear & Risk Auditor",
    systemInstruction:
      "You are the adversarial Bear & Risk Auditor (Pre-Mortem specialist). Your job is to try to BREAK the thesis using deterministic DCF stress tests (+WACC / -growth), macro shocks, concentration HHI, and tail-risk math. Never soften real risks.",
  },
  cfa_risk: {
    label: "CFA Forensic & Risk Officer",
    systemInstruction:
      "You are a CFA Charterholder Forensic Accountant & Institutional Risk Officer. Focus on Beneish M-Score, Altman Z-Score, accruals quality, Sharpe/VaR/CVaR, liquidity/slippage, and pre-trade compliance. Cite exact numbers from tools.",
  },
  tax_strategist: {
    label: "Global Tax Strategist",
    systemInstruction:
      "You are a cross-border Private Wealth & Global Tax Strategist. Focus on capital gains drag, after-tax alpha, asset location (TFSA/RRSP/Roth/ISA/Non-Reg), dividend withholding treaties, and whether to rebalance now or via new cash flows. Always call audit_global_tax when relevant.",
  },
  bull_vs_bear: {
    label: "Bull vs. Bear IC Clash",
    systemInstruction:
      "You are orchestrating a sharp, two-sided Investment Committee clash between the Bull Strategist and the Bear Risk Auditor on the user's exact question. First invoke quant tools to ground the numbers, then deliver a crisp Bull argument in `content` and a direct Bear counter-rebuttal in `rebuttalContent`.",
  },
};

const WAR_ROOM_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    content: {
      type: Type.STRING,
      description:
        "Primary specialist response (or Bull argument when targetRole is bull_vs_bear). 2-4 crisp paragraphs with exact numbers cited from tools.",
    },
    rebuttalContent: {
      type: Type.STRING,
      description:
        "Only populated when targetRole is bull_vs_bear: the Bear Risk Auditor's direct counter-rebuttal citing downside math.",
    },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 to 3 concise, quantified takeaways.",
    },
    convictionDelta: {
      type: Type.INTEGER,
      description:
        "Suggested shift to the CIO's 0-100 Conviction Score based on this cross-examination, integer between -15 and +15 (0 if neutral).",
    },
  },
  required: ["content", "keyTakeaways", "convictionDelta"],
};

function nowTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function runDeterministicWarRoom(payload: WarRoomRequestPayload): WarRoomMessage {
  const { question, targetRole, analysisRequest, cioMemo, universalQuant, rebalanceSummary } =
    payload;
  const qLower = question.toLowerCase();
  const toolCalls: ToolCallRecord[] = [];

  const invoke = (name: string, args: Record<string, unknown>) => {
    const start = Date.now();
    const out = executeUniversalQuantTool(name, args, analysisRequest, universalQuant);
    toolCalls.push({
      id: `wr-tool-${Date.now()}-${toolCalls.length}`,
      toolName: name,
      args,
      resultSummary: out.summary,
      durationMs: Math.max(1, Date.now() - start),
    });
    return out;
  };

  // Detect WACC / growth shift requests (e.g. "+150bps WACC" or "-3% growth")
  const bpsMatch = qLower.match(/([+-]?\d{2,3})\s*bps/);
  const waccShift =
    bpsMatch && /wacc|rate|discount/.test(qLower)
      ? Number(bpsMatch[1]) / 100
      : targetRole === "bear"
      ? 1.5
      : targetRole === "bull"
      ? -0.75
      : 0;
  const growthShift =
    targetRole === "bear" ? -2.5 : targetRole === "bull" ? 2.0 : 0;

  let content = "";
  let rebuttalContent: string | undefined;
  let keyTakeaways: string[] = [];
  let convictionDelta = 0;

  if (targetRole === "tax_strategist" || /(tax|capital gain|tfsa|rrsp|roth|isa|withhold|after-tax|residency)/.test(qLower)) {
    const residencyId = defaultResidencyForJurisdiction(analysisRequest.jurisdiction);
    const taxOut = invoke("audit_global_tax", { residencyId });
    const rebalSim = simulateCioRebalance({
      holdings: analysisRequest.holdings,
      rebalancePlan: cioMemo.rebalancePlan,
      capital: analysisRequest.capital,
      monthlyContribution: analysisRequest.monthlyContribution,
      horizonYears: analysisRequest.horizonYears,
      options: {
        residencyId,
        accountWrapper: "taxable",
        assumedUnrealizedGainPct: 25,
      },
    });
    const tax = rebalSim.taxImpact;
    content = `Evaluating "${question}" under ${tax.residencyLabel} rules (${tax.ltcgRatePct}% LTCG rate): executing the CIO rebalance inside a taxable account triggers ~$${tax.totalTaxDragUsd.toLocaleString()} (${tax.taxDragBps} bps of NAV) in estimated capital gains tax on $${tax.totalTrimmedDollars.toLocaleString()} of trims. ${tax.verdictExplanation}\n\nGlobal Tax Audit: ${taxOut.summary}.`;
    keyTakeaways = [
      `Taxable rebalance drag: $${tax.totalTaxDragUsd.toLocaleString()} (${tax.taxDragBps} bps) at 25% assumed unrealized gain`,
      `After-tax verdict: ${tax.verdict.replace(/_/g, " ")}${tax.paybackMonths !== null ? ` (${tax.paybackMonths} mo payback)` : ""}`,
      `Tax-sheltered execution (TFSA/RRSP/Roth/ISA) eliminates 100% of realization friction`,
    ];
    convictionDelta = tax.verdict === "USE_NEW_CASH_FLOWS" ? -3 : 2;
  } else if (targetRole === "bull_vs_bear") {
    const bullDcf = invoke("run_dcf_valuation", {
      waccAdjustmentPct: -0.75,
      growthAdjustmentPct: 2.0,
    });
    const bearDcf = invoke("run_dcf_valuation", {
      waccAdjustmentPct: 1.5,
      growthAdjustmentPct: -2.5,
    });
    const shockOut = invoke("stress_test_cross_asset_shocks", {});

    content = `BULL CASE on "${question}": Even before multiple expansion, modest operational execution (-75bps WACC, +2% FCF growth) lifts intrinsic value sharply (${bullDcf.summary}). With portfolio Sharpe at ${universalQuant.portfolioMetrics.sharpeRatio} and ${universalQuant.monteCarlo.probabilityOfDoublingPct}% probability of doubling over ${analysisRequest.horizonYears}Y, trimming too early sacrifices asymmetric compounding.`;
    rebuttalContent = `BEAR REBUTTAL: That bull math assumes benign discount rates. Under a +150bps WACC / -2.5% growth stress (${bearDcf.summary}), the margin of safety compresses rapidly. Pair that with portfolio HHI of ${universalQuant.portfolioMetrics.concentrationHhi} (${universalQuant.portfolioMetrics.concentrationLabel}) and our tail-risk audit (${shockOut.summary}) — sizing discipline and hedging are mandatory.`;
    keyTakeaways = [
      `Bull DCF case: ${bullDcf.summary}`,
      `Bear stress DCF: ${bearDcf.summary}`,
      `Macro tail risk: ${shockOut.summary}`,
    ];
    convictionDelta = 0;
  } else if (targetRole === "bear" || /(break|risk|shock|recession|crash|drawdown|downside|wacc|bear|pre-mortem)/.test(qLower)) {
    const dcfOut = invoke("run_dcf_valuation", {
      waccAdjustmentPct: waccShift || 1.5,
      growthAdjustmentPct: growthShift || -2.0,
    });
    const shockOut = invoke("stress_test_cross_asset_shocks", {});
    const portOut = invoke("analyze_portfolio_metrics", { includeSectorBreakdown: true });

    content = `Pre-mortem stress test for "${question}": Shifting discount rate by +${(waccShift || 1.5).toFixed(2)}% WACC and growth by ${(growthShift || -2.0).toFixed(1)}% recalculates intrinsic value to: ${dcfOut.summary}.\n\nAt the portfolio level (${portOut.summary}), our cross-asset shock engine flags the primary vulnerability: ${shockOut.summary}. If this thesis breaks, it will likely be through valuation multiple compression colliding with single-sector concentration.`;
    keyTakeaways = [
      `Stressed DCF: ${dcfOut.summary}`,
      `Worst macro shock: ${shockOut.summary}`,
      `Estimated max drawdown: -${universalQuant.portfolioMetrics.estimatedMaxDrawdownPct}% (HHI ${universalQuant.portfolioMetrics.concentrationHhi})`,
    ];
    convictionDelta = -6;
  } else if (targetRole === "cfa_risk" || /(beneish|altman|forensic|var|cvar|liquidity|slippage|compliance|cfa|earnings)/.test(qLower)) {
    const forensicOut = invoke("run_cfa_forensic_audit", {});
    const hfOut = invoke("analyze_hedge_fund_risk", {});
    const liqOut = invoke("run_liquidity_compliance_check", {});

    content = `CFA Forensic & Risk Desk response to "${question}":\n• Accounting Quality: ${forensicOut.summary}\n• Institutional Risk Attribution: ${hfOut.summary}\n• Liquidity & Pre-Trade Compliance: ${liqOut.summary}`;
    keyTakeaways = [
      forensicOut.summary,
      hfOut.summary,
      liqOut.summary,
    ];
    convictionDelta = -2;
  } else if (targetRole === "bull" || /(upside|catalyst|compound|bull|size up|add|growth)/.test(qLower)) {
    const dcfOut = invoke("run_dcf_valuation", {
      waccAdjustmentPct: waccShift || -0.75,
      growthAdjustmentPct: growthShift || 2.0,
    });
    const mcOut = invoke("run_monte_carlo_simulation", {
      horizonYears: analysisRequest.horizonYears,
    });

    content = `Bull Strategist case on "${question}": Under a constructive execution path (${dcfOut.summary}), upside remains compelling relative to current market pricing. Over a ${analysisRequest.horizonYears}-year horizon, our 800-path simulation projects ${mcOut.summary}, with a ${universalQuant.monteCarlo.probabilityOfDoublingPct}% probability of doubling capital.`;
    keyTakeaways = [
      `Constructive DCF: ${dcfOut.summary}`,
      mcOut.summary,
      `Top catalyst: ${cioMemo.catalysts[0] ?? "Execution on core revenue & FCF growth"}`,
    ];
    convictionDelta = 5;
  } else {
    // CIO default synthesis
    const portOut = invoke("analyze_portfolio_metrics", {});
    const mcOut = invoke("run_monte_carlo_simulation", {
      horizonYears: analysisRequest.horizonYears,
    });
    const rebalNote = rebalanceSummary
      ? ` Applying the CIO rebalance improves Sharpe by ${rebalanceSummary.sharpeDelta >= 0 ? "+" : ""}${rebalanceSummary.sharpeDelta} and shifts volatility by ${rebalanceSummary.volatilityDeltaPct >= 0 ? "+" : ""}${rebalanceSummary.volatilityDeltaPct}% (est. tax drag $${rebalanceSummary.totalTaxDragUsd.toLocaleString()}, verdict: ${rebalanceSummary.verdict}).`
      : "";

    content = `CIO Committee Ruling on "${question}": Our current stance remains ${cioMemo.rating} (${cioMemo.convictionScore}/100 conviction). ${cioMemo.valuationVerdict}\n\nPortfolio baseline: ${portOut.summary}. Trajectory: ${mcOut.summary}.${rebalNote}`;
    keyTakeaways = [
      `Current CIO Rating: ${cioMemo.rating} (${cioMemo.convictionScore}/100)`,
      portOut.summary,
      rebalanceSummary
        ? `Simulated CIO Rebalance: Sharpe ${rebalanceSummary.sharpeDelta >= 0 ? "+" : ""}${rebalanceSummary.sharpeDelta}, Tax Drag $${rebalanceSummary.totalTaxDragUsd.toLocaleString()}`
        : `Horizon: ${cioMemo.timeHorizonNote}`,
    ];
    convictionDelta = rebalanceSummary && rebalanceSummary.sharpeDelta > 0 ? 3 : 0;
  }

  return {
    id: `wr-msg-${Date.now()}`,
    sender: "agent",
    targetRole,
    speakerLabel: ROLE_META[targetRole].label,
    content,
    rebuttalContent,
    keyTakeaways,
    convictionDelta,
    toolCalls,
    mode: "deterministic-engine",
    timestamp: nowTime(),
  };
}

export async function POST(req: NextRequest) {
  const parsedBody = await readJsonBodyWithLimit<WarRoomRequestPayload>(req, 512_000);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
  }
  const payload = parsedBody.data;

  if (!payload.question?.trim() || payload.question.length > 2000) {
    return NextResponse.json(
      { error: "Question is required (max 2000 characters)." },
      { status: 400 }
    );
  }

  const targetRole: WarRoomTargetRole = ROLE_META[payload.targetRole]
    ? payload.targetRole
    : "cio";
  const headerKey = extractSafeGeminiApiKey(req);
  const apiKey = headerKey || process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    const message = runDeterministicWarRoom({ ...payload, targetRole });
    return NextResponse.json({ message });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const roleCfg = ROLE_META[targetRole];
    const instructions = [roleCfg.systemInstruction, audienceGuidance(payload.analysisRequest.audience)].filter(Boolean).join("\n");
    const toolCalls: ToolCallRecord[] = [];

    const historyText = (payload.history ?? [])
      .slice(-6)
      .map((h) => `${h.speakerLabel}: ${h.content}`)
      .join("\n");

    const contextPrompt = `ACTIVE INVESTMENT CASE:
- Title: ${payload.analysisRequest.title}
- Thesis: ${payload.analysisRequest.thesisPrompt}
- Capital: $${payload.analysisRequest.capital.toLocaleString()} | Horizon: ${payload.analysisRequest.horizonYears}Y | Jurisdiction: ${payload.analysisRequest.jurisdiction ?? "Canada"}
- Holdings: ${payload.analysisRequest.holdings.map((h) => `${h.ticker} (${h.weightPct}%, beta ${h.beta})`).join(", ")}
- CIO Memo: ${payload.cioMemo.rating} (${payload.cioMemo.convictionScore}/100) — ${payload.cioMemo.headline}
- Valuation Verdict: ${payload.cioMemo.valuationVerdict}
- Portfolio Baseline: Exp Return ${payload.universalQuant.portfolioMetrics.expectedAnnualReturnPct}%, Vol ${payload.universalQuant.portfolioMetrics.annualVolatilityPct}%, Sharpe ${payload.universalQuant.portfolioMetrics.sharpeRatio}, HHI ${payload.universalQuant.portfolioMetrics.concentrationHhi}
${
  payload.rebalanceSummary
    ? `- Simulated CIO Rebalance: Sharpe Delta ${payload.rebalanceSummary.sharpeDelta}, Vol Delta ${payload.rebalanceSummary.volatilityDeltaPct}%, Est Tax Drag $${payload.rebalanceSummary.totalTaxDragUsd.toLocaleString()} (${payload.rebalanceSummary.verdict})`
    : ""
}
${historyText ? `\nRECENT WAR ROOM TRANSCRIPT:\n${historyText}` : ""}

USER CROSS-EXAMINATION QUESTION:
"${payload.question}"

First call 1-2 relevant quantitative tools to verify your math (never guess financial calculations), then deliver your specialist answer.`;

    // Step 1: Function-calling research turn (up to 2 rounds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents: any[] = [{ role: "user", parts: [{ text: contextPrompt }] }];

    for (let round = 0; round < 2; round++) {
      const resp = await ai.models.generateContent({
        model: DEFAULT_MODEL,
        contents,
        config: {
          systemInstruction: instructions,
          tools: [{ functionDeclarations: UNIVERSAL_QUANT_TOOLS }],
          temperature: 0.35,
        },
      });

      const calls = resp.functionCalls;
      if (!calls || calls.length === 0) break;

      const modelParts = resp.candidates?.[0]?.content?.parts ?? [];
      if (modelParts.length > 0) {
        contents.push({ role: "model", parts: modelParts });
      }

      const responseParts = [];
      for (const call of calls) {
        const start = Date.now();
        const name = call.name || "analyze_portfolio_metrics";
        const args = (call.args ?? {}) as Record<string, unknown>;
        const out = executeUniversalQuantTool(
          name,
          args,
          payload.analysisRequest,
          payload.universalQuant
        );
        toolCalls.push({
          id: `wr-tool-${Date.now()}-${toolCalls.length}`,
          toolName: name,
          args,
          resultSummary: out.summary,
          durationMs: Math.max(1, Date.now() - start),
        });
        responseParts.push({
          functionResponse: {
            name,
            response: out.payload,
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    // Step 2: Structured final answer citing tool outputs
    const toolSummaryBlock =
      toolCalls.length > 0
        ? `\nVERIFIED QUANT TOOL OUTPUTS:\n${toolCalls
            .map((t) => `- ${t.toolName}(${JSON.stringify(t.args)}): ${t.resultSummary}`)
            .join("\n")}`
        : "";

    const finalResp = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${contextPrompt}${toolSummaryBlock}\n\nRespond strictly in the requested JSON schema. ${
                targetRole === "bull_vs_bear"
                  ? "Put the Bull Strategist's argument in `content` and the Bear Risk Auditor's direct counter-rebuttal in `rebuttalContent`."
                  : "Leave `rebuttalContent` empty."
              }`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: instructions,
        responseMimeType: "application/json",
        responseSchema: WAR_ROOM_RESPONSE_SCHEMA,
        temperature: 0.35,
      },
    });

    const rawText = finalResp.text || "{}";
    const parsed = JSON.parse(rawText) as {
      content?: string;
      rebuttalContent?: string;
      keyTakeaways?: string[];
      convictionDelta?: number;
    };

    const message: WarRoomMessage = {
      id: `wr-msg-${Date.now()}`,
      sender: "agent",
      targetRole,
      speakerLabel: roleCfg.label,
      content: parsed.content?.trim() || "Committee review completed.",
      rebuttalContent:
        targetRole === "bull_vs_bear" ? parsed.rebuttalContent?.trim() : undefined,
      keyTakeaways: Array.isArray(parsed.keyTakeaways)
        ? parsed.keyTakeaways.slice(0, 4)
        : [],
      convictionDelta: clamp(Math.round(Number(parsed.convictionDelta) || 0), -15, 15),
      toolCalls,
      mode: "live-gemini",
      timestamp: nowTime(),
    };

    return NextResponse.json({ message });
  } catch (err) {
    logServerError("api/war-room:POST", err);
    const message = runDeterministicWarRoom({ ...payload, targetRole });
    return NextResponse.json({ message });
  }
}
