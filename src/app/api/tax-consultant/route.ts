import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import {
  generateDeterministicTaxAdvice,
  runGlobalTaxAudit,
} from "@/lib/quant/global-tax-engine";
import { GlobalTaxProfile, TaxConsultantMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const TAX_CONSULTANT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description:
        "Clear, executive, numbers-cited tax strategy answer tailored to the user's residency, accounts, business, foreign real estate, and gain streams. Use concise markdown bolding for key figures.",
    },
    keyMetricsCited: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 to 4 short verified quantitative metrics cited from the deterministic tax audit.",
    },
    actionSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 to 4 concrete, prioritized tax structuring action steps.",
    },
    riskFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "1 to 3 critical cross-border compliance or double-taxation warnings.",
    },
  },
  required: ["answer", "keyMetricsCited", "actionSteps", "riskFlags"],
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      question: string;
      profile: GlobalTaxProfile;
      history?: Pick<TaxConsultantMessage, "role" | "content">[];
    };

    const question = (body.question || "").trim();
    if (!question || !body.profile) {
      return NextResponse.json(
        { error: "Missing question or global tax profile." },
        { status: 400 }
      );
    }

    // Always recompute deterministic ground truth server-side so numbers are 100% verified
    const report = runGlobalTaxAudit(body.profile);
    const apiKey =
      req.headers.get("x-gemini-api-key")?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      "";

    if (!apiKey) {
      const fallback = generateDeterministicTaxAdvice(question, report, body.profile);
      return NextResponse.json({
        mode: "deterministic-engine",
        modelUsed: "deterministic-global-tax-engine",
        ...fallback,
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      const recentHistory = (body.history || [])
        .slice(-4)
        .map((m) => `${m.role === "user" ? "Investor" : "Tax Consultant"}: ${m.content}`)
        .join("\n");

      const groundedContext = {
        residency: report.residency.label,
        effectiveMarginalRatePct: report.effectiveMarginalRatePct,
        taxEfficiencyScore: report.taxEfficiencyScore,
        estimatedAnnualTaxAlphaUsd: report.estimatedAnnualTaxAlphaUsd,
        portfolioValueUsd: body.profile.portfolioValueUsd,
        foreignAllocationPct: body.profile.foreignAllocationPct,
        foreignSourceCountry: body.profile.foreignSourceCountry,
        targetGainToAccessUsd: body.profile.targetGainToAccessUsd,
        accounts: report.accountLocations.map((a) => ({
          name: a.accountName,
          domCagrPct: a.domesticAfterTaxCagrPct,
          forCagrPct: a.foreignAfterTaxCagrPct,
          whtBps: a.foreignWithholdingDragBps,
          projectedWealthUsd: a.projected10YrWealthUsd,
          taxSavedVsTaxableUsd: a.taxSavedVsTaxableUsd,
          treatyNote: a.treatyNote,
        })),
        incomeStreams: report.incomeStreams.map((s) => ({
          label: s.label,
          effectiveTaxRatePct: s.effectiveTaxRatePct,
          netSpendableUsd: s.netSpendableUsd,
          foreignWithholdingUsd: s.foreignWithholdingUsd,
          caveat: s.keyCaveat,
        })),
        businessStructures: report.businessStructures.map((b) => ({
          label: b.label,
          effectiveCombinedRatePct: b.effectiveCombinedRatePct,
          annualDeferralAdvantageUsd: b.annualDeferralAdvantageUsd,
          exitEffectiveRatePct: b.exitEffectiveRatePct,
          passiveGrindWarning: b.passiveGrindWarning,
          cfcOrFapiWarning: b.cfcOrFapiWarning,
        })),
        foreignRealEstate: {
          market: report.foreignRealEstate.marketLabel,
          entity: report.foreignRealEstate.entityLabel,
          priceUsd: report.foreignRealEstate.purchasePriceUsd,
          acquisitionFrictionUsd: report.foreignRealEstate.totalAcquisitionFrictionUsd,
          foreignBuyerSurchargeUsd: report.foreignRealEstate.foreignBuyerSurchargeUsd,
          grossMethodTaxUsd: report.foreignRealEstate.foreignRentalTaxGrossMethodUsd,
          netElectionTaxUsd: report.foreignRealEstate.foreignRentalTaxNetElectionUsd,
          afterTaxCashflowUsd: report.foreignRealEstate.netAnnualAfterTaxCashflowUsd,
          closingWithholdingUsd: report.foreignRealEstate.mandatoryClosingWithholdingUsd,
          preTaxIrrPct: report.foreignRealEstate.preTaxIrrPct,
          afterTaxIrrPct: report.foreignRealEstate.afterTaxIrrPct,
          alerts: report.foreignRealEstate.entityStructureAlerts,
          estateTaxNote: report.foreignRealEstate.estateTaxExposureNote,
        },
        complianceAlerts: report.complianceAlerts,
      };

      const prompt = `You are a senior international cross-border tax strategist ("Tax Consultant in Your Pocket") inside ThesisLens.
You advise high-net-worth investors and founders on:
1. Domestic vs. foreign investing across tax-efficient accounts (TFSA, RRSP, FHSA, Roth IRA, 401k, HSA, ISA, SIPP, Irish UCITS, Taxable, HoldCo)
2. Withholding tax treaties, Foreign Tax Credits (FTC), PFIC, T1135, FBAR, and US Estate Tax situs
3. Owning businesses (Sole Prop, CCPC SBD/CDA/AAII grind, HoldCo, S-Corp, C-Corp QSBS §1202, Foreign Corp CFC/FAPI/GILTI)
4. Buying foreign real estate (US FIRPTA, Canada Sec 116 & NRST, Mexico Fideicomiso, Portugal IMT, UK SDLT/IHT, Dubai DIFC Will, Net Rental Elections)
5. Accessing investment gain streams (LTCG, STCG, Qualified/Eligible Dividends, Foreign Dividends, Interest, Return of Capital, SBLOC/Buy-Borrow-Die, Corporate CDA)

STRICT RULES:
- Cite ONLY the verified quantitative numbers from the DETERMINISTIC TAX ENGINE JSON below. Do not hallucinate different figures.
- Be sharp, practical, and structured like a Big-4 / family-office cross-border partner.
- Remind the investor briefly at the end only if relevant that cross-border filings should be confirmed with a licensed local CPA/tax counsel.

DETERMINISTIC TAX ENGINE OUTPUT:
${JSON.stringify(groundedContext, null, 2)}

${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n` : ""}
INVESTOR QUESTION:
${question}`;

      const response = await ai.models.generateContent({
        model: DEFAULT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: TAX_CONSULTANT_SCHEMA,
          temperature: 0.25,
        },
      });

      const rawText = response.text?.trim() || "";
      const parsed = JSON.parse(rawText) as {
        answer: string;
        keyMetricsCited: string[];
        actionSteps: string[];
        riskFlags: string[];
      };

      return NextResponse.json({
        mode: "live-gemini",
        modelUsed: DEFAULT_MODEL,
        ...parsed,
      });
    } catch {
      const fallback = generateDeterministicTaxAdvice(question, report, body.profile);
      return NextResponse.json({
        mode: "deterministic-engine",
        modelUsed: "deterministic-fallback",
        ...fallback,
      });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to run Global Tax Consultant.",
      },
      { status: 500 }
    );
  }
}
