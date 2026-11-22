import type { TemplateId } from "../fundamentals/sector";
import type { AssumptionNote } from "../model/types";

export type FilingSectionKind = "mda" | "segments" | "risk_factors" | "guidance" | "financials";

export interface DossierPassage {
  /** Stable citation identifier referenced by the analyst (e.g. "FIN-FY2026", "GUID-2026Q3-1"). */
  id: string;
  section: FilingSectionKind;
  title: string;
  /** Filing date (YYYY-MM-DD). Strictly checked against asOf for zero look-ahead. */
  filed: string;
  form: string;
  accn?: string;
  text: string;
}

export interface SegmentRow {
  periodId: string;
  segment: string;
  revenue: number;
  operatingIncome?: number | null;
  filed: string;
  source: string;
}

export interface KpiPoint {
  periodId: string;
  metric: string;
  value: number;
  unit: string;
  filed: string;
  source: string;
}

export interface GuidanceItem {
  id: string;
  /** Target fiscal period (e.g. "FY2027", "FY2027Q1"). */
  targetPeriod: string;
  metric: "revenueGrowth" | "revenue" | "ebitMargin" | "grossMargin" | "epsDiluted" | "capexPctRevenue" | "taxRate";
  low?: number | null;
  high?: number | null;
  point?: number | null;
  unit: "decimal" | "currency" | "per_share";
  quote: string;
  filed: string;
  form: string;
  accn?: string;
}

export interface CompanyDossier {
  ticker: string;
  name: string;
  cik: number;
  templateId: TemplateId;
  currency: string;
  asOf: string | null;
  /** Compact CSV of annual and recent quarterly history. */
  annualCsv: string;
  quarterlyCsv: string;
  /** Validated segment breakdown (rejected if segments fail to reconcile to reported revenue). */
  segments: SegmentRow[];
  segmentWarnings: string[];
  /** Operating KPI series. */
  kpis: KpiPoint[];
  /** Dated guidance log (filtered by filed <= asOf). */
  guidance: GuidanceItem[];
  /** Prior model's assumption notes (if re-modelling on a new filing). */
  priorAssumptions: AssumptionNote[];
  /** Indexed filing & data passages that analyst overrides may cite. */
  passages: DossierPassage[];
  /** Approximate token count of the compact pack. */
  estimatedTokens: number;
}
