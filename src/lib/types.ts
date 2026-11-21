export type RiskProfile = "conservative" | "balanced" | "aggressive";

export type Jurisdiction = "Canada" | "US" | "Global";

export type AnalysisMode =
  | "any_outcome"
  | "portfolio"
  | "prediction"
  | "options"
  | "real_assets"
  | "venture";

export type AssetClass =
  | "equity"
  | "etf"
  | "prediction_market"
  | "option"
  | "fixed_income"
  | "commodity_future"
  | "real_estate"
  | "private_venture"
  | "crypto"
  | "custom_outcome";

export type AgentRole =
  | "router"
  | "access_scout"
  | "extractor"
  | "equity_quant"
  | "superforecaster"
  | "derivatives_quant"
  | "real_assets_quant"
  | "bull"
  | "bear"
  | "cio";

export type ActionRating =
  | "STRONG BUY"
  | "BUY"
  | "HOLD"
  | "TRIM"
  | "AVOID"
  | "STRONG BET"
  | "HEDGE"
  | "PASS";

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
    | "Consumer"
    | "Real Estate"
    | "Crypto & Digital"
    | "Event Contract"
    | "Venture / Private";
  assetClass?: AssetClass;
  weightPct: number;
  currentPrice: number;
  beta: number;
  expectedAnnualReturnPct: number;
  annualVolatilityPct: number;
  dividendYieldPct?: number;
}

// ── Equity DCF ──
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

// ── Prediction Markets & Event Contracts ──
export interface PredictionBetInputs {
  question: string;
  venue: string; // e.g. "Polymarket", "Kalshi", "Metaculus / Synthetic"
  side: "YES" | "NO";
  yesPriceCents: number; // 1..99
  noPriceCents: number; // 1..99 (yes + no > 100 reflects vig/spread)
  estimatedTrueProbPct: number; // user/superforecaster true probability for YES (1..99)
  feePct: number; // trading/settlement fee %
  oracleRiskHaircutPct: number; // 0..30 haircut for resolution/oracle ambiguity
  stakeCapital: number;
  resolutionDate: string;
}

export interface PredictionSensitivityCell {
  trueProbPct: number;
  entryPriceCents: number;
  expectedRoiPct: number;
  halfKellyPct: number;
}

export interface PredictionValuationResult {
  question: string;
  venue: string;
  side: "YES" | "NO";
  rawMarketPriceCents: number;
  overroundPct: number;
  fairImpliedProbPct: number;
  estimatedTrueProbPct: number;
  edgePct: number;
  netExpectedValuePerDollar: number;
  expectedRoiPct: number;
  expectedDollarProfit: number;
  fullKellyPct: number;
  halfKellyPct: number;
  quarterKellyPct: number;
  riskAdjustedKellyPct: number;
  recommendedDollarStake: number;
  breakevenProbPct: number;
  sensitivityGrid: PredictionSensitivityCell[];
}

// ── Options & Derivatives (Black-Scholes-Merton) ──
export type OptionStrategyType =
  | "long_call"
  | "long_put"
  | "bull_call_spread"
  | "bear_put_spread"
  | "long_straddle";

export interface OptionStrategyInputs {
  underlying: string;
  strategy: OptionStrategyType;
  spotPrice: number;
  strikePrice: number;
  upperStrikePrice?: number; // used for spreads
  daysToExpiry: number;
  impliedVolatilityPct: number;
  riskFreeRatePct: number;
  contracts: number; // 1 contract = 100 shares
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  thetaPerDay: number;
  vegaPer1PctIv: number;
  rho: number;
}

export interface OptionPayoffPoint {
  spotPrice: number;
  expiryPnl: number;
  midLifePnl: number;
}

export interface OptionValuationResult {
  underlying: string;
  strategy: OptionStrategyType;
  spotPrice: number;
  strikePrice: number;
  upperStrikePrice?: number;
  daysToExpiry: number;
  impliedVolatilityPct: number;
  netDebitPerShare: number;
  totalCapitalAtRisk: number;
  maxProfit: number | null; // null = unlimited
  maxLoss: number;
  breakevens: number[];
  probabilityOfProfitPct: number;
  greeks: OptionGreeks;
  payoffCurve: OptionPayoffPoint[];
}

// ── Real Estate & Real Assets ──
export interface RealEstateInputs {
  propertyName: string;
  purchasePrice: number;
  downPaymentPct: number;
  closingCostsPct: number;
  grossAnnualRent: number;
  vacancyRatePct: number;
  operatingExpenseRatioPct: number; // % of effective gross income
  mortgageRatePct: number;
  amortizationYears: number;
  annualRentGrowthPct: number;
  holdYears: number;
  exitCapRatePct: number;
}

export interface RealEstateSensitivityCell {
  mortgageRatePct: number;
  exitCapRatePct: number;
  leveredIrrPct: number;
  cashOnCashPct: number;
}

export interface RealEstateValuationResult {
  propertyName: string;
  totalCashInvested: number;
  loanAmount: number;
  year1Noi: number;
  annualDebtService: number;
  year1CashFlow: number;
  goingInCapRatePct: number;
  cashOnCashPct: number;
  dscr: number;
  grossRentMultiplier: number;
  projectedExitValue: number;
  remainingLoanAtExit: number;
  leveredIrrPct: number;
  equityMultiple: number;
  sensitivityGrid: RealEstateSensitivityCell[];
}

// ── Fixed Income / Credit ──
export interface BondInputs {
  issuer: string;
  faceValue: number;
  couponRatePct: number;
  ytmPct: number;
  yearsToMaturity: number;
  paymentsPerYear: number;
}

export interface BondValuationResult {
  issuer: string;
  fairPrice: number;
  currentYieldPct: number;
  ytmPct: number;
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;
  dv01Per10k: number;
  rateShocks: { bpsChange: number; projectedPrice: number; pctChange: number }[];
}

// ── Venture / Private SAFE & Power-Law Deals ──
export interface VentureDealInputs {
  companyName: string;
  stage: "Pre-Seed" | "Seed" | "Series A" | "Growth";
  investmentAmount: number;
  valuationCap: number; // post-money SAFE cap or entry valuation
  expectedDilutionPct: number; // cumulative future dilution
  failureProbPct: number; // probability of 0x
  modestExitProbPct: number; // 1x-3x
  breakoutProbPct: number; // 5x-15x
  powerLawProbPct: number; // 25x-100x
  holdYears: number;
}

export interface VentureValuationResult {
  companyName: string;
  stage: string;
  investmentAmount: number;
  initialOwnershipPct: number;
  dilutedOwnershipPct: number;
  meanMoic: number;
  medianMoic: number;
  p90Moic: number;
  expectedEndingValue: number;
  expectedIrrPct: number;
  probabilityOfLossPct: number;
  breakevenExitValuation: number;
  exitDistribution: { bucket: string; probabilityPct: number; avgMoic: number }[];
}

// ── Portfolio & Monte Carlo & Macro Shocks ──
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

export interface UniversalQuantBundle {
  portfolioMetrics: PortfolioMetrics;
  dcfResult: DcfResult;
  monteCarlo: MonteCarloResult;
  macroShocks: MacroShockScenarioResult[];
  predictionValuation?: PredictionValuationResult;
  optionsValuation?: OptionValuationResult;
  realAssetValuation?: RealEstateValuationResult;
  bondValuation?: BondValuationResult;
  ventureValuation?: VentureValuationResult;
}

// ── Dynamic Workforce, Routing & Expression Access Vehicles ──
export interface RoutingPlan {
  analysisMode: AnalysisMode;
  jurisdiction: Jurisdiction;
  detectedAssetClasses: AssetClass[];
  outcomeQuestion: string;
  activatedSpecialists: {
    role: AgentRole;
    label: string;
    reason: string;
    parallel: boolean;
  }[];
  liveMarketDataUsed: boolean;
}

export interface ExpressionVehicle {
  id: string;
  name: string;
  venue: string;
  assetClass: AssetClass;
  instrumentSummary: string;
  impliedProbabilityOrReturn: string;
  capitalEfficiencyScore: number; // 1-100
  convexityScore: number; // 1-100
  liquidityScore: number; // 1-100
  estimatedFeeOrVigPct: number;
  jurisdictionAccess: "Canada & US" | "US Regulated" | "Global / DeFi" | "Accredited Only";
  keyRisk: string;
  recommendedKellyPct: number;
  accessUrl?: string;
  dataProvenance?: "LIVE" | "SYNTHETIC";
}

export interface LiveMarketQuote {
  id: string;
  venue: "Polymarket" | "Kalshi";
  question: string;
  yesPriceCents: number;
  noPriceCents: number;
  volumeUsd: number;
  liquidityUsd: number;
  endDate: string;
  url: string;
  live: boolean;
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
  parallelGroup?: string;
}

export interface RebalanceAction {
  ticker: string;
  action: "ADD" | "HOLD" | "TRIM" | "HEDGE" | "BET" | "PASS";
  targetWeightPct: number;
  rationale: string;
}

export interface AccessChecklistItem {
  step: string;
  venue: string;
  accountNote: string;
  invalidationTrigger: string;
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
  recommendedExpressionSummary?: string;
  accessChecklist?: AccessChecklistItem[];
}

export interface AnalysisRequestPayload {
  title: string;
  thesisPrompt: string;
  analysisMode?: AnalysisMode;
  jurisdiction?: Jurisdiction;
  capital: number;
  monthlyContribution: number;
  horizonYears: number;
  riskProfile: RiskProfile;
  holdings: Holding[];
  dcfInputs: DcfInputs;
  predictionInputs?: PredictionBetInputs;
  optionInputs?: OptionStrategyInputs;
  realEstateInputs?: RealEstateInputs;
  bondInputs?: BondInputs;
  ventureInputs?: VentureDealInputs;
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
  routingPlan?: RoutingPlan;
  expressionVehicles?: ExpressionVehicle[];
  portfolioMetrics: PortfolioMetrics;
  dcfResult: DcfResult;
  monteCarlo: MonteCarloResult;
  macroShocks: MacroShockScenarioResult[];
  universalQuant?: UniversalQuantBundle;
  debateTurns: AgentDebateTurn[];
  cioMemo: CioInvestmentMemo;
}

export type StreamEvent =
  | {
      type: "status";
      message: string;
      mode: "live-gemini" | "demo-simulation";
      model: string;
    }
  | { type: "routing_plan"; plan: RoutingPlan }
  | {
      type: "quant_ready";
      portfolioMetrics: PortfolioMetrics;
      dcfResult: DcfResult;
      monteCarlo: MonteCarloResult;
      macroShocks: MacroShockScenarioResult[];
    }
  | { type: "universal_quant_ready"; quant: UniversalQuantBundle }
  | { type: "access_vehicles"; vehicles: ExpressionVehicle[] }
  | { type: "agent_turn"; turn: AgentDebateTurn }
  | { type: "cio_memo"; memo: CioInvestmentMemo }
  | { type: "complete"; result: CompleteAnalysisResult }
  | { type: "error"; message: string };
