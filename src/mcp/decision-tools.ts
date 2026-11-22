import { z } from "zod";
import {
  analyzeBondDuration,
  analyzeHedgeFundRisk,
  analyzePortfolioMetrics,
  analyzeRealEstateDeal,
  buildDefaultForensicInputs,
  buildDefaultGlobalTaxProfile,
  buildRealEstatePresetInputs,
  compareRealEstateClasses,
  compareRealEstateMarkets,
  evaluatePredictionBet,
  getRealEstateMarket,
  priceOptionStrategy,
  runCfaForensicAnalysis,
  runDcfValuation,
  runGlobalTaxAudit,
  runLiquidityAndComplianceCheck,
  runMonteCarloSimulation,
  simulateCioRebalance,
  simulateVenturePowerLaw,
  stressTestMacroShocks,
  summarizeResidentialVsCommercial,
} from "../lib/quant-engine";
import { searchPredictionMarkets } from "../lib/adapters/market-data";
import { getCompanyFundamentals } from "../lib/fundamentals";
import { buildCompanyModel } from "../lib/model";
import {
  companyModelRequestSchema,
  presentModel,
  summarizeModel,
  toBuildOptions,
} from "../lib/model/present";
import {
  fundamentalsRequestSchema,
  presentFundamentals,
  summarizeFundamentals,
} from "../lib/fundamentals/present";
import {
  CURATED_INTEL_SIGNALS,
  fetchIntelligenceCorpus,
} from "../lib/adapters/intel-ingestion";
import { runUniversalWorkforce } from "../lib/workforce/orchestrator";
import { PRESET_SCENARIOS } from "../lib/demo-scenarios";
import type {
  AnalysisMode,
  AnalysisRequestPayload,
  ForeignRealEstateMarketId,
  ForeignSourceCountryId,
  Holding,
  Jurisdiction,
  OptionStrategyType,
  RealEstatePropertyClass,
  RebalanceAction,
  RiskProfile,
  TaxResidencyId,
} from "../lib/types";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export interface DecisionToolOutput {
  summary: string;
  data: Record<string, unknown>;
}

// ── Shared Zod Building Blocks ──

const SECTOR_ENUM = z.enum([
  "Technology",
  "Mining & Materials",
  "Energy",
  "Financials",
  "Healthcare",
  "Industrials",
  "Fixed Income",
  "Consumer",
  "Real Estate",
  "Crypto & Digital",
  "Event Contract",
  "Venture / Private",
]);

const HOLDING_SCHEMA = z.object({
  ticker: z.string().min(1).describe("Ticker or asset identifier (e.g. VOO, VALE, XBB)."),
  name: z.string().optional().describe("Human-readable asset name."),
  sector: SECTOR_ENUM.default("Technology").describe("Primary sector / asset bucket."),
  side: z.enum(["LONG", "SHORT"]).default("LONG").describe("Position direction."),
  weightPct: z.number().describe("Portfolio weight % (e.g. 25 for 25%)."),
  currentPrice: z.number().positive().default(100).describe("Current price per share/unit."),
  beta: z.number().default(1.0).describe("Market beta relative to S&P 500."),
  expectedAnnualReturnPct: z.number().default(9.0).describe("Expected annualized return %."),
  annualVolatilityPct: z.number().positive().default(18.0).describe("Annualized volatility %."),
  dividendYieldPct: z.number().min(0).default(1.2).describe("Annual dividend/distribution yield %."),
  advUsd: z.number().positive().optional().describe("20-day Average Daily Volume in USD."),
  borrowCostPct: z.number().min(0).optional().describe("Annualized short borrow cost %."),
});

const PROPERTY_CLASS_ENUM = z.enum([
  "single_family",
  "small_multifamily",
  "apartments_multifamily",
  "student_housing",
  "short_term_rental",
  "industrial_logistics",
  "retail_nnn",
  "office_class_a",
  "mixed_use",
  "data_center_specialty",
]);

const TAX_RESIDENCY_ENUM = z.enum([
  "canada_on",
  "us_ca",
  "us_tx",
  "uk",
  "singapore",
  "uae",
  "portugal",
]);

const FOREIGN_RE_MARKET_ENUM = z.enum([
  "us_florida",
  "portugal_lisbon",
  "mexico_riviera",
  "uk_london",
  "uae_dubai",
  "japan_tokyo",
  "canada_ontario",
]);

const FOREIGN_SOURCE_ENUM = z.enum([
  "us",
  "canada",
  "uk",
  "ireland_ucits",
  "eu_germany",
  "japan",
  "switzerland",
]);

function normalizeHoldings(raw: z.infer<typeof HOLDING_SCHEMA>[]): Holding[] {
  return raw.map((h) => ({
    ticker: h.ticker.toUpperCase(),
    name: h.name ?? h.ticker.toUpperCase(),
    sector: h.sector,
    side: h.side,
    weightPct: h.weightPct,
    currentPrice: h.currentPrice,
    beta: h.beta,
    expectedAnnualReturnPct: h.expectedAnnualReturnPct,
    annualVolatilityPct: h.annualVolatilityPct,
    dividendYieldPct: h.dividendYieldPct,
    advUsd: h.advUsd,
    borrowCostPct: h.borrowCostPct,
  }));
}

// ── 1. DCF Valuation ──

export const dcfInputSchema = {
  ticker: z.string().min(1).describe("Stock ticker symbol (e.g. NVDA, VALE, AAPL)."),
  currentPrice: z.number().positive().describe("Current share price in USD."),
  sharesOutstandingBillions: z
    .number()
    .positive()
    .describe("Diluted shares outstanding in billions (e.g. 2.5 for 2.5B shares)."),
  baseFreeCashFlowBillions: z
    .number()
    .describe("Current annual Free Cash Flow (FCF) in billions USD."),
  revenueGrowthYear1To5Pct: z
    .number()
    .min(-30)
    .max(80)
    .default(10)
    .describe("Expected annual FCF/revenue growth rate % over years 1-5."),
  waccPct: z
    .number()
    .min(4)
    .max(25)
    .default(9.5)
    .describe("Weighted Average Cost of Capital (discount rate) %."),
  terminalGrowthPct: z
    .number()
    .min(0)
    .max(6)
    .default(2.5)
    .describe("Perpetual terminal growth rate % (must be < WACC)."),
  netDebtBillions: z
    .number()
    .default(0)
    .describe("Net debt (total debt minus cash) in billions USD; negative if net cash."),
};

export function handleDcfValuation(
  args: z.infer<z.ZodObject<typeof dcfInputSchema>>
): DecisionToolOutput {
  const result = runDcfValuation(args);
  const verdict =
    result.upsidePct >= 20
      ? "UNDERVALUED (Margin of Safety)"
      : result.upsidePct >= -10
      ? "FAIRLY VALUED"
      : "OVERVALUED (Priced for Perfection)";
  return {
    summary: `${result.ticker} DCF Intrinsic Value: $${result.impliedSharePrice} vs $${result.currentPrice} (${result.upsidePct >= 0 ? "+" : ""}${result.upsidePct}% upside @ ${result.waccPct}% WACC, ${result.terminalGrowthPct}% terminal growth) — ${verdict}.`,
    data: result as unknown as Record<string, unknown>,
  };
}

// ── 2. Monte Carlo Wealth Projection ──

export const monteCarloInputSchema = {
  initialCapital: z.number().min(0).default(100_000).describe("Starting investment capital in USD."),
  monthlyContribution: z
    .number()
    .min(0)
    .default(1000)
    .describe("Recurring monthly contribution in USD."),
  horizonYears: z.number().min(1).max(40).default(10).describe("Investment time horizon in years."),
  expectedReturnPct: z
    .number()
    .min(-10)
    .max(40)
    .default(8.5)
    .describe("Expected annualized portfolio return %."),
  volatilityPct: z
    .number()
    .min(1)
    .max(120)
    .default(16)
    .describe("Annualized portfolio volatility %."),
};

export function handleMonteCarloProjection(
  args: z.infer<z.ZodObject<typeof monteCarloInputSchema>>
): DecisionToolOutput {
  const result = runMonteCarloSimulation(args);
  const totalContributed = args.initialCapital + args.monthlyContribution * 12 * args.horizonYears;
  return {
    summary: `${result.horizonYears}Y Monte Carlo (${result.simulations} paths, contributed ${fmtUsd(totalContributed)}): Median ${fmtUsd(result.medianEndingValue)} | Downside P10 ${fmtUsd(result.downsideP10Value)} | Upside P90 ${fmtUsd(result.upsideP90Value)} | Prob of Loss ${result.probabilityOfLossPct}% | Prob of Doubling ${result.probabilityOfDoublingPct}%.`,
    data: {
      ...result,
      totalContributed,
    },
  };
}

// ── 3. Portfolio Risk & 6-Regime Macro Stress Test ──

export const portfolioRiskInputSchema = {
  capital: z.number().positive().default(100_000).describe("Total portfolio capital in USD."),
  holdings: z
    .array(HOLDING_SCHEMA)
    .min(1)
    .describe("Array of portfolio holdings with weights, beta, expected return, and volatility."),
  includeInstitutionalRiskBook: z
    .boolean()
    .default(false)
    .describe(
      "If true, also computes 95% Monthly VaR, 99% Fat-Tail CVaR, Sortino/Calmar, Fama-French factor tilts, Black-Litterman weights, and Almgren-Chriss liquidity/compliance checks."
    ),
  maxAdvParticipationPct: z
    .number()
    .min(1)
    .max(50)
    .default(15)
    .describe("Max % of 20-day ADV per day for liquidity check (when institutional risk book is enabled)."),
};

export function handlePortfolioRisk(
  args: z.infer<z.ZodObject<typeof portfolioRiskInputSchema>>
): DecisionToolOutput {
  const holdings = normalizeHoldings(args.holdings);
  const metrics = analyzePortfolioMetrics(holdings, args.capital);
  const macroShocks = stressTestMacroShocks(holdings, args.capital);
  const worstShock = [...macroShocks].sort(
    (a, b) => a.portfolioImpactPct - b.portfolioImpactPct
  )[0];
  const bestShock = [...macroShocks].sort(
    (a, b) => b.portfolioImpactPct - a.portfolioImpactPct
  )[0];

  const hedgeFundRisk = args.includeInstitutionalRiskBook
    ? analyzeHedgeFundRisk(holdings, args.capital)
    : undefined;
  const liquidityCompliance = args.includeInstitutionalRiskBook
    ? runLiquidityAndComplianceCheck(holdings, args.capital, hedgeFundRisk!, undefined, args.maxAdvParticipationPct)
    : undefined;

  return {
    summary: `Portfolio (${fmtUsd(args.capital)}): Exp Return ${metrics.expectedAnnualReturnPct}% | Vol ${metrics.annualVolatilityPct}% | Sharpe ${metrics.sharpeRatio} | Beta ${metrics.weightedBeta} | HHI ${metrics.concentrationHhi} (${metrics.concentrationLabel}). Worst macro shock: ${worstShock.name} (${worstShock.portfolioImpactPct}%, ${fmtUsd(worstShock.dollarImpact)}); Best tailwind: ${bestShock.name} (${bestShock.portfolioImpactPct >= 0 ? "+" : ""}${bestShock.portfolioImpactPct}%).`,
    data: {
      metrics,
      macroShocks,
      ...(hedgeFundRisk ? { hedgeFundRisk } : {}),
      ...(liquidityCompliance ? { liquidityCompliance } : {}),
    },
  };
}

// ── 4. Tax-Aware Rebalance Simulator ──

export const rebalanceInputSchema = {
  capital: z.number().positive().default(100_000).describe("Total portfolio value in USD."),
  monthlyContribution: z.number().min(0).default(1000).describe("Monthly new cash flow in USD."),
  horizonYears: z.number().min(1).max(30).default(5).describe("Projection horizon in years."),
  holdings: z.array(HOLDING_SCHEMA).min(1).describe("Current portfolio holdings."),
  targetPlan: z
    .array(
      z.object({
        ticker: z.string().min(1),
        action: z.enum(["ADD", "HOLD", "TRIM", "HEDGE", "BET", "PASS"]),
        targetWeightPct: z.number().min(0).max(100),
        rationale: z.string().default("Rebalance toward risk-adjusted target."),
      })
    )
    .min(1)
    .describe("Proposed target weights and actions by ticker."),
  residency: TAX_RESIDENCY_ENUM.default("canada_on").describe("Investor tax residency."),
  accountWrapper: z
    .enum(["taxable", "tax_sheltered"])
    .default("taxable")
    .describe("Whether the portfolio sits in a taxable account or tax-sheltered wrapper (TFSA/RRSP/Roth/ISA)."),
  assumedUnrealizedGainPct: z
    .number()
    .min(0)
    .max(80)
    .default(25)
    .describe("Estimated % of trimmed positions that represents unrealized capital gain."),
};

export function handleSimulateRebalance(
  args: z.infer<z.ZodObject<typeof rebalanceInputSchema>>
): DecisionToolOutput {
  const holdings = normalizeHoldings(args.holdings);
  const rebalancePlan: RebalanceAction[] = args.targetPlan.map((p) => ({
    ticker: p.ticker.toUpperCase(),
    action: p.action,
    targetWeightPct: p.targetWeightPct,
    rationale: p.rationale,
  }));
  const result = simulateCioRebalance({
    holdings,
    rebalancePlan,
    capital: args.capital,
    monthlyContribution: args.monthlyContribution,
    horizonYears: args.horizonYears,
    options: {
      residencyId: args.residency as TaxResidencyId,
      accountWrapper: args.accountWrapper,
      assumedUnrealizedGainPct: args.assumedUnrealizedGainPct,
    },
  });

  return {
    summary: `Rebalance Verdict: ${result.taxImpact.verdict} (${result.taxImpact.verdictExplanation}). Sharpe ${result.beforeMetrics.sharpeRatio} -> ${result.afterMetrics.sharpeRatio} (${result.deltas.sharpeDelta >= 0 ? "+" : ""}${result.deltas.sharpeDelta}), Vol ${result.beforeMetrics.annualVolatilityPct}% -> ${result.afterMetrics.annualVolatilityPct}%, Tax Drag ${fmtUsd(result.taxImpact.totalTaxDragUsd)} (${result.taxImpact.taxDragBps} bps).`,
    data: result as unknown as Record<string, unknown>,
  };
}

// ── 5. Real Estate Underwriting ──

export const realEstateDealInputSchema = {
  propertyName: z.string().optional().describe("Label for the property deal."),
  propertyClass: PROPERTY_CLASS_ENUM.default("small_multifamily").describe(
    "Property class (residential or commercial)."
  ),
  marketId: z
    .string()
    .default("sudbury-on")
    .describe(
      "Market benchmark id: sudbury-on, toronto-gta, calgary-ab, vancouver-bc, austin-tx, miami-fl, phoenix-az, new-york-ny, chicago-il, or london-uk."
    ),
  purchasePrice: z.number().positive().optional().describe("Purchase price in USD (defaults to market/class preset)."),
  downPaymentPct: z.number().min(5).max(100).optional().describe("Down payment % of purchase price."),
  grossAnnualRent: z.number().positive().optional().describe("Gross annual rental income in USD."),
  vacancyRatePct: z.number().min(0).max(50).optional().describe("Expected vacancy rate %."),
  operatingExpenseRatioPct: z.number().min(5).max(80).optional().describe("Operating expense ratio % of EGI."),
  mortgageRatePct: z.number().min(1).max(18).optional().describe("Mortgage interest rate %."),
  amortizationYears: z.number().min(5).max(40).optional().describe("Loan amortization period in years."),
  annualRentGrowthPct: z.number().min(-5).max(15).optional().describe("Expected annual rent growth %."),
  holdYears: z.number().min(1).max(30).optional().describe("Expected hold period in years."),
  exitCapRatePct: z.number().min(2).max(15).optional().describe("Assumed exit cap rate %."),
  renovationCapex: z.number().min(0).optional().describe("Upfront renovation / value-add CapEx in USD."),
  marginalTaxRatePct: z.number().min(0).max(60).optional().describe("Investor marginal tax rate %."),
};

export function handleUnderwriteRealEstate(
  args: z.infer<z.ZodObject<typeof realEstateDealInputSchema>>
): DecisionToolOutput {
  const preset = buildRealEstatePresetInputs(
    args.propertyClass as RealEstatePropertyClass,
    args.marketId
  );

  // If purchasePrice is overridden without grossAnnualRent, scale preset rent proportionally
  const priceScale =
    args.purchasePrice && !args.grossAnnualRent && preset.purchasePrice > 0
      ? args.purchasePrice / preset.purchasePrice
      : 1;

  const merged = {
    ...preset,
    propertyName: args.propertyName ?? preset.propertyName,
    purchasePrice: args.purchasePrice ?? preset.purchasePrice,
    downPaymentPct: args.downPaymentPct ?? preset.downPaymentPct,
    grossAnnualRent: args.grossAnnualRent ?? Math.round(preset.grossAnnualRent * priceScale),
    vacancyRatePct: args.vacancyRatePct ?? preset.vacancyRatePct,
    operatingExpenseRatioPct: args.operatingExpenseRatioPct ?? preset.operatingExpenseRatioPct,
    mortgageRatePct: args.mortgageRatePct ?? preset.mortgageRatePct,
    amortizationYears: args.amortizationYears ?? preset.amortizationYears,
    annualRentGrowthPct: args.annualRentGrowthPct ?? preset.annualRentGrowthPct,
    holdYears: args.holdYears ?? preset.holdYears,
    exitCapRatePct: args.exitCapRatePct ?? preset.exitCapRatePct,
    renovationCapex: args.renovationCapex ?? preset.renovationCapex,
    marginalTaxRatePct: args.marginalTaxRatePct ?? preset.marginalTaxRatePct,
  };

  const result = analyzeRealEstateDeal(merged);
  const breaches = result.lenderCovenantChecks.filter((c) => c.status === "BREACH");
  const covenantNote =
    breaches.length > 0
      ? `COVENANT BREACH (${breaches.map((b) => b.name).join(", ")})`
      : "All Lender Covenants PASS";

  return {
    summary: `${result.propertyName} (${result.propertyClassLabel} in ${result.marketName}): Cash Invested ${fmtUsd(result.totalCashInvested)} | Cap Rate ${result.goingInCapRatePct}% (vs ${result.benchmarkCapRatePct}% benchmark) | CoC ${result.cashOnCashPct}% | DSCR ${result.dscr}x | Levered IRR ${result.leveredIrrPct}% | After-Tax IRR ${result.afterTaxIrrPct}% | ${covenantNote}.`,
    data: result as unknown as Record<string, unknown>,
  };
}

// ── 6. Real Estate Market & Class Screening ──

export const realEstateCompareInputSchema = {
  marketId: z
    .string()
    .default("sudbury-on")
    .describe("Target market id for cross-class comparison (e.g. sudbury-on, calgary-ab, austin-tx, toronto-gta)."),
  propertyClass: PROPERTY_CLASS_ENUM.default("small_multifamily").describe(
    "Target property class for cross-market screening."
  ),
  rateOffsetPct: z
    .number()
    .min(-3)
    .max(5)
    .default(0)
    .describe("Optional interest rate stress offset in percentage points (e.g. +1.0 for +100bps shock)."),
};

export function handleCompareRealEstateMarkets(
  args: z.infer<z.ZodObject<typeof realEstateCompareInputSchema>>
): DecisionToolOutput {
  const market = getRealEstateMarket(args.marketId);
  const classComparison = compareRealEstateClasses(market.id, args.rateOffsetPct);
  const marketComparison = compareRealEstateMarkets(
    args.propertyClass as RealEstatePropertyClass,
    args.rateOffsetPct
  );
  const residentialVsCommercial = summarizeResidentialVsCommercial(classComparison, market);
  const topClass = classComparison[0];
  const topMarket = marketComparison[0];

  return {
    summary: `Real Estate Matrix (${market.name}, rate offset ${args.rateOffsetPct >= 0 ? "+" : ""}${args.rateOffsetPct}%): Top class in ${market.name} is ${topClass.label} (${topClass.leveredIrrPct}% IRR, ${topClass.goingInCapRatePct}% Cap, ${topClass.dscr}x DSCR). Top market for ${args.propertyClass} is ${topMarket.marketName} (${topMarket.leveredIrrPct}% IRR, score ${topMarket.compositeScore}/100). Recommended tilt: ${residentialVsCommercial.recommendedTilt}.`,
    data: {
      market,
      propertyClass: args.propertyClass,
      rateOffsetPct: args.rateOffsetPct,
      residentialVsCommercial,
      classComparison,
      marketComparison,
    },
  };
}

// ── 7. Fixed Income / Bond Duration ──

export const bondDurationInputSchema = {
  issuer: z.string().default("10Y Government Bond").describe("Bond issuer or ETF name."),
  faceValue: z.number().positive().default(1000).describe("Par/face value in USD."),
  couponRatePct: z.number().min(0).max(20).default(4.5).describe("Annual coupon rate %."),
  ytmPct: z.number().min(0).max(25).default(4.8).describe("Current yield-to-maturity %."),
  yearsToMaturity: z.number().min(0.5).max(50).default(10).describe("Years until maturity."),
  paymentsPerYear: z.number().int().min(1).max(12).default(2).describe("Coupon payments per year (2 = semi-annual)."),
};

export function handleBondDuration(
  args: z.infer<z.ZodObject<typeof bondDurationInputSchema>>
): DecisionToolOutput {
  const result = analyzeBondDuration(args);
  const shockUp100 = result.rateShocks.find((s) => s.bpsChange === 100);
  return {
    summary: `${result.issuer}: Fair Price $${result.fairPrice} | YTM ${result.ytmPct}% | Mod Duration ${result.modifiedDuration}y | Convexity ${result.convexity} | DV01 $${result.dv01Per10k}/$10k${shockUp100 ? ` | +100bps shock: ${shockUp100.pctChange}%` : ""}.`,
    data: result as unknown as Record<string, unknown>,
  };
}

// ── 8. Probabilistic Bet & Kelly Sizing (Prediction Markets & General Bets) ──

export const predictionBetInputSchema = {
  question: z.string().min(1).describe("The binary event or decision question."),
  venue: z.string().default("Polymarket").describe("Market venue or decision context."),
  side: z.enum(["YES", "NO"]).default("YES").describe("Side of the bet/decision."),
  yesPriceCents: z.number().min(1).max(99).describe("Market YES price in cents (1-99), i.e. implied probability %."),
  noPriceCents: z
    .number()
    .min(1)
    .max(99)
    .optional()
    .describe("Market NO price in cents (defaults to 102 - yesPriceCents to reflect ~2% spread/vig)."),
  estimatedTrueProbPct: z
    .number()
    .min(1)
    .max(99)
    .describe("Your calibrated estimate of the true YES probability (1-99%)."),
  feePct: z.number().min(0).max(15).default(1.5).describe("Trading/settlement fee %."),
  oracleRiskHaircutPct: z
    .number()
    .min(0)
    .max(30)
    .default(10)
    .describe("Haircut % for resolution ambiguity, execution risk, or model uncertainty."),
  stakeCapital: z.number().positive().default(10_000).describe("Total bankroll / capital pool allocated for sizing in USD."),
  resolutionDate: z.string().default("2027-12-31").describe("Expected resolution date (YYYY-MM-DD)."),
};

export function handleEvaluatePredictionBet(
  args: z.infer<z.ZodObject<typeof predictionBetInputSchema>>
): DecisionToolOutput {
  const noPriceCents =
    args.noPriceCents ?? Math.min(99, Math.max(1, 102 - args.yesPriceCents));
  const result = evaluatePredictionBet({
    ...args,
    noPriceCents,
  });
  const verdict =
    result.riskAdjustedKellyPct <= 0
      ? "PASS (Negative or Zero Risk-Adjusted Edge)"
      : result.expectedRoiPct >= 20
      ? "STRONG +EV BET"
      : "MODERATE +EV BET";

  return {
    summary: `${verdict} on "${result.question}" (${result.side} @ ${result.rawMarketPriceCents}c, vig ${result.overroundPct}%): Edge ${result.edgePct >= 0 ? "+" : ""}${result.edgePct}% | Expected ROI ${result.expectedRoiPct >= 0 ? "+" : ""}${result.expectedRoiPct}% | Breakeven Prob ${result.breakevenProbPct}% | Risk-Adjusted Kelly ${result.riskAdjustedKellyPct}% (${fmtUsd(result.recommendedDollarStake)} recommended stake).`,
    data: result as unknown as Record<string, unknown>,
  };
}

// ── 9. Options Pricing & Greeks (Black-Scholes-Merton) ──

export const optionStrategyInputSchema = {
  underlying: z.string().min(1).describe("Underlying ticker symbol."),
  strategy: z
    .enum(["long_call", "long_put", "bull_call_spread", "bear_put_spread", "long_straddle"])
    .default("bull_call_spread")
    .describe("Option structure to price."),
  spotPrice: z.number().positive().describe("Current underlying spot price in USD."),
  strikePrice: z.number().positive().describe("Primary strike price in USD."),
  upperStrikePrice: z
    .number()
    .positive()
    .optional()
    .describe("Second strike price for spreads (upper strike for bull call spread, lower/upper for bear put spread)."),
  daysToExpiry: z.number().min(1).max(1095).default(90).describe("Days to expiration."),
  impliedVolatilityPct: z.number().min(5).max(250).default(35).describe("Annualized implied volatility %."),
  riskFreeRatePct: z.number().min(0).max(15).default(4.2).describe("Risk-free interest rate %."),
  contracts: z.number().int().min(1).max(1000).default(1).describe("Number of option contracts (1 contract = 100 shares)."),
};

export function handlePriceOptionStrategy(
  args: z.infer<z.ZodObject<typeof optionStrategyInputSchema>>
): DecisionToolOutput {
  const result = priceOptionStrategy({
    ...args,
    strategy: args.strategy as OptionStrategyType,
  });
  return {
    summary: `${result.underlying} ${result.strategy} (${args.contracts}x, ${result.daysToExpiry} DTE, ${result.impliedVolatilityPct}% IV): Net Debit $${result.netDebitPerShare}/sh | Capital at Risk ${fmtUsd(result.totalCapitalAtRisk)} | Max Profit ${result.maxProfit === null ? "Unlimited" : fmtUsd(result.maxProfit)} | Breakeven ${result.breakevens.map((b) => `$${b}`).join(" / ")} | Prob of Profit ${result.probabilityOfProfitPct}% | Delta ${result.greeks.delta}, Theta ${result.greeks.thetaPerDay}/d.`,
    data: result as unknown as Record<string, unknown>,
  };
}

// ── 10. Venture / Startup Equity Power-Law Simulation ──

export const venturePowerlawInputSchema = {
  companyName: z.string().min(1).describe("Startup or private company name."),
  stage: z.enum(["Pre-Seed", "Seed", "Series A", "Growth"]).default("Seed").describe("Funding stage."),
  investmentAmount: z.number().positive().default(50_000).describe("Check size or equity value in USD."),
  valuationCap: z.number().positive().default(10_000_000).describe("Post-money valuation or SAFE cap in USD."),
  expectedDilutionPct: z.number().min(0).max(90).default(45).describe("Expected cumulative future dilution %."),
  failureProbPct: z.number().min(0).max(95).default(60).describe("Probability of 0x total loss %."),
  modestExitProbPct: z.number().min(0).max(95).default(25).describe("Probability of 1x-3x modest exit %."),
  breakoutProbPct: z.number().min(0).max(95).default(11).describe("Probability of 5x-15x breakout exit %."),
  powerLawProbPct: z.number().min(0).max(95).default(4).describe("Probability of 25x-100x power-law outcome %."),
  holdYears: z.number().min(1).max(15).default(7).describe("Expected years to liquidity."),
};

export function handleVenturePowerlaw(
  args: z.infer<z.ZodObject<typeof venturePowerlawInputSchema>>
): DecisionToolOutput {
  const result = simulateVenturePowerLaw(args);
  return {
    summary: `${result.companyName} (${result.stage}, ${fmtUsd(result.investmentAmount)} @ ${fmtUsd(args.valuationCap)} cap): Mean MOIC ${result.meanMoic}x vs Median ${result.medianMoic}x (P90 ${result.p90Moic}x) | Expected IRR ${result.expectedIrrPct}% | Prob of Loss ${result.probabilityOfLossPct}% | Breakeven Exit ${fmtUsd(result.breakevenExitValuation)}.`,
    data: result as unknown as Record<string, unknown>,
  };
}

// ── 11. CFA Forensic Accounting & Quality of Earnings ──

export const cfaForensicsInputSchema = {
  ticker: z.string().min(1).describe("Company ticker symbol."),
  revenuePrior: z.number().positive().optional().describe("Prior-year revenue ($M)."),
  revenueCurrent: z.number().positive().optional().describe("Current-year revenue ($M)."),
  receivablesPrior: z.number().min(0).optional().describe("Prior-year accounts receivable ($M)."),
  receivablesCurrent: z.number().min(0).optional().describe("Current-year accounts receivable ($M)."),
  grossMarginPriorPct: z.number().optional().describe("Prior-year gross margin %."),
  grossMarginCurrentPct: z.number().optional().describe("Current-year gross margin %."),
  ebit: z.number().optional().describe("Current EBIT ($M)."),
  netIncome: z.number().optional().describe("Current Net Income ($M)."),
  operatingCashFlow: z.number().optional().describe("Current Operating Cash Flow ($M)."),
  totalAssets: z.number().positive().optional().describe("Total Assets ($M)."),
  totalDebtCurrent: z.number().min(0).optional().describe("Current Total Debt ($M)."),
  marketCap: z.number().positive().optional().describe("Current Market Cap ($M)."),
  unleveredBeta: z.number().positive().optional().describe("Industry unlevered beta for Hamada WACC."),
};

export function handleForensicAccounting(
  args: z.infer<z.ZodObject<typeof cfaForensicsInputSchema>>
): DecisionToolOutput {
  const marketCapBillions = args.marketCap ? args.marketCap / 1000 : 50;
  const defaults = buildDefaultForensicInputs(args.ticker.toUpperCase(), marketCapBillions);
  const merged = {
    ...defaults,
    ticker: args.ticker.toUpperCase(),
    ...(args.revenuePrior !== undefined ? { revenuePrior: args.revenuePrior } : {}),
    ...(args.revenueCurrent !== undefined ? { revenueCurrent: args.revenueCurrent } : {}),
    ...(args.receivablesPrior !== undefined ? { receivablesPrior: args.receivablesPrior } : {}),
    ...(args.receivablesCurrent !== undefined ? { receivablesCurrent: args.receivablesCurrent } : {}),
    ...(args.grossMarginPriorPct !== undefined ? { grossMarginPriorPct: args.grossMarginPriorPct } : {}),
    ...(args.grossMarginCurrentPct !== undefined ? { grossMarginCurrentPct: args.grossMarginCurrentPct } : {}),
    ...(args.ebit !== undefined ? { ebit: args.ebit } : {}),
    ...(args.netIncome !== undefined ? { netIncome: args.netIncome } : {}),
    ...(args.operatingCashFlow !== undefined ? { operatingCashFlow: args.operatingCashFlow } : {}),
    ...(args.totalAssets !== undefined ? { totalAssets: args.totalAssets } : {}),
    ...(args.totalDebtCurrent !== undefined ? { totalDebtCurrent: args.totalDebtCurrent } : {}),
    ...(args.marketCap !== undefined ? { marketCap: args.marketCap } : {}),
    ...(args.unleveredBeta !== undefined ? { unleveredBeta: args.unleveredBeta } : {}),
  };
  const result = runCfaForensicAnalysis(merged);
  return {
    summary: `${result.ticker} Forensic Audit: Beneish M-Score ${result.beneishMScore} (${result.beneishFlag}) | Altman Z-Score ${result.altmanZScore} (${result.altmanZone}) | Sloan Accruals ${result.sloanAccrualsRatioPct}% | Cash Conversion ${result.cashConversionRatio}x | DuPont ROE ${result.dupontRoe.roePct}% | Hamada WACC ${result.bottomUpWacc.waccPct}%. Red flags: ${result.redFlags.length}.`,
    data: result as unknown as Record<string, unknown>,
  };
}

// ── 12. Global Cross-Border Tax Strategy Audit ──

export const globalTaxInputSchema = {
  residency: TAX_RESIDENCY_ENUM.default("canada_on").describe("Investor tax residency."),
  annualOrdinaryIncomeUsd: z.number().min(0).optional().describe("Annual ordinary income in USD."),
  portfolioValueUsd: z.number().positive().optional().describe("Investable portfolio value in USD."),
  foreignAllocationPct: z.number().min(0).max(100).optional().describe("% of portfolio invested in foreign assets."),
  foreignSourceCountry: FOREIGN_SOURCE_ENUM.optional().describe("Primary foreign investment source country."),
  targetGainToAccessUsd: z.number().min(0).optional().describe("Annual investment gain or liquidity target to extract in USD."),
  horizonYears: z.number().min(1).max(30).optional().describe("Compounding horizon in years."),
  businessAnnualProfitUsd: z.number().min(0).optional().describe("Annual business pre-tax profit (for entity optimization)."),
  foreignPropertyMarket: FOREIGN_RE_MARKET_ENUM.optional().describe("Foreign real estate market to audit."),
  foreignPropertyPriceUsd: z.number().positive().optional().describe("Foreign property purchase price in USD."),
};

export function handleGlobalTaxAudit(
  args: z.infer<z.ZodObject<typeof globalTaxInputSchema>>
): DecisionToolOutput {
  const base = buildDefaultGlobalTaxProfile();
  const profile = {
    ...base,
    residency: args.residency as TaxResidencyId,
    ...(args.annualOrdinaryIncomeUsd !== undefined ? { annualOrdinaryIncomeUsd: args.annualOrdinaryIncomeUsd } : {}),
    ...(args.portfolioValueUsd !== undefined ? { portfolioValueUsd: args.portfolioValueUsd } : {}),
    ...(args.foreignAllocationPct !== undefined ? { foreignAllocationPct: args.foreignAllocationPct } : {}),
    ...(args.foreignSourceCountry !== undefined ? { foreignSourceCountry: args.foreignSourceCountry as ForeignSourceCountryId } : {}),
    ...(args.targetGainToAccessUsd !== undefined ? { targetGainToAccessUsd: args.targetGainToAccessUsd } : {}),
    ...(args.horizonYears !== undefined ? { horizonYears: args.horizonYears } : {}),
    ...(args.businessAnnualProfitUsd !== undefined ? { businessAnnualProfitUsd: args.businessAnnualProfitUsd } : {}),
    ...(args.foreignPropertyMarket !== undefined ? { foreignPropertyMarket: args.foreignPropertyMarket as ForeignRealEstateMarketId } : {}),
    ...(args.foreignPropertyPriceUsd !== undefined ? { foreignPropertyPriceUsd: args.foreignPropertyPriceUsd } : {}),
  };
  const report = runGlobalTaxAudit(profile);
  return {
    summary: `Global Tax Audit (${report.residency.label}, ${report.effectiveMarginalRatePct}% marginal rate): Tax Efficiency ${report.taxEfficiencyScore}/100 | Est. Annual Tax Alpha ${fmtUsd(report.estimatedAnnualTaxAlphaUsd)} | Best Wrapper: ${report.bestAccountWrapper} | Best Gain Stream: ${report.bestGainStream} | Best Entity: ${report.bestBusinessStructure} | Foreign RE After-Tax IRR (${report.foreignRealEstate.marketLabel}): ${report.foreignRealEstate.afterTaxIrrPct}%.`,
    data: report as unknown as Record<string, unknown>,
  };
}

// ── 13. Search Live Prediction Markets ──

export const companyFundamentalsInputSchema = fundamentalsRequestSchema;

export async function handleCompanyFundamentals(
  args: z.infer<z.ZodObject<typeof companyFundamentalsInputSchema>>
): Promise<DecisionToolOutput> {
  const { ticker, asOf, ...view } = args;
  const fundamentals = await getCompanyFundamentals(ticker, { asOf });
  return {
    summary: summarizeFundamentals(fundamentals),
    data: presentFundamentals(fundamentals, view) as unknown as Record<string, unknown>,
  };
}

export const companyModelInputSchema = companyModelRequestSchema;

export async function handleBuildCompanyModel(
  args: z.infer<z.ZodObject<typeof companyModelInputSchema>>
): Promise<DecisionToolOutput> {
  const model = await buildCompanyModel(args.ticker, toBuildOptions(args));
  return {
    summary: summarizeModel(model),
    data: presentModel(model, args.detail) as unknown as Record<string, unknown>,
  };
}

export const searchMarketsInputSchema = {
  query: z.string().min(1).describe("Topic or event keywords to search live prediction markets (e.g. 'Fed rate cut', 'AI', 'copper', 'Canada')."),
};

export async function handleSearchPredictionMarkets(
  args: z.infer<z.ZodObject<typeof searchMarketsInputSchema>>
): Promise<DecisionToolOutput> {
  const { markets, liveCount } = await searchPredictionMarkets(args.query);
  const top = markets.slice(0, 3);
  const topLine = top
    .map((m) => `"${m.question}" (${m.venue}: YES ${m.yesPriceCents}c)`)
    .join("; ");
  return {
    summary: `Found ${markets.length} prediction markets (${liveCount > 0 ? `${liveCount} live` : "deterministic fallback"}) for "${args.query}". Top: ${topLine || "none"}.`,
    data: {
      query: args.query,
      liveCount,
      source: liveCount > 0 ? "live-api" : "synthetic-fallback",
      markets,
    },
  };
}

// ── 14. Query Intelligence Corpus ──

export const queryIntelInputSchema = {
  query: z.string().default("").describe("Keywords or thesis topic to match."),
  tickers: z.array(z.string()).default([]).describe("Optional list of ticker symbols to filter (e.g. ['VALE', 'ETN'])."),
  sourceFilter: z
    .enum(["all", "newsletter", "news", "podcast", "filing", "macro"])
    .default("all")
    .describe("Filter by intelligence source type."),
  liveFetch: z
    .boolean()
    .default(false)
    .describe("If true, attempts live RSS/SEC/macro feed refresh; otherwise uses fast curated corpus."),
};

export async function handleQueryIntelligence(
  args: z.infer<z.ZodObject<typeof queryIntelInputSchema>>
): Promise<DecisionToolOutput> {
  const upperTickers = args.tickers.map((t) => t.toUpperCase());
  let signals = CURATED_INTEL_SIGNALS;
  let liveCount = 0;

  if (args.liveFetch) {
    const res = await fetchIntelligenceCorpus(args.query, upperTickers);
    signals = res.signals;
    liveCount = res.liveCount;
  }

  const qLower = args.query.toLowerCase();
  const filtered = signals.filter((s) => {
    const matchSource = args.sourceFilter === "all" || s.sourceType === args.sourceFilter;
    const matchTicker =
      upperTickers.length === 0 ||
      s.tickers.some((t) => upperTickers.includes(t.toUpperCase()));
    const matchQuery =
      !qLower ||
      s.title.toLowerCase().includes(qLower) ||
      s.summary.toLowerCase().includes(qLower);
    return matchSource && matchTicker && matchQuery;
  });

  const avgSent = filtered.length
    ? round(filtered.reduce((acc, s) => acc + s.sentimentScore, 0) / filtered.length, 2)
    : 0;

  return {
    summary: `Intelligence Corpus: ${filtered.length} matching signals (avg sentiment ${avgSent >= 0 ? "+" : ""}${avgSent}${liveCount > 0 ? `, ${liveCount} live` : ""}). Top: ${filtered[0]?.title ?? "none"}.`,
    data: {
      totalMatched: filtered.length,
      averageSentiment: avgSent,
      liveCount,
      signals: filtered.slice(0, 12),
    },
  };
}

// ── 15. Composite Decision Tool: Compare Competing Options Head-to-Head ──

const DECISION_OPTION_SCHEMA = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("real_estate"),
    label: z.string().describe("Option name (e.g. 'Buy Sudbury 4-Plex')."),
    propertyClass: PROPERTY_CLASS_ENUM.default("small_multifamily"),
    marketId: z.string().default("sudbury-on"),
    purchasePrice: z.number().positive().optional(),
    downPaymentPct: z.number().min(5).max(100).optional(),
    grossAnnualRent: z.number().positive().optional(),
    mortgageRatePct: z.number().min(1).max(18).optional(),
  }),
  z.object({
    kind: z.literal("portfolio"),
    label: z.string().describe("Option name (e.g. 'Invest in Diversified ETF Portfolio')."),
    expectedReturnPct: z.number().min(-10).max(35).default(8.5),
    volatilityPct: z.number().min(1).max(100).default(15),
    taxSheltered: z.boolean().default(true).describe("Whether held inside a tax-free wrapper (TFSA/Roth/ISA)."),
  }),
  z.object({
    kind: z.literal("bond"),
    label: z.string().describe("Option name (e.g. '5Y Government Bond / GIC Ladder')."),
    couponRatePct: z.number().min(0).max(20).default(4.5),
    ytmPct: z.number().min(0).max(25).default(4.6),
    taxSheltered: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("prediction_bet"),
    label: z.string().describe("Option name (e.g. 'Asymmetric Event Contract')."),
    question: z.string().default("Binary outcome bet"),
    side: z.enum(["YES", "NO"]).default("YES"),
    yesPriceCents: z.number().min(1).max(99),
    estimatedTrueProbPct: z.number().min(1).max(99),
  }),
  z.object({
    kind: z.literal("venture"),
    label: z.string().describe("Option name (e.g. 'Angel Check / Startup Equity')."),
    stage: z.enum(["Pre-Seed", "Seed", "Series A", "Growth"]).default("Seed"),
    valuationCap: z.number().positive().default(10_000_000),
    failureProbPct: z.number().min(0).max(95).default(60),
  }),
]);

export const compareDecisionOptionsInputSchema = {
  decisionQuestion: z
    .string()
    .min(1)
    .describe("The human decision being evaluated (e.g. 'Deploy $120k into Sudbury duplex vs TFSA ETFs vs GICs')."),
  capitalUsd: z.number().positive().default(100_000).describe("Capital being allocated in USD."),
  horizonYears: z.number().min(1).max(30).default(7).describe("Decision evaluation horizon in years."),
  residency: TAX_RESIDENCY_ENUM.default("canada_on").describe("Tax residency for after-tax adjustment."),
  riskProfile: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
  options: z
    .array(DECISION_OPTION_SCHEMA)
    .min(2)
    .max(5)
    .describe("2 to 5 concrete competing options to compare apples-to-apples."),
};

export function handleCompareDecisionOptions(
  args: z.infer<z.ZodObject<typeof compareDecisionOptionsInputSchema>>
): DecisionToolOutput {
  const taxProfile = {
    ...buildDefaultGlobalTaxProfile(),
    residency: args.residency as TaxResidencyId,
  };
  const taxAudit = runGlobalTaxAudit(taxProfile);
  const ltcgTaxFrac = taxAudit.residency.ltcgRatePct / 100;
  const interestTaxFrac = taxAudit.residency.interestRatePct / 100;

  const evaluated = args.options.map((opt) => {
    if (opt.kind === "real_estate") {
      const preset = buildRealEstatePresetInputs(
        opt.propertyClass as RealEstatePropertyClass,
        opt.marketId
      );
      const downPct = opt.downPaymentPct ?? preset.downPaymentPct;
      const inferredPurchasePrice =
        opt.purchasePrice ?? Math.round(args.capitalUsd / ((downPct + preset.closingCostsPct) / 100));
      const scale = preset.purchasePrice > 0 ? inferredPurchasePrice / preset.purchasePrice : 1;
      const deal = analyzeRealEstateDeal({
        ...preset,
        propertyName: opt.label,
        purchasePrice: inferredPurchasePrice,
        downPaymentPct: downPct,
        grossAnnualRent: opt.grossAnnualRent ?? Math.round(preset.grossAnnualRent * scale),
        mortgageRatePct: opt.mortgageRatePct ?? preset.mortgageRatePct,
        holdYears: args.horizonYears,
      });
      const projectedValue = Math.round(args.capitalUsd * deal.equityMultiple);
      const worstCell = [...deal.sensitivityGrid].sort(
        (a, b) => a.leveredIrrPct - b.leveredIrrPct
      )[0];
      const stressedIrr = worstCell
        ? Math.min(worstCell.leveredIrrPct - 8, deal.leveredIrrPct - 12)
        : round(deal.leveredIrrPct - 12, 1);
      const downsideP10Value = Math.round(
        args.capitalUsd * Math.pow(Math.max(0.5, 1 + stressedIrr / 100), args.horizonYears)
      );
      const covenantBreaches = deal.lenderCovenantChecks.filter((c) => c.status === "BREACH").length;
      return {
        label: opt.label,
        kind: opt.kind,
        expectedAfterTaxIrrPct: deal.afterTaxIrrPct,
        projectedMedianValueUsd: projectedValue,
        downsideP10ValueUsd: Math.max(0, downsideP10Value),
        probabilityOfLossPct: covenantBreaches > 0 ? 35 : deal.dscr < 1.2 ? 25 : 15,
        liquidityRating: "Low (Months to Sell, 5-6% Transaction Cost)",
        effortLevel: "High (Property & Tenant Management)",
        keyMetrics: {
          purchasePrice: inferredPurchasePrice,
          goingInCapRatePct: deal.goingInCapRatePct,
          cashOnCashPct: deal.cashOnCashPct,
          dscr: deal.dscr,
          leveredIrrPct: deal.leveredIrrPct,
          covenantBreaches,
        },
        keyRisk:
          covenantBreaches > 0
            ? `Fails ${covenantBreaches} lender covenant(s); DSCR ${deal.dscr}x is tight under rate/vacancy stress.`
            : `Illiquid & leveraged (${deal.ltvPct}% LTV); sensitive to +100bps refinancing and exit cap expansion.`,
      };
    }

    if (opt.kind === "portfolio") {
      const effectiveReturn = opt.taxSheltered
        ? opt.expectedReturnPct
        : round(opt.expectedReturnPct * (1 - ltcgTaxFrac * 0.65), 2);
      const mc = runMonteCarloSimulation({
        initialCapital: args.capitalUsd,
        monthlyContribution: 0,
        horizonYears: args.horizonYears,
        expectedReturnPct: effectiveReturn,
        volatilityPct: opt.volatilityPct,
      });
      return {
        label: opt.label,
        kind: opt.kind,
        expectedAfterTaxIrrPct: effectiveReturn,
        projectedMedianValueUsd: mc.medianEndingValue,
        downsideP10ValueUsd: mc.downsideP10Value,
        probabilityOfLossPct: mc.probabilityOfLossPct,
        liquidityRating: "High (T+1 Public Markets)",
        effortLevel: "Low (Passive Rebalancing)",
        keyMetrics: {
          preTaxReturnPct: opt.expectedReturnPct,
          volatilityPct: opt.volatilityPct,
          taxSheltered: opt.taxSheltered,
          upsideP90ValueUsd: mc.upsideP90Value,
          probabilityOfDoublingPct: mc.probabilityOfDoublingPct,
        },
        keyRisk: `Market drawdown volatility (${opt.volatilityPct}%/yr); P10 downside ends at ${fmtUsd(mc.downsideP10Value)}.`,
      };
    }

    if (opt.kind === "bond") {
      const bond = analyzeBondDuration({
        issuer: opt.label,
        faceValue: 1000,
        couponRatePct: opt.couponRatePct,
        ytmPct: opt.ytmPct,
        yearsToMaturity: args.horizonYears,
        paymentsPerYear: 2,
      });
      const afterTaxYtm = opt.taxSheltered
        ? opt.ytmPct
        : round(opt.ytmPct * (1 - interestTaxFrac), 2);
      const medianVal = Math.round(
        args.capitalUsd * Math.pow(1 + afterTaxYtm / 100, args.horizonYears)
      );
      const shockUp200 = bond.rateShocks.find((s) => s.bpsChange === 200);
      const markToMarketDownside = Math.round(
        args.capitalUsd * (1 + (shockUp200?.pctChange ?? -8) / 100)
      );
      return {
        label: opt.label,
        kind: opt.kind,
        expectedAfterTaxIrrPct: afterTaxYtm,
        projectedMedianValueUsd: medianVal,
        downsideP10ValueUsd: Math.min(medianVal, markToMarketDownside),
        probabilityOfLossPct: 2,
        liquidityRating: "High (T+1 Bonds / Ladder)",
        effortLevel: "Very Low",
        keyMetrics: {
          preTaxYtmPct: opt.ytmPct,
          modifiedDuration: bond.modifiedDuration,
          taxSheltered: opt.taxSheltered,
        },
        keyRisk: `Inflation/purchasing-power erosion and ${shockUp200?.pctChange ?? -8}% mark-to-market drop if rates jump +200bps.`,
      };
    }

    if (opt.kind === "prediction_bet") {
      const bet = evaluatePredictionBet({
        question: opt.question,
        venue: "Prediction Market",
        side: opt.side,
        yesPriceCents: opt.yesPriceCents,
        noPriceCents: Math.min(99, Math.max(1, 102 - opt.yesPriceCents)),
        estimatedTrueProbPct: opt.estimatedTrueProbPct,
        feePct: 1.5,
        oracleRiskHaircutPct: 10,
        stakeCapital: args.capitalUsd,
        resolutionDate: "2027-12-31",
      });
      const kellyDeploy = bet.recommendedDollarStake;
      const restCash = Math.max(0, args.capitalUsd - kellyDeploy);
      const expectedValue = Math.round(args.capitalUsd + bet.expectedDollarProfit * (kellyDeploy / Math.max(1, args.capitalUsd)));
      const probWin = opt.side === "YES" ? opt.estimatedTrueProbPct : 100 - opt.estimatedTrueProbPct;
      return {
        label: opt.label,
        kind: opt.kind,
        expectedAfterTaxIrrPct: round(bet.expectedRoiPct * (bet.riskAdjustedKellyPct / 100), 2),
        projectedMedianValueUsd: expectedValue,
        downsideP10ValueUsd: Math.round(restCash),
        probabilityOfLossPct: round(100 - probWin, 1),
        liquidityRating: "Medium (Event Resolution / Orderbook)",
        effortLevel: "Medium (Research & Resolution Tracking)",
        keyMetrics: {
          edgePct: bet.edgePct,
          expectedRoiPct: bet.expectedRoiPct,
          riskAdjustedKellyPct: bet.riskAdjustedKellyPct,
          recommendedDollarStake: bet.recommendedDollarStake,
        },
        keyRisk: `Binary loss of staked capital (${fmtUsd(kellyDeploy)}) if wrong (${round(100 - probWin, 1)}% chance) plus oracle resolution risk.`,
      };
    }

    // venture
    const v = simulateVenturePowerLaw({
      companyName: opt.label,
      stage: opt.stage,
      investmentAmount: args.capitalUsd,
      valuationCap: opt.valuationCap,
      expectedDilutionPct: 45,
      failureProbPct: opt.failureProbPct,
      modestExitProbPct: Math.max(5, Math.round((100 - opt.failureProbPct) * 0.6)),
      breakoutProbPct: Math.max(2, Math.round((100 - opt.failureProbPct) * 0.3)),
      powerLawProbPct: Math.max(1, Math.round((100 - opt.failureProbPct) * 0.1)),
      holdYears: args.horizonYears,
    });
    return {
      label: opt.label,
      kind: opt.kind,
      expectedAfterTaxIrrPct: v.expectedIrrPct,
      projectedMedianValueUsd: Math.round(args.capitalUsd * v.medianMoic),
      downsideP10ValueUsd: 0,
      probabilityOfLossPct: v.probabilityOfLossPct,
      liquidityRating: "Very Low (7-10Y Illiquid Lockup)",
      effortLevel: "Low-Medium (Diligence)",
      keyMetrics: {
        meanMoic: v.meanMoic,
        medianMoic: v.medianMoic,
        p90Moic: v.p90Moic,
        breakevenExitValuation: v.breakevenExitValuation,
      },
      keyRisk: `Extreme right-skew: ${v.probabilityOfLossPct}% chance of total loss; median MOIC is ${v.medianMoic}x despite ${v.meanMoic}x mean.`,
    };
  });

  // Score options according to user risk profile
  const scored = evaluated.map((item) => {
    const downsideRatio = item.downsideP10ValueUsd / Math.max(1, args.capitalUsd);
    const returnWeight = args.riskProfile === "aggressive" ? 0.65 : args.riskProfile === "conservative" ? 0.25 : 0.45;
    const safetyWeight = 1 - returnWeight;
    const compositeScore = round(
      item.expectedAfterTaxIrrPct * 3.5 * returnWeight +
        downsideRatio * 55 * safetyWeight -
        item.probabilityOfLossPct * (args.riskProfile === "conservative" ? 0.5 : 0.18),
      1
    );
    return { ...item, compositeScore };
  });

  scored.sort((a, b) => b.compositeScore - a.compositeScore);
  const winner = scored[0];
  const highestReturn = [...scored].sort((a, b) => b.expectedAfterTaxIrrPct - a.expectedAfterTaxIrrPct)[0];
  const safest = [...scored].sort((a, b) => b.downsideP10ValueUsd - a.downsideP10ValueUsd)[0];

  return {
    summary: `Decision Comparison for "${args.decisionQuestion}" (${fmtUsd(args.capitalUsd)}, ${args.horizonYears}Y, ${taxAudit.residency.label}, ${args.riskProfile} profile): Best overall risk-adjusted fit is "${winner.label}" (${winner.expectedAfterTaxIrrPct}% after-tax IRR, P10 downside ${fmtUsd(winner.downsideP10ValueUsd)}). Highest return: "${highestReturn.label}" (${highestReturn.expectedAfterTaxIrrPct}%). Safest floor: "${safest.label}" (P10 ${fmtUsd(safest.downsideP10ValueUsd)}).`,
    data: {
      decisionQuestion: args.decisionQuestion,
      capitalUsd: args.capitalUsd,
      horizonYears: args.horizonYears,
      residency: taxAudit.residency.label,
      riskProfile: args.riskProfile,
      recommendedOption: winner.label,
      highestReturnOption: highestReturn.label,
      safestFloorOption: safest.label,
      rankedOptions: scored,
    },
  };
}

// ── 16. Full Adversarial Investment Committee (Bull / Bear / Risk / Tax / CIO) ──

export const adversarialCommitteeInputSchema = {
  title: z.string().min(1).describe("Short title for the investment or capital decision."),
  thesisPrompt: z
    .string()
    .min(10)
    .describe("Detailed thesis, decision context, and what the user is considering doing."),
  mode: z
    .enum(["any_outcome", "hedge_fund", "portfolio", "prediction", "options", "real_assets", "venture"])
    .default("any_outcome")
    .describe("Decision mode (defaults to 'any_outcome' for universal multi-asset synthesis)."),
  jurisdiction: z.enum(["Canada", "US", "Global"]).default("Canada"),
  riskProfile: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
  capital: z.number().positive().default(100_000).describe("Capital at stake in USD."),
  monthlyContribution: z.number().min(0).default(1000).describe("Monthly recurring contribution in USD."),
  horizonYears: z.number().min(1).max(30).default(5).describe("Decision time horizon in years."),
  holdings: z
    .array(HOLDING_SCHEMA)
    .optional()
    .describe("Optional portfolio holdings; if omitted, uses a balanced benchmark basket so the committee can still run."),
  useGeminiIfAvailable: z
    .boolean()
    .default(true)
    .describe("If true and GEMINI_API_KEY is configured, runs live Gemini multi-agent debate; otherwise runs deterministic quant synthesis."),
};

export async function handleRunAdversarialCommittee(
  args: z.infer<z.ZodObject<typeof adversarialCommitteeInputSchema>>,
  geminiApiKey?: string
): Promise<DecisionToolOutput> {
  const defaultPayload = PRESET_SCENARIOS[0].payload;
  const holdings =
    args.holdings && args.holdings.length > 0
      ? normalizeHoldings(args.holdings)
      : defaultPayload.holdings;

  const request: AnalysisRequestPayload = {
    ...defaultPayload,
    title: args.title,
    thesisPrompt: args.thesisPrompt,
    analysisMode: args.mode as AnalysisMode,
    jurisdiction: args.jurisdiction as Jurisdiction,
    capital: args.capital,
    monthlyContribution: args.monthlyContribution,
    horizonYears: args.horizonYears,
    riskProfile: args.riskProfile as RiskProfile,
    holdings,
  };

  const apiKey = args.useGeminiIfAvailable
    ? geminiApiKey || process.env.GEMINI_API_KEY
    : undefined;

  const result = await runUniversalWorkforce(request, apiKey, () => {
    // Silent event sink for stateless MCP invocation
  });

  const memo = result.cioMemo;
  return {
    summary: `CIO Committee Verdict (${result.mode}): ${memo.rating} | Conviction ${memo.convictionScore}/100 — ${memo.headline}. ${memo.executiveSummary}`,
    data: {
      mode: result.mode,
      routingPlan: result.routingPlan,
      cioMemo: memo,
      agentDebateSummary: result.debateTurns.map((t) => ({
        role: t.role,
        agentName: t.agentName,
        title: t.title,
        confidencePct: t.confidencePct,
        keyPoints: t.keyPoints,
      })),
      portfolioMetrics: result.portfolioMetrics,
      worstMacroShock: [...result.macroShocks].sort(
        (a, b) => a.portfolioImpactPct - b.portfolioImpactPct
      )[0],
    },
  };
}
