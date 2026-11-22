import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createThesisLensMcpServer } from "../src/mcp/server";

async function testInMemoryServer() {
  console.log("1. Testing ThesisLens MCP Server via InMemoryTransport...");
  const server = createThesisLensMcpServer();
  const client = new Client({ name: "verify-mcp-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  // Discovery checks
  const { tools } = await client.listTools();
  assert.equal(tools.length, 19, `Expected 19 MCP tools, got ${tools.length}`);
  assert(tools.some((t) => t.name === "build_company_model"), "build_company_model registered");
  assert(tools.some((t) => t.name === "get_company_fundamentals"), "get_company_fundamentals registered");
  assert(tools.some((t) => t.name === "run_company_analyst"), "run_company_analyst registered");
  console.log(`   PASS: Discovered ${tools.length} tools.`);

  const { prompts } = await client.listPrompts();
  assert.equal(prompts.length, 3, `Expected 3 MCP prompts, got ${prompts.length}`);
  const briefPrompt = await client.getPrompt({
    name: "decision-brief",
    arguments: {
      decision: "Buy Sudbury 4-plex vs invest $120k in TFSA",
      capitalUsd: "120000",
      residency: "canada_on",
    },
  });
  assert(briefPrompt.messages.length === 1, "Prompt should return 1 message");
  const plannerBrief = await client.getPrompt({
    name: "decision-brief",
    arguments: { decision: "Compare a household purchase with investing", audience: "planner" },
  });
  const guidance = plannerBrief.messages[0].content;
  assert(guidance.type === "text" && guidance.text.includes("household's goals"));
  console.log(`   PASS: Discovered ${prompts.length} prompts & rendered 'decision-brief'.`);

  const { resources } = await client.listResources();
  assert.equal(resources.length, 3, `Expected 3 MCP resources, got ${resources.length}`);
  const reResource = await client.readResource({ uri: "thesislens://markets/real-estate" });
  assert(reResource.contents.length === 1, "Resource should return content");
  const parsedRe = JSON.parse((reResource.contents[0] as { text: string }).text);
  assert(parsedRe.markets.length >= 10, "Should list >= 10 real estate markets");
  console.log(`   PASS: Discovered ${resources.length} resources & read real-estate benchmarks.`);

  // Tool 1: DCF Valuation
  const dcf = await client.callTool({
    name: "run_dcf_valuation",
    arguments: {
      ticker: "VALE",
      currentPrice: 12.5,
      sharesOutstandingBillions: 4.3,
      baseFreeCashFlowBillions: 6.2,
      revenueGrowthYear1To5Pct: 7,
      waccPct: 10,
      terminalGrowthPct: 2.5,
      netDebtBillions: 14,
    },
  });
  assert(!dcf.isError, "run_dcf_valuation should succeed");
  const dcfData = dcf.structuredContent as Record<string, unknown>;
  assert(typeof dcfData.impliedSharePrice === "number" && dcfData.impliedSharePrice > 0);
  console.log("   PASS: run_dcf_valuation ->", dcfData.summary);

  // Tool 2: Portfolio Risk
  const port = await client.callTool({
    name: "analyze_portfolio_risk",
    arguments: {
      capital: 100_000,
      holdings: [
        { ticker: "VALE", sector: "Mining & Materials", weightPct: 30, beta: 1.25, expectedAnnualReturnPct: 12, annualVolatilityPct: 32 },
        { ticker: "ETN", sector: "Industrials", weightPct: 30, beta: 1.15, expectedAnnualReturnPct: 11, annualVolatilityPct: 24 },
        { ticker: "XBB", sector: "Fixed Income", weightPct: 40, beta: 0.15, expectedAnnualReturnPct: 4.5, annualVolatilityPct: 7 },
      ],
      includeInstitutionalRiskBook: true,
    },
  });
  assert(!port.isError, "analyze_portfolio_risk should succeed");
  const portData = port.structuredContent as Record<string, unknown>;
  assert(Array.isArray(portData.macroShocks) && portData.macroShocks.length >= 4);
  assert(Boolean(portData.hedgeFundRisk), "Institutional risk book should be populated");
  console.log("   PASS: analyze_portfolio_risk ->", portData.summary);

  // Tool 3: Real Estate Deal Underwriting (with partial inputs auto-filled)
  const re = await client.callTool({
    name: "underwrite_real_estate_deal",
    arguments: {
      propertyClass: "small_multifamily",
      marketId: "sudbury-on",
      purchasePrice: 550_000,
      downPaymentPct: 20,
    },
  });
  assert(!re.isError, "underwrite_real_estate_deal should succeed");
  const reData = re.structuredContent as Record<string, unknown>;
  assert(typeof reData.dscr === "number" && reData.dscr > 0);
  console.log("   PASS: underwrite_real_estate_deal ->", reData.summary);

  // Tool 4: Prediction Bet / Kelly Sizing
  const bet = await client.callTool({
    name: "evaluate_prediction_bet",
    arguments: {
      question: "Will Copper exceed $12,000/t by Q4?",
      yesPriceCents: 38,
      estimatedTrueProbPct: 54,
      stakeCapital: 25_000,
    },
  });
  assert(!bet.isError, "evaluate_prediction_bet should succeed");
  const betData = bet.structuredContent as Record<string, unknown>;
  assert(typeof betData.riskAdjustedKellyPct === "number" && betData.riskAdjustedKellyPct > 0);
  console.log("   PASS: evaluate_prediction_bet ->", betData.summary);

  // Tool 5: Global Tax Strategy
  const tax = await client.callTool({
    name: "audit_global_tax_strategy",
    arguments: {
      residency: "canada_on",
      portfolioValueUsd: 250_000,
      annualOrdinaryIncomeUsd: 160_000,
    },
  });
  assert(!tax.isError, "audit_global_tax_strategy should succeed");
  const taxData = tax.structuredContent as Record<string, unknown>;
  assert(typeof taxData.taxEfficiencyScore === "number");
  console.log("   PASS: audit_global_tax_strategy ->", taxData.summary);

  // Tool 6: Head-to-Head Compare Decision Options
  const cmp = await client.callTool({
    name: "compare_decision_options",
    arguments: {
      decisionQuestion: "Deploy $120k in Ontario: Sudbury 4-plex vs TFSA ETFs vs 7Y Bond Ladder",
      capitalUsd: 120_000,
      horizonYears: 7,
      residency: "canada_on",
      riskProfile: "balanced",
      options: [
        { kind: "real_estate", label: "Sudbury Small Multifamily", propertyClass: "small_multifamily", marketId: "sudbury-on" },
        { kind: "portfolio", label: "TFSA All-Equity ETF", expectedReturnPct: 8.5, volatilityPct: 15, taxSheltered: true },
        { kind: "bond", label: "7Y Government Bond Ladder", couponRatePct: 4.5, ytmPct: 4.6, taxSheltered: true },
      ],
    },
  });
  assert(!cmp.isError, "compare_decision_options should succeed");
  const cmpData = cmp.structuredContent as Record<string, unknown>;
  assert(Array.isArray(cmpData.rankedOptions) && cmpData.rankedOptions.length === 3);
  console.log("   PASS: compare_decision_options ->", cmpData.summary);

  // Tool 7: Adversarial Committee (deterministic mode)
  const committee = await client.callTool({
    name: "run_adversarial_committee",
    arguments: {
      title: "Sudbury Critical Minerals & AI Grid Allocation",
      thesisPrompt: "Should I allocate $100k into nickel/copper, uranium, and grid infrastructure for a 5-year AI power supercycle?",
      jurisdiction: "Canada",
      capital: 100_000,
      horizonYears: 5,
      useGeminiIfAvailable: false,
    },
  });
  assert(!committee.isError, "run_adversarial_committee should succeed");
  const commData = committee.structuredContent as Record<string, unknown>;
  assert(Boolean(commData.cioMemo), "Committee must return a structured CIO Memo");
  console.log("   PASS: run_adversarial_committee ->", commData.summary);

  await client.close();
  await server.close();
}

async function testStdioTransport() {
  console.log("\n2. Testing real stdio subprocess (src/mcp/stdio.ts)...");
  const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
  const transport = new StdioClientTransport({
    command: tsxBin,
    args: ["src/mcp/stdio.ts"],
    stderr: "pipe",
  });
  const client = new Client({ name: "verify-stdio-client", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  assert.equal(tools.length, 19, "stdio server should expose all 19 tools");

  const res = await client.callTool({
    name: "analyze_bond_duration",
    arguments: {
      issuer: "Canada 10Y Benchmark",
      couponRatePct: 4.0,
      ytmPct: 4.2,
      yearsToMaturity: 10,
    },
  });
  assert(!res.isError, "stdio analyze_bond_duration should succeed");
  console.log("   PASS: stdio handshake + tool call ->", (res.structuredContent as Record<string, unknown>).summary);

  await client.close();
}

async function main() {
  await testInMemoryServer();
  await testStdioTransport();
  console.log("\nALL MCP VERIFICATION CHECKS PASSED!");
}

main().catch((err) => {
  console.error("MCP verification failed:", err);
  process.exit(1);
});
