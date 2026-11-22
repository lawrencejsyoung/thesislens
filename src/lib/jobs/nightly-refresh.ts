import crypto from "node:crypto";
import { getCompanyFundamentals } from "../fundamentals";
import { UNIVERSE } from "../fundamentals/universe";
import type { CompanyFundamentals } from "../fundamentals/types";
import { buildModelFromFundamentals } from "../model";
import { getValuationStore, type StoredFact, type StoredJobRun, type ValuationStore } from "../storage";

export interface NightlyRefreshOptions {
  tickers?: string[];
  store?: ValuationStore;
  /** Optional custom fundamentals loader (used by offline tests). */
  loadFundamentals?: (ticker: string) => Promise<CompanyFundamentals>;
  triggerSource?: string;
}

export interface NightlyRefreshSummary {
  run: StoredJobRun;
  updatedTickers: string[];
  skippedTickers: string[];
  errors: { ticker: string; message: string }[];
}

export function extractStoredFacts(f: CompanyFundamentals): StoredFact[] {
  const out: StoredFact[] = [];
  for (const period of [...f.history.annual, ...f.history.quarterly]) {
    for (const [lineItem, value] of Object.entries(period.values)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const src = period.sources[lineItem as keyof typeof period.sources];
      out.push({
        companyTicker: f.profile.ticker.toUpperCase(),
        periodId: period.id,
        fiscalYear: period.fiscalYear,
        fiscalQuarter: period.fiscalQuarter,
        periodStart: period.start,
        periodEnd: period.end,
        lineItem,
        value,
        tags: src?.tags ?? [],
        method: src?.method ?? "reported",
        accn: src?.accn,
        form: src?.form,
        filedDate: src?.filed ?? period.end,
        currency: f.history.currency,
      });
    }
  }
  return out;
}

/**
 * Phase 4 Nightly Refresh Job:
 * Refreshes SEC facts for the covered universe, upserts companies & facts into Postgres/store,
 * rebuilds baseline models, and persists a new model_version whenever the underlying period or value shifts.
 */
export async function runNightlyRefreshJob(opts: NightlyRefreshOptions = {}): Promise<NightlyRefreshSummary> {
  const store = opts.store ?? getValuationStore();
  const tickers = opts.tickers ?? UNIVERSE.map((u) => u.ticker);
  const load =
    opts.loadFundamentals ??
    ((t: string) => getCompanyFundamentals(t, { maxAnnualPeriods: 10, maxQuarterlyPeriods: 12 }));

  const run: StoredJobRun = {
    id: `run_nightly_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    jobType: "nightly_refresh",
    triggerSource: opts.triggerSource ?? "cloud-run-job",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    companiesProcessed: 0,
    modelsUpdated: 0,
    inputTokens: 0,
    outputTokens: 0,
    tokenCostUsd: 0,
    errorMessage: null,
    metadata: { universeSize: tickers.length },
  };
  await store.recordRun(run);

  const updatedTickers: string[] = [];
  const skippedTickers: string[] = [];
  const errors: { ticker: string; message: string }[] = [];

  for (const ticker of tickers) {
    try {
      const f = await load(ticker);
      await store.upsertCompany({
        ticker: f.profile.ticker,
        cik: f.profile.cik,
        predecessorCiks: [],
        name: f.profile.name,
        templateId: f.profile.templateId as Parameters<ValuationStore["upsertCompany"]>[0]["templateId"],
        currency: f.history.currency,
        sic: f.profile.sic,
        fiscalYearEnd: f.profile.fiscalYearEnd,
        inUniverse: true,
        marketCapUsd: null,
        adrRatio: 1,
        updatedAt: new Date().toISOString(),
      });
      await store.upsertFacts(extractStoredFacts(f));

      const model = buildModelFromFundamentals(f);
      const latest = await store.getLatestModelVersion(ticker);
      const changed =
        !latest ||
        latest.output.base.periodId !== model.base.periodId ||
        Math.abs(latest.valuePerShare - model.valuation.valuePerShare) / Math.max(0.01, Math.abs(latest.valuePerShare)) > 0.005;

      if (changed) {
        await store.saveModelVersion({
          companyTicker: ticker,
          asOf: model.asOf,
          modelType: "baseline",
          triggerType: "nightly",
          output: model,
        });
        updatedTickers.push(ticker);
        run.modelsUpdated++;
      } else {
        skippedTickers.push(ticker);
      }
      run.companiesProcessed++;
    } catch (err) {
      errors.push({ ticker, message: err instanceof Error ? err.message : String(err) });
    }
  }

  run.finishedAt = new Date().toISOString();
  run.status = errors.length === tickers.length && tickers.length > 0 ? "failed" : "completed";
  run.errorMessage = errors.length > 0 ? `${errors.length} ticker(s) failed.` : null;
  run.metadata = { ...run.metadata, updatedCount: updatedTickers.length, errorCount: errors.length };
  await store.recordRun(run);

  return { run, updatedTickers, skippedTickers, errors };
}
