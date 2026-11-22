import crypto from "node:crypto";
import { runAnalystOnFundamentals } from "../analyst";
import { getCompanyFundamentals } from "../fundamentals";
import type { CompanyFundamentals } from "../fundamentals/types";
import type { AnalystModel, RatesProvider } from "../providers/types";
import { getValuationStore, type StoredJobRun, type StoredModelVersion, type ValuationStore } from "../storage";
import { extractStoredFacts } from "./nightly-refresh";

export const MATERIAL_FILING_FORMS = new Set(["10-K", "10-Q", "20-F", "6-K", "8-K"]);

export interface DetectedFiling {
  ticker: string;
  cik: number;
  form: string;
  accn: string;
  filedDate: string;
  /** Optional summary text / exhibit 99.1 excerpt attached to the filing. */
  summaryText?: string;
}

export interface FilingPollerOptions {
  filings: DetectedFiling[];
  store?: ValuationStore;
  analystModel?: AnalystModel;
  ratesProvider?: RatesProvider;
  loadFundamentals?: (ticker: string, asOf?: string) => Promise<CompanyFundamentals>;
  triggerSource?: string;
}

export interface FilingPollerSummary {
  run: StoredJobRun;
  createdVersions: StoredModelVersion[];
  skippedAccns: string[];
  errors: { ticker: string; accn: string; message: string }[];
}

/**
 * Phase 4 Filing Poller Job:
 * Watches incoming SEC filings (10-K, 10-Q, 20-F, earnings 8-K). For each new unseen accession
 * number, reloads fundamentals, runs the Phase 3 analyst with a "what changed since last model"
 * prompt referencing the prior model_version, and stores the new version + citations.
 */
export async function runFilingPollerJob(opts: FilingPollerOptions): Promise<FilingPollerSummary> {
  const store = opts.store ?? getValuationStore();
  const load =
    opts.loadFundamentals ??
    ((t: string, asOf?: string) =>
      getCompanyFundamentals(t, { asOf, maxAnnualPeriods: 10, maxQuarterlyPeriods: 12 }));

  const run: StoredJobRun = {
    id: `run_poller_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    jobType: "filing_poller",
    triggerSource: opts.triggerSource ?? "edgar-poller",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    companiesProcessed: 0,
    modelsUpdated: 0,
    inputTokens: 0,
    outputTokens: 0,
    tokenCostUsd: 0,
    errorMessage: null,
    metadata: { candidateFilings: opts.filings.length },
  };
  await store.recordRun(run);

  const createdVersions: StoredModelVersion[] = [];
  const skippedAccns: string[] = [];
  const errors: { ticker: string; accn: string; message: string }[] = [];

  for (const filing of opts.filings) {
    if (!MATERIAL_FILING_FORMS.has(filing.form.toUpperCase())) {
      skippedAccns.push(filing.accn);
      continue;
    }

    try {
      const prior = await store.getLatestModelVersion(filing.ticker);
      if (prior?.triggerAccn === filing.accn) {
        skippedAccns.push(filing.accn);
        continue;
      }

      const f = await load(filing.ticker, filing.filedDate);
      await store.upsertFacts(extractStoredFacts(f));

      const extraPassages = filing.summaryText
        ? [
            {
              id: `FILING-${filing.form}-${filing.filedDate}`,
              section: (filing.form === "8-K" ? "guidance" : "mda") as "guidance" | "mda",
              title: `${filing.ticker} ${filing.form} (${filing.filedDate})`,
              filed: filing.filedDate,
              form: filing.form,
              accn: filing.accn,
              text: filing.summaryText,
            },
          ]
        : [];

      const analystRes = await runAnalystOnFundamentals(f, {
        asOf: filing.filedDate,
        analystModel: opts.analystModel,
        ratesProvider: opts.ratesProvider,
        extraPassages,
        priorAssumptions: prior?.notes ?? [],
        isFilingDeltaRun: Boolean(prior),
      });

      const saved = await store.saveModelVersion({
        companyTicker: filing.ticker,
        asOf: filing.filedDate,
        modelType: "analyst",
        triggerType: "filing",
        triggerAccn: filing.accn,
        thesisSummary: analystRes.thesisSummary,
        citations: analystRes.citations,
        output: analystRes.model,
        parentVersionId: prior?.id ?? null,
      });

      createdVersions.push(saved);
      run.companiesProcessed++;
      run.modelsUpdated++;
      run.inputTokens += analystRes.usage.inputTokens;
      run.outputTokens += analystRes.usage.outputTokens;
      run.tokenCostUsd = Number((run.tokenCostUsd + analystRes.usage.estimatedCostUsd).toFixed(6));
    } catch (err) {
      errors.push({
        ticker: filing.ticker,
        accn: filing.accn,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  run.finishedAt = new Date().toISOString();
  run.status = errors.length > 0 && createdVersions.length === 0 ? "failed" : "completed";
  run.errorMessage = errors.length > 0 ? `${errors.length} filing(s) failed.` : null;
  await store.recordRun(run);

  return { run, createdVersions, skippedAccns, errors };
}
