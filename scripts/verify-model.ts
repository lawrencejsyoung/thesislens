/**
 * Offline verification of the three-statement model engine and DCF (runs in CI, no network).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeCompanyFacts } from "../src/lib/fundamentals/normalize";
import { coverageScore, runQualityChecks } from "../src/lib/fundamentals/checks";
import type { CompanyFundamentals } from "../src/lib/fundamentals/types";
import type { TemplateId } from "../src/lib/fundamentals/sector";
import type { SecCompanyFacts } from "../src/lib/fundamentals/sec-types";
import { buildModelFromFundamentals, ModelInputError, ModelUnsupportedError } from "../src/lib/model";
import { projectStatements } from "../src/lib/model/engine";
import { valueCompany } from "../src/lib/model/valuation";
import type { BaseYear, ModelAssumptions } from "../src/lib/model/types";

const FIXTURES = path.join(__dirname, "fixtures", "sec");

function fundamentals(name: string, ticker: string, templateId: TemplateId, asOf?: string): CompanyFundamentals {
  const raw: SecCompanyFacts = JSON.parse(readFileSync(path.join(FIXTURES, `companyfacts-${name}.json`), "utf8"));
  const history = normalizeCompanyFacts(raw, { asOf });
  return {
    profile: { ticker, cik: raw.cik, name: raw.entityName, sic: null, sicDescription: null, exchanges: [], fiscalYearEnd: null, templateId },
    history,
    checks: runQualityChecks(history, templateId, "2026-11-22"),
    coverageScore: coverageScore(history, templateId),
  };
}

const fill = (n: number, x: number) => Array.from({ length: n }, () => x);

function steadyState(years = 10): { base: BaseYear; a: ModelAssumptions } {
  const base: BaseYear = {
    fiscalYear: 2025,
    periodId: "FY2025",
    end: "2025-12-31",
    revenue: 1000,
    cogs: 600,
    ebit: 200,
    cash: 100,
    receivables: 100,
    inventory: 60,
    ppe: 500,
    otherAssets: 240,
    payables: 50,
    debt: 300,
    otherLiabilities: 150,
    equity: 500,
    dilutedShares: 100,
  };
  const a: ModelAssumptions = {
    years,
    drivers: {
      revenueGrowth: fill(years, 0),
      ebitMargin: fill(years, 0.2),
      grossMargin: fill(years, 0.4),
      daPctRevenue: fill(years, 0.05),
      capexPctRevenue: fill(years, 0.05),
      sbcPctRevenue: fill(years, 0),
      taxRate: fill(years, 0.25),
      dso: fill(years, 36.5),
      dio: fill(years, 36.5),
      dpo: fill(years, (50 / 600) * 365),
      dividendPayout: fill(years, 0.5),
      buybackPctOfFcf: fill(years, 0),
      shareCountChange: fill(years, 0),
    },
    financing: { interestRateOnDebt: 0.05, interestRateOnCash: 0.02, minCashPctRevenue: 0.05, debtChange: fill(years, 0) },
    valuation: {
      riskFreeRate: 0.04,
      equityRiskPremium: 0.05,
      unleveredBeta: 1,
      targetDebtWeight: 0.2,
      preTaxCostOfDebt: 0.05,
      terminalGrowth: 0,
      terminalRonic: 0.1,
      sbcTreatment: "expense",
      waccOverride: 0.08,
    },
  };
  return { base, a };
}

function verifyEngineIdentities() {
  console.log("1. Engine identities (balance sheet balances, cash ties, steady state)...");
  const { base, a } = steadyState();
  const ys = projectStatements(base, a);
  for (const y of ys) {
    assert(Math.abs(y.balanceDifference) < 1e-9, `${y.label} balance diff ${y.balanceDifference}`);
    assert(Math.abs(y.operatingCashFlow + y.investingCashFlow + y.financingCashFlow - y.netChangeInCash) < 1e-9, `${y.label} cash tie`);
    assert(Math.abs(y.changeInNwc) < 1e-9, "steady state has no working-capital build");
    assert(Math.abs(y.fcff - 200 * 0.75) < 1e-9, "steady-state FCFF = NOPAT");
  }
  console.log("   PASS");
}

function verifyGordonEquivalence() {
  console.log("2. DCF reproduces the closed form for a no-growth perpetuity...");
  const { base, a } = steadyState();
  const ys = projectStatements(base, a);
  const W = 0.08;
  const nopat = 150;
  const val = valueCompany({
    projections: ys,
    assumptions: a.valuation,
    terminalTaxRate: 0.25,
    valuationDate: base.end,
    netDebt: 200,
    grossDebt: 300,
    minorityAndOther: 0,
    shares: 100,
    currentPrice: null,
  });
  // Mid-year explicit flows + perpetuity at year 10.
  let expected = 0;
  for (let i = 1; i <= 10; i++) expected += nopat / Math.pow(1 + W, i - 0.5);
  expected += nopat / W / Math.pow(1 + W, 10);
  const err = Math.abs(val.enterpriseValue - expected) / expected;
  assert(err < 5e-4, `EV ${val.enterpriseValue} vs closed form ${expected} (err ${err})`);
  assert(Math.abs(val.valuePerShare - (val.enterpriseValue - 200) / 100) < 1e-9, "equity bridge");
  console.log(`   PASS: EV ${val.enterpriseValue.toFixed(2)} vs ${expected.toFixed(2)} (err ${(err * 100).toFixed(3)}%).`);
}

function verifyValueDriver() {
  console.log("3. Terminal value-driver economics...");
  const { base, a } = steadyState();
  const ys = projectStatements(base, a);
  const common = {
    projections: ys,
    terminalTaxRate: 0.25,
    valuationDate: base.end,
    netDebt: 0,
    grossDebt: 300,
    minorityAndOther: 0,
    shares: 100,
    currentPrice: null,
  };
  const run = (g: number, ronic: number) =>
    valueCompany({ ...common, assumptions: { ...a.valuation, terminalGrowth: g, terminalRonic: ronic } });
  const at = (g: number, ronic: number) => run(g, ronic).valuePerShare;
  // When RONIC = WACC, growth creates no value: TV collapses to NOPAT(N+1) / WACC.
  for (const g of [0.01, 0.03]) {
    const tv = run(g, 0.08).terminalValue;
    assert(Math.abs(tv - (150 * (1 + g)) / 0.08) < 1e-6, `RONIC = WACC ⇒ TV = NOPAT·(1+g)/WACC (g=${g})`);
  }
  assert(at(0.03, 0.2) > at(0.01, 0.2), "RONIC > WACC ⇒ growth adds value");
  assert(at(0.03, 0.05) < at(0.01, 0.05), "RONIC < WACC ⇒ growth destroys value");
  console.log("   PASS");
}

function verifyRevolver() {
  console.log("4. Revolver funds shortfalls and is swept with excess cash...");
  const { base, a } = steadyState();
  a.drivers.dividendPayout = [3, 3, 0, 0, 0, 0, 0, 0, 0, 0];
  const ys = projectStatements(base, a);
  assert(ys[0].revolverBalance > 0 && ys[1].revolverBalance > ys[0].revolverBalance, "revolver drawn while payouts exceed cash");
  assert(ys[9].revolverBalance === 0, "revolver fully repaid once payouts stop");
  for (const y of ys) {
    assert(y.cash >= 1000 * 0.05 - 1e-9, `${y.label} cash floor respected`);
    assert(Math.abs(y.balanceDifference) < 1e-9);
  }
  console.log("   PASS");
}

function verifyAppleModel() {
  console.log("5. Apple end-to-end model from real SEC data...");
  const f = fundamentals("AAPL", "AAPL", "hardware");
  const m = buildModelFromFundamentals(f, { valuationDate: "2026-11-22", currentPrice: 250 });
  assert.equal(m.base.periodId, "FY2026");
  assert.equal(m.projections.length, 10);
  assert.equal(m.projections[0].label, "FY2027E");
  for (const c of m.checks.filter((c) => c.id === "balance-sheet-balances" || c.id === "cash-flow-ties")) {
    assert.equal(c.status, "pass", c.message);
  }
  const [bear, baseCase, bull] = m.scenarios;
  assert(bear.valuePerShare < baseCase.valuePerShare && baseCase.valuePerShare < bull.valuePerShare, "scenario ordering");
  assert(m.probabilityWeightedValue > bear.valuePerShare && m.probabilityWeightedValue < bull.valuePerShare);
  assert(m.valuation.upside !== null && Math.abs(m.valuation.upside - (m.valuation.valuePerShare / 250 - 1)) < 1e-12);
  assert(m.valuation.wacc > 0.06 && m.valuation.wacc < 0.12, `WACC ${m.valuation.wacc}`);
  assert(m.valuation.netDebt < 0, "Apple is net cash once marketable securities are counted");

  // Sensitivity: value falls as WACC rises.
  const g0 = m.valuation.sensitivity.filter((c) => Math.abs(c.terminalGrowth - m.assumptions.valuation.terminalGrowth) < 1e-12);
  for (let i = 1; i < g0.length; i++) assert(g0[i].valuePerShare < g0[i - 1].valuePerShare, "monotonic in WACC");

  assert.equal(m.quarterlyOutlook.length, 8, "two forecast years of quarters");
  const q = m.quarterlyOutlook.slice(0, 4).reduce((s, x) => s + x.revenue, 0);
  assert(Math.abs(q - m.projections[0].revenue) / q < 1e-9, "quarters sum to the forecast year");
  assert(m.notes.some((n) => n.key === "revenueGrowth[1]"), "every baseline driver carries a basis note");
  console.log(
    `   PASS: ${m.base.periodId} base, WACC ${(m.valuation.wacc * 100).toFixed(2)}%, value/share ${m.valuation.valuePerShare.toFixed(2)} (bear ${bear.valuePerShare.toFixed(0)} / bull ${bull.valuePerShare.toFixed(0)}).`
  );

  console.log("6. Overrides are applied, bounded and documented...");
  const o = buildModelFromFundamentals(f, {
    valuationDate: "2026-11-22",
    overrides: {
      drivers: { revenueGrowth: [0.05, 0.04], ebitMargin: 0.3 },
      valuation: { terminalGrowth: 0.02 },
      rationale: { revenueGrowth: "Mgmt guided low-to-mid single digit growth (FY26 Q4 call)." },
    },
  });
  assert.equal(o.assumptions.drivers.revenueGrowth[0], 0.05);
  assert.equal(o.assumptions.drivers.revenueGrowth[9], 0.04, "path extends with its last value");
  assert.equal(o.assumptions.drivers.ebitMargin[5], 0.3);
  assert(o.notes.some((n) => n.source === "override" && n.basis.includes("Q4 call")), "rationale recorded");
  assert(o.valuation.valuePerShare < m.valuation.valuePerShare, "lower growth and margin lower the value");
  assert.throws(() => buildModelFromFundamentals(f, { overrides: { drivers: { ebitMargin: 5 } } }), ModelInputError);
  assert.throws(
    () => buildModelFromFundamentals(f, { overrides: { drivers: { nonsense: 1 } as never } }),
    ModelInputError
  );
  assert.throws(() => buildModelFromFundamentals(f, { currentPrice: -1 }), ModelInputError);
  console.log("   PASS");
}

function verifyPointInTimeModel() {
  console.log("7. Point-in-time model (as of 2025-06-30)...");
  const f = fundamentals("AAPL", "AAPL", "hardware", "2025-06-30");
  const m = buildModelFromFundamentals(f, { valuationDate: "2025-06-30" });
  assert.equal(m.base.periodId, "FY2024");
  const note = m.notes.find((n) => n.key === "revenueGrowth[1]");
  assert(note && note.basis.includes("FY2025Q1") && note.basis.includes("FY2025Q2"), "year 1 anchored to reported YTD");
  assert(m.quarterlyOutlook[0].actual && m.quarterlyOutlook[1].actual && !m.quarterlyOutlook[2].actual);
  console.log(`   PASS: base FY2024, year-1 growth ${note.value} from YTD actuals.`);
}

function verifyUnsupported() {
  console.log("8. Financials are routed away from the FCFF engine...");
  const f = fundamentals("JPM", "JPM", "bank");
  assert.throws(() => buildModelFromFundamentals(f), ModelUnsupportedError);
  console.log("   PASS");
}

verifyEngineIdentities();
verifyGordonEquivalence();
verifyValueDriver();
verifyRevolver();
verifyAppleModel();
verifyPointInTimeModel();
verifyUnsupported();
console.log("\nAll model checks passed.");
