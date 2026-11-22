import {
  handleBuildCompanyModel,
  handleCompanyFundamentals,
  handleCompareDecisionOptions,
  handleDcfValuation,
  handleEvaluatePredictionBet,
  handleGlobalTaxAudit,
  handleMonteCarloProjection,
  handlePortfolioRisk,
  handleSimulateRebalance,
  handleUnderwriteRealEstate,
  type DecisionToolOutput,
} from "../../mcp/decision-tools";

export interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Curated OpenAI Function Calling / Agents SDK tool definitions backed by
 * ThesisLens's deterministic TypeScript quant & valuation engine.
 */
export function getOpenAIFunctionTools(): OpenAIFunctionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "run_dcf_valuation",
        description:
          "Run a deterministic 5-year DCF intrinsic valuation with WACC/terminal-growth sensitivity.",
        parameters: {
          type: "object",
          required: ["ticker", "currentPrice", "fcfPerShare", "growthRate", "wacc", "terminalGrowth"],
          properties: {
            ticker: { type: "string" },
            currentPrice: { type: "number" },
            fcfPerShare: { type: "number" },
            growthRate: { type: "number" },
            wacc: { type: "number" },
            terminalGrowth: { type: "number" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "analyze_portfolio_risk",
        description:
          "Compute portfolio beta, volatility, Sharpe ratio, HHI concentration, and 6-regime macro stress tests.",
        parameters: {
          type: "object",
          required: ["capital", "holdings"],
          properties: {
            capital: { type: "number" },
            holdings: {
              type: "array",
              items: {
                type: "object",
                required: ["ticker", "weight"],
                properties: {
                  ticker: { type: "string" },
                  weight: { type: "number" },
                  sector: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_company_fundamentals",
        description: "Fetch normalized SEC EDGAR XBRL financial statements for any US/ADR ticker.",
        parameters: {
          type: "object",
          required: ["ticker"],
          properties: {
            ticker: { type: "string" },
            asOf: { type: "string" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "build_company_model",
        description: "Build a linked 3-statement company model and DCF / specialist sector valuation.",
        parameters: {
          type: "object",
          required: ["ticker"],
          properties: {
            ticker: { type: "string" },
            currentPrice: { type: "number" },
            drivers: { type: "object" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "audit_global_tax_strategy",
        description: "Audit cross-border tax wrappers (TFSA, RRSP, Roth, 401k, ISA, CCPC, HoldCo).",
        parameters: {
          type: "object",
          required: ["residency"],
          properties: {
            residency: { type: "string" },
            annualIncomeUsd: { type: "number" },
            portfolioUsd: { type: "number" },
          },
        },
      },
    },
  ];
}

export async function executeOpenAIToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<DecisionToolOutput> {
  switch (name) {
    case "run_dcf_valuation":
      return handleDcfValuation(args as Parameters<typeof handleDcfValuation>[0]);
    case "run_monte_carlo_projection":
      return handleMonteCarloProjection(args as Parameters<typeof handleMonteCarloProjection>[0]);
    case "analyze_portfolio_risk":
      return handlePortfolioRisk(args as Parameters<typeof handlePortfolioRisk>[0]);
    case "simulate_rebalance":
      return handleSimulateRebalance(args as Parameters<typeof handleSimulateRebalance>[0]);
    case "underwrite_real_estate_deal":
      return handleUnderwriteRealEstate(args as Parameters<typeof handleUnderwriteRealEstate>[0]);
    case "evaluate_prediction_bet":
      return handleEvaluatePredictionBet(args as Parameters<typeof handleEvaluatePredictionBet>[0]);
    case "audit_global_tax_strategy":
      return handleGlobalTaxAudit(args as Parameters<typeof handleGlobalTaxAudit>[0]);
    case "compare_decision_options":
      return handleCompareDecisionOptions(args as Parameters<typeof handleCompareDecisionOptions>[0]);
    case "get_company_fundamentals":
      return handleCompanyFundamentals(args as Parameters<typeof handleCompanyFundamentals>[0]);
    case "build_company_model":
      return handleBuildCompanyModel(args as Parameters<typeof handleBuildCompanyModel>[0]);
    default:
      throw new Error(`Unsupported ThesisLens OpenAI tool: ${name}`);
  }
}
