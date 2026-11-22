/**
 * Offline verification of the SEC fundamentals pipeline (runs in CI, no network).
 * Fixtures are real SEC companyfacts responses, trimmed to the tags ThesisLens maps.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeCompanyFacts } from "../src/lib/fundamentals/normalize";
import { mergeCompanyFacts } from "../src/lib/fundamentals";
import { coverageScore, runQualityChecks } from "../src/lib/fundamentals/checks";
import { templateForCompany } from "../src/lib/fundamentals/sector";
import type { SecCompanyFacts, SecFact } from "../src/lib/fundamentals/sec-types";
import type { FinancialHistory, FinancialPeriod } from "../src/lib/fundamentals/types";

const FIXTURES = path.join(__dirname, "fixtures", "sec");
const load = (name: string): SecCompanyFacts =>
  JSON.parse(readFileSync(path.join(FIXTURES, `companyfacts-${name}.json`), "utf8"));

function period(h: FinancialHistory, id: string): FinancialPeriod {
  const p = [...h.annual, ...h.quarterly].find((x) => x.id === id);
  assert(p, `period ${id} missing`);
  return p;
}

const B = 1e9;
const near = (actual: number | undefined, expected: number, tol = 0.5e6, label = "") =>
  assert(
    actual !== undefined && Math.abs(actual - expected) <= tol,
    `${label} expected ${expected}, got ${actual}`
  );

function verifyApple() {
  console.log("1. Apple (10-K/10-Q, Sept fiscal year, YTD cash flows)...");
  const h = normalizeCompanyFacts(load("AAPL"));
  assert.equal(h.currency, "USD");
  assert.equal(h.taxonomy, "us-gaap");

  const fy24 = period(h, "FY2024");
  assert.equal(fy24.end, "2024-09-28", "FY labels must follow Apple's own fiscal year");
  near(fy24.values.revenue, 391.035 * B, 0.5e6, "FY2024 revenue");
  near(fy24.values.netIncome, 93.736 * B, 0.5e6, "FY2024 net income");
  near(fy24.values.epsDiluted, 6.08, 0.001, "FY2024 EPS");
  near(fy24.values.operatingCashFlow, 118.254 * B, 0.5e6, "FY2024 CFO");
  near(fy24.values.freeCashFlow, (118.254 - 9.447) * B, 1e6, "FY2024 FCF");

  // Q4 is never filed; it must be FY − 9M and the four quarters must sum to the year.
  const q4 = period(h, "FY2025Q4");
  assert.equal(q4.sources.revenue?.method, "derived");
  near(q4.values.revenue, 102.466 * B, 0.5e6, "FY2025 Q4 revenue");
  const quarters = [1, 2, 3, 4].map((k) => period(h, `FY2025Q${k}`));
  const sum = quarters.reduce((a, q) => a + (q.values.revenue ?? 0), 0);
  near(sum, period(h, "FY2025").values.revenue as number, 1, "FY2025 quarters sum");

  // 10-Qs report cash flow YTD only; discrete Q2 CFO must be H1 − Q1.
  const q2 = period(h, "FY2026Q2");
  assert.equal(q2.sources.operatingCashFlow?.method, "derived");
  assert.equal(q2.sources.revenue?.method, "reported");

  // Q4 EPS from derived shares and net income stays close to FY EPS / 4 scale.
  assert(q4.values.epsDiluted && q4.values.epsDiluted > 1.5 && q4.values.epsDiluted < 2.2, "Q4 EPS plausible");

  // Balance sheet balances.
  const fails = runQualityChecks(h, templateForCompany("AAPL", "3571"), "2026-11-22").filter((c) => c.status === "fail");
  assert.deepEqual(fails, [], `Apple quality checks should pass: ${JSON.stringify(fails)}`);
  assert.equal(coverageScore(h, "hardware"), 100);
  console.log("   PASS: FY labels, Q4/YTD derivation, FCF, EPS and balance checks.");

  console.log("2. Point-in-time cutoff (asOf)...");
  const pit = normalizeCompanyFacts(load("AAPL"), { asOf: "2025-06-30" });
  assert.equal(pit.annual[pit.annual.length - 1].id, "FY2024", "FY2025 10-K was not yet filed on 2025-06-30");
  assert.equal(pit.quarterly[pit.quarterly.length - 1].id, "FY2025Q2");
  assert(pit.lastFiled && pit.lastFiled <= "2025-06-30", "no facts filed after the cutoff");
  for (const p of [...pit.annual, ...pit.quarterly]) {
    for (const src of Object.values(p.sources)) {
      if (src?.filed) assert(src.filed <= "2025-06-30", `${p.id} uses a fact filed ${src.filed}`);
    }
  }
  assert(pit.latestSharesOutstanding && pit.latestSharesOutstanding.filed <= "2025-06-30");
  console.log("   PASS: no look-ahead; latest visible periods are FY2024 and FY2025Q2.");
}

function verifyBank() {
  console.log("3. JPMorgan (bank line items)...");
  const h = normalizeCompanyFacts(load("JPM"));
  const fy = period(h, "FY2024");
  near(fy.values.netIncome, 58.471 * B, 0.5e6, "JPM FY2024 net income");
  near(fy.values.netInterestIncome, 92.583 * B, 0.5e6, "JPM FY2024 NII");
  assert(fy.values.deposits && fy.values.deposits > 2e12, "deposits present");
  assert(fy.values.loans && fy.values.loans > 1e12, "loans present");
  assert.equal(coverageScore(h, "bank"), 100);
  console.log("   PASS: NII, deposits, loans, full bank coverage.");
}

function verifyIfrs() {
  console.log("4. Novo Nordisk (20-F, IFRS, DKK)...");
  const h = normalizeCompanyFacts(load("NVO"));
  assert.equal(h.currency, "DKK");
  assert.equal(h.taxonomy, "ifrs-full");
  const fy = period(h, "FY2024");
  near(fy.values.revenue, 290.403 * B, 0.5e6, "NVO FY2024 revenue");
  near(fy.values.netIncome, 100.988 * B, 0.5e6, "NVO FY2024 net income");
  assert(fy.values.operatingIncome && fy.values.totalAssets && fy.values.equity, "core IFRS items present");
  console.log("   PASS: ifrs-full tags in reporting currency.");
}

function verifyPredecessorMerge() {
  console.log("5. ExxonMobil holding-company reorganization (predecessor CIK merge)...");
  const successorOnly = normalizeCompanyFacts(load("XOM"));
  assert.equal(successorOnly.annual.length, 0, "new registrant alone has no annual history");
  const merged = normalizeCompanyFacts(mergeCompanyFacts(load("XOM"), [load("XOM-predecessor")]));
  near(period(merged, "FY2024").values.netIncome, 33.68 * B, 0.5e6, "XOM FY2024 net income");
  assert(merged.quarterly.length >= 12, "merged quarterly history");
  const last = merged.quarterly[merged.quarterly.length - 1];
  assert(last.end >= "2026-09-30", "latest quarter comes from the successor registrant");
  console.log(`   PASS: ${merged.annual.length} annual + ${merged.quarterly.length} quarterly periods after merge.`);
}

function fact(partial: Partial<SecFact> & Pick<SecFact, "end" | "val" | "filed">): SecFact {
  return { accn: `acc-${partial.filed}`, fy: null, fp: null, form: "10-K", ...partial };
}

function verifySynthetic() {
  console.log("6. Synthetic edge cases (restatement, tag switch, Q4 derivation)...");
  const facts: SecCompanyFacts = {
    cik: 1,
    entityName: "Synthetic Co",
    facts: {
      "us-gaap": {
        // Tag switch: FY2022 under SalesRevenueNet, FY2023 under the ASC 606 tag.
        SalesRevenueNet: {
          label: null,
          description: null,
          units: { USD: [fact({ start: "2022-01-01", end: "2022-12-31", val: 100, filed: "2023-02-01", fy: 2022, fp: "FY" })] },
        },
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          label: null,
          description: null,
          units: {
            USD: [
              fact({ start: "2023-01-01", end: "2023-03-31", val: 25, filed: "2023-05-01", form: "10-Q", fy: 2023, fp: "Q1" }),
              fact({ start: "2023-01-01", end: "2023-06-30", val: 55, filed: "2023-08-01", form: "10-Q", fy: 2023, fp: "Q2" }),
              fact({ start: "2023-01-01", end: "2023-09-30", val: 90, filed: "2023-11-01", form: "10-Q", fy: 2023, fp: "Q3" }),
              fact({ start: "2023-01-01", end: "2023-12-31", val: 120, filed: "2024-02-01", fy: 2023, fp: "FY" }),
              // Restated in the next 10-K.
              fact({ start: "2023-01-01", end: "2023-12-31", val: 118, filed: "2025-02-01", fy: 2024, fp: "FY" }),
              fact({ start: "2024-01-01", end: "2024-12-31", val: 130, filed: "2025-02-01", fy: 2024, fp: "FY" }),
            ],
          },
        },
        Assets: {
          label: null,
          description: null,
          units: {
            USD: [
              fact({ end: "2022-12-31", val: 500, filed: "2023-02-01", fy: 2022, fp: "FY" }),
              fact({ end: "2023-12-31", val: 520, filed: "2024-02-01", fy: 2023, fp: "FY" }),
              fact({ end: "2024-12-31", val: 540, filed: "2025-02-01", fy: 2024, fp: "FY" }),
            ],
          },
        },
      },
    },
  };

  const latest = normalizeCompanyFacts(facts);
  assert.equal(period(latest, "FY2022").values.revenue, 100, "pre-switch tag used for FY2022");
  assert.equal(period(latest, "FY2023").values.revenue, 118, "restated value wins by default");
  assert.equal(period(latest, "FY2023Q2").values.revenue, 30, "Q2 = H1 − Q1");
  assert.equal(period(latest, "FY2023Q4").values.revenue, 118 - 90, "Q4 = restated FY − 9M");

  const asOf2024 = normalizeCompanyFacts(facts, { asOf: "2024-06-30" });
  assert.equal(period(asOf2024, "FY2023").values.revenue, 120, "original value visible before restatement");
  assert.equal(period(asOf2024, "FY2023Q4").values.revenue, 30);
  assert(!asOf2024.annual.some((p) => p.id === "FY2024"), "FY2024 not visible in mid-2024");
  console.log("   PASS: tag switch, restatement vs point-in-time, YTD derivation.");
}

function verifySectorMapping() {
  console.log("7. Sector template mapping...");
  assert.equal(templateForCompany("JPM", "6021"), "bank");
  assert.equal(templateForCompany("XOM", "2911"), "energy");
  assert.equal(templateForCompany("COP", "1311"), "energy", "narrowest SIC range wins over mining");
  assert.equal(templateForCompany("AMZN", "5961"), "internet", "override beats SIC");
  assert.equal(templateForCompany("brk.b", "6331"), "insurance");
  assert.equal(templateForCompany("UNKNOWN", null), "industrial");
  console.log("   PASS");
}

verifyApple();
verifyBank();
verifyIfrs();
verifyPredecessorMerge();
verifySynthetic();
verifySectorMapping();
console.log("\nAll fundamentals checks passed.");
