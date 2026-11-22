/**
 * Cloud Run Job entrypoint: Filing-triggered analyst refresh poller.
 * Watches recent SEC submissions for covered tickers and triggers Phase 3 analyst updates.
 * Usage: npx tsx scripts/job-filing-poller.ts [TICKER1,TICKER2,...]
 */
import { UNIVERSE } from "../src/lib/fundamentals/universe";
import { fetchSubmissions, resolveCik } from "../src/lib/fundamentals/sec-client";
import { MATERIAL_FILING_FORMS, runFilingPollerJob, type DetectedFiling } from "../src/lib/jobs";

async function main() {
  const arg = process.argv[2];
  const filterSet = arg
    ? new Set(arg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))
    : null;
  const targets = filterSet
    ? UNIVERSE.filter((u) => filterSet.has(u.ticker.toUpperCase()))
    : UNIVERSE.slice(0, 25);

  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const detected: DetectedFiling[] = [];

  for (const entry of targets) {
    try {
      const resolved = await resolveCik(entry.ticker);
      if (!resolved) continue;
      const sub = await fetchSubmissions(resolved.cik);
      const recent = sub.filings?.recent;
      if (!recent) continue;
      for (let i = 0; i < Math.min(10, recent.form.length); i++) {
        const form = recent.form[i];
        const filedDate = recent.filingDate[i];
        const accn = recent.accessionNumber[i];
        if (!MATERIAL_FILING_FORMS.has(form) || filedDate < sinceDate) continue;
        detected.push({ ticker: entry.ticker, cik: resolved.cik, form, accn, filedDate });
        break;
      }
    } catch {
      // continue polling remaining tickers
    }
  }

  const res = await runFilingPollerJob({
    filings: detected,
    triggerSource: process.env.CLOUD_RUN_EXECUTION || "cli-poller",
  });

  console.log(
    JSON.stringify(
      {
        runId: res.run.id,
        status: res.run.status,
        detectedFilings: detected.length,
        modelsUpdated: res.run.modelsUpdated,
        tokenCostUsd: res.run.tokenCostUsd,
        errors: res.errors,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
