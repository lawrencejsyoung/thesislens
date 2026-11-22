/**
 * Live data-quality audit across the coverage universe (hits SEC EDGAR; not run in CI).
 *
 *   npm run audit:fundamentals                 # whole universe
 *   npm run audit:fundamentals -- AAPL XOM JPM # specific tickers
 *   npm run audit:fundamentals -- --as-of 2024-06-30
 *
 * Writes a JSON report to .cache/fundamentals-audit.json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { getCompanyFundamentals, UNIVERSE, type CompanyFundamentals } from "../src/lib/fundamentals";

interface Row {
  ticker: string;
  ok: boolean;
  error?: string;
  template?: string;
  currency?: string;
  latestFy?: string;
  annual?: number;
  quarterly?: number;
  coverage?: number;
  failures?: string[];
  warnings?: string[];
}

function summarize(ticker: string, f: CompanyFundamentals): Row {
  const latest = f.history.annual[f.history.annual.length - 1];
  const tag = (c: { id: string; periodId?: string }) => (c.periodId ? `${c.id}@${c.periodId}` : c.id);
  return {
    ticker,
    ok: true,
    template: f.profile.templateId,
    currency: f.history.currency,
    latestFy: latest?.id,
    annual: f.history.annual.length,
    quarterly: f.history.quarterly.length,
    coverage: f.coverageScore,
    failures: f.checks.filter((c) => c.status === "fail").map(tag),
    warnings: f.checks.filter((c) => c.status === "warn").map((c) => `${tag(c)}: ${c.message}`),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const asOfIdx = args.indexOf("--as-of");
  const asOf = asOfIdx >= 0 ? args[asOfIdx + 1] : undefined;
  const tickers = args.filter((a, i) => !a.startsWith("--") && (asOfIdx < 0 || i !== asOfIdx + 1));
  const list = tickers.length ? tickers : UNIVERSE.map((e) => e.ticker);

  const rows: Row[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const ticker = list[cursor++];
      try {
        rows.push(summarize(ticker, await getCompanyFundamentals(ticker, { asOf })));
      } catch (err) {
        rows.push({ ticker, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  rows.sort((a, b) => list.indexOf(a.ticker) - list.indexOf(b.ticker));

  for (const r of rows) {
    if (!r.ok) {
      console.log(`${r.ticker.padEnd(6)} ERROR ${r.error}`);
      continue;
    }
    const flags = [
      r.failures?.length ? `FAIL ${r.failures.join(" ")}` : "",
      r.warnings?.length ? `WARN ${r.warnings.length}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    console.log(
      `${r.ticker.padEnd(6)} ${String(r.template).padEnd(20)} ${r.currency} ${String(r.latestFy).padEnd(7)} A${r.annual} Q${r.quarterly} cov=${r.coverage} ${flags}`
    );
  }

  const ok = rows.filter((r) => r.ok);
  const full = ok.filter((r) => r.coverage === 100).length;
  const clean = ok.filter((r) => !r.failures?.length).length;
  console.log(
    `\n${rows.length} companies | ${ok.length} loaded | ${full} with 100% core coverage | ${clean} with no failed checks | mean coverage ${(
      ok.reduce((a, r) => a + (r.coverage ?? 0), 0) / Math.max(1, ok.length)
    ).toFixed(1)}`
  );

  await mkdir(".cache", { recursive: true });
  await writeFile(".cache/fundamentals-audit.json", JSON.stringify({ asOf: asOf ?? null, rows }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
