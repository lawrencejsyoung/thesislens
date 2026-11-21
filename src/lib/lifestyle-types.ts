export type DemographicId =
  | "individual"
  | "couple"
  | "business_owner"
  | "doctor"
  | "executive"
  | "retiree"
  | "hnw_family"
  | "young_professional";

export type PlanningJurisdiction = "Canada" | "United States";

export type RiskProfile = "conservative" | "balanced" | "growth" | "aggressive";

export type MilestoneCategory =
  | "real_estate"
  | "education"
  | "lifestyle"
  | "business"
  | "healthcare"
  | "legacy"
  | "sabbatical";

export interface LifestyleMilestone {
  id: string;
  title: string;
  category: MilestoneCategory;
  age: number;
  amount: number; // Positive = cash outflow (expense), Negative = cash inflow (e.g., business exit, inheritance)
  durationYears?: number; // Default 1 (one-time)
  enabled: boolean;
  priority: "essential" | "important" | "aspirational";
}

export interface DemographicSpecificInputs {
  // Business Owner
  businessValuation?: number;
  businessExitAge?: number;
  corporateRetainedEarnings?: number;
  salaryDividendSplitPct?: number; // % taken as salary vs dividend
  // Doctor / Medical Professional
  medicalSchoolDebt?: number;
  practiceBuyInAge?: number;
  ownOccDisabilityCoveragePct?: number; // % of after-tax income covered
  partTimeTransitionAge?: number;
  // Corporate Executive
  annualEquityVest?: number;
  concentratedStockPct?: number;
  // Retiree / Pre-Retiree
  govPensionAnnual?: number; // CPP+OAS or Social Security combined
  govPensionStartAge?: number;
  longTermCareAnnualBudget?: number;
  // HNW / Multi-Gen
  philanthropyAnnual?: number;
  trustStructureActive?: boolean;
  // Couple / Family
  dependentsCount?: number;
  childcareAnnual?: number;
  // Individual / Young Prof
  studentLoanBalance?: number;
  sabbaticalTargetAge?: number;
}

export interface LifestylePlanInputs {
  clientName: string;
  demographic: DemographicId;
  jurisdiction: PlanningJurisdiction;
  currentAge: number;
  partnerAge?: number;
  retirementAge: number;
  lifeExpectancy: number;
  riskProfile: RiskProfile;

  // Annual Incomes (Gross, today's dollars)
  primaryIncome: number;
  partnerIncome: number;
  passiveOrBusinessIncome: number;
  annualIncomeGrowthPct: number;

  // Annual Spending (After-tax, today's dollars)
  essentialAnnualSpend: number;
  discretionaryAnnualSpend: number; // Travel, dining, hobbies, luxury
  healthcareAnnualSpend: number;
  annualDebtService: number;
  inflationRatePct: number;
  retirementSpendRatioPct: number; // e.g., 80% of pre-retirement spend

  // Balance Sheet (Today's dollars)
  taxDeferredAssets: number; // RRSP / 401(k) / IPP
  taxFreeAssets: number; // TFSA / Roth IRA / HSA
  taxableAndCorpAssets: number; // Non-registered / HoldCo / Brokerage
  cashEmergencyFund: number;
  illiquidEquityAssets: number; // Home equity, business equity, private real estate
  totalLiabilities: number;

  // Annual Contributions (Pre-retirement)
  annualSavingsContribution: number;

  // Protection & Readiness Flags
  hasDisabilityInsurance: boolean;
  hasLifeInsurance: boolean;
  hasEstateWillAndPoa: boolean;
  hasUmbrellaOrMalpractice: boolean;

  // Demographic-specific levers
  specifics: DemographicSpecificInputs;

  // Life Milestones
  milestones: LifestyleMilestone[];
}

export interface YearlyProjectionPoint {
  year: number;
  age: number;
  phase: "Accumulation" | "Transition" | "Go-Go Retirement" | "Slow-Go Retirement" | "No-Go / Care";
  grossIncome: number;
  estimatedTax: number;
  netIncome: number;
  lifestyleSpend: number;
  milestoneCashFlow: number; // Net cash outflow (+) or inflow (-)
  netSavingsOrWithdrawal: number;
  liquidPortfolio: number;
  illiquidAssets: number;
  totalNetWorth: number;
  p10Portfolio: number;
  p50Portfolio: number;
  p90Portfolio: number;
  milestoneLabels: string[];
}

export interface ReadinessPillar {
  id: string;
  label: string;
  score: number; // 0 - 100
  status: "strong" | "watch" | "action_needed";
  detail: string;
}

export interface RiskChecklistItem {
  id: string;
  category: string;
  title: string;
  status: "covered" | "gap" | "review";
  priority: "critical" | "high" | "medium";
  recommendation: string;
}

export interface TaxWaterfallStep {
  order: number;
  vehicle: string;
  role: string;
  rationale: string;
}

export interface StressTestScenario {
  id: string;
  name: string;
  description: string;
  successRatePct: number;
  deltaSuccessPct: number;
  terminalMedianLiquid: number;
  deltaTerminalWealth: number;
  impactSeverity: "low" | "moderate" | "severe";
}

export interface MilestoneFundingStatus {
  id: string;
  title: string;
  age: number;
  totalCost: number; // positive = outflow, negative = inflow
  priority: "essential" | "important" | "aspirational";
  category: MilestoneCategory;
  projectedLiquidAtAge: number;
  fundedStatus: "fully_funded" | "inflow_event" | "tight" | "at_risk";
}

export interface LifestylePlanResult {
  inputs: LifestylePlanInputs;
  kpis: {
    successProbabilityPct: number;
    readinessScore: number; // 0-100
    projectedLiquidAtRetirement: number;
    projectedNetWorthAtRetirement: number;
    terminalMedianLiquid: number;
    safeAnnualLifestyleSpend: number;
    currentAnnualLifestyleSpend: number;
    lifestyleSpendGap: number; // positive = surplus capacity, negative = overspending
    financialIndependenceAge: number | null;
    effectiveTaxRatePct: number;
    savingsRatePct: number;
    emergencyRunwayMonths: number;
    debtToIncomePct: number;
    expectedReturnPct: number;
    portfolioVolatilityPct: number;
  };
  cashFlowBreakdown: {
    grossIncome: number;
    taxes: number;
    essentialSpend: number;
    discretionarySpend: number;
    healthcareSpend: number;
    debtService: number;
    savingsAndSurplus: number;
  };
  projections: YearlyProjectionPoint[];
  readinessPillars: ReadinessPillar[];
  riskChecklist: RiskChecklistItem[];
  taxWaterfall: {
    accumulationOrder: TaxWaterfallStep[];
    decumulationOrder: TaxWaterfallStep[];
  };
  milestoneStatuses: MilestoneFundingStatus[];
  stressTests: StressTestScenario[];
}

export interface AdvisorBriefResponse {
  mode: "live-gemini" | "deterministic-cfp";
  modelUsed: string;
  headline: string;
  executiveSummary: string;
  demographicPlaybook: string[];
  lifestyleTradeoffs: string[];
  actionPlan90Days: {
    step: string;
    owner: "Advisor" | "Client" | "CPA / Tax" | "Estate / Legal";
    impact: string;
  }[];
  clientMeetingQuestions: string[];
}

export interface DemographicMeta {
  id: DemographicId;
  label: string;
  shortLabel: string;
  tagline: string;
  typicalAum: string;
  keyFocusAreas: string[];
  accentColor: string;
  defaultProfile: LifestylePlanInputs;
}
