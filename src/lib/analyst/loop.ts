import { getCompanyFundamentals } from "../fundamentals";
import type { CompanyFundamentals } from "../fundamentals/types";
import { buildCompanyDossier, getPassagesBySection } from "../dossier/extract";
import type { FilingSectionKind } from "../dossier/types";
import { buildModelFromFundamentals } from "../model";
import {
  addUsage,
  createAnalystModel,
  emptyUsage,
  FredDamodaranRatesProvider,
  type AnalystMessage,
  type AnalystModel,
} from "../providers";
import {
  ANALYST_TOOL_DECLARATIONS,
  buildCompanyDossierPrompt,
  buildSharedAnalystSystemPrefix,
} from "./prompt";
import type { AnalystProposalPayload, AnalystRunResult, RunAnalystOptions } from "./types";
import { validateAnalystProposal } from "./validator";

function extractJsonObject(raw: string): AnalystProposalPayload {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Analyst response did not contain a valid JSON object.");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<AnalystProposalPayload>;
  return {
    thesisSummary: typeof parsed.thesisSummary === "string" ? parsed.thesisSummary : "Analyst model update.",
    overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
    keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks.map(String) : [],
    catalysts: Array.isArray(parsed.catalysts) ? parsed.catalysts.map(String) : [],
  };
}

/**
 * Core Phase 3c analyst loop operating on already-loaded fundamentals (used directly by
 * offline tests, backtests, and the ticker-based entrypoint).
 */
export async function runAnalystOnFundamentals(
  fundamentals: CompanyFundamentals,
  opts: RunAnalystOptions = {}
): Promise<AnalystRunResult> {
  const asOf = opts.asOf ?? fundamentals.history.asOf ?? null;
  const ratesProvider = opts.ratesProvider ?? new FredDamodaranRatesProvider();
  const rates = await ratesProvider.getRates(asOf);

  // Build mechanical baseline anchored to FRED 10Y Treasury + Damodaran implied ERP
  const rateValuationOverride = {
    riskFreeRate: rates.riskFreeRate,
    equityRiskPremium: rates.equityRiskPremium,
  };
  const rateRationale = {
    riskFreeRate: `${rates.riskFreeSource} (as of ${rates.asOf}).`,
    equityRiskPremium: `${rates.erpSource}.`,
  };

  const baseline = buildModelFromFundamentals(fundamentals, {
    currentPrice: opts.currentPrice ?? null,
    valuationDate: opts.valuationDate ?? asOf ?? undefined,
    overrides: {
      years: opts.years,
      valuation: rateValuationOverride,
      rationale: rateRationale,
    },
  });

  const dossier =
    opts.dossier ??
    buildCompanyDossier(fundamentals, {
      asOf,
      extraPassages: opts.extraPassages,
      priorAssumptions: opts.priorAssumptions,
    });

  const analystModel: AnalystModel =
    opts.analystModel ??
    createAnalystModel({
      apiKey: opts.apiKey,
    });

  const systemPrefix = buildSharedAnalystSystemPrefix();
  const messages: AnalystMessage[] = [
    {
      role: "user",
      content: buildCompanyDossierPrompt(dossier, baseline, rates, opts.isFilingDeltaRun ?? false),
    },
  ];

  const maxTurns = opts.maxTurns ?? 6;
  const toolCallsExecuted: { name: string; args: Record<string, unknown> }[] = [];
  let usage = emptyUsage();
  let lastProposal: AnalystProposalPayload = { thesisSummary: "Baseline model retained.", overrides: [] };
  let lastValidation = validateAnalystProposal(lastProposal, dossier);
  let turns = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    turns = turn + 1;
    const response = await analystModel.generate({
      systemPrefix,
      messages,
      tools: ANALYST_TOOL_DECLARATIONS,
      temperature: 0.2,
    });
    usage = addUsage(usage, response.usage);

    if (response.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: response.text,
        toolCalls: response.toolCalls,
      });

      for (const tc of response.toolCalls) {
        toolCallsExecuted.push({ name: tc.name, args: tc.args });
        let toolOutput: unknown;
        try {
          if (tc.name === "get_filing_section") {
            const section = String(tc.args.section ?? "financials") as FilingSectionKind;
            toolOutput = { section, passages: getPassagesBySection(dossier, section) };
          } else if (tc.name === "get_kpi_history") {
            const metricFilter = typeof tc.args.metric === "string" ? tc.args.metric : null;
            toolOutput = {
              kpis: metricFilter ? dossier.kpis.filter((k) => k.metric === metricFilter) : dossier.kpis,
              segments: dossier.segments,
            };
          } else if (tc.name === "get_guidance") {
            toolOutput = { guidance: dossier.guidance, asOf: dossier.asOf };
          } else if (tc.name === "run_model") {
            const candidate = buildModelFromFundamentals(fundamentals, {
              currentPrice: opts.currentPrice ?? null,
              valuationDate: opts.valuationDate ?? asOf ?? undefined,
              overrides: {
                years: opts.years,
                drivers: tc.args.drivers as Record<string, number | number[]> | undefined,
                valuation: {
                  ...rateValuationOverride,
                  ...(tc.args.valuation as Record<string, number> | undefined),
                },
                rationale: rateRationale,
              },
            });
            toolOutput = {
              valuePerShare: Number(candidate.valuation.valuePerShare.toFixed(2)),
              probabilityWeightedValue: Number(candidate.probabilityWeightedValue.toFixed(2)),
              wacc: Number(candidate.valuation.wacc.toFixed(4)),
              y1: {
                period: candidate.projections[0]?.label,
                revenue: Math.round(candidate.projections[0]?.revenue ?? 0),
                ebitMargin: Number((candidate.projections[0]?.ebitMargin ?? 0).toFixed(4)),
                epsDiluted: Number((candidate.projections[0]?.epsDiluted ?? 0).toFixed(3)),
              },
              checks: candidate.checks.filter((c) => c.status !== "pass"),
            };
          } else {
            toolOutput = { error: `Unknown tool: ${tc.name}` };
          }
        } catch (err) {
          toolOutput = { error: err instanceof Error ? err.message : String(err) };
        }

        messages.push({
          role: "tool",
          toolCallId: tc.id,
          toolName: tc.name,
          content: JSON.stringify(toolOutput),
        });
      }
      continue;
    }

    // Final JSON proposal turn
    messages.push({ role: "assistant", content: response.text });
    try {
      lastProposal = extractJsonObject(response.text);
      lastValidation = validateAnalystProposal(lastProposal, dossier);
      if (lastValidation.valid) {
        break;
      }
      // Feed validation errors back to the analyst for self-correction if turns remain
      if (turn < maxTurns - 1) {
        messages.push({
          role: "user",
          content:
            `Your proposal failed validation:\n` +
            lastValidation.errors.map((e) => `- [${e.code}] ${e.key}: ${e.message}`).join("\n") +
            `\nPlease fix these issues (ensure every citationId matches an indexed passage in the dossier and values are within bounds) and return corrected JSON only.`,
        });
      }
    } catch (err) {
      if (turn < maxTurns - 1) {
        messages.push({
          role: "user",
          content: `Could not parse your JSON proposal (${err instanceof Error ? err.message : String(err)}). Return valid JSON only matching the required schema.`,
        });
      }
    }
  }

  // Deterministically compute the final model using validated overrides + FRED/Damodaran rates
  const mergedOverrides = {
    years: opts.years,
    drivers: lastValidation.acceptedOverrides.drivers,
    financing: lastValidation.acceptedOverrides.financing,
    valuation: {
      ...rateValuationOverride,
      ...lastValidation.acceptedOverrides.valuation,
    },
    rationale: {
      ...rateRationale,
      ...lastValidation.acceptedOverrides.rationale,
    },
  };

  const finalModel = buildModelFromFundamentals(fundamentals, {
    currentPrice: opts.currentPrice ?? null,
    valuationDate: opts.valuationDate ?? asOf ?? undefined,
    overrides: mergedOverrides,
  });

  return {
    model: finalModel,
    baselineValuePerShare: baseline.valuation.valuePerShare,
    rates,
    thesisSummary: lastProposal.thesisSummary,
    keyRisks: lastProposal.keyRisks ?? [],
    catalysts: lastProposal.catalysts ?? [],
    citations: lastValidation.resolvedCitations,
    validation: lastValidation,
    toolCallsExecuted,
    turns,
    usage,
    provider: analystModel.providerId,
    modelName: analystModel.modelName,
  };
}

/** Fetch SEC fundamentals and run the Phase 3 analyst loop. */
export async function runCompanyAnalyst(
  ticker: string,
  opts: RunAnalystOptions = {}
): Promise<AnalystRunResult> {
  const fundamentals = await getCompanyFundamentals(ticker, {
    asOf: opts.asOf ?? undefined,
    maxAnnualPeriods: 10,
    maxQuarterlyPeriods: 12,
  });
  return runAnalystOnFundamentals(fundamentals, opts);
}
