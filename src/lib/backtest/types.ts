import type { TemplateId } from "../fundamentals/sector";

export type ForecasterName = "naive" | "baseline" | "analyst";

export interface ForecastPoint {
  revenue: number;
  epsDiluted: number;
}

export interface QuarterBacktestRow {
  ticker: string;
  templateId: TemplateId;
  targetPeriodId: string;
  /** Day before the target quarter's earnings release / filing date. */
  asOf: string;
  actualRevenue: number;
  actualEps: number;
  priorYearRevenue: number | null;
  priorYearEps: number | null;
  forecasts: Record<ForecasterName, ForecastPoint>;
  revenueApe: Record<ForecasterName, number>;
  epsApe: Record<ForecasterName, number>;
  citationsChecked: number;
  citationsValidBeforeAsOf: number;
  lookAheadViolations: string[];
}

export interface ForecasterMetrics {
  count: number;
  medianRevenueApe: number;
  medianEpsApe: number;
  revenueDirectionalHitRate: number;
  epsDirectionalHitRate: number;
}

export interface TemplateScorecard {
  templateId: TemplateId;
  naive: ForecasterMetrics;
  baseline: ForecasterMetrics;
  analyst: ForecasterMetrics;
  analystBeatsNaiveRevenue: boolean;
  analystBeatsBaselineEps: boolean;
}

export interface LookAheadAudit {
  totalCitations: number;
  validCitations: number;
  /** 1.0 = 100% clean (required by Phase 5 gate). */
  cleanRate: number;
  violations: string[];
}

export interface BacktestGateResult {
  passed: boolean;
  templatesBeatingNaiveRevenue: number;
  totalTemplatesEvaluated: number;
  requiredTemplatesToBeat: number;
  analystBeatsBaselineEpsOverall: boolean;
  lookAheadCleanRate: number;
  reasons: string[];
}

export interface BacktestReport {
  generatedAt: string;
  companiesEvaluated: number;
  quartersEvaluated: number;
  overall: Record<ForecasterName, ForecasterMetrics>;
  byTemplate: TemplateScorecard[];
  lookAheadAudit: LookAheadAudit;
  gate: BacktestGateResult;
  rows: QuarterBacktestRow[];
}
