import type { TemplateId } from "../fundamentals/sector";

/**
 * Three-statement company model types.
 *
 * Drivers are per-forecast-year paths (index 0 = first forecast fiscal year). Rates are
 * decimals (0.05 = 5%); days are days; money is in the company's reporting currency units.
 */

/** A driver value: one number for every year, or an explicit per-year path (last value extends). */
export type DriverInput = number | number[];

export const DRIVER_KEYS = [
  "revenueGrowth",
  "ebitMargin",
  "grossMargin",
  "daPctRevenue",
  "capexPctRevenue",
  "sbcPctRevenue",
  "taxRate",
  "dso",
  "dio",
  "dpo",
  "dividendPayout",
  "buybackPctOfFcf",
  "shareCountChange",
] as const;
export type DriverKey = (typeof DRIVER_KEYS)[number];

export type DriverPaths = Record<DriverKey, number[]>;

export interface FinancingAssumptions {
  /** Pre-tax rate on average gross debt. */
  interestRateOnDebt: number;
  /** Rate earned on average cash. */
  interestRateOnCash: number;
  /** Cash floor as a share of revenue; shortfalls draw on a revolver. */
  minCashPctRevenue: number;
  /** Scheduled change in gross debt per year (negative = repayment). */
  debtChange: number[];
}

export interface ValuationAssumptions {
  riskFreeRate: number;
  equityRiskPremium: number;
  unleveredBeta: number;
  /** Used for WACC weights when no share price is supplied. */
  targetDebtWeight: number;
  preTaxCostOfDebt: number;
  terminalGrowth: number;
  /** Return on new invested capital in the terminal period (value-driver formula). */
  terminalRonic: number;
  /** "expense": SBC is a real cost (not added back to FCFF). "addback": treat as non-cash. */
  sbcTreatment: "expense" | "addback";
  /** Explicit WACC override; when set, CAPM inputs are ignored. */
  waccOverride?: number;
}

export interface ModelAssumptions {
  years: number;
  drivers: DriverPaths;
  financing: FinancingAssumptions;
  valuation: ValuationAssumptions;
}

/** Why each assumption has the value it has. Every baseline and override is recorded here. */
export interface AssumptionNote {
  key: string;
  value: string;
  basis: string;
  source: "baseline" | "template" | "override";
}

/** Partial overrides, as supplied by a user or (in Phase 3) the LLM analyst. */
export interface AssumptionOverrides {
  years?: number;
  drivers?: Partial<Record<DriverKey, DriverInput>>;
  financing?: Partial<Omit<FinancingAssumptions, "debtChange">> & { debtChange?: DriverInput };
  valuation?: Partial<ValuationAssumptions>;
  /** Free-text rationale per key, carried into the assumption notes. */
  rationale?: Record<string, string>;
}

export interface BaseYear {
  fiscalYear: number;
  periodId: string;
  end: string;
  revenue: number;
  cogs: number | null;
  ebit: number;
  cash: number;
  receivables: number;
  inventory: number;
  ppe: number;
  otherAssets: number;
  payables: number;
  debt: number;
  otherLiabilities: number;
  equity: number;
  dilutedShares: number;
}

export interface ProjectedYear {
  fiscalYear: number;
  label: string;
  start: string;
  end: string;
  // Income statement
  revenue: number;
  revenueGrowth: number;
  cogs: number | null;
  grossProfit: number | null;
  ebit: number;
  ebitMargin: number;
  depreciationAmortization: number;
  ebitda: number;
  stockBasedCompensation: number;
  interestExpense: number;
  interestIncome: number;
  pretaxIncome: number;
  incomeTax: number;
  netIncome: number;
  dilutedShares: number;
  epsDiluted: number;
  dividends: number;
  shareRepurchases: number;
  // Balance sheet
  cash: number;
  receivables: number;
  inventory: number;
  ppe: number;
  otherAssets: number;
  totalAssets: number;
  payables: number;
  debt: number;
  /** Revolver outstanding at year end (included in debt). */
  revolverBalance: number;
  otherLiabilities: number;
  equity: number;
  totalLiabilitiesAndEquity: number;
  // Cash flow
  changeInNwc: number;
  operatingCashFlow: number;
  capex: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netChangeInCash: number;
  freeCashFlow: number;
  /** Unlevered free cash flow used in the DCF. */
  fcff: number;
  // Integrity
  balanceDifference: number;
}

export interface SensitivityCell {
  wacc: number;
  terminalGrowth: number;
  valuePerShare: number;
}

export interface DcfValuation {
  wacc: number;
  costOfEquity: number;
  leveredBeta: number;
  afterTaxCostOfDebt: number;
  debtWeight: number;
  pvExplicit: number;
  pvTerminal: number;
  terminalValue: number;
  terminalShareOfEv: number;
  impliedExitEvEbitda: number;
  enterpriseValue: number;
  netDebt: number;
  minorityAndOther: number;
  equityValue: number;
  sharesForValuation: number;
  valuePerShare: number;
  currentPrice: number | null;
  upside: number | null;
  valuationDate: string;
  sensitivity: SensitivityCell[];
}

export type ScenarioName = "bear" | "base" | "bull";

export interface ScenarioResult {
  name: ScenarioName;
  probability: number;
  description: string;
  valuePerShare: number;
  revenueFinalYear: number;
  ebitMarginFinalYear: number;
  wacc: number;
}

export interface QuarterlyOutlook {
  periodId: string;
  revenue: number;
  epsDiluted: number;
  actual: boolean;
}

export interface ModelCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface CompanyModel {
  ticker: string;
  name: string;
  templateId: TemplateId;
  currency: string;
  asOf: string | null;
  base: BaseYear;
  history: { periodId: string; revenue: number; ebit: number | null; netIncome: number | null; epsDiluted: number | null }[];
  assumptions: ModelAssumptions;
  notes: AssumptionNote[];
  projections: ProjectedYear[];
  quarterlyOutlook: QuarterlyOutlook[];
  valuation: DcfValuation;
  scenarios: ScenarioResult[];
  probabilityWeightedValue: number;
  checks: ModelCheck[];
  warnings: string[];
}
