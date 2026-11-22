export type RiskProfile = "conservative" | "balanced" | "aggressive";

export type Jurisdiction = "Canada" | "US" | "Global";

export type AnalysisMode =
  | "any_outcome"
  | "hedge_fund"
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
  | "cfa_forensic"
  | "risk_officer"
  | "intel_analyst"
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
  side?: "LONG" | "SHORT"; // negative weightPct or side="SHORT" denotes short position
  weightPct: number;
  currentPrice: number;
  beta: number;
  expectedAnnualReturnPct: number;
  annualVolatilityPct: number;
  dividendYieldPct?: number;
  advUsd?: number; // 20-day Average Daily Volume in USD (for $100M liquidity/impact)
  borrowCostPct?: number; // Annualized short borrow fee %
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
export type RealEstateCategory = "residential" | "commercial";

export type RealEstatePropertyClass =
  | "single_family"
  | "small_multifamily"
  | "apartments_multifamily"
  | "student_housing"
  | "short_term_rental"
  | "industrial_logistics"
  | "retail_nnn"
  | "office_class_a"
  | "mixed_use"
  | "data_center_specialty";

export type RealEstateLeaseStructure =
  | "gross"
  | "modified_gross"
  | "nnn"
  | "short_term";

export type RealEstateMarketTier =
  | "Gateway"
  | "Growth Sunbelt"
  | "Secondary Value"
  | "Resource / Regional";

export interface RealEstateMarketBenchmark {
  id: string;
  name: string;
  region: "Canada" | "US" | "Global";
  tier: RealEstateMarketTier;
  populationGrowthPct: number;
  jobGrowthPct: number;
  medianHouseholdIncomeUsd: number;
  supplyPipelinePct: number; // % of existing stock under construction
  propertyTaxRatePct: number;
  landlordFriendlyScore: number; // 0-100
  rentControlRisk: "Low" | "Moderate" | "High";
  baseResidentialCapPct: number;
  baseCommercialCapPct: number;
  baseRentGrowthPct: number;
  baseVacancyPct: number;
  macroScore: number; // 0-100 composite market fundamental score
  highlights: string;
}

export interface RealEstateClassProfile {
  id: RealEstatePropertyClass;
  label: string;
  shortLabel: string;
  category: RealEstateCategory;
  defaultLeaseStructure: RealEstateLeaseStructure;
  capRateSpreadBps: number; // spread vs market base cap rate
  typicalVacancyPct: number;
  typicalOpexRatioPct: number;
  typicalCapexReservePct: number;
  reimbursementRecoveryPct: number; // % of OpEx reimbursed by tenants (e.g. NNN = 85%)
  typicalLtvPct: number;
  debtSpreadOverTreasuryPct: number;
  typicalAmortYears: number;
  typicalHoldYears: number;
  rentGrowthModifierPct: number;
  minLenderDscr: number;
  minDebtYieldPct: number;
  volatilityPct: number;
  liquidityScore: number; // 0-100
  managementIntensity: "Low" | "Moderate" | "High";
  unitLabel: "units" | "sq ft";
  defaultUnitsOrSqft: number;
  defaultPurchasePrice: number;
  description: string;
}

export interface RealEstateInputs {
  propertyName: string;
  category?: RealEstateCategory;
  propertyClass?: RealEstatePropertyClass;
  marketId?: string;
  leaseStructure?: RealEstateLeaseStructure;
  unitsOrSqft?: number;
  purchasePrice: number;
  downPaymentPct: number;
  closingCostsPct: number;
  renovationCapex?: number; // upfront value-add / TI / renovation budget
  grossAnnualRent: number;
  vacancyRatePct: number;
  operatingExpenseRatioPct: number; // % of effective gross income
  capexReservePct?: number; // % of EGI reserved for CapEx / TI & LC
  reimbursementRecoveryPct?: number; // % of OpEx recovered via NNN / CAM
  expenseGrowthPct?: number; // annual OpEx inflation %
  mortgageRatePct: number;
  amortizationYears: number;
  interestOnlyYears?: number; // optional IO period (common in commercial/bridge)
  annualRentGrowthPct: number;
  holdYears: number;
  exitCapRatePct: number;
  depreciationBasisPct?: number; // building value % of purchase price (default 75%)
  marginalTaxRatePct?: number; // investor marginal tax rate % (default 35%)
}

export interface RealEstateSensitivityCell {
  mortgageRatePct: number;
  exitCapRatePct: number;
  leveredIrrPct: number;
  cashOnCashPct: number;
}

export interface RealEstateYearProjection {
  year: number;
  grossPotentialRent: number;
  vacancyLoss: number;
  reimbursements: number;
  effectiveGrossIncome: number;
  operatingExpenses: number;
  capexReserve: number;
  noi: number;
  debtService: number;
  cashFlowBeforeTax: number;
  loanBalance: number;
  impliedPropertyValue: number;
  netEquity: number;
}

export interface RealEstateCovenantCheck {
  name: string;
  limit: string;
  actual: string;
  status: "PASS" | "WARN" | "BREACH";
  detail: string;
}

export interface RealEstateClassComparisonItem {
  propertyClass: RealEstatePropertyClass;
  label: string;
  shortLabel: string;
  category: RealEstateCategory;
  leaseStructure: RealEstateLeaseStructure;
  goingInCapRatePct: number;
  cashOnCashPct: number;
  dscr: number;
  debtYieldPct: number;
  leveredIrrPct: number;
  unleveredIrrPct: number;
  equityMultiple: number;
  volatilityPct: number;
  riskAdjustedScore: number; // 0-100
  managementIntensity: "Low" | "Moderate" | "High";
  verdict: "Attractive" | "Core Hold" | "Watch / Tight";
}

export interface RealEstateMarketComparisonItem {
  marketId: string;
  marketName: string;
  region: "Canada" | "US" | "Global";
  tier: RealEstateMarketTier;
  populationGrowthPct: number;
  jobGrowthPct: number;
  supplyPipelinePct: number;
  rentControlRisk: "Low" | "Moderate" | "High";
  benchmarkCapRatePct: number;
  projectedRentGrowthPct: number;
  cashOnCashPct: number;
  dscr: number;
  leveredIrrPct: number;
  compositeScore: number; // 0-100
  verdict: "Top Pick" | "Balanced" | "Yield-Constrained";
}

export interface ResidentialVsCommercialSummary {
  residentialAvgCapPct: number;
  commercialAvgCapPct: number;
  residentialAvgIrrPct: number;
  commercialAvgIrrPct: number;
  residentialAvgDscr: number;
  commercialAvgDscr: number;
  residentialAvgCoCPct: number;
  commercialAvgCoCPct: number;
  recommendedTilt: "Residential Core" | "Commercial Yield" | "Barbell 50/50";
  rationale: string;
}

export interface RealEstateValuationResult {
  propertyName: string;
  category: RealEstateCategory;
  propertyClass: RealEstatePropertyClass;
  propertyClassLabel: string;
  marketId: string;
  marketName: string;
  leaseStructure: RealEstateLeaseStructure;
  unitsOrSqft: number;
  unitLabel: "units" | "sq ft";
  totalCashInvested: number;
  loanAmount: number;
  ltvPct: number;
  year1Noi: number;
  annualDebtService: number;
  year1CashFlow: number;
  goingInCapRatePct: number;
  benchmarkCapRatePct: number;
  capRateSpreadToBenchmarkBps: number;
  capRateSpreadToRiskFreeBps: number;
  cashOnCashPct: number;
  dscr: number;
  debtYieldPct: number;
  breakEvenOccupancyPct: number;
  grossRentMultiplier: number;
  pricePerUnitOrSqft: number;
  noiPerUnitOrSqft: number;
  projectedExitValue: number;
  remainingLoanAtExit: number;
  leveredIrrPct: number;
  unleveredIrrPct: number;
  afterTaxIrrPct: number;
  annualDepreciationShield: number;
  equityMultiple: number;
  unleveredEquityMultiple: number;
  yearlyCashFlows: RealEstateYearProjection[];
  lenderCovenantChecks: RealEstateCovenantCheck[];
  sensitivityGrid: RealEstateSensitivityCell[];
  classComparison?: RealEstateClassComparisonItem[];
  marketComparison?: RealEstateMarketComparisonItem[];
  residentialVsCommercial?: ResidentialVsCommercialSummary;
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
  cfaForensics?: CfaForensicResult;
  hedgeFundRisk?: HedgeFundRiskReport;
  liquidityCompliance?: LiquidityComplianceReport;
}

// ── CFA Charterholder Forensic Accounting & Quality of Earnings ──
export interface CfaForensicInputs {
  ticker: string;
  revenuePrior: number; // $M
  revenueCurrent: number; // $M
  receivablesPrior: number; // $M
  receivablesCurrent: number; // $M
  grossMarginPriorPct: number;
  grossMarginCurrentPct: number;
  ebit: number; // $M
  netIncome: number; // $M
  operatingCashFlow: number; // $M
  totalAssets: number; // $M
  currentAssets: number; // $M
  currentLiabilities: number; // $M
  totalLiabilities: number; // $M
  retainedEarnings: number; // $M
  marketCap: number; // $M
  ppePrior: number; // $M
  ppeCurrent: number; // $M
  depreciationPrior: number; // $M
  depreciationCurrent: number; // $M
  sgaPrior: number; // $M
  sgaCurrent: number; // $M
  totalDebtPrior: number; // $M
  totalDebtCurrent: number; // $M
  shareholdersEquity: number; // $M
  taxRatePct: number;
  costOfDebtPct: number;
  unleveredBeta: number;
  riskFreeRatePct: number;
  equityRiskPremiumPct: number;
}

export interface CfaForensicResult {
  ticker: string;
  beneishMScore: number;
  beneishFlag: "CLEAN" | "ELEVATED_MANIPULATION_RISK";
  beneishComponents: {
    dsri: number;
    gmi: number;
    aqi: number;
    sgi: number;
    depi: number;
    sgai: number;
    lvgi: number;
    tata: number;
  };
  altmanZScore: number;
  altmanZone: "SAFE" | "GREY" | "DISTRESS";
  sloanAccrualsRatioPct: number;
  cashConversionRatio: number;
  dupontRoe: {
    netMarginPct: number;
    assetTurnover: number;
    financialLeverage: number;
    roePct: number;
  };
  bottomUpWacc: {
    releveredBeta: number;
    costOfEquityPct: number;
    afterTaxCostOfDebtPct: number;
    waccPct: number;
  };
  residualIncomeValuePerShareDeltaPct: number;
  redFlags: string[];
}

// ── $100M Hedge Fund Long/Short Risk, Factor Attribution & Tail Risk ──
export interface FactorTilt {
  factor: "Market" | "Value" | "Momentum" | "Quality" | "Size" | "Commodity/Inflation";
  exposure: number;
  contributionToVolPct: number;
}

export interface PositionRiskContribution {
  ticker: string;
  side: "LONG" | "SHORT";
  signedWeightPct: number;
  dollarExposure: number;
  standaloneVolPct: number;
  mctrPct: number; // Marginal Contribution to Risk
  percentOfRisk: number;
  borrowDragUsd: number;
}

export interface HedgeFundRiskReport {
  aumUsd: number;
  longExposurePct: number;
  shortExposurePct: number;
  grossExposurePct: number;
  netExposurePct: number;
  betaAdjustedNetPct: number;
  portfolioVolPct: number;
  expectedNetReturnPct: number;
  shortBorrowDragBps: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  var95MonthlyPct: number;
  var95MonthlyUsd: number;
  cvar99MonthlyPct: number;
  cvar99MonthlyUsd: number;
  idiosyncraticRiskPct: number;
  factorTilts: FactorTilt[];
  positionRisks: PositionRiskContribution[];
  blackLittermanWeights: {
    ticker: string;
    currentSignedWeightPct: number;
    optimalSignedWeightPct: number;
    deltaPct: number;
  }[];
}

// ── Institutional Liquidity, Market Impact & Pre-Trade Compliance ──
export interface PositionLiquidityMetric {
  ticker: string;
  side: "LONG" | "SHORT";
  dollarExposure: number;
  advUsd: number;
  pctOfAdv: number;
  daysToLiquidate: number; // at 15% max ADV participation
  estimatedImpactBps: number; // Almgren-Chriss temporary + permanent impact
  estimatedSlippageUsd: number;
  liquidityBucket: "T+1 Liquid" | "2-5 Days" | "Illiquid (>5d)";
}

export interface ComplianceRuleResult {
  ruleId: string;
  ruleName: string;
  limit: string;
  actual: string;
  status: "PASS" | "WARN" | "BREACH";
  detail: string;
}

export interface LiquidityComplianceReport {
  aumUsd: number;
  maxAdvParticipationPct: number;
  weightedDaysToLiquidate: number;
  illiquidPctOfNav: number;
  totalEstimatedRebalanceSlippageUsd: number;
  totalEstimatedSlippageBps: number;
  overallStatus: "PASS" | "WARN" | "BREACH";
  positionLiquidity: PositionLiquidityMetric[];
  complianceChecks: ComplianceRuleResult[];
}

// ── Unstructured Intelligence Ingestion (Newsletters, News, Podcasts, Filings, Macro) ──
export type IntelSourceType =
  | "newsletter"
  | "news"
  | "podcast"
  | "filing"
  | "macro";

export interface IntelSignal {
  id: string;
  sourceType: IntelSourceType;
  sourceName: string;
  title: string;
  publishedAt: string;
  url?: string;
  audioUrl?: string;
  durationLabel?: string;
  tickers: string[];
  sentimentScore: number; // -100 (bearish) to +100 (bullish)
  noveltyScore: number; // 0 to 100
  credibilityTier: 1 | 2 | 3; // 1 = primary filing / institutional, 2 = specialist, 3 = commentary
  keyClaims: string[];
  catalysts: string[];
  summary: string;
  live: boolean;
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
  audience?: import("./workspaces").Profile;
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
  cfaForensicInputs?: CfaForensicInputs;
  intelSignals?: IntelSignal[];
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
  intelSignals?: IntelSignal[];
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
  | { type: "intel_ready"; signals: IntelSignal[] }
  | { type: "agent_turn"; turn: AgentDebateTurn }
  | { type: "cio_memo"; memo: CioInvestmentMemo }
  | { type: "complete"; result: CompleteAnalysisResult }
  | { type: "error"; message: string };

// ── Global Tax Consultant & Cross-Border Structuring Module ──
export type TaxResidencyId =
  | "canada_on"
  | "us_ca"
  | "us_tx"
  | "uk"
  | "singapore"
  | "uae"
  | "portugal";

export type ForeignSourceCountryId =
  | "us"
  | "canada"
  | "uk"
  | "ireland_ucits"
  | "eu_germany"
  | "japan"
  | "switzerland";

export type TaxAssetBucket =
  | "domestic_equity_growth"
  | "domestic_dividend"
  | "foreign_us_dividend"
  | "foreign_growth_etf"
  | "fixed_income_reit"
  | "active_options_crypto";

export type InvestmentGainStreamId =
  | "ltcg"
  | "stcg"
  | "domestic_qualified_div"
  | "foreign_div"
  | "interest_credit"
  | "return_of_capital"
  | "sbloc_borrow"
  | "corp_cda_extraction";

export type BusinessStructureId =
  | "sole_prop"
  | "domestic_smb_corp"
  | "holdco_passive"
  | "us_c_corp_qsbs"
  | "foreign_operating_corp";

export type ForeignRealEstateMarketId =
  | "us_florida"
  | "portugal_lisbon"
  | "mexico_riviera"
  | "uk_london"
  | "uae_dubai"
  | "japan_tokyo"
  | "canada_ontario";

export type ForeignPropertyEntityType =
  | "personal_direct"
  | "home_corp"
  | "local_llc"
  | "trust_fideicomiso";

export interface TaxResidencyProfile {
  id: TaxResidencyId;
  label: string;
  country: string;
  currency: string;
  topOrdinaryRatePct: number;
  ltcgRatePct: number;
  stcgRatePct: number;
  domesticDividendRatePct: number;
  foreignDividendRatePct: number;
  interestRatePct: number;
  estateTaxThresholdUsd: number | null;
  estateTaxTopRatePct: number;
  territorialSystem: boolean;
  keyAccounts: string[];
  summaryNote: string;
}

export interface GlobalTaxProfile {
  residency: TaxResidencyId;
  annualOrdinaryIncomeUsd: number;
  portfolioValueUsd: number;
  foreignAllocationPct: number;
  foreignSourceCountry: ForeignSourceCountryId;
  targetGainToAccessUsd: number;
  horizonYears: number;
  expectedPreTaxReturnPct: number;
  expectedDividendYieldPct: number;
  // Business ownership inputs
  businessAnnualProfitUsd: number;
  businessSalaryDrawUsd: number;
  businessPassiveIncomeUsd: number;
  businessExitValueUsd: number;
  // Foreign real estate inputs
  foreignPropertyMarket: ForeignRealEstateMarketId;
  foreignPropertyPriceUsd: number;
  foreignPropertyGrossYieldPct: number;
  foreignPropertyHoldYears: number;
  foreignPropertyAppreciationPct: number;
  foreignPropertyEntity: ForeignPropertyEntityType;
}

export interface AccountLocationRow {
  accountId: string;
  accountName: string;
  category: "tax_free" | "tax_deferred" | "taxable" | "corporate" | "offshore_ucits";
  contributionCapNote: string;
  domesticAfterTaxCagrPct: number;
  foreignAfterTaxCagrPct: number;
  foreignWithholdingDragBps: number;
  ftcRecoverable: boolean;
  projected10YrWealthUsd: number;
  taxSavedVsTaxableUsd: number;
  bestForAssets: string[];
  avoidAssets: string[];
  treatyNote: string;
}

export interface AssetLocationRecommendation {
  assetBucket: TaxAssetBucket;
  assetLabel: string;
  optimalAccount: string;
  worstAccount: string;
  annualTaxDragSavedBps: number;
  rationale: string;
}

export interface IncomeStreamComparisonRow {
  streamId: InvestmentGainStreamId;
  label: string;
  category: string;
  grossAmountUsd: number;
  domesticTaxUsd: number;
  foreignWithholdingUsd: number;
  borrowingOrFrictionUsd: number;
  netSpendableUsd: number;
  effectiveTaxRatePct: number;
  afterTaxRetentionPct: number;
  tenYrCompoundedNetUsd: number;
  accessMechanism: string;
  keyCaveat: string;
}

export interface BusinessStructureRow {
  structureId: BusinessStructureId;
  label: string;
  corporateTaxRatePct: number;
  annualCorporateTaxUsd: number;
  annualPersonalTaxUsd: number;
  totalAnnualTaxUsd: number;
  effectiveCombinedRatePct: number;
  retainedForReinvestmentUsd: number;
  annualDeferralAdvantageUsd: number;
  exitTaxOnSaleUsd: number;
  exitEffectiveRatePct: number;
  passiveGrindWarning?: string;
  cfcOrFapiWarning?: string;
  verdict: "OPTIMAL" | "VIABLE" | "CAUTION";
  keyTakeaway: string;
}

export interface ForeignRealEstateTaxResult {
  marketId: ForeignRealEstateMarketId;
  marketLabel: string;
  country: string;
  entityType: ForeignPropertyEntityType;
  entityLabel: string;
  purchasePriceUsd: number;
  // Acquisition
  acquisitionStampAndTransferUsd: number;
  foreignBuyerSurchargeUsd: number;
  setupAndLegalUsd: number;
  totalAcquisitionFrictionUsd: number;
  // Ongoing Annual Rental
  grossAnnualRentUsd: number;
  operatingAndPropertyTaxUsd: number;
  depreciationShieldUsd: number;
  foreignRentalTaxGrossMethodUsd: number;
  foreignRentalTaxNetElectionUsd: number;
  homeCountryNetTaxAfterFtcUsd: number;
  netAnnualAfterTaxCashflowUsd: number;
  // Exit
  projectedExitPriceUsd: number;
  grossCapitalGainUsd: number;
  foreignExitCapitalGainsTaxUsd: number;
  mandatoryClosingWithholdingUsd: number;
  closingWithholdingRule: string;
  homeExitTopUpTaxUsd: number;
  netAfterTaxExitProceedsUsd: number;
  // Summary
  preTaxIrrPct: number;
  afterTaxIrrPct: number;
  totalLifecycleTaxDragPct: number;
  estateTaxExposureNote: string;
  entityStructureAlerts: string[];
  recommendedStructure: string;
}

export interface TaxComplianceAlert {
  id: string;
  severity: "HIGH" | "MEDIUM" | "INFO";
  code: string;
  title: string;
  summary: string;
  action: string;
}

export interface GlobalTaxReport {
  residency: TaxResidencyProfile;
  effectiveMarginalRatePct: number;
  taxEfficiencyScore: number; // 0..100
  estimatedAnnualTaxAlphaUsd: number;
  bestAccountWrapper: string;
  bestGainStream: string;
  bestBusinessStructure: string;
  accountLocations: AccountLocationRow[];
  assetLocationMatrix: AssetLocationRecommendation[];
  incomeStreams: IncomeStreamComparisonRow[];
  businessStructures: BusinessStructureRow[];
  foreignRealEstate: ForeignRealEstateTaxResult;
  complianceAlerts: TaxComplianceAlert[];
  executivePlaybook: string[];
}

export interface TaxConsultantMessage {
  id: string;
  role: "user" | "consultant";
  content: string;
  timestamp: string;
  mode?: "live-gemini" | "deterministic-engine";
  keyMetricsCited?: string[];
  actionSteps?: string[];
  riskFlags?: string[];
}

// ── Adaptive Experience Tier ──
export type ExperienceTier = "prosumer" | "institutional";

// ── 1-Click Tax-Aware CIO Rebalance Simulator ──
export type RebalanceAccountWrapper = "taxable" | "tax_sheltered";

export interface RebalanceSimulationOptions {
  residencyId: TaxResidencyId;
  accountWrapper: RebalanceAccountWrapper;
  assumedUnrealizedGainPct: number; // 0..80
}

export interface RebalancePositionDelta {
  ticker: string;
  name: string;
  sector: Holding["sector"];
  action: RebalanceAction["action"];
  currentWeightPct: number;
  targetWeightPct: number;
  deltaWeightPct: number;
  tradeDollarAmount: number;
  estimatedRealizedGainUsd: number;
  estimatedTaxDragUsd: number;
  rationale: string;
}

export interface RebalanceTaxImpact {
  residencyId: TaxResidencyId;
  residencyLabel: string;
  accountWrapper: RebalanceAccountWrapper;
  ltcgRatePct: number;
  assumedUnrealizedGainPct: number;
  totalTurnoverPct: number;
  totalTrimmedDollars: number;
  estimatedRealizedGainsUsd: number;
  totalTaxDragUsd: number;
  taxDragBps: number;
  annualExpectedAlphaGainUsd: number;
  paybackMonths: number | null;
  verdict: "TAX_EFFICIENT" | "USE_NEW_CASH_FLOWS" | "TAX_FREE_WRAPPER";
  verdictExplanation: string;
}

export interface RebalanceSimulationResult {
  beforeMetrics: PortfolioMetrics;
  afterMetrics: PortfolioMetrics;
  beforeMonteCarlo: MonteCarloResult;
  afterMonteCarlo: MonteCarloResult;
  beforeWorstShock: MacroShockScenarioResult | null;
  afterWorstShock: MacroShockScenarioResult | null;
  proposedHoldings: Holding[];
  positionDeltas: RebalancePositionDelta[];
  deltas: {
    expectedReturnDeltaPct: number;
    volatilityDeltaPct: number;
    sharpeDelta: number;
    betaDelta: number;
    hhiDelta: number;
    maxDrawdownDeltaPct: number;
    medianEndingValueDeltaUsd: number;
    downsideP10DeltaUsd: number;
    worstShockImprovementPct: number;
  };
  taxImpact: RebalanceTaxImpact;
}

// ── Interactive IC War Room ──
export type WarRoomTargetRole =
  | "cio"
  | "bull"
  | "bear"
  | "cfa_risk"
  | "tax_strategist"
  | "bull_vs_bear";

export interface WarRoomMessage {
  id: string;
  sender: "user" | "agent";
  targetRole: WarRoomTargetRole;
  speakerLabel: string;
  content: string;
  rebuttalContent?: string; // populated for bull_vs_bear clash
  keyTakeaways?: string[];
  convictionDelta?: number; // -15..+15 shift on committee conviction
  toolCalls?: ToolCallRecord[];
  mode?: "live-gemini" | "deterministic-engine";
  timestamp: string;
}

export interface WarRoomRequestPayload {
  question: string;
  targetRole: WarRoomTargetRole;
  analysisRequest: AnalysisRequestPayload;
  cioMemo: CioInvestmentMemo;
  universalQuant: UniversalQuantBundle;
  rebalanceSummary?: {
    sharpeDelta: number;
    volatilityDeltaPct: number;
    totalTaxDragUsd: number;
    verdict: string;
  };
  history?: { sender: "user" | "agent"; speakerLabel: string; content: string }[];
}

export interface WarRoomResponsePayload {
  message: WarRoomMessage;
}
