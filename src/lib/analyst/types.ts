import type { CompanyDossier, DossierPassage } from "../dossier/types";
import type { AssumptionOverrides, CompanyModel, DriverInput, DriverKey } from "../model/types";
import type { AnalystModel, AnalystUsage, RatesProvider, RatesSnapshot } from "../providers/types";

export interface CitedOverrideItem {
  /** Driver key (e.g. "revenueGrowth", "ebitMargin") or valuation/financing key (e.g. "terminalGrowth"). */
  key: string;
  /** Numeric value or per-year path (decimals for rates, days for DSO/DIO/DPO). */
  value: DriverInput;
  /** Must resolve to a DossierPassage.id in the company dossier. */
  citationId: string;
  /** Concise analyst rationale explaining how the cited passage justifies the assumption. */
  rationale: string;
  /** Required when the proposed value materially diverges from dated guidance in the dossier. */
  divergenceReason?: string;
}

export interface AnalystProposalPayload {
  thesisSummary: string;
  overrides: CitedOverrideItem[];
  keyRisks?: string[];
  catalysts?: string[];
}

export interface ResolvedCitation {
  key: string;
  citationId: string;
  rationale: string;
  divergenceReason?: string;
  passage: DossierPassage;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  key: string;
  code:
    | "MISSING_CITATION"
    | "UNRESOLVED_CITATION"
    | "LOOKAHEAD_VIOLATION"
    | "UNKNOWN_KEY"
    | "OUT_OF_SECTOR_BOUNDS"
    | "UNEXPLAINED_GUIDANCE_DIVERGENCE";
  message: string;
}

export interface AnalystValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  resolvedCitations: ResolvedCitation[];
  /** Validated Phase 2 AssumptionOverrides ready for buildModelFromFundamentals. */
  acceptedOverrides: AssumptionOverrides;
}

export interface RunAnalystOptions {
  currentPrice?: number | null;
  asOf?: string | null;
  years?: number;
  valuationDate?: string;
  /** Custom AnalystModel (e.g. RecordedAnalystModel in tests or GeminiAnalystModel in prod). */
  analystModel?: AnalystModel;
  /** Custom RatesProvider (defaults to FredDamodaranRatesProvider). */
  ratesProvider?: RatesProvider;
  /** Pre-built dossier (optional; otherwise constructed from fundamentals). */
  dossier?: CompanyDossier;
  /** Extra dossier inputs (guidance, MD&A passages, prior model assumptions). */
  extraPassages?: DossierPassage[];
  priorAssumptions?: CompanyDossier["priorAssumptions"];
  /** "what changed since last model" mode for Phase 4 filing-triggered refreshes. */
  isFilingDeltaRun?: boolean;
  /** Max tool-use / validation retry turns (default 6). */
  maxTurns?: number;
  /** Optional API key override for Gemini. */
  apiKey?: string;
}

export interface AnalystRunResult {
  model: CompanyModel;
  baselineValuePerShare: number;
  rates: RatesSnapshot;
  thesisSummary: string;
  keyRisks: string[];
  catalysts: string[];
  citations: ResolvedCitation[];
  validation: AnalystValidationResult;
  toolCallsExecuted: { name: string; args: Record<string, unknown> }[];
  turns: number;
  usage: AnalystUsage;
  provider: string;
  modelName: string;
}

export type AnalystDriverKey = DriverKey;
