import { lookupCitation } from "../dossier/extract";
import type { CompanyDossier } from "../dossier/types";
import { templateConfig } from "../model/templates";
import { DRIVER_KEYS, type AssumptionOverrides, type DriverInput, type DriverKey } from "../model/types";
import type {
  AnalystProposalPayload,
  AnalystValidationResult,
  ResolvedCitation,
  ValidationIssue,
} from "./types";

const FINANCING_KEYS = new Set(["interestRateOnDebt", "interestRateOnCash", "minCashPctRevenue", "debtChange"]);
const VALUATION_KEYS = new Set([
  "riskFreeRate",
  "equityRiskPremium",
  "unleveredBeta",
  "targetDebtWeight",
  "preTaxCostOfDebt",
  "terminalGrowth",
  "terminalRonic",
  "waccOverride",
]);

function asArray(v: DriverInput): number[] {
  return Array.isArray(v) ? v : [v];
}

function sectorBoundsForKey(key: string, templateId: CompanyDossier["templateId"]): [number, number] {
  const cfg = templateConfig(templateId);
  switch (key) {
    case "revenueGrowth":
      return [-0.5, 1.0];
    case "ebitMargin":
      return cfg.ebitMarginBounds;
    case "grossMargin":
      return [-0.2, 0.98];
    case "daPctRevenue":
      return [0, 0.45];
    case "capexPctRevenue":
      return [0, 0.65];
    case "sbcPctRevenue":
      return [0, 0.35];
    case "taxRate":
      return [0, 0.45];
    case "dso":
    case "dio":
    case "dpo":
      return [0, 365];
    case "dividendPayout":
    case "buybackPctOfFcf":
      return [0, 2.5];
    case "shareCountChange":
      return [-0.15, 0.25];
    case "terminalGrowth":
      return [0, 0.045];
    case "terminalRonic":
      return [0.03, 0.5];
    case "unleveredBeta":
      return [0.2, 2.5];
    case "targetDebtWeight":
      return [0, 0.8];
    case "preTaxCostOfDebt":
    case "interestRateOnDebt":
    case "interestRateOnCash":
    case "minCashPctRevenue":
      return [0, 0.25];
    case "waccOverride":
      return [0.04, 0.2];
    default:
      return [-1e12, 1e12];
  }
}

/**
 * Validates an analyst override proposal against the company dossier and sector guardrails.
 * - Rejects uncited assumptions or unresolvable citations.
 * - Rejects any citation whose filing date exceeds dossier.asOf (zero look-ahead).
 * - Rejects unknown keys or out-of-sector-bounds values.
 * - Flags any override that diverges materially from dated guidance without a stated divergenceReason.
 */
export function validateAnalystProposal(
  proposal: AnalystProposalPayload,
  dossier: CompanyDossier
): AnalystValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const resolvedCitations: ResolvedCitation[] = [];

  const drivers: AssumptionOverrides["drivers"] = {};
  const financing: AssumptionOverrides["financing"] = {};
  const valuation: AssumptionOverrides["valuation"] = {};
  const rationale: Record<string, string> = {};

  for (const item of proposal.overrides ?? []) {
    const { key, value, citationId, rationale: why, divergenceReason } = item;

    const isDriver = (DRIVER_KEYS as readonly string[]).includes(key);
    const isFinancing = FINANCING_KEYS.has(key);
    const isValuation = VALUATION_KEYS.has(key);

    if (!isDriver && !isFinancing && !isValuation) {
      errors.push({
        severity: "error",
        key,
        code: "UNKNOWN_KEY",
        message: `Override key "${key}" is not a valid model driver, financing, or valuation parameter.`,
      });
      continue;
    }

    // 1. Citation presence & resolution
    if (!citationId || !citationId.trim()) {
      errors.push({
        severity: "error",
        key,
        code: "MISSING_CITATION",
        message: `Override "${key}" has no citationId. Every analyst assumption must cite a dossier passage.`,
      });
      continue;
    }

    const passage = lookupCitation(dossier, citationId.trim());
    if (!passage) {
      errors.push({
        severity: "error",
        key,
        code: "UNRESOLVED_CITATION",
        message: `Override "${key}" cites "${citationId}", which does not exist in the dossier.`,
      });
      continue;
    }

    // 2. Point-in-time look-ahead check
    if (dossier.asOf && passage.filed > dossier.asOf) {
      errors.push({
        severity: "error",
        key,
        code: "LOOKAHEAD_VIOLATION",
        message: `Override "${key}" cites "${citationId}" filed ${passage.filed}, after asOf ${dossier.asOf}.`,
      });
      continue;
    }

    // 3. Sector bounds check
    const nums = asArray(value);
    const [lo, hi] = sectorBoundsForKey(key, dossier.templateId);
    if (
      nums.length === 0 ||
      nums.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < lo || n > hi)
    ) {
      errors.push({
        severity: "error",
        key,
        code: "OUT_OF_SECTOR_BOUNDS",
        message: `Override "${key}" value ${JSON.stringify(value)} falls outside ${dossier.templateId} bounds [${lo}, ${hi}].`,
      });
      continue;
    }

    // 4. Guidance divergence check
    const matchingGuidance = dossier.guidance
      .filter((g) => g.metric === key && g.unit === "decimal")
      .sort((a, b) => b.filed.localeCompare(a.filed))[0];

    if (matchingGuidance) {
      const y1Val = nums[0];
      const gLow = matchingGuidance.low ?? matchingGuidance.point ?? null;
      const gHigh = matchingGuidance.high ?? matchingGuidance.point ?? null;
      const outsideLow = gLow !== null && y1Val < gLow - 0.02;
      const outsideHigh = gHigh !== null && y1Val > gHigh + 0.02;
      if ((outsideLow || outsideHigh) && (!divergenceReason || !divergenceReason.trim())) {
        warnings.push({
          severity: "warning",
          key,
          code: "UNEXPLAINED_GUIDANCE_DIVERGENCE",
          message: `Override "${key}" Year-1 value (${(y1Val * 100).toFixed(1)}%) diverges >200bps from guidance ${matchingGuidance.id} (${gLow !== null ? (gLow * 100).toFixed(1) : "?"}%–${gHigh !== null ? (gHigh * 100).toFixed(1) : "?"}%) without a stated divergenceReason.`,
        });
      }
    }

    // Accept override
    const fullNote = `[${passage.id} · ${passage.form} ${passage.filed}] ${why}${divergenceReason ? ` (Guidance divergence: ${divergenceReason})` : ""}`;
    rationale[key] = fullNote;

    if (isDriver) {
      drivers[key as DriverKey] = value;
    } else if (isFinancing) {
      if (key === "debtChange") financing.debtChange = value;
      else (financing as Record<string, number>)[key] = nums[0];
    } else if (isValuation) {
      (valuation as Record<string, number>)[key] = nums[0];
    }

    resolvedCitations.push({
      key,
      citationId: passage.id,
      rationale: why,
      divergenceReason,
      passage,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resolvedCitations,
    acceptedOverrides: {
      drivers: Object.keys(drivers).length > 0 ? drivers : undefined,
      financing: Object.keys(financing).length > 0 ? financing : undefined,
      valuation: Object.keys(valuation).length > 0 ? valuation : undefined,
      rationale: Object.keys(rationale).length > 0 ? rationale : undefined,
    },
  };
}
