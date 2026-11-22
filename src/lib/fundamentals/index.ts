import { coverageScore, runQualityChecks } from "./checks";
import {
  fetchCompanyFacts,
  fetchSubmissions,
  normalizeTicker,
  resolveCik,
  SecRequestError,
} from "./sec-client";
import type { SecCompanyFacts } from "./sec-types";
import { normalizeCompanyFacts, type NormalizeOptions } from "./normalize";
import { templateForCompany } from "./sector";
import { findUniverseEntry } from "./universe";
import type { CompanyFundamentals } from "./types";

export * from "./types";
export { LINE_ITEM_LABELS, type LineItemId } from "./line-items";
export { TEMPLATE_LABELS, type TemplateId } from "./sector";
export { UNIVERSE } from "./universe";

export class UnknownTickerError extends Error {
  constructor(ticker: string) {
    super(`Ticker ${ticker} is not an SEC registrant (no CIK found).`);
    this.name = "UnknownTickerError";
  }
}

/**
 * Merge predecessor registrant facts into the successor's. Values are concatenated per
 * tag/unit; the normalizer keeps the latest-filed value per period, so successor restatements win.
 */
export function mergeCompanyFacts(primary: SecCompanyFacts, others: SecCompanyFacts[]): SecCompanyFacts {
  if (others.length === 0) return primary;
  const merged: SecCompanyFacts = { ...primary, facts: {} };
  for (const source of [primary, ...others]) {
    for (const [ns, concepts] of Object.entries(source.facts ?? {})) {
      const nsOut = (merged.facts[ns] ??= {});
      for (const [name, concept] of Object.entries(concepts)) {
        const out = (nsOut[name] ??= { label: concept.label, description: concept.description, units: {} });
        for (const [unit, facts] of Object.entries(concept.units)) {
          out.units[unit] = [...(out.units[unit] ?? []), ...facts];
        }
      }
    }
  }
  return merged;
}

export interface FundamentalsOptions extends NormalizeOptions {
  today?: string;
}

export async function getCompanyFundamentals(
  rawTicker: string,
  opts: FundamentalsOptions = {}
): Promise<CompanyFundamentals> {
  const ticker = normalizeTicker(rawTicker);
  const resolved = await resolveCik(ticker);
  if (!resolved) throw new UnknownTickerError(ticker);
  const entry = findUniverseEntry(ticker);

  const [facts, submissions, ...predecessors] = await Promise.all([
    fetchCompanyFacts(resolved.cik),
    fetchSubmissions(resolved.cik).catch((err) => {
      if (err instanceof SecRequestError) return null;
      throw err;
    }),
    ...(entry?.predecessorCiks ?? []).map((cik) => fetchCompanyFacts(cik)),
  ]);

  const history = normalizeCompanyFacts(mergeCompanyFacts(facts, predecessors), opts);
  const templateId = entry?.template ?? templateForCompany(ticker, submissions?.sic);

  return {
    profile: {
      ticker,
      cik: resolved.cik,
      name: submissions?.name ?? facts.entityName ?? resolved.title,
      sic: submissions?.sic || null,
      sicDescription: submissions?.sicDescription || null,
      exchanges: [...new Set((submissions?.exchanges ?? []).filter(Boolean))],
      fiscalYearEnd: submissions?.fiscalYearEnd ?? null,
      templateId,
    },
    history,
    checks: runQualityChecks(history, templateId, opts.today),
    coverageScore: coverageScore(history, templateId),
  };
}
