/**
 * Offline verification of Phase 5: Point-in-Time Backtesting & Expansion Gate
 * (runs in CI, zero look-ahead, no API key or network).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeCompanyFacts } from "../src/lib/fundamentals/normalize";
import { coverageScore, runQualityChecks } from "../src/lib/fundamentals/checks";
import type { CompanyFundamentals } from "../src/lib/fundamentals/types";
import type { TemplateId } from "../src/lib/fundamentals/sector";
import type { SecCompanyFacts } from "../src/lib/fundamentals/sec-types";
import { runPointInTimeBacktest, sliceFundamentalsAsOf } from "../src/lib/backtest";
import { RecordedAnalystModel, emptyUsage } from "../src/lib/providers";

const FIXTURES = path.join(__dirname, "fixtures", "sec");

function loadFixture(name: string, ticker: string, templateId: TemplateId): CompanyFundamentals {
  const raw: SecCompanyFacts = JSON.parse(readFileSync(path.join(FIXTURES, `companyfacts-${name}.json`), "utf8"));
  const history = normalizeCompanyFacts(raw);
  return {
    profile: { ticker, cik: raw.cik, name: raw.entityName, sic: null, sicDescription: null, exchanges: [], fiscalYearEnd: null, templateId },
    history,
    checks: runQualityChecks(history, templateId, "2026-11-22"),
    coverageScore: coverageScore(history, templateId),
  };
}

async function main() {
  console.log("1. Verifying strict point-in-time slicing (zero look-ahead)...");
  const aapl = loadFixture("AAPL", "AAPL", "hardware");
  const pit = sliceFundamentalsAsOf(aapl, "2025-06-30");
  assert(pit.history.annual.every((p) => p.end <= "2025-06-30"));
  assert(pit.history.quarterly.every((q) => q.end <= "2025-06-30"));
  console.log("   PASS");

  console.log("2. Running 8-template point-in-time backtest (naive vs baseline vs analyst)...");
  const templates: TemplateId[] = [
    "hardware",
    "software",
    "semiconductors",
    "internet",
    "industrial",
    "consumer",
    "retail",
    "payments",
  ];
  const panel: CompanyFundamentals[] = templates.map((t, idx) => ({
    ...aapl,
    profile: { ...aapl.profile, ticker: `REF${idx + 1}`, name: `Reference ${t}`, templateId: t },
  }));

  const report = await runPointInTimeBacktest(panel, {
    quartersPerCompany: 4,
    createAnalystForQuarter: (pitCompany) => {
      const latestAnnual = pitCompany.history.annual[pitCompany.history.annual.length - 1];
      const latestQ = pitCompany.history.quarterly[pitCompany.history.quarterly.length - 1];
      const rev = latestAnnual?.values.revenue ?? 1;
      const ebitM = latestAnnual?.values.operatingIncome ? latestAnnual.values.operatingIncome / rev : 0.3;
      const citationId = latestQ ? `FIN-${latestQ.id}` : `FIN-${latestAnnual.id}`;
      // Analyst uses only strictly visible pitCompany history (zero look-ahead) with steady-growth calibration
      return new RecordedAnalystModel([
        {
          text: JSON.stringify({
            thesisSummary: "Calibrated growth and margin trajectory from latest visible quarterly filing.",
            overrides: [
              {
                key: "revenueGrowth",
                value: [0.065, 0.06, 0.055],
                citationId,
                rationale: "Anchored to latest visible filing growth.",
              },
              {
                key: "ebitMargin",
                value: Math.min(0.45, Math.max(0.1, ebitM + 0.005)),
                citationId,
                rationale: "Modest operating leverage from latest visible filing.",
              },
            ],
          }),
          toolCalls: [],
          usage: emptyUsage(),
          model: "recorded-backtest-v1",
        },
      ]);
    },
  });

  assert.equal(report.companiesEvaluated, 8);
  assert.equal(report.byTemplate.length, 8);
  assert(report.quartersEvaluated >= 24, `expected >= 24 quarters evaluated, got ${report.quartersEvaluated}`);
  assert.equal(report.lookAheadAudit.cleanRate, 1, "look-ahead audit must be 100% clean");
  assert.equal(report.lookAheadAudit.violations.length, 0);
  assert(report.lookAheadAudit.totalCitations > 0, "citations were audited");

  console.log(
    `   PASS: Evaluated ${report.quartersEvaluated} quarters across ${report.byTemplate.length} templates. ` +
      `Rev MdAPE: naive ${(report.overall.naive.medianRevenueApe * 100).toFixed(2)}% | baseline ${(report.overall.baseline.medianRevenueApe * 100).toFixed(2)}% | analyst ${(report.overall.analyst.medianRevenueApe * 100).toFixed(2)}%. ` +
      `Look-ahead audit: ${(report.lookAheadAudit.cleanRate * 100).toFixed(0)}% clean (${report.lookAheadAudit.validCitations}/${report.lookAheadAudit.totalCitations}). ` +
      `Gate: ${report.gate.passed ? "PASS" : "FAIL"} (${report.gate.templatesBeatingNaiveRevenue}/8 templates beat naive rev).`
  );
  console.log("\nAll Phase 5 backtest checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
