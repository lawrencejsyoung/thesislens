/**
 * Offline verification of Phase 6: Specialist Sector Valuation Models (all 19 templates, zero refusals),
 * ADR conversion, EU ESEF / Japan EDINET international normalizers, and market-cap universe ranking.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeCompanyFacts } from "../src/lib/fundamentals/normalize";
import { mergeCompanyFacts } from "../src/lib/fundamentals";
import { coverageScore, runQualityChecks } from "../src/lib/fundamentals/checks";
import { TEMPLATE_IDS, type TemplateId } from "../src/lib/fundamentals/sector";
import type { CompanyFundamentals } from "../src/lib/fundamentals/types";
import type { SecCompanyFacts } from "../src/lib/fundamentals/sec-types";
import { convertAdrPriceToOrdinary, convertOrdinaryValueToAdrUsd } from "../src/lib/fundamentals/adr";
import {
  CompositeFundamentalsProvider,
  EdinetFundamentalsProvider,
  EsefFundamentalsProvider,
} from "../src/lib/fundamentals/international";
import { rankUniverseByMarketCap } from "../src/lib/fundamentals/universe-ranking";
import { StaticMarketDataProvider } from "../src/lib/providers";
import { buildModelFromFundamentals } from "../src/lib/model";

const FIXTURES = path.join(__dirname, "fixtures", "sec");

function loadFixture(name: string, ticker: string, templateId: TemplateId, predecessor?: string): CompanyFundamentals {
  let raw: SecCompanyFacts = JSON.parse(readFileSync(path.join(FIXTURES, `companyfacts-${name}.json`), "utf8"));
  if (predecessor) {
    const prev: SecCompanyFacts = JSON.parse(readFileSync(path.join(FIXTURES, `companyfacts-${predecessor}.json`), "utf8"));
    raw = mergeCompanyFacts(raw, [prev]);
  }
  const history = normalizeCompanyFacts(raw);
  return {
    profile: { ticker, cik: raw.cik, name: raw.entityName, sic: null, sicDescription: null, exchanges: [], fiscalYearEnd: null, templateId },
    history,
    checks: runQualityChecks(history, templateId, "2026-11-22"),
    coverageScore: coverageScore(history, templateId),
  };
}

async function main() {
  console.log("1. Verifying zero refusals across all 19 sector templates...");
  const aapl = loadFixture("AAPL", "AAPL", "hardware");
  const jpm = loadFixture("JPM", "JPM", "bank");
  const xom = loadFixture("XOM", "XOM", "energy", "XOM-predecessor");
  const nvo = loadFixture("NVO", "NVO", "pharma");

  for (const tid of TEMPLATE_IDS) {
    const baseF = tid === "bank" ? jpm : tid === "energy" ? xom : tid === "pharma" ? nvo : aapl;
    const f: CompanyFundamentals = {
      ...baseF,
      profile: { ...baseF.profile, templateId: tid },
    };
    const m = buildModelFromFundamentals(f, { valuationDate: "2026-11-22" });
    assert(Number.isFinite(m.valuation.valuePerShare) && m.valuation.valuePerShare > 0, `${tid} produced valid positive value/share`);
  }
  console.log(`   PASS: All ${TEMPLATE_IDS.length} templates built valid models with 0 refusals.`);

  console.log("2. Verifying each of the 8 Phase 6 specialist sector models...");
  const bankModel = buildModelFromFundamentals(jpm, { valuationDate: "2026-11-22" });
  assert.equal(bankModel.sectorValuation?.method, "bank-residual-income");

  const insurerModel = buildModelFromFundamentals({ ...jpm, profile: { ...jpm.profile, ticker: "CB", templateId: "insurance" } });
  assert.equal(insurerModel.sectorValuation?.method, "insurance-embedded-value");

  const brokerModel = buildModelFromFundamentals({ ...jpm, profile: { ...jpm.profile, ticker: "BLK", templateId: "capital-markets" } });
  assert.equal(brokerModel.sectorValuation?.method, "capital-markets-aum-roe");

  const reitModel = buildModelFromFundamentals({ ...aapl, profile: { ...aapl.profile, ticker: "AMT", templateId: "reit" } });
  assert.equal(reitModel.sectorValuation?.method, "reit-nav-affo");
  assert(!reitModel.warnings.some((w) => w.includes("indicative only")));

  const utilModel = buildModelFromFundamentals({ ...aapl, profile: { ...aapl.profile, ticker: "NEE", templateId: "utility" } });
  assert.equal(utilModel.sectorValuation?.method, "utility-rate-base");
  assert(!utilModel.warnings.some((w) => w.includes("indicative only")));

  const energyModel = buildModelFromFundamentals(xom, { valuationDate: "2026-11-22" });
  assert.equal(energyModel.sectorValuation?.method, "commodity-reserve-nav");

  const pharmaModel = buildModelFromFundamentals(nvo, {
    valuationDate: "2026-11-22",
    pipelineAssets: [{ name: "CagriSema", phase: "phase3", peakSales: 40_000_000_000, yearsToLaunch: 2 }],
  });
  assert.equal(pharmaModel.sectorValuation?.method, "pharma-rnpv-blend");
  assert(pharmaModel.valuation.valuePerShare > (pharmaModel.sectorValuation?.crossCheckValuePerShare ?? 0), "pipeline rNPV adds value");

  // Auto captive-finance split: create a high-debt OEM (debt = 100% of revenue)
  const autoF: CompanyFundamentals = {
    ...aapl,
    profile: { ...aapl.profile, ticker: "F", name: "Ford Motor Co", templateId: "auto" },
    history: {
      ...aapl.history,
      annual: aapl.history.annual.map((p, idx) =>
        idx === aapl.history.annual.length - 1
          ? { ...p, values: { ...p.values, totalDebt: (p.values.revenue ?? 100e9) * 0.9 } }
          : p
      ),
    },
  };
  const autoModel = buildModelFromFundamentals(autoF, { valuationDate: "2026-11-22" });
  assert.equal(autoModel.sectorValuation?.method, "auto-captive-split");
  assert(Number(autoModel.sectorValuation?.metrics.captiveFinanceDebtB) > 0, "captive finance debt separated");
  console.log("   PASS: Banks, Insurers, Capital Markets, REITs, Utilities, Commodities, Pharma rNPV, and Auto Captive Split verified.");

  console.log("3. Verifying ADR ratio & FX round-trip conversion...");
  const tsmOrd = convertAdrPriceToOrdinary("TSM", 180, { fxToUsd: 0.031 });
  assert.equal(tsmOrd.ordinarySharesPerAdr, 5);
  assert.equal(tsmOrd.reportingCurrency, "TWD");
  const backToAdr = convertOrdinaryValueToAdrUsd("TSM", tsmOrd.ordinaryPrice, { fxToUsd: 0.031 });
  assert(Math.abs(backToAdr.adrValueUsd - 180) < 1e-9, "ADR round-trip exact");
  console.log(`   PASS: TSM $180 ADR <-> ${tsmOrd.ordinaryPrice.toFixed(2)} TWD ordinary share (1:5 ratio).`);

  console.log("4. Verifying EU ESEF & Japan EDINET international providers + composite routing...");
  const esef = new EsefFundamentalsProvider({
    "SAP.DE": {
      ticker: "SAP.DE",
      entityName: "SAP SE",
      currency: "EUR",
      exchange: "XETRA",
      templateId: "software",
      sourceLabel: "ESEF-iXBRL",
      rows: [
        {
          fiscalYear: 2024,
          start: "2024-01-01",
          end: "2024-12-31",
          filed: "2025-02-28",
          revenue: 34_176_000_000,
          grossProfit: 25_000_000_000,
          operatingIncome: 8_150_000_000,
          netIncome: 6_200_000_000,
          epsDiluted: 5.3,
          dilutedShares: 1_170_000_000,
          operatingCashFlow: 8_200_000_000,
          capex: 800_000_000,
          cash: 9_600_000_000,
          totalAssets: 72_000_000_000,
          totalDebt: 9_800_000_000,
          stockholdersEquity: 43_000_000_000,
          ppe: 4_500_000_000,
          depreciationAmortization: 1_400_000_000,
        },
      ],
    },
  });
  const edinet = new EdinetFundamentalsProvider({
    "7203.T": {
      ticker: "7203.T",
      entityName: "Toyota Motor Corp",
      currency: "JPY",
      exchange: "TSE",
      templateId: "auto",
      sourceLabel: "EDINET-JP",
      rows: [
        {
          fiscalYear: 2025,
          start: "2024-04-01",
          end: "2025-03-31",
          filed: "2025-06-20",
          revenue: 45_000_000_000_000,
          grossProfit: 9_000_000_000_000,
          operatingIncome: 4_800_000_000_000,
          netIncome: 4_200_000_000_000,
          epsDiluted: 315,
          dilutedShares: 13_300_000_000,
          operatingCashFlow: 4_500_000_000_000,
          capex: 2_100_000_000_000,
          cash: 9_000_000_000_000,
          totalAssets: 90_000_000_000_000,
          totalDebt: 36_000_000_000_000,
          stockholdersEquity: 35_000_000_000_000,
          ppe: 15_000_000_000_000,
          depreciationAmortization: 2_000_000_000_000,
        },
      ],
    },
  });
  const composite = new CompositeFundamentalsProvider([esef, edinet]);
  const sapF = await composite.getFundamentals("SAP.DE");
  const sapM = buildModelFromFundamentals(sapF);
  assert.equal(sapM.currency, "EUR");
  assert(sapM.valuation.valuePerShare > 0);

  const toyotaF = await composite.getFundamentals("7203.T");
  const toyotaM = buildModelFromFundamentals(toyotaF);
  assert.equal(toyotaM.currency, "JPY");
  assert.equal(toyotaM.sectorValuation?.method, "auto-captive-split");
  console.log(`   PASS: SAP.DE (${sapM.currency} ${sapM.valuation.valuePerShare.toFixed(2)}) & 7203.T (${toyotaM.currency} ${toyotaM.valuation.valuePerShare.toFixed(0)}).`);

  console.log("5. Verifying dynamic market-cap universe ranking...");
  const marketData = new StaticMarketDataProvider([
    { ticker: "NVDA", price: 140, quoteCurrency: "USD", marketCapUsd: 3_500_000_000_000, beta: 1.5, adrRatio: 1, asOf: "2026-11-22", source: "test" },
    { ticker: "AAPL", price: 230, quoteCurrency: "USD", marketCapUsd: 3_400_000_000_000, beta: 1.1, adrRatio: 1, asOf: "2026-11-22", source: "test" },
    { ticker: "MSFT", price: 420, quoteCurrency: "USD", marketCapUsd: 3_100_000_000_000, beta: 1.0, adrRatio: 1, asOf: "2026-11-22", source: "test" },
  ]);
  const ranked = await rankUniverseByMarketCap(marketData, { limit: 10 });
  assert.equal(ranked[0].ticker, "NVDA");
  assert.equal(ranked[1].ticker, "AAPL");
  assert.equal(ranked[2].ticker, "MSFT");
  assert.equal(ranked[0].source, "market-data-provider");
  console.log("   PASS: Universe dynamically ranked by market cap from MarketDataProvider.");

  console.log("\nAll Phase 6 full-coverage checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
