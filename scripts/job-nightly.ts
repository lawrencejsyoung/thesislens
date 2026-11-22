/**
 * Cloud Run Job entrypoint: Nightly SEC facts refresh & baseline model rebuild.
 * Usage: npx tsx scripts/job-nightly.ts [TICKER1,TICKER2,...]
 */
import { runNightlyRefreshJob } from "../src/lib/jobs";

async function main() {
  const arg = process.argv[2];
  const tickers = arg ? arg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined;
  const res = await runNightlyRefreshJob({ tickers, triggerSource: process.env.CLOUD_RUN_EXECUTION || "cli" });
  console.log(
    JSON.stringify(
      {
        runId: res.run.id,
        status: res.run.status,
        companiesProcessed: res.run.companiesProcessed,
        modelsUpdated: res.run.modelsUpdated,
        errorCount: res.errors.length,
      },
      null,
      2
    )
  );
  if (res.run.status === "failed") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
