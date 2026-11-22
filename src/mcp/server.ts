import { profiles } from "../lib/workspaces";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RequestContext } from "../lib/auth/types";
import { buildCalculationProvenance, recordAuditEvent } from "../lib/compliance/provenance";
import {
  FOREIGN_REAL_ESTATE_MARKETS,
  REAL_ESTATE_CLASSES,
  REAL_ESTATE_MARKETS,
  TAX_RESIDENCY_PROFILES,
} from "../lib/quant-engine";
import { PRESET_SCENARIOS } from "../lib/demo-scenarios";
import {
  adversarialCommitteeInputSchema,
  bondDurationInputSchema,
  cfaForensicsInputSchema,
  companyAnalystInputSchema,
  companyFundamentalsInputSchema,
  companyModelInputSchema,
  compareDecisionOptionsInputSchema,
  dcfInputSchema,
  DecisionToolOutput,
  globalTaxInputSchema,
  handleBondDuration,
  handleBuildCompanyModel,
  handleCompanyFundamentals,
  handleCompareDecisionOptions,
  handleCompareRealEstateMarkets,
  handleDcfValuation,
  handleEvaluatePredictionBet,
  handleForensicAccounting,
  handleGlobalTaxAudit,
  handleMonteCarloProjection,
  handlePortfolioRisk,
  handlePriceOptionStrategy,
  handleQueryIntelligence,
  handleRunAdversarialCommittee,
  handleRunCompanyAnalyst,
  handleSearchPredictionMarkets,
  handleSimulateRebalance,
  handleUnderwriteRealEstate,
  handleVenturePowerlaw,
  monteCarloInputSchema,
  optionStrategyInputSchema,
  portfolioRiskInputSchema,
  predictionBetInputSchema,
  queryIntelInputSchema,
  realEstateCompareInputSchema,
  realEstateDealInputSchema,
  rebalanceInputSchema,
  searchMarketsInputSchema,
  venturePowerlawInputSchema,
} from "./decision-tools";

export interface ThesisLensMcpOptions {
  /** Optional Gemini API key override (falls back to process.env.GEMINI_API_KEY). */
  geminiApiKey?: string;
  /** Optional authenticated tenant/user context for provenance, RBAC, and audit logging. */
  requestContext?: RequestContext;
}

function toToolResult(
  out: DecisionToolOutput,
  meta?: {
    toolName: string;
    input: unknown;
    deterministic: boolean;
    ctx?: RequestContext;
  }
) {
  const provenance = meta
    ? buildCalculationProvenance({
        toolName: meta.toolName,
        input: meta.input,
        output: out.data,
        deterministic: meta.deterministic,
        profile: meta.ctx?.profile ?? "retail",
      })
    : undefined;

  if (meta?.ctx && provenance) {
    recordAuditEvent({
      orgId: meta.ctx.orgId,
      userId: meta.ctx.userId,
      surface: meta.ctx.surface,
      action: "mcp:tool_call",
      toolName: meta.toolName,
      inputHash: provenance.inputHash,
      outputHash: provenance.outputHash,
      provenanceHash: provenance.provenanceHash,
      tokensUsed: 0,
      costUsd: 0,
      status: "ok",
    });
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `${out.summary}\n\n${JSON.stringify(out.data, null, 2)}`,
      },
    ],
    structuredContent: {
      summary: out.summary,
      ...out.data,
      ...(provenance ? { provenance } : {}),
    },
  };
}

function toErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `ThesisLens tool error: ${message}`,
      },
    ],
  };
}

const READ_ONLY_DETERMINISTIC = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const READ_ONLY_LIVE = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/**
 * Creates a fresh ThesisLens MCP Server exposing 16 deterministic quant & decision tools,
 * 3 decision-coaching prompts, and 3 reference resources.
 */
export function createThesisLensMcpServer(options: ThesisLensMcpOptions = {}): McpServer {
  const server = new McpServer({
    name: "thesislens-decision-engine",
    version: "1.0.0",
  }, { instructions: "Start with the decision-brief prompt and its optional audience. Discover tools via tools/list and scenario inputs via resources/list. State which inputs were supplied or assumed, cite tool outputs, and identify simulated committee findings." });

  // ── TOOLS (16) ──────────────────────────────────────────────────────────────

  server.registerTool(
    "run_dcf_valuation",
    {
      title: "5-Year DCF Intrinsic Valuation",
      description:
        "Runs a deterministic 5-year Discounted Cash Flow (DCF) intrinsic valuation with WACC and terminal growth sensitivity grid. Use when evaluating whether a stock or business is undervalued, fairly valued, or overvalued.",
      inputSchema: dcfInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleDcfValuation(args), {
          toolName: "run_dcf_valuation",
          input: args,
          deterministic: true,
          ctx: options.requestContext,
        });
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "run_monte_carlo_projection",
    {
      title: "Monte Carlo Wealth Projection",
      description:
        "Runs an 800-path Geometric Brownian Motion Monte Carlo simulation to project P10 (downside), P50 (median), and P90 (upside) wealth, probability of loss, and probability of doubling over a given horizon.",
      inputSchema: monteCarloInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleMonteCarloProjection(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "analyze_portfolio_risk",
    {
      title: "Portfolio Risk & 6-Regime Macro Stress Test",
      description:
        "Computes portfolio weighted beta, expected return, volatility, Sharpe ratio, HHI concentration, and stress-tests across 6 institutional macro regimes (+100bps Rate Shock, AI Capex Digestion, Hard Landing, Critical Minerals Supercycle, Stagflation, VIX>45 Crunch). Optionally runs institutional VaR/CVaR, factor tilts, and liquidity compliance.",
      inputSchema: portfolioRiskInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handlePortfolioRisk(args), {
          toolName: "analyze_portfolio_risk",
          input: args,
          deterministic: true,
          ctx: options.requestContext,
        });
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "simulate_rebalance",
    {
      title: "Tax-Aware Portfolio Rebalance Simulator",
      description:
        "Simulates moving from current holdings to target weights, quantifying before/after Sharpe, volatility, Monte Carlo, and residency-specific capital gains tax drag. Recommends whether to rebalance immediately or via new cash flows.",
      inputSchema: rebalanceInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleSimulateRebalance(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "underwrite_real_estate_deal",
    {
      title: "Real Estate Deal Underwriting",
      description:
        "Underwrites a residential or commercial property deal across 10 classes and 10 markets: NOI, Going-in Cap Rate vs. Benchmark, Cash-on-Cash, DSCR, Debt Yield, Break-Even Occupancy, Lender Covenants, and Unlevered/Levered/After-Tax IRR. Partial inputs auto-fill from market benchmarks.",
      inputSchema: realEstateDealInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleUnderwriteRealEstate(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "compare_real_estate_markets",
    {
      title: "Real Estate Market & Property Class Matrix",
      description:
        "Ranks all 10 residential & commercial property classes inside a target market and screens 10 North American/Global markets for a given property class under optional interest-rate stress shifts.",
      inputSchema: realEstateCompareInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleCompareRealEstateMarkets(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "analyze_bond_duration",
    {
      title: "Fixed Income & Bond Duration Stress Test",
      description:
        "Computes fixed-income fair price, YTM, Macaulay/Modified Duration, Convexity, DV01, and +/-200bps interest rate shock price changes.",
      inputSchema: bondDurationInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleBondDuration(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "evaluate_prediction_bet",
    {
      title: "Probabilistic Bet EV & Kelly Sizing",
      description:
        "Evaluates any binary prediction market or probabilistic decision: strips vig/overround, calculates Expected Value (EV), ROI, breakeven probability, Full/Half/Quarter Kelly sizing, and Oracle/Ambiguity Risk Haircut.",
      inputSchema: predictionBetInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleEvaluatePredictionBet(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "price_option_strategy",
    {
      title: "Black-Scholes-Merton Option Strategy Pricer",
      description:
        "Prices single- and multi-leg option strategies (long call/put, bull call spread, bear put spread, long straddle) with exact Greeks (Delta, Gamma, Theta, Vega, Rho), max profit/loss, breakevens, and Probability of Profit.",
      inputSchema: optionStrategyInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handlePriceOptionStrategy(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "simulate_venture_powerlaw",
    {
      title: "Venture / Startup Equity Power-Law Simulator",
      description:
        "Runs a 1,200-path power-law Monte Carlo with dilution waterfall for angel checks, SAFE notes, or startup equity offers: Mean vs. Median MOIC, expected IRR, probability of loss, and breakeven exit valuation.",
      inputSchema: venturePowerlawInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleVenturePowerlaw(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "run_forensic_accounting_audit",
    {
      title: "CFA Forensic Accounting & Earnings Quality Audit",
      description:
        "Runs CFA Level II/III forensic diagnostics: Beneish M-Score (manipulation flag), Altman Z-Score (distress zone), Sloan Accruals Ratio, Cash Conversion, DuPont 3-stage ROE, and Bottom-Up Hamada WACC.",
      inputSchema: cfaForensicsInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleForensicAccounting(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "audit_global_tax_strategy",
    {
      title: "Cross-Border Global Tax & Wrapper Audit",
      description:
        "Audits domestic vs. foreign investing across tax-efficient accounts (TFSA, RRSP, Roth, 401k, ISA, SIPP, UCITS), business entities (CCPC, S-Corp, HoldCo, QSBS), foreign real estate tax rules, and gain extraction streams.",
      inputSchema: globalTaxInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleGlobalTaxAudit(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "search_prediction_markets",
    {
      title: "Search Live Prediction Markets",
      description:
        "Queries live prediction markets (Polymarket/Kalshi with deterministic fallback) to retrieve market-implied base-rate probabilities for real-world macro, political, or financial events.",
      inputSchema: searchMarketsInputSchema,
      annotations: READ_ONLY_LIVE,
    },
    async (args) => {
      try {
        return toToolResult(await handleSearchPredictionMarkets(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "get_company_fundamentals",
    {
      title: "Company Fundamentals (SEC EDGAR)",
      description:
        "Returns a normalized annual and quarterly financial history (income statement, balance sheet, cash flow, bank items) for any SEC-reporting company, built from XBRL filings, with data-quality checks. Supports a point-in-time `asOf` cutoff for backtests. Use before valuing a specific company instead of estimating its financials.",
      inputSchema: companyFundamentalsInputSchema,
      annotations: READ_ONLY_LIVE,
    },
    async (args) => {
      try {
        return toToolResult(await handleCompanyFundamentals(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "build_company_model",
    {
      title: "Three-Statement Company Model & DCF",
      description:
        "Builds a linked income statement / balance sheet / cash flow model (10 forecast years by default) from a company's SEC filings, then values it with an FCFF DCF or specialist sector model (banks, insurers, REITs, utilities, commodities, pharma, autos), bear/base/bull scenarios and a sensitivity grid. Every baseline assumption is derived from reported history and documented; pass driver overrides with a rationale to express a view.",
      inputSchema: companyModelInputSchema,
      annotations: READ_ONLY_LIVE,
    },
    async (args) => {
      try {
        return toToolResult(await handleBuildCompanyModel(args), {
          toolName: "build_company_model",
          input: args,
          deterministic: true,
          ctx: options.requestContext,
        });
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "run_company_analyst",
    {
      title: "AI Equity Analyst Company Model",
      description:
        "Runs the Phase 3 AI equity analyst loop: loads SEC fundamentals, FRED 10Y Treasury + Damodaran ERP rates, and the company dossier, then uses Gemini (or configured ANALYST_PROVIDER) with tool calls to propose cited, sector-bounded overrides and compute a validated three-statement valuation model.",
      inputSchema: companyAnalystInputSchema,
      annotations: READ_ONLY_LIVE,
    },
    async (args) => {
      try {
        return toToolResult(await handleRunCompanyAnalyst(args, options.geminiApiKey));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "query_intelligence_corpus",
    {
      title: "Query Financial Intelligence Corpus",
      description:
        "Searches ThesisLens's curated and live intelligence signals (SEC filings, macro central bank feeds, newsletters, news wires, podcasts) for ticker claims, sentiment, and catalysts.",
      inputSchema: queryIntelInputSchema,
      annotations: READ_ONLY_LIVE,
    },
    async (args) => {
      try {
        return toToolResult(await handleQueryIntelligence(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "compare_decision_options",
    {
      title: "Head-to-Head Capital Decision Comparison",
      description:
        "Compares 2 to 5 competing paths (real estate deal vs. equity portfolio vs. bonds vs. probabilistic bet vs. venture equity) over the same capital, horizon, tax residency, and risk profile on an apples-to-apples after-tax, downside-adjusted basis.",
      inputSchema: compareDecisionOptionsInputSchema,
      annotations: READ_ONLY_DETERMINISTIC,
    },
    async (args) => {
      try {
        return toToolResult(handleCompareDecisionOptions(args));
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  server.registerTool(
    "run_adversarial_committee",
    {
      title: "Adversarial Investment Committee & Pre-Mortem",
      description:
        "Runs ThesisLens's full adversarial committee (Bull Strategist, Bear Pre-Mortem Auditor, CFA Risk Officer, Tax Strategist, and CIO Synthesizer) to produce a structured Decision Memo with Action Rating, Conviction Score (0-100), Bull/Bear points, Invalidation Triggers, and Action Checklist. Runs deterministically with zero API key, or upgrades to Gemini when GEMINI_API_KEY is configured.",
      inputSchema: adversarialCommitteeInputSchema,
      annotations: READ_ONLY_LIVE,
    },
    async (args) => {
      try {
        return toToolResult(await handleRunAdversarialCommittee(args, options.geminiApiKey), {
          toolName: "run_adversarial_committee",
          input: args,
          deterministic: false,
          ctx: options.requestContext,
        });
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  // ── PROMPTS (3) ─────────────────────────────────────────────────────────────

  server.registerPrompt(
    "decision-brief",
    {
      title: "Structured Financial Decision Brief",
      description:
        "Guides an agent through clarifying a person's goals, running deterministic ThesisLens quant checks, and delivering an adversarial Bull vs. Bear pre-mortem with explicit invalidation triggers.",
      argsSchema: {
        decision: z.string().describe("The decision the user is trying to make."),
        audience: z.enum(["beginner", "retail", "planner", "manager"]).optional().describe("Optional audience for the explanation and next steps."),
        capitalUsd: z.string().optional().describe("Approximate capital at stake (e.g. '100000')."),
        residency: z
          .string()
          .optional()
          .describe("Tax residency (e.g. canada_on, us_ca, us_tx, uk, singapore)."),
      },
    },
    ({ decision, capitalUsd, residency, audience }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Help the user make a high-conviction, mathematically grounded decision on: "${decision}".`,
              audience ? profiles[audience].agent : "",
              capitalUsd ? `Capital at stake: $${capitalUsd}.` : "",
              residency ? `Tax residency: ${residency}.` : "",
              "",
              "Follow this ThesisLens Decision Protocol:",
              "1. Clarify any missing core constraints (time horizon, risk tolerance, liquidity needs, tax wrapper) — or state explicit assumptions if proceeding immediately.",
              "2. Never estimate financial math in prose. Call the relevant ThesisLens deterministic tools (`compare_decision_options`, `underwrite_real_estate_deal`, `analyze_portfolio_risk`, `run_dcf_valuation`, `evaluate_prediction_bet`, `audit_global_tax_strategy`, etc.).",
              "3. Stress-test the downside: cite P10 outcomes, worst macro shock, or rate/cap-rate sensitivity.",
              "4. Run or synthesize an adversarial Bull vs. Bear pre-mortem (`run_adversarial_committee` when appropriate).",
              "5. Deliver a concise recommendation with: (a) Clear Verdict & Conviction (0-100), (b) Verified Numbers, (c) Top 3 Pre-Mortem Failure Modes, and (d) Concrete Invalidation Triggers that would flip the decision.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "buy-vs-invest",
    {
      title: "Buy Real Estate vs. Invest in Markets",
      description:
        "Structured workflow comparing a property purchase against investing the same capital in public markets or bonds, adjusted for local tax wrappers.",
      argsSchema: {
        capitalUsd: z.string().describe("Available cash/down payment in USD."),
        marketId: z.string().default("sudbury-on").describe("Real estate market id (e.g. sudbury-on, toronto-gta, austin-tx)."),
        residency: z.string().default("canada_on").describe("Investor tax residency."),
        horizonYears: z.string().default("7").describe("Holding period in years."),
      },
    },
    ({ capitalUsd, marketId, residency, horizonYears }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Compare buying real estate in ${marketId} vs. investing $${capitalUsd} into diversified public equities/bonds over a ${horizonYears}-year horizon for a resident of ${residency}.`,
              "",
              "Required tool steps:",
              `1. Call \`underwrite_real_estate_deal\` for ${marketId} and check DSCR, going-in cap rate vs. benchmark, lender covenants, and after-tax IRR.`,
              `2. Call \`audit_global_tax_strategy\` for residency \`${residency}\` to identify optimal tax-sheltered wrappers (e.g., TFSA/RRSP/Roth/ISA).`,
              `3. Call \`compare_decision_options\` pitting the real estate deal, a tax-sheltered ETF portfolio, and a defensive bond/GIC ladder head-to-head.`,
              "4. Present an apples-to-apples comparison table (After-Tax IRR, Median Ending Wealth, Downside P10, Liquidity, Effort) and highlight the exact interest rate or rent-growth threshold where the winner flips.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "probabilistic-bet-sizing",
    {
      title: "Probabilistic Decision & Kelly Bet Sizing",
      description:
        "Structured workflow for calibrating probabilities against market base rates and computing risk-adjusted Kelly sizing.",
      argsSchema: {
        question: z.string().describe("The binary event or asymmetric bet under consideration."),
        bankrollUsd: z.string().default("10000").describe("Bankroll allocated for sizing."),
      },
    },
    ({ question, bankrollUsd }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Evaluate the probabilistic decision: "${question}" with a $${bankrollUsd} bankroll.`,
              "",
              "Required tool steps:",
              `1. Call \`search_prediction_markets\` for "${question}" to anchor market-implied base rates.`,
              "2. Articulate why the true probability differs (or does not differ) from the market price, applying an explicit oracle/ambiguity haircut.",
              "3. Call `evaluate_prediction_bet` to strip vig, compute Expected Value, ROI, Breakeven Probability, and Risk-Adjusted Kelly stake.",
              "4. Never recommend a stake above Half-Kelly; if edge <= 0%, explicitly advise PASS.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // ── RESOURCES (3) ───────────────────────────────────────────────────────────

  server.registerResource(
    "real-estate-benchmarks",
    "thesislens://markets/real-estate",
    {
      title: "ThesisLens Real Estate Markets & Property Classes",
      description:
        "Catalog of all 10 supported North American/Global real estate markets and 10 residential/commercial property classes with cap rate and lender covenant benchmarks.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "thesislens://markets/real-estate",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              markets: REAL_ESTATE_MARKETS,
              propertyClasses: REAL_ESTATE_CLASSES,
            },
            null,
            2
          ),
        },
      ],
    })
  );

  server.registerResource(
    "tax-residencies",
    "thesislens://tax/residencies",
    {
      title: "ThesisLens Global Tax Residencies & Foreign Property Markets",
      description:
        "Supported tax residency profiles (rates, key accounts, estate rules) and foreign real estate tax markets.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "thesislens://tax/residencies",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              residencies: TAX_RESIDENCY_PROFILES,
              foreignRealEstateMarkets: FOREIGN_REAL_ESTATE_MARKETS,
            },
            null,
            2
          ),
        },
      ],
    })
  );

  server.registerResource(
    "preset-scenarios",
    "thesislens://scenarios/presets",
    {
      title: "ThesisLens Demo & Benchmark Scenarios",
      description:
        "Curated multi-asset investment committee scenarios (including Sudbury Critical Minerals & AI Grid) for testing and benchmarking.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "thesislens://scenarios/presets",
          mimeType: "application/json",
          text: JSON.stringify(
            PRESET_SCENARIOS.map((s) => ({
              id: s.id,
              label: s.label,
              badge: s.badge,
              description: s.description,
              analysisMode: s.payload.analysisMode,
              jurisdiction: s.payload.jurisdiction,
              capital: s.payload.capital,
              horizonYears: s.payload.horizonYears,
              riskProfile: s.payload.riskProfile,
              holdingsCount: s.payload.holdings.length,
            })),
            null,
            2
          ),
        },
      ],
    })
  );

  return server;
}
