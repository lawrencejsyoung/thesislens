import { FunctionDeclaration, Type } from "@google/genai";
import {
  AnalysisRequestPayload,
  UniversalQuantBundle,
} from "../types";
import {
  runDcfValuation,
  runMonteCarloSimulation,
} from "../quant-engine";
import { evaluatePredictionBet } from "./prediction-ev";
import { priceOptionStrategy } from "./options-bsm";
import { analyzeBondDuration, analyzeRealEstateDeal } from "./real-assets-credit";
import { simulateVenturePowerLaw } from "./venture-powerlaw";
import {
  analyzeHedgeFundRisk,
  buildDefaultForensicInputs,
  runCfaForensicAnalysis,
  runLiquidityAndComplianceCheck,
} from "./cfa-institutional";
import { CURATED_INTEL_SIGNALS } from "../adapters/intel-ingestion";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export const UNIVERSAL_QUANT_TOOLS: FunctionDeclaration[] = [
  {
    name: "run_dcf_valuation",
    description:
      "Runs a 5-year Discounted Cash Flow (DCF) intrinsic valuation model with WACC and terminal growth sensitivity analysis.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        waccAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional WACC shift in percentage points (e.g. -0.5 bull, +1.0 bear).",
        },
        growthAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional 5-year FCF growth shift in percentage points.",
        },
      },
    },
  },
  {
    name: "run_monte_carlo_simulation",
    description:
      "Runs an 800-path Geometric Brownian Motion Monte Carlo simulation to project P10/P50/P90 portfolio wealth and probability of doubling.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        horizonYears: {
          type: Type.NUMBER,
          description: "Investment horizon in years.",
        },
      },
    },
  },
  {
    name: "analyze_portfolio_metrics",
    description:
      "Computes cross-asset portfolio weighted beta, expected return, annualized volatility, Sharpe ratio, max drawdown estimate, and HHI concentration index.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeSectorBreakdown: {
          type: Type.BOOLEAN,
          description: "Whether to include sector/asset-class weight breakdown.",
        },
      },
    },
  },
  {
    name: "stress_test_cross_asset_shocks",
    description:
      "Stress-tests the portfolio across 6 institutional cross-asset regimes: +100bps Rate Shock, AI Capex Digestion, Hard Landing Recession, Critical Minerals Supercycle, Stagflation/Debasement, and VIX>45 Liquidity Crunch.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        focusRegime: {
          type: Type.STRING,
          description: "Optional focus macro regime id.",
        },
      },
    },
  },
  {
    name: "evaluate_prediction_bet",
    description:
      "Evaluates a binary prediction market or future-outcome contract: strips vig/overround, calculates Expected Value (EV), ROI, Full/Half/Quarter Kelly sizing, and Oracle-Risk Haircut.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        estimatedTrueProbPct: {
          type: Type.NUMBER,
          description: "Optional override for estimated true YES probability (1-99).",
        },
        oracleRiskHaircutPct: {
          type: Type.NUMBER,
          description: "Optional haircut % for resolution/oracle ambiguity (0-30).",
        },
      },
    },
  },
  {
    name: "price_option_strategy",
    description:
      "Prices a single- or multi-leg option strategy via Black-Scholes-Merton, computing Greeks (Delta, Gamma, Theta, Vega, Rho), max profit/loss, breakevens, and Probability of Profit.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ivAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional Implied Volatility shift in percentage points (e.g. +10 for vol spike, -10 for vol crush).",
        },
        daysToExpiry: {
          type: Type.NUMBER,
          description: "Optional days to expiration override.",
        },
      },
    },
  },
  {
    name: "analyze_real_estate_deal",
    description:
      "Models a leveraged real estate or real-asset investment: NOI, Going-in Cap Rate, DSCR, Cash-on-Cash return, and 5-10Y Levered IRR.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mortgageRateAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional shift in mortgage interest rate in percentage points.",
        },
        exitCapAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional shift in exit cap rate in percentage points.",
        },
      },
    },
  },
  {
    name: "analyze_bond_duration",
    description:
      "Computes Fixed Income fair price, YTM, Macaulay/Modified Duration, Convexity, DV01, and +/-200bps rate-shock price changes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ytmAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional YTM shift in percentage points.",
        },
      },
    },
  },
  {
    name: "simulate_venture_powerlaw",
    description:
      "Runs a 1,200-path Power-Law Venture/SAFE Monte Carlo with dilution waterfall, computing Mean vs. Median MOIC, expected IRR, probability of loss, and breakeven exit valuation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        failureProbAdjustmentPct: {
          type: Type.NUMBER,
          description: "Optional adjustment to failure probability in percentage points.",
        },
      },
    },
  },
  {
    name: "run_cfa_forensic_accounting",
    description:
      "Runs CFA Level II/III forensic accounting & quality-of-earnings diagnostics: Beneish M-Score, Altman Z-Score, Sloan Accruals Ratio, Cash Conversion, DuPont 3-stage ROE, and Bottom-Up Hamada WACC.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        receivablesGrowthShockPct: {
          type: Type.NUMBER,
          description: "Optional stress shock to receivables growth % to test earnings quality sensitivity.",
        },
      },
    },
  },
  {
    name: "run_hedge_fund_risk_book",
    description:
      "Computes institutional Long/Short hedge fund risk book: Gross/Net/Beta-Adjusted exposure, signed covariance volatility, 95% Monthly VaR, 99% Fat-Tail CVaR, Sortino/Calmar, Fama-French factor tilts, MCTR, short borrow drag, and Black-Litterman optimal weights.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        aumUsdOverride: {
          type: Type.NUMBER,
          description: "Optional AUM override in USD (e.g., 100000000 for $100M fund).",
        },
      },
    },
  },
  {
    name: "run_liquidity_and_compliance_check",
    description:
      "Runs $100M hedge fund Almgren-Chriss market impact, 20-day ADV days-to-liquidate, and pre-trade compliance checks (single-name cap, gross leverage, 99% CVaR limit, illiquidity bucket, CFA forensic gate).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        maxAdvParticipationPct: {
          type: Type.NUMBER,
          description: "Max % of 20-day ADV allowed per trading day (default 15%).",
        },
      },
    },
  },
  {
    name: "query_intelligence_corpus",
    description:
      "Searches ingested newsletters, financial news wires, podcasts, SEC filings, and central bank macro feeds for ticker claims, consensus sentiment, novelty scores, and upcoming catalysts.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        sourceFilter: {
          type: Type.STRING,
          description: "Optional filter: 'all', 'newsletter', 'news', 'podcast', 'filing', or 'macro'.",
        },
        tickerFilter: {
          type: Type.STRING,
          description: "Optional ticker symbol to filter intelligence signals (e.g. VALE, ETN, CCJ).",
        },
      },
    },
  },
];

export function executeUniversalQuantTool(
  name: string,
  args: Record<string, unknown>,
  request: AnalysisRequestPayload,
  quant: UniversalQuantBundle
): { payload: Record<string, unknown>; summary: string } {
  if (name === "run_dcf_valuation") {
    const waccAdj = typeof args.waccAdjustmentPct === "number" ? args.waccAdjustmentPct : 0;
    const growthAdj = typeof args.growthAdjustmentPct === "number" ? args.growthAdjustmentPct : 0;
    const res =
      waccAdj !== 0 || growthAdj !== 0
        ? runDcfValuation({
            ...request.dcfInputs,
            waccPct: Math.max(5, request.dcfInputs.waccPct + waccAdj),
            revenueGrowthYear1To5Pct: Math.max(
              -5,
              request.dcfInputs.revenueGrowthYear1To5Pct + growthAdj
            ),
          })
        : quant.dcfResult;
    return {
      payload: {
        ticker: res.ticker,
        currentPrice: res.currentPrice,
        impliedSharePrice: res.impliedSharePrice,
        upsidePct: res.upsidePct,
        waccPct: res.waccPct,
        terminalGrowthPct: res.terminalGrowthPct,
        enterpriseValueBillions: res.enterpriseValueBillions,
      },
      summary: `${res.ticker} DCF Fair Value: $${res.impliedSharePrice} vs $${res.currentPrice} (${res.upsidePct >= 0 ? "+" : ""}${res.upsidePct}% @ ${res.waccPct}% WACC)`,
    };
  }

  if (name === "run_monte_carlo_simulation") {
    const horizon =
      typeof args.horizonYears === "number" ? args.horizonYears : request.horizonYears;
    const res =
      horizon !== request.horizonYears
        ? runMonteCarloSimulation({
            initialCapital: request.capital,
            monthlyContribution: request.monthlyContribution,
            horizonYears: horizon,
            expectedReturnPct: quant.portfolioMetrics.expectedAnnualReturnPct,
            volatilityPct: quant.portfolioMetrics.annualVolatilityPct,
          })
        : quant.monteCarlo;
    return {
      payload: {
        horizonYears: res.horizonYears,
        medianEndingValue: res.medianEndingValue,
        downsideP10Value: res.downsideP10Value,
        upsideP90Value: res.upsideP90Value,
        probabilityOfDoublingPct: res.probabilityOfDoublingPct,
        probabilityOfLossPct: res.probabilityOfLossPct,
      },
      summary: `${res.horizonYears}Y Monte Carlo (${res.simulations} paths): Median ${formatCurrency(res.medianEndingValue)} | P10 ${formatCurrency(res.downsideP10Value)} | P90 ${formatCurrency(res.upsideP90Value)}`,
    };
  }

  if (name === "analyze_portfolio_metrics") {
    const m = quant.portfolioMetrics;
    return {
      payload: { ...m },
      summary: `Beta ${m.weightedBeta} | Exp Return ${m.expectedAnnualReturnPct}% | Vol ${m.annualVolatilityPct}% | Sharpe ${m.sharpeRatio} | HHI ${m.concentrationHhi} (${m.concentrationLabel})`,
    };
  }

  if (name === "stress_test_cross_asset_shocks" || name === "stress_test_macro_shock") {
    const worst = [...quant.macroShocks].sort(
      (a, b) => a.portfolioImpactPct - b.portfolioImpactPct
    )[0];
    const best = [...quant.macroShocks].sort(
      (a, b) => b.portfolioImpactPct - a.portfolioImpactPct
    )[0];
    return {
      payload: { scenarios: quant.macroShocks },
      summary: `Worst shock: ${worst.name} (${worst.portfolioImpactPct}%, ${formatCurrency(worst.dollarImpact)}) | Best tailwind: ${best.name} (${best.portfolioImpactPct >= 0 ? "+" : ""}${best.portfolioImpactPct}%)`,
    };
  }

  if (name === "evaluate_prediction_bet") {
    const baseInput = request.predictionInputs ?? {
      question: request.title,
      venue: "Polymarket / Kalshi",
      side: "YES" as const,
      yesPriceCents: 42,
      noPriceCents: 60,
      estimatedTrueProbPct: 56,
      feePct: 1.5,
      oracleRiskHaircutPct: 10,
      stakeCapital: request.capital,
      resolutionDate: "2027-12-31",
    };
    const res = evaluatePredictionBet({
      ...baseInput,
      estimatedTrueProbPct:
        typeof args.estimatedTrueProbPct === "number"
          ? args.estimatedTrueProbPct
          : baseInput.estimatedTrueProbPct,
      oracleRiskHaircutPct:
        typeof args.oracleRiskHaircutPct === "number"
          ? args.oracleRiskHaircutPct
          : baseInput.oracleRiskHaircutPct,
    });
    return {
      payload: { ...res, sensitivityGrid: undefined },
      summary: `${res.side} @ ${res.rawMarketPriceCents}¢ (Fair ${res.fairImpliedProbPct}% vs True ${res.estimatedTrueProbPct}%, Edge ${res.edgePct >= 0 ? "+" : ""}${res.edgePct}%) → EV ROI ${res.expectedRoiPct >= 0 ? "+" : ""}${res.expectedRoiPct}% | Risk-Adj Kelly ${res.riskAdjustedKellyPct}% (${formatCurrency(res.recommendedDollarStake)})`,
    };
  }

  if (name === "price_option_strategy") {
    const baseInput = request.optionInputs ?? {
      underlying: request.dcfInputs.ticker,
      strategy: "bull_call_spread" as const,
      spotPrice: request.dcfInputs.currentPrice,
      strikePrice: Math.round(request.dcfInputs.currentPrice * 1.02),
      upperStrikePrice: Math.round(request.dcfInputs.currentPrice * 1.2),
      daysToExpiry: 180,
      impliedVolatilityPct: 38,
      riskFreeRatePct: 4.2,
      contracts: 5,
    };
    const ivAdj = typeof args.ivAdjustmentPct === "number" ? args.ivAdjustmentPct : 0;
    const res = priceOptionStrategy({
      ...baseInput,
      impliedVolatilityPct: Math.max(8, baseInput.impliedVolatilityPct + ivAdj),
      daysToExpiry:
        typeof args.daysToExpiry === "number" ? args.daysToExpiry : baseInput.daysToExpiry,
    });
    return {
      payload: { ...res, payoffCurve: undefined },
      summary: `${res.underlying} ${res.strategy} (${res.daysToExpiry}d, IV ${res.impliedVolatilityPct}%): Debit $${res.netDebitPerShare}/sh | Risk ${formatCurrency(res.totalCapitalAtRisk)} | MaxProfit ${res.maxProfit === null ? "Unlimited" : formatCurrency(res.maxProfit)} | PoP ${res.probabilityOfProfitPct}% | Δ=${res.greeks.delta} Θ=${res.greeks.thetaPerDay}/d`,
    };
  }

  if (name === "analyze_real_estate_deal") {
    const baseInput = request.realEstateInputs ?? {
      propertyName: request.title,
      purchasePrice: 650000,
      downPaymentPct: 20,
      closingCostsPct: 3,
      grossAnnualRent: 62400,
      vacancyRatePct: 5,
      operatingExpenseRatioPct: 32,
      mortgageRatePct: 5.25,
      amortizationYears: 25,
      annualRentGrowthPct: 3.0,
      holdYears: 7,
      exitCapRatePct: 6.25,
    };
    const rateAdj =
      typeof args.mortgageRateAdjustmentPct === "number" ? args.mortgageRateAdjustmentPct : 0;
    const capAdj = typeof args.exitCapAdjustmentPct === "number" ? args.exitCapAdjustmentPct : 0;
    const res = analyzeRealEstateDeal({
      ...baseInput,
      mortgageRatePct: Math.max(2, baseInput.mortgageRatePct + rateAdj),
      exitCapRatePct: Math.max(3, baseInput.exitCapRatePct + capAdj),
    });
    return {
      payload: { ...res, sensitivityGrid: undefined },
      summary: `Cap Rate ${res.goingInCapRatePct}% | DSCR ${res.dscr}x | Cash-on-Cash ${res.cashOnCashPct}% | Levered IRR ${res.leveredIrrPct}% (${res.equityMultiple}x EM on ${formatCurrency(res.totalCashInvested)} cash)`,
    };
  }

  if (name === "analyze_bond_duration") {
    const baseInput = request.bondInputs ?? {
      issuer: "10Y Sovereign Treasury Benchmark",
      faceValue: 1000,
      couponRatePct: 4.25,
      ytmPct: 4.5,
      yearsToMaturity: 10,
      paymentsPerYear: 2,
    };
    const ytmAdj = typeof args.ytmAdjustmentPct === "number" ? args.ytmAdjustmentPct : 0;
    const res = analyzeBondDuration({
      ...baseInput,
      ytmPct: Math.max(0.5, baseInput.ytmPct + ytmAdj),
    });
    return {
      payload: { ...res },
      summary: `${res.issuer}: Price $${res.fairPrice} | YTM ${res.ytmPct}% | Mod Duration ${res.modifiedDuration}y | Convexity ${res.convexity} | +100bps shock ${res.rateShocks.find((s) => s.bpsChange === 100)?.pctChange ?? 0}%`,
    };
  }

  if (name === "simulate_venture_powerlaw") {
    const baseInput = request.ventureInputs ?? {
      companyName: request.title,
      stage: "Seed" as const,
      investmentAmount: 25000,
      valuationCap: 15000000,
      expectedDilutionPct: 45,
      failureProbPct: 58,
      modestExitProbPct: 24,
      breakoutProbPct: 13,
      powerLawProbPct: 5,
      holdYears: 8,
    };
    const failAdj =
      typeof args.failureProbAdjustmentPct === "number" ? args.failureProbAdjustmentPct : 0;
    const res = simulateVenturePowerLaw({
      ...baseInput,
      failureProbPct: Math.min(90, Math.max(10, baseInput.failureProbPct + failAdj)),
    });
    return {
      payload: { ...res },
      summary: `${res.companyName} (${res.stage}): Mean ${res.meanMoic}x vs Median ${res.medianMoic}x MOIC (P90 ${res.p90Moic}x) | Exp IRR ${res.expectedIrrPct}% | Loss Odds ${res.probabilityOfLossPct}% | Breakeven Exit ${formatCurrency(res.breakevenExitValuation)}`,
    };
  }

  if (name === "run_cfa_forensic_accounting") {
    const baseInputs =
      request.cfaForensicInputs ??
      buildDefaultForensicInputs(
        request.dcfInputs.ticker,
        request.dcfInputs.currentPrice * request.dcfInputs.sharesOutstandingBillions
      );
    const shockPct =
      typeof args.receivablesGrowthShockPct === "number" ? args.receivablesGrowthShockPct : 0;
    const res =
      shockPct !== 0
        ? runCfaForensicAnalysis({
            ...baseInputs,
            receivablesCurrent: baseInputs.receivablesCurrent * (1 + shockPct / 100),
          })
        : quant.cfaForensics ?? runCfaForensicAnalysis(baseInputs);
    return {
      payload: { ...res },
      summary: `${res.ticker} CFA Forensics: Beneish M=${res.beneishMScore} (${res.beneishFlag}) | Altman Z=${res.altmanZScore} (${res.altmanZone}) | DuPont ROE ${res.dupontRoe.roePct}% | Hamada WACC ${res.bottomUpWacc.waccPct}% | Sloan Accruals ${res.sloanAccrualsRatioPct}%`,
    };
  }

  if (name === "run_hedge_fund_risk_book") {
    const aum =
      typeof args.aumUsdOverride === "number" && args.aumUsdOverride > 0
        ? args.aumUsdOverride
        : request.capital;
    const res =
      aum !== request.capital
        ? analyzeHedgeFundRisk(request.holdings, aum)
        : quant.hedgeFundRisk ?? analyzeHedgeFundRisk(request.holdings, aum);
    return {
      payload: { ...res },
      summary: `AUM ${formatCurrency(res.aumUsd)} Book: Gross ${res.grossExposurePct}% / Net ${res.netExposurePct}% (Beta-Adj ${res.betaAdjustedNetPct}%) | Vol ${res.portfolioVolPct}% | Sharpe ${res.sharpeRatio} / Sortino ${res.sortinoRatio} | 99% 1M CVaR ${res.cvar99MonthlyPct}% (${formatCurrency(res.cvar99MonthlyUsd)})`,
    };
  }

  if (name === "run_liquidity_and_compliance_check") {
    const maxAdv =
      typeof args.maxAdvParticipationPct === "number" ? args.maxAdvParticipationPct : 15;
    const riskBook = quant.hedgeFundRisk ?? analyzeHedgeFundRisk(request.holdings, request.capital);
    const res =
      maxAdv !== 15
        ? runLiquidityAndComplianceCheck(
            request.holdings,
            request.capital,
            riskBook,
            quant.cfaForensics,
            maxAdv
          )
        : quant.liquidityCompliance ??
          runLiquidityAndComplianceCheck(
            request.holdings,
            request.capital,
            riskBook,
            quant.cfaForensics,
            15
          );
    const breaches = res.complianceChecks.filter((c) => c.status === "BREACH").length;
    const warns = res.complianceChecks.filter((c) => c.status === "WARN").length;
    return {
      payload: { ...res },
      summary: `Compliance ${res.overallStatus} (${breaches} breaches, ${warns} warns) | Weighted DTL ${res.weightedDaysToLiquidate}d | Est. Rebalance Slippage ${res.totalEstimatedSlippageBps} bps (${formatCurrency(res.totalEstimatedRebalanceSlippageUsd)})`,
    };
  }

  if (name === "query_intelligence_corpus") {
    const sourceFilter =
      typeof args.sourceFilter === "string" ? args.sourceFilter.toLowerCase() : "all";
    const tickerFilter =
      typeof args.tickerFilter === "string" ? args.tickerFilter.toUpperCase() : "";
    const corpus =
      request.intelSignals && request.intelSignals.length > 0
        ? request.intelSignals
        : CURATED_INTEL_SIGNALS;
    const filtered = corpus.filter((sig) => {
      const sourceOk = sourceFilter === "all" || !sourceFilter || sig.sourceType === sourceFilter;
      const tickerOk = !tickerFilter || sig.tickers.includes(tickerFilter);
      return sourceOk && tickerOk;
    });
    const avgSent =
      filtered.length > 0
        ? Math.round(
            filtered.reduce((s, item) => s + item.sentimentScore, 0) / filtered.length
          )
        : 0;
    return {
      payload: {
        count: filtered.length,
        averageSentiment: avgSent,
        signals: filtered.slice(0, 6),
      },
      summary: `Intel Corpus (${filtered.length} signals, avg sentiment ${avgSent >= 0 ? "+" : ""}${avgSent}): ${filtered
        .slice(0, 2)
        .map((s) => `[${s.sourceType.toUpperCase()}] ${s.sourceName}`)
        .join(" | ")}`,
    };
  }

  return {
    payload: { error: `Unknown tool: ${name}` },
    summary: `Unknown tool ${name}`,
  };
}
