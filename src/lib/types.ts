export type RiskProfile = "conservative" | "balanced" | "aggressive";

export type AgentRole = "extractor" | "bull" | "bear" | "cio";

export type ActionRating =
  | "STRONG BUY"
  | "BUY"
  | "HOLD"
  | "TRIM"
  | "AVOID";

export interface Holding {
  ticker: string;
  name: string;
  sector:
    | "Technology"
    | "Mining & Materials"
    | "Energy"
    | "Financials"
    | "Healthcare"
    | "Industrials"
    | "Fixed Income"
    | "Consumer";
  weightPct: number;
  currentPrice: number;
  beta: number;
  expectedAnnualReturnPct: number;
  annualVolatilityPct: number;
  dividendYieldPct?: number;
}

export interface DcfInputs {
  ticker: string;
  currentPrice: number;
  sharesOutstandingBillions: number;
  baseFreeCashFlowBillions: number;
  revenueGrowthYear1To5Pct: number;
  waccPct: number;
  terminalGrowthPct: number;
  netDebtBillions: number;
}

export interface DcfSensitivityCell {
  waccPct: number;
  terminalGrowthPct: number;
  impliedSharePrice: number;
  upsidePct: number;
}

export interface DcfResult {
  ticker: string;
  currentPrice: number;
  impliedSharePrice: number;
  upsidePct: number;
  enterpriseValueBillions: number;
  equityValueBillions: number;
  pvOfCashFlowsBillions: number;
  pvOfTerminalValueBillions: number;
  waccPct: number;
  terminalGrowthPct: number;
  sensitivityGrid: DcfSensitivityCell[];
}

export interface MonteCarloPoint {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  contributed: number;
}

export interface MonteCarloResult {
  initialCapital: number;
  monthlyContribution: number;
  horizonYears: number;
  expectedReturnPct: number;
  volatilityPct: number;
  simulations: number;
  medianEndingValue: number;
  downsideP10Value: number;
  upsideP90Value: number;
  probabilityOfDoublingPct: number;
  probabilityOfLossPct: number;
  trajectory: MonteCarloPoint[];
}

export interface MacroShockScenarioResult {
  id: string;
  name: string;
  description: string;
  portfolioImpactPct: number;
  dollarImpact: number;
  worstHitHolding: string;
  bestHedgeHolding: string;
  recommendedHedge: string;
}

export interface PortfolioMetrics {
  totalCapital: number;
  weightedBeta: number;
  expectedAnnualReturnPct: number;
  annualVolatilityPct: number;
  sharpeRatio: number;
  estimatedMaxDrawdownPct: number;
  concentrationHhi: number;
  concentrationLabel: "Diversified" | "Moderate" | "Concentrated";
  weightedDividendYieldPct: number;
  sectorBreakdown: { sector: string; weightPct: number }[];
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  resultSummary: string;
  durationMs: number;
}

export interface AgentDebateTurn {
  id: string;
  role: AgentRole;
  agentName: string;
  title: string;
  timestamp: string;
  status: "running" | "complete";
  summary: string;
  keyPoints: string[];
  toolCalls: ToolCallRecord[];
  confidencePct?: number;
}

export interface RebalanceAction {
  ticker: string;
  action: "ADD" | "HOLD" | "TRIM" | "HEDGE";
  targetWeightPct: number;
  rationale: string;
}

export interface CioInvestmentMemo {
  headline: string;
  rating: ActionRating;
  convictionScore: number;
  executiveSummary: string;
  valuationVerdict: string;
  bullThesisHighlights: string[];
  bearRiskFlags: string[];
  catalysts: string[];
  rebalancePlan: RebalanceAction[];
  timeHorizonNote: string;
}

export interface AnalysisRequestPayload {
  title: string;
  thesisPrompt: string;
  capital: number;
  monthlyContribution: number;
  horizonYears: number;
  riskProfile: RiskProfile;
  holdings: Holding[];
  dcfInputs: DcfInputs;
  attachmentBase64?: string;
  attachmentMimeType?: string;
  attachmentName?: string;
  forceDemoMode?: boolean;
}

export interface CompleteAnalysisResult {
  id: string;
  createdAt: string;
  mode: "live-gemini" | "demo-simulation";
  modelUsed: string;
  title: string;
  request: AnalysisRequestPayload;
  portfolioMetrics: PortfolioMetrics;
  dcfResult: DcfResult;
  monteCarlo: MonteCarloResult;
  macroShocks: MacroShockScenarioResult[];
  debateTurns: AgentDebateTurn[];
  cioMemo: CioInvestmentMemo;
}

export type StreamEvent =
  | { type: "status"; message: string; mode: "live-gemini" | "demo-simulation"; model: string }
  | { type: "quant_ready"; portfolioMetrics: PortfolioMetrics; dcfResult: DcfResult; monteCarlo: MonteCarloResult; macroShocks: MacroShockScenarioResult[] }
  | { type: "agent_turn"; turn: AgentDebateTurn }
  | { type: "cio_memo"; memo: CioInvestmentMemo }
  | { type: "complete"; result: CompleteAnalysisResult }
  | { type: "error"; message: string };
