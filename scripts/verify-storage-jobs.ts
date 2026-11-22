/**
 * Offline verification of Phase 4: Postgres schema migration, ValuationStore (7 tables + vector search),
 * Nightly Refresh Job, and Filing Poller Job (runs in CI, no network or DB required).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeCompanyFacts } from "../src/lib/fundamentals/normalize";
import { coverageScore, runQualityChecks } from "../src/lib/fundamentals/checks";
import type { CompanyFundamentals } from "../src/lib/fundamentals/types";
import type { TemplateId } from "../src/lib/fundamentals/sector";
import type { SecCompanyFacts } from "../src/lib/fundamentals/sec-types";
import { MemoryValuationStore } from "../src/lib/storage";
import { runFilingPollerJob, runNightlyRefreshJob } from "../src/lib/jobs";
import { FredDamodaranRatesProvider, RecordedAnalystModel, emptyUsage } from "../src/lib/providers";

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

function verifyMigrationSql() {
  console.log("1. Checking Postgres + pgvector SQL migration schema...");
  const sql = readFileSync(path.join(process.cwd(), "db", "migrations", "001_initial_valuation_schema.sql"), "utf8");
  assert(sql.includes("CREATE EXTENSION IF NOT EXISTS vector"), "pgvector extension");
  for (const table of ["companies", "facts", "kpis", "guidance", "doc_chunks", "model_versions", "runs"]) {
    assert(sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing table ${table}`);
  }
  console.log("   PASS: All 7 tables + pgvector extension present.");
}

async function verifyStoreAndJobs() {
  console.log("2. Testing ValuationStore (doc_chunks vector search, versions, runs)...");
  const store = new MemoryValuationStore(null);
  await store.upsertDocChunks([
    {
      id: "c1",
      companyTicker: "AAPL",
      form: "10-K",
      filedDate: "2025-11-01",
      section: "mda",
      chunkIndex: 0,
      title: "Services Growth",
      content: "Services gross margin expanded to 74%.",
      tokenCount: 12,
      embedding: [1, 0, 0],
    },
    {
      id: "c2",
      companyTicker: "AAPL",
      form: "10-Q",
      filedDate: "2026-08-01",
      section: "mda",
      chunkIndex: 1,
      title: "Future Q3 Filing",
      content: "Post-asOf content.",
      tokenCount: 10,
      embedding: [0, 1, 0],
    },
  ]);

  const pitChunks = await store.searchDocChunks("AAPL", { asOf: "2026-01-01", queryEmbedding: [0.9, 0.1, 0] });
  assert.equal(pitChunks.length, 1, "asOf filters out future doc_chunks");
  assert.equal(pitChunks[0].id, "c1");
  console.log("   PASS: Vector search & point-in-time doc_chunks filtering work.");

  console.log("3. Testing Nightly Refresh Job...");
  const aapl = loadFixture("AAPL", "AAPL", "hardware");
  const nightly = await runNightlyRefreshJob({
    tickers: ["AAPL"],
    store,
    loadFundamentals: async () => aapl,
    triggerSource: "verify-test",
  });
  assert.equal(nightly.run.status, "completed");
  assert.equal(nightly.updatedTickers.length, 1);
  const v1 = await store.getLatestModelVersion("AAPL");
  assert(v1 && v1.versionNumber === 1 && v1.modelType === "baseline");

  // Re-running nightly with unchanged data should skip creating a duplicate version
  const nightly2 = await runNightlyRefreshJob({
    tickers: ["AAPL"],
    store,
    loadFundamentals: async () => aapl,
    triggerSource: "verify-test",
  });
  assert.equal(nightly2.updatedTickers.length, 0);
  assert.equal(nightly2.skippedTickers.length, 1);
  console.log("   PASS: Nightly job builds v1 and skips unchanged re-runs.");

  console.log("4. Testing Filing Poller Job (delta analyst run + version reopen)...");
  const ratesProvider = new FredDamodaranRatesProvider({ allowNetwork: false });
  const mockAnalyst = new RecordedAnalystModel([
    {
      text: JSON.stringify({
        thesisSummary: "New 8-K confirms accelerating Services mix; lifting EBIT margin to 33%.",
        overrides: [
          {
            key: "ebitMargin",
            value: [0.33, 0.335],
            citationId: "FILING-8-K-2026-11-05",
            rationale: "8-K earnings release highlights higher Services margin mix.",
          },
        ],
      }),
      toolCalls: [],
      usage: { ...emptyUsage(), inputTokens: 900, outputTokens: 120, estimatedCostUsd: 0.0002 },
      model: "recorded-analyst-v1",
    },
  ]);

  const poller = await runFilingPollerJob({
    filings: [
      {
        ticker: "AAPL",
        cik: aapl.profile.cik,
        form: "8-K",
        accn: "0000320193-26-000123",
        filedDate: "2026-11-05",
        summaryText: "Services revenue grew 14% YoY with record 74.5% gross margin.",
      },
    ],
    store,
    analystModel: mockAnalyst,
    ratesProvider,
    loadFundamentals: async () => aapl,
    triggerSource: "verify-poller",
  });
  assert.equal(poller.createdVersions.length, 1);
  const v2 = poller.createdVersions[0];
  assert.equal(v2.versionNumber, 2);
  assert.equal(v2.parentVersionId, v1.id, "v2 links back to v1");
  assert.equal(v2.triggerAccn, "0000320193-26-000123");
  assert.equal(v2.citations.length, 1);

  // Reopen v2 by id with exact inputs and citations
  const reopened = await store.getModelVersion(v2.id);
  assert(reopened && reopened.citations[0].citationId === "FILING-8-K-2026-11-05");

  // Duplicate accession number is skipped
  const pollerDup = await runFilingPollerJob({
    filings: [
      {
        ticker: "AAPL",
        cik: aapl.profile.cik,
        form: "8-K",
        accn: "0000320193-26-000123",
        filedDate: "2026-11-05",
      },
    ],
    store,
    analystModel: mockAnalyst,
    ratesProvider,
    loadFundamentals: async () => aapl,
  });
  assert.equal(pollerDup.createdVersions.length, 0);
  assert.equal(pollerDup.skippedAccns.length, 1);
  console.log(`   PASS: Filing poller created v2 (parent ${v1.id}), reopened exact citations, and deduplicated repeat accn.`);
}

async function main() {
  verifyMigrationSql();
  await verifyStoreAndJobs();
  console.log("\nAll Phase 4 storage & refresh job checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
