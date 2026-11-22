import type { CompanyDossier } from "../dossier/types";
import type { CompanyModel } from "../model/types";
import type { RatesSnapshot } from "../providers/types";
import type { AnalystToolDeclaration } from "../providers/types";
import { DRIVER_KEYS } from "../model/types";

/**
 * Shared, cacheable system prompt prefix (Phase 3d cost control).
 * Sector instructions, override schema, citation rules, and worked example stay identical
 * across companies so Gemini context caching can reuse the prefix.
 */
export function buildSharedAnalystSystemPrefix(): string {
  return `You are a sell-side equity research analyst building a linked three-statement valuation model in ThesisLens.

CORE RULES:
1. You propose assumptions; deterministic TypeScript code computes every financial statement line and DCF output. Never compute DCF or EPS by hand when you can call \`run_model\`.
2. EVERY single override you propose MUST cite a valid \`citationId\` from the company dossier (e.g. "FIN-FY2026", "GUID-...", "MDA-..."). Uncited overrides are rejected by the validator.
3. Never cite or rely on information filed after the dossier's \`asOf\` date.
4. If dated management guidance exists for a metric and your override diverges materially (>200 bps on growth/margins or >5% on EPS), you MUST include a \`divergenceReason\`.
5. Use tools (\`get_filing_section\`, \`get_kpi_history\`, \`get_guidance\`, \`run_model\`) to inspect details and check valuation impact before returning your final JSON.

SUPPORTED OVERRIDE KEYS:
- Drivers (decimals for rates, e.g. 0.08 = 8%; days for dso/dio/dpo; number or per-year array):
  ${DRIVER_KEYS.join(", ")}
- Valuation (scalar decimals): terminalGrowth, terminalRonic, unleveredBeta, targetDebtWeight, preTaxCostOfDebt
- Financing (scalar decimals): interestRateOnDebt, interestRateOnCash, minCashPctRevenue

FINAL OUTPUT FORMAT (return valid JSON only, no markdown fences):
{
  "thesisSummary": "2-4 sentence institutional thesis explaining the key drivers and valuation.",
  "overrides": [
    {
      "key": "revenueGrowth",
      "value": [0.08, 0.07, 0.06],
      "citationId": "FIN-FY2026",
      "rationale": "FY2026 revenue grew 8.2% with steady Services mix shift; tapering gently to 6%.",
      "divergenceReason": "Optional — required only when differing materially from management guidance."
    }
  ],
  "keyRisks": ["Risk 1", "Risk 2"],
  "catalysts": ["Catalyst 1", "Catalyst 2"]
}`;
}

export const ANALYST_TOOL_DECLARATIONS: AnalystToolDeclaration[] = [
  {
    name: "get_filing_section",
    description: "Retrieve filing passages from the company dossier for a given section (mda, segments, risk_factors, guidance, financials).",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["mda", "segments", "risk_factors", "guidance", "financials"],
          description: "Dossier section to retrieve.",
        },
      },
      required: ["section"],
    },
  },
  {
    name: "get_kpi_history",
    description: "Retrieve operating KPI history and validated segment revenue breakdown from the dossier.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", description: "Optional KPI metric filter (e.g. gross_margin, ebit_margin, fcf_margin)." },
      },
    },
  },
  {
    name: "get_guidance",
    description: "Retrieve all dated management guidance entries in the dossier (strictly filtered to filed <= asOf).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "run_model",
    description: "Test-run the deterministic three-statement model & valuation with candidate driver/valuation overrides and inspect value/share, WACC, and Year 1-3 projections.",
    parameters: {
      type: "object",
      properties: {
        drivers: { type: "object", description: "Candidate driver overrides (key -> number or number[])." },
        valuation: { type: "object", description: "Candidate valuation overrides (key -> number)." },
      },
    },
  },
];

export function buildCompanyDossierPrompt(
  dossier: CompanyDossier,
  baseline: CompanyModel,
  rates: RatesSnapshot,
  isFilingDeltaRun = false
): string {
  const passageList = dossier.passages
    .map((p) => `[${p.id}] (${p.section}, ${p.form}, filed ${p.filed}) ${p.title}: ${p.text}`)
    .join("\n");

  const priorSection =
    dossier.priorAssumptions.length > 0
      ? `\nPRIOR MODEL ASSUMPTIONS (${isFilingDeltaRun ? "WHAT CHANGED SINCE LAST MODEL — focus on deltas from new filings" : "reference"}):\n` +
        dossier.priorAssumptions
          .slice(0, 15)
          .map((n) => `- ${n.key}: ${n.value} (${n.source}: ${n.basis})`)
          .join("\n")
      : "";

  const y1 = baseline.projections[0];
  const y2 = baseline.projections[1];

  return `COMPANY: ${dossier.name} (${dossier.ticker}) | Template: ${dossier.templateId} | Currency: ${dossier.currency} | As-Of: ${dossier.asOf ?? "latest"}
RATES: Rf = ${(rates.riskFreeRate * 100).toFixed(2)}% (${rates.riskFreeSource}), ERP = ${(rates.equityRiskPremium * 100).toFixed(2)}% (${rates.erpSource})

BASELINE MECHANICAL MODEL:
- Base Period: ${baseline.base.periodId} | Value/Share: ${dossier.currency} ${baseline.valuation.valuePerShare.toFixed(2)} | WACC: ${(baseline.valuation.wacc * 100).toFixed(2)}%
- ${y1?.label ?? "Y1"}: Rev ${(y1?.revenue / 1e9).toFixed(2)}B (${(y1?.revenueGrowth * 100).toFixed(1)}%), EBIT Margin ${(y1?.ebitMargin * 100).toFixed(1)}%, EPS ${y1?.epsDiluted.toFixed(2)}
- ${y2?.label ?? "Y2"}: Rev ${(y2?.revenue / 1e9).toFixed(2)}B (${(y2?.revenueGrowth * 100).toFixed(1)}%), EBIT Margin ${(y2?.ebitMargin * 100).toFixed(1)}%, EPS ${y2?.epsDiluted.toFixed(2)}

ANNUAL HISTORY (CSV, money in millions):
${dossier.annualCsv}

RECENT QUARTERLY HISTORY (CSV, money in millions):
${dossier.quarterlyCsv}
${priorSection}

INDEXED CITABLE PASSAGES:
${passageList}

Review the baseline model and indexed passages. Call tools if you want to verify KPIs, guidance, or test overrides with run_model, then output your final JSON proposal.`;
}
