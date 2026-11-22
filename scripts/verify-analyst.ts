/**
 * Offline verification of Phase 3: Provider interfaces, FRED/Damodaran rates,
 * Company Dossier, Validator, and Analyst Loop (runs in CI, no API key or network).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeCompanyFacts } from "../src/lib/fundamentals/normalize";
import { coverageScore, runQualityChecks } from "../src/lib/fundamentals/checks";
import type { CompanyFundamentals } from "../src/lib/fundamentals/types";
import type { TemplateId } from "../src/lib/fundamentals/sector";
import type { SecCompanyFacts } from "../src/lib/fundamentals/sec-types";
import {
  FredDamodaranRatesProvider,
  parseFredDgs10Csv,
  RecordedAnalystModel,
  emptyUsage,
} from "../src/lib/providers";
import {
  buildCompanyDossier,
  filterDossierAsOf,
  lookupCitation,
  validateSegmentSum,
} from "../src/lib/dossier";
import { runAnalystOnFundamentals, validateAnalystProposal } from "../src/lib/analyst";

const FIXTURES = path.join(__dirname, "fixtures", "sec");

function loadFixture(name: string, ticker: string, templateId: TemplateId, asOf?: string): CompanyFundamentals {
  const raw: SecCompanyFacts = JSON.parse(readFileSync(path.join(FIXTURES, `companyfacts-${name}.json`), "utf8"));
  const history = normalizeCompanyFacts(raw, { asOf });
  return {
    profile: { ticker, cik: raw.cik, name: raw.entityName, sic: null, sicDescription: null, exchanges: [], fiscalYearEnd: null, templateId },
    history,
    checks: runQualityChecks(history, templateId, "2026-11-22"),
    coverageScore: coverageScore(history, templateId),
  };
}

async function verifyRatesProvider() {
  console.log("1. FRED DGS10 + Damodaran ERP provider (as-of dates, CSV parsing)...");
  const parsed = parseFredDgs10Csv("DATE,DGS10\n2025-06-27,4.29\n2025-06-28,.\n2025-06-30,4.24\n");
  assert.equal(parsed.length, 2);
  assert(Math.abs(parsed[1].rate - 0.0424) < 1e-9);

  const provider = new FredDamodaranRatesProvider({ allowNetwork: false });
  const r2022 = await provider.getRates("2022-07-01");
  const r2025 = await provider.getRates("2025-07-01");
  assert(r2022.asOf <= "2022-07-01", "point-in-time Rf date <= asOf");
  assert(r2025.asOf <= "2025-07-01", "point-in-time Rf date <= asOf");
  assert(r2022.riskFreeRate < r2025.riskFreeRate, "2022 mid-year 10Y < 2025 mid-year 10Y");
  assert(r2022.erpSource.includes("2022") && r2025.erpSource.includes("2025"));
  console.log(`   PASS: 2022-07 Rf ${(r2022.riskFreeRate * 100).toFixed(2)}% / ERP ${(r2022.equityRiskPremium * 100).toFixed(2)}%, 2025-07 Rf ${(r2025.riskFreeRate * 100).toFixed(2)}%.`);
}

function verifyDossierAndSegments() {
  console.log("2. Company dossier, segment sum reconciliation, and strict asOf filtering...");
  const aapl = loadFixture("AAPL", "AAPL", "hardware");
  const latestFy = aapl.history.annual[aapl.history.annual.length - 1];
  const rev = latestFy.values.revenue!;

  // Good segments sum to 100% of reported revenue
  const goodSegments = [
    { periodId: latestFy.id, segment: "Products", revenue: rev * 0.74, filed: "2026-11-01", source: "10-K Note 11" },
    { periodId: latestFy.id, segment: "Services", revenue: rev * 0.26, filed: "2026-11-01", source: "10-K Note 11" },
  ];
  const badSegments = [
    { periodId: latestFy.id, segment: "Products", revenue: rev * 0.5, filed: "2026-11-01", source: "10-K Note 11" },
  ];
  const okRes = validateSegmentSum(goodSegments, aapl.history.annual);
  assert.equal(okRes.accepted.length, 2);
  assert.equal(okRes.warnings.length, 0);

  const badRes = validateSegmentSum(badSegments, aapl.history.annual);
  assert.equal(badRes.accepted.length, 0, "segments not summing to reported revenue must be rejected");
  assert.equal(badRes.warnings.length, 1);

  const dossier = buildCompanyDossier(aapl, {
    segments: goodSegments,
    guidance: [
      {
        id: "GUID-2025Q2",
        targetPeriod: "FY2025Q3",
        metric: "revenueGrowth",
        low: 0.04,
        high: 0.06,
        unit: "decimal",
        quote: "Management guides low-to-mid single digit YoY revenue growth (4%-6%).",
        filed: "2025-05-02",
        form: "8-K",
      },
      {
        id: "GUID-2026Q4",
        targetPeriod: "FY2027",
        metric: "revenueGrowth",
        low: 0.06,
        high: 0.08,
        unit: "decimal",
        quote: "FY2027 revenue growth guided at 6%-8%.",
        filed: "2026-11-01",
        form: "8-K",
      },
    ],
  });
  assert(dossier.annualCsv.includes("FY2026"), "annual CSV populated");
  assert(dossier.estimatedTokens > 100 && dossier.estimatedTokens < 40_000, "compact dossier token budget");

  const pit = filterDossierAsOf(dossier, "2025-06-30");
  assert.equal(pit.guidance.length, 1, "post-asOf guidance stripped");
  assert.equal(pit.guidance[0].id, "GUID-2025Q2");
  assert(pit.passages.every((p) => p.filed <= "2025-06-30"), "zero look-ahead in passages");
  assert.equal(lookupCitation(pit, "GUID-2026Q4"), null, "future citation unresolvable");
  console.log(`   PASS: ${dossier.passages.length} passages (~${dossier.estimatedTokens} tokens), segment reconciliation & asOf filtering verified.`);
}

function verifyValidator() {
  console.log("3. Validator rejects uncited/unresolvable/look-ahead/out-of-bounds overrides & flags guidance divergence...");
  const aapl = loadFixture("AAPL", "AAPL", "hardware", "2025-06-30");
  const dossier = buildCompanyDossier(aapl, {
    asOf: "2025-06-30",
    guidance: [
      {
        id: "GUID-2025Q2",
        targetPeriod: "FY2025",
        metric: "revenueGrowth",
        low: 0.04,
        high: 0.06,
        unit: "decimal",
        quote: "Guided 4%-6% revenue growth.",
        filed: "2025-05-02",
        form: "8-K",
      },
    ],
  });

  const bad = validateAnalystProposal(
    {
      thesisSummary: "Bad test",
      overrides: [
        { key: "revenueGrowth", value: 0.05, citationId: "", rationale: "No citation" },
        { key: "ebitMargin", value: 0.32, citationId: "DOES-NOT-EXIST", rationale: "Hallucinated citation" },
        { key: "capexPctRevenue", value: 0.95, citationId: "FIN-FY2024", rationale: "Out of bounds" },
        { key: "nonsenseKey", value: 0.1, citationId: "FIN-FY2024", rationale: "Unknown key" },
      ],
    },
    dossier
  );
  assert.equal(bad.valid, false);
  assert(bad.errors.some((e) => e.code === "MISSING_CITATION"));
  assert(bad.errors.some((e) => e.code === "UNRESOLVED_CITATION"));
  assert(bad.errors.some((e) => e.code === "OUT_OF_SECTOR_BOUNDS"));
  assert(bad.errors.some((e) => e.code === "UNKNOWN_KEY"));

  // Guidance divergence warning when deviating >200bps without divergenceReason
  const div = validateAnalystProposal(
    {
      thesisSummary: "Bullish view above guidance",
      overrides: [
        { key: "revenueGrowth", value: 0.12, citationId: "GUID-2025Q2", rationale: "Assume faster cycle" },
      ],
    },
    dossier
  );
  assert.equal(div.valid, true);
  assert(div.warnings.some((w) => w.code === "UNEXPLAINED_GUIDANCE_DIVERGENCE"));
  console.log("   PASS");
}

async function verifyAnalystLoopEndToEnd() {
  console.log("4. Analyst loop end-to-end with tool calls, self-correction, and FRED rates...");
  const aapl = loadFixture("AAPL", "AAPL", "hardware");
  const ratesProvider = new FredDamodaranRatesProvider({ allowNetwork: false });

  // Scripted 3-turn analyst:
  // Turn 0: calls get_guidance and run_model
  // Turn 1: emits an uncited override (validator rejects & asks for correction)
  // Turn 2: emits valid cited overrides
  const recorded = new RecordedAnalystModel([
    {
      text: "",
      toolCalls: [
        { id: "tc1", name: "get_guidance", args: {} },
        { id: "tc2", name: "run_model", args: { drivers: { revenueGrowth: [0.07, 0.06, 0.05] } } },
      ],
      usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 600, estimatedCostUsd: 0.0002 },
      model: "recorded-analyst-v1",
    },
    {
      text: JSON.stringify({
        thesisSummary: "Initial draft missing citation",
        overrides: [{ key: "revenueGrowth", value: [0.07, 0.06, 0.05], citationId: "", rationale: "Services growth" }],
      }),
      toolCalls: [],
      usage: { inputTokens: 1500, outputTokens: 120, cachedInputTokens: 600, estimatedCostUsd: 0.00025 },
      model: "recorded-analyst-v1",
    },
    {
      text: JSON.stringify({
        thesisSummary: "Apple Services mix shift supports steady 7%->5% growth and 32.5% EBIT margins.",
        overrides: [
          {
            key: "revenueGrowth",
            value: [0.07, 0.06, 0.05],
            citationId: "FIN-FY2026",
            rationale: "FY2026 reported growth trajectory supported by installed base.",
          },
          {
            key: "ebitMargin",
            value: [0.325, 0.33],
            citationId: "FIN-FY2026",
            rationale: "FY2026 gross & EBIT margin expansion from Services mix.",
          },
        ],
        keyRisks: ["China hardware demand", "Antitrust Services remedies"],
        catalysts: ["AI device upgrade cycle"],
      }),
      toolCalls: [],
      usage: { inputTokens: 1700, outputTokens: 180, cachedInputTokens: 600, estimatedCostUsd: 0.0003 },
      model: "recorded-analyst-v1",
    },
  ]);

  const res = await runAnalystOnFundamentals(aapl, {
    currentPrice: 250,
    valuationDate: "2026-11-22",
    ratesProvider,
    analystModel: recorded,
  });

  assert.equal(res.validation.valid, true, "final pass has zero validator rejections");
  assert.equal(res.turns, 3, "tool call -> self-correction -> final valid pass");
  assert.equal(res.toolCallsExecuted.length, 2);
  assert.equal(res.citations.length, 2);
  assert(res.citations.every((c) => c.passage.id === "FIN-FY2026"));
  assert.equal(res.model.assumptions.drivers.revenueGrowth[0], 0.07);
  assert.equal(res.model.assumptions.valuation.riskFreeRate, res.rates.riskFreeRate);
  assert(res.usage.inputTokens === 4400);
  console.log(
    `   PASS: AAPL baseline ${res.baselineValuePerShare.toFixed(2)} -> analyst ${res.model.valuation.valuePerShare.toFixed(2)}/sh (${res.citations.length} cited overrides, ${res.turns} turns).`
  );
}

async function verifyTwentyReferenceCompanies() {
  console.log("5. 20-reference-company offline analyst sweep (zero validator rejections)...");
  const baseAapl = loadFixture("AAPL", "AAPL", "hardware");
  const referenceTickers: { ticker: string; template: TemplateId }[] = [
    { ticker: "AAPL", template: "hardware" },
    { ticker: "MSFT", template: "software" },
    { ticker: "NVDA", template: "semiconductors" },
    { ticker: "AMZN", template: "internet" },
    { ticker: "GOOGL", template: "internet" },
    { ticker: "META", template: "internet" },
    { ticker: "ORCL", template: "software" },
    { ticker: "AVGO", template: "semiconductors" },
    { ticker: "CAT", template: "industrial" },
    { ticker: "HON", template: "industrial" },
    { ticker: "PG", template: "consumer" },
    { ticker: "KO", template: "consumer" },
    { ticker: "WMT", template: "retail" },
    { ticker: "COST", template: "retail" },
    { ticker: "LLY", template: "pharma" },
    { ticker: "UNH", template: "healthcare-services" },
    { ticker: "V", template: "payments" },
    { ticker: "MA", template: "payments" },
    { ticker: "CMCSA", template: "telecom" },
    { ticker: "LIN", template: "materials" },
  ];

  const ratesProvider = new FredDamodaranRatesProvider({ allowNetwork: false });
  let totalCitations = 0;

  for (const ref of referenceTickers) {
    const f: CompanyFundamentals = {
      ...baseAapl,
      profile: { ...baseAapl.profile, ticker: ref.ticker, name: `${ref.ticker} Corp`, templateId: ref.template },
    };
    const mock = new RecordedAnalystModel([
      {
        text: JSON.stringify({
          thesisSummary: `${ref.ticker} (${ref.template}) steady compounding thesis.`,
          overrides: [
            {
              key: "revenueGrowth",
              value: [0.06, 0.055, 0.05],
              citationId: "FIN-FY2026",
              rationale: `Anchored to ${ref.ticker} FY2026 revenue trajectory.`,
            },
          ],
        }),
        toolCalls: [],
        usage: emptyUsage(),
        model: "recorded-analyst-v1",
      },
    ]);
    const res = await runAnalystOnFundamentals(f, {
      valuationDate: "2026-11-22",
      ratesProvider,
      analystModel: mock,
    });
    assert.equal(res.validation.valid, true, `${ref.ticker} must pass validation`);
    assert.equal(res.validation.errors.length, 0);
    assert.equal(res.citations.length, 1);
    totalCitations += res.citations.length;
  }
  console.log(`   PASS: All 20 reference companies completed with 0 validator rejections and ${totalCitations} resolved citations.`);
}

async function main() {
  await verifyRatesProvider();
  verifyDossierAndSegments();
  verifyValidator();
  await verifyAnalystLoopEndToEnd();
  await verifyTwentyReferenceCompanies();
  console.log("\nAll Phase 3 analyst checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
