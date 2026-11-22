import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { runLifestylePlan } from "@/lib/lifestyle-engine";
import { getDemographicMeta } from "@/lib/lifestyle-presets";
import {
  AdvisorBriefResponse,
  LifestylePlanInputs,
  LifestylePlanResult,
} from "@/lib/lifestyle-types";
import {
  extractSafeGeminiApiKey,
  logServerError,
  readJsonBodyWithLimit,
} from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function buildDeterministicAdvisorBrief(
  plan: LifestylePlanResult
): AdvisorBriefResponse {
  const { inputs, kpis, riskChecklist, stressTests, taxWaterfall } = plan;
  const meta = getDemographicMeta(inputs.demographic);
  const gaps = riskChecklist.filter((r) => r.status === "gap");
  const worstStress = [...stressTests].sort(
    (a, b) => a.successRatePct - b.successRatePct
  )[0];

  const spendStatus =
    kpis.lifestyleSpendGap >= 0
      ? `a sustainable surplus capacity of ${fmtMoney(kpis.lifestyleSpendGap)}/yr`
      : `an annual lifestyle funding gap of ${fmtMoney(Math.abs(kpis.lifestyleSpendGap))}/yr`;

  const headline =
    kpis.successProbabilityPct >= 85
      ? `${inputs.clientName}: High-Confidence Lifestyle Trajectory (${kpis.successProbabilityPct}% Funded)`
      : kpis.successProbabilityPct >= 70
      ? `${inputs.clientName}: Watchlist Lifestyle Plan (${kpis.successProbabilityPct}% Funded) — Targeted Optimization Needed`
      : `${inputs.clientName}: Lifestyle Funding Stress (${kpis.successProbabilityPct}% Funded) — Immediate Structural Rebalance`;

  const executiveSummary =
    `For this ${meta.label} profile (${inputs.jurisdiction}, age ${inputs.currentAge} targeting retirement at ${inputs.retirementAge}), ` +
    `our 450-path Monte Carlo engine projects a ${kpis.successProbabilityPct}% probability of fully funding all lifestyle spending and life milestones through age ${inputs.lifeExpectancy}, ` +
    `with a median liquid portfolio of ${fmtMoney(kpis.projectedLiquidAtRetirement)} at retirement and ${fmtMoney(kpis.terminalMedianLiquid)} at terminal age. ` +
    `Current lifestyle burn (${fmtMoney(kpis.currentAnnualLifestyleSpend)}/yr) implies ${spendStatus} relative to the 85%-confidence safe capacity of ${fmtMoney(kpis.safeAnnualLifestyleSpend)}/yr. ` +
    `Overall Lifestyle Readiness scores ${kpis.readinessScore}/100, with ${gaps.length} immediate protection/structural gap(s) identified.`;

  const demographicPlaybook = [
    ...taxWaterfall.accumulationOrder
      .slice(0, 2)
      .map((s) => `Tax & Account Priority #${s.order} (${s.vehicle}): ${s.rationale}`),
    ...taxWaterfall.decumulationOrder
      .slice(0, 1)
      .map((s) => `Decumulation Sequencing (${s.vehicle}): ${s.rationale}`),
    `Primary Stress Vulnerability — ${worstStress.name}: Plan success shifts by ${worstStress.deltaSuccessPct} pts to ${worstStress.successRatePct}% (${fmtMoney(worstStress.terminalMedianLiquid)} terminal median). Pre-emptively ring-fence 18–24 months of essential spending before retirement.`,
  ];

  const lifestyleTradeoffs = [
    kpis.lifestyleSpendGap < 0
      ? `Trimming discretionary lifestyle burn by ${fmtMoney(Math.abs(kpis.lifestyleSpendGap))}/yr OR extending full retirement by 2–3 years restores >85% Monte Carlo confidence.`
      : `Surplus capacity of ${fmtMoney(kpis.lifestyleSpendGap)}/yr allows either upgrading aspirational travel/giving milestones or accelerating financial independence${kpis.financialIndependenceAge ? ` (projected FI at age ${kpis.financialIndependenceAge})` : ""}.`,
    `Savings velocity is currently ${kpis.savingsRatePct}% of gross income against a ${(kpis.effectiveTaxRatePct).toFixed(1)}% estimated effective tax drag; shifting contributions into tax-advantaged vehicles compounds after-tax retirement income materially.`,
    inputs.demographic === "business_owner"
      ? `Balance corporate retained earnings vs. personal salary draw (${inputs.specifics.salaryDividendSplitPct ?? 65}% salary split) to unlock IPP/RRSP room while avoiding the passive investment income grind.`
      : inputs.demographic === "doctor"
      ? `Coordinate Medical Professional Corp (MPC) dividend smoothing with your planned clinical step-down${inputs.specifics.partTimeTransitionAge ? ` at age ${inputs.specifics.partTimeTransitionAge}` : ""} to avoid peak-bracket tax leakage.`
      : inputs.demographic === "executive"
      ? `Automate 10b5-1 RSU sales to reduce single-stock concentration (${inputs.specifics.concentratedStockPct ?? 40}%) below 15% and pair appreciated stock gifts with a Donor-Advised Fund.`
      : `Apply the Go-Go / Slow-Go / No-Go retirement spending framework so peak travel years are funded early while preserving late-life healthcare reserves.`,
  ];

  const actionPlan90Days: AdvisorBriefResponse["actionPlan90Days"] = [
    ...(gaps.length > 0
      ? [
          {
            step: `Close critical protection gap: ${gaps[0].title}`,
            owner: (gaps[0].category === "Estate & Legal"
              ? "Estate / Legal"
              : "Advisor") as "Advisor" | "Client" | "CPA / Tax" | "Estate / Legal",
            impact: "Eliminates catastrophic household tail risk",
          },
        ]
      : []),
    {
      step: `Implement Priority #1 contribution/structuring move: ${taxWaterfall.accumulationOrder[0]?.vehicle ?? "Tax-Advantaged Rebalance"}`,
      owner: "CPA / Tax",
      impact: "Lowers lifetime effective tax drag & boosts net compounding",
    },
    {
      step: `Review & rank all ${plan.milestoneStatuses.length} active life milestones (Essential vs. Aspirational) and lock in 12-month liquidity bucket`,
      owner: "Client",
      impact: "Aligns portfolio risk budget with near-term lifestyle cash needs",
    },
    {
      step: `Stress-test portfolio allocation (${inputs.riskProfile}) against ${worstStress.name} and establish automated rebalancing guardrails`,
      owner: "Advisor",
      impact: `Protects ${kpis.successProbabilityPct}% plan success rate during drawdowns`,
    },
  ];

  const clientMeetingQuestions = [
    `If markets experience a 20% drawdown within 24 months of age ${inputs.retirementAge}, would you prefer flexing discretionary travel spend by 15% or delaying full retirement by 1–2 years?`,
    inputs.demographic === "business_owner"
      ? "How confident are you in the timing and net after-tax multiple of your business exit, and have we completed a 24-month LCGE/QSBS purification check?"
      : inputs.demographic === "doctor"
      ? "At what age do you envision stepping back from full-time call/clinical load into part-time or locum work, and does your disability policy reflect true own-occupation specialty language?"
      : inputs.demographic === "couple"
      ? "How do both partners rank funding 100% of children's education and family real estate versus retiring 2–3 years earlier?"
      : "Which of your upcoming lifestyle milestones is completely non-negotiable, and where are you comfortable keeping timing flexible?",
    `Are your current Will, Power of Attorney, and registered account beneficiaries fully aligned with your ${inputs.jurisdiction} estate plan?`,
  ];

  return {
    mode: "deterministic-cfp",
    modelUsed: "CFP Deterministic Advisory Engine",
    headline,
    executiveSummary,
    demographicPlaybook,
    lifestyleTradeoffs,
    actionPlan90Days,
    clientMeetingQuestions,
  };
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBodyWithLimit<{
    inputs: LifestylePlanInputs;
    generateBrief?: boolean;
  }>(req, 256_000);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const body = parsed.data;

    if (!body?.inputs || typeof body.inputs !== "object") {
      return NextResponse.json(
        { error: "Missing lifestyle plan inputs" },
        { status: 400 }
      );
    }

    const plan = runLifestylePlan(body.inputs);

    if (!body.generateBrief) {
      return NextResponse.json({ plan });
    }

    const headerKey = extractSafeGeminiApiKey(req);
    const apiKey = headerKey || process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json({
        plan,
        brief: buildDeterministicAdvisorBrief(plan),
      });
    }

    // Live Google Gemini CFP Advisory Brief
    try {
      const ai = new GoogleGenAI({ apiKey });
      const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const meta = getDemographicMeta(body.inputs.demographic);

      const prompt = `You are a Senior Certified Financial Planner (CFP) and Private Wealth Strategist preparing a concise, high-conviction client advisory brief for a wealth manager.

CLIENT ARCHETYPE: ${meta.label} (${body.inputs.jurisdiction})
CLIENT NAME: ${body.inputs.clientName}
AGE / RETIREMENT / HORIZON: Age ${body.inputs.currentAge} -> Retire ${body.inputs.retirementAge} -> Plan to Age ${body.inputs.lifeExpectancy}
RISK PROFILE: ${body.inputs.riskProfile}

QUANTITATIVE ENGINE RESULTS:
- Monte Carlo Success Probability: ${plan.kpis.successProbabilityPct}%
- Lifestyle Readiness Score: ${plan.kpis.readinessScore}/100
- Current Annual Lifestyle Spend: ${fmtMoney(plan.kpis.currentAnnualLifestyleSpend)} vs Safe 85%-Confidence Capacity: ${fmtMoney(plan.kpis.safeAnnualLifestyleSpend)} (Gap: ${fmtMoney(plan.kpis.lifestyleSpendGap)})
- Projected Liquid Portfolio at Retirement: ${fmtMoney(plan.kpis.projectedLiquidAtRetirement)} | Terminal Median: ${fmtMoney(plan.kpis.terminalMedianLiquid)}
- Effective Tax Rate: ${plan.kpis.effectiveTaxRatePct}% | Savings Rate: ${plan.kpis.savingsRatePct}% | Emergency Runway: ${plan.kpis.emergencyRunwayMonths} months | DTI: ${plan.kpis.debtToIncomePct}%
- Protection Gaps: ${plan.riskChecklist.filter((r) => r.status !== "covered").map((r) => `${r.title} (${r.status})`).join("; ") || "None"}
- Key Stress Tests: ${plan.stressTests.map((s) => `${s.name}: ${s.successRatePct}% (${s.deltaSuccessPct >= 0 ? "+" : ""}${s.deltaSuccessPct} pts)`).join(" | ")}
- Active Milestones: ${plan.milestoneStatuses.map((m) => `${m.title} @ age ${m.age} (${fmtMoney(m.totalCost)}, ${m.fundedStatus})`).join("; ")}

Deliver concrete, jurisdiction-accurate (${body.inputs.jurisdiction}) wealth management advice tailored specifically to a ${meta.label}. Reference exact numbers from above.`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              executiveSummary: { type: Type.STRING },
              demographicPlaybook: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              lifestyleTradeoffs: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              actionPlan90Days: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    owner: { type: Type.STRING },
                    impact: { type: Type.STRING },
                  },
                  required: ["step", "owner", "impact"],
                },
              },
              clientMeetingQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              "headline",
              "executiveSummary",
              "demographicPlaybook",
              "lifestyleTradeoffs",
              "actionPlan90Days",
              "clientMeetingQuestions",
            ],
          },
        },
      });

      const rawText = response.text;
      if (rawText) {
        const parsed = JSON.parse(rawText) as Omit<
          AdvisorBriefResponse,
          "mode" | "modelUsed"
        >;
        return NextResponse.json({
          plan,
          brief: {
            mode: "live-gemini",
            modelUsed: modelName,
            ...parsed,
          },
        });
      }
    } catch {
      // Fall back seamlessly to deterministic CFP brief on API error
    }

    return NextResponse.json({
      plan,
      brief: buildDeterministicAdvisorBrief(plan),
    });
  } catch (err) {
    logServerError("api/lifestyle:POST", err);
    return NextResponse.json(
      {
        error: "Lifestyle planning calculation failed.",
      },
      { status: 500 }
    );
  }
}
