/**
 * Live sweep: build a baseline model for every company in the universe and flag anomalies
 * (hits SEC EDGAR; not run in CI).
 *
 *   npm run audit:models
 *   npm run audit:models -- AAPL MU NEE
 */
import { mkdir, writeFile } from "node:fs/promises";
import { UNIVERSE } from "../src/lib/fundamentals";
import { buildCompanyModel } from "../src/lib/model";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const tickers = args.length ? args : UNIVERSE.map((e) => e.ticker);
  const counts: Record<string, number> = {};
  const report: Record<string, unknown>[] = [];

  for (const ticker of tickers) {
    try {
      const m = await buildCompanyModel(ticker);
      const v = m.valuation;
      const y1 = m.projections[0];
      const flags = [
        ...m.checks.filter((c) => c.status !== "pass").map((c) => c.id),
        ...(v.valuePerShare <= 0 ? ["nonpositive-value"] : []),
        ...m.warnings.filter((w) => w.startsWith("Cyclical peak") || w.startsWith("Year-1 revenue growth")).map((w) => w.split(":")[0]),
      ];
      counts.built = (counts.built ?? 0) + 1;
      if (flags.length) counts.flagged = (counts.flagged ?? 0) + 1;
      report.push({ ticker, template: m.templateId, valuePerShare: v.valuePerShare, wacc: v.wacc, terminalShare: v.terminalShareOfEv, g1: y1.revenueGrowth, margin1: y1.ebitMargin, flags });
      console.log(
        `${ticker.padEnd(6)} ${m.templateId.padEnd(20)} ${m.currency} value ${v.valuePerShare.toFixed(2).padStart(9)}  WACC ${(v.wacc * 100).toFixed(1)}%  TV ${(v.terminalShareOfEv * 100).toFixed(0)}%  g1 ${(y1.revenueGrowth * 100).toFixed(0)}%  m1 ${(y1.ebitMargin * 100).toFixed(0)}%  ${flags.join(" ")}`
      );
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      counts[name] = (counts[name] ?? 0) + 1;
      report.push({ ticker, error: name, message: err instanceof Error ? err.message : String(err) });
      if (name !== "ModelUnsupportedError") console.log(`${ticker.padEnd(6)} ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log("\n", counts);
  await mkdir(".cache", { recursive: true });
  await writeFile(".cache/models-audit.json", JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
