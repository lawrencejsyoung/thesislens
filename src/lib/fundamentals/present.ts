import { z } from "zod";
import { LINE_ITEM_LABELS, type LineItemId } from "./line-items";
import type { CompanyFundamentals, FinancialPeriod } from "./types";

/** Shared request schema for the API route and MCP tool. */
export const fundamentalsRequestSchema = {
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9.\-]+$/, "Ticker may contain letters, digits, '.' and '-' only.")
    .describe("Exchange ticker of an SEC-reporting company, e.g. AAPL, BRK.B, TSM."),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "asOf must be YYYY-MM-DD.")
    .optional()
    .describe("Point-in-time cutoff: only use filings made on or before this date (for backtests)."),
  annualPeriods: z.number().int().min(1).max(15).optional().describe("Fiscal years to return (default 5)."),
  quarterlyPeriods: z.number().int().min(0).max(40).optional().describe("Quarters to return (default 8)."),
  includeSources: z
    .boolean()
    .optional()
    .describe("Include the XBRL tag, filing accession and filing date behind every value."),
};

export type FundamentalsRequest = z.infer<z.ZodObject<typeof fundamentalsRequestSchema>>;

function slimPeriod(p: FinancialPeriod, includeSources: boolean): FinancialPeriod | Omit<FinancialPeriod, "sources"> {
  if (includeSources) return p;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sources, ...rest } = p;
  return rest;
}

export function presentFundamentals(f: CompanyFundamentals, req: Omit<FundamentalsRequest, "ticker">) {
  const nA = req.annualPeriods ?? 5;
  const nQ = req.quarterlyPeriods ?? 8;
  const inc = req.includeSources ?? false;
  return {
    profile: f.profile,
    currency: f.history.currency,
    taxonomy: f.history.taxonomy,
    asOf: f.history.asOf,
    lastFiled: f.history.lastFiled,
    coverageScore: f.coverageScore,
    latestSharesOutstanding: f.history.latestSharesOutstanding,
    annual: f.history.annual.slice(-nA).map((p) => slimPeriod(p, inc)),
    quarterly: nQ === 0 ? [] : f.history.quarterly.slice(-nQ).map((p) => slimPeriod(p, inc)),
    checks: f.checks.filter((c) => c.status !== "pass" && c.status !== "skip"),
    lineItemLabels: LINE_ITEM_LABELS,
    source: "SEC EDGAR XBRL companyfacts (data.sec.gov)",
  };
}

const fmtBillions = (v: number | undefined) => (v === undefined ? "n/a" : `${(v / 1e9).toFixed(2)}B`);

export function summarizeFundamentals(f: CompanyFundamentals): string {
  const latest = f.history.annual[f.history.annual.length - 1];
  const cur = f.history.currency;
  if (!latest) return `${f.profile.ticker}: no annual history in SEC data.`;
  const v = latest.values;
  const items: [string, LineItemId][] = [
    ["revenue", "revenue"],
    ["net income", "netIncome"],
    ["FCF", "freeCashFlow"],
    ["net debt", "netDebt"],
  ];
  const parts = items.map(([label, id]) => `${label} ${cur} ${fmtBillions(v[id])}`);
  const eps = v.epsDiluted !== undefined ? `, diluted EPS ${v.epsDiluted.toFixed(2)}` : "";
  const issues = f.checks.filter((c) => c.status === "fail").length;
  return `${f.profile.name} (${f.profile.ticker}, ${f.profile.templateId} template) ${latest.id} ending ${latest.end}: ${parts.join(", ")}${eps}. ${f.history.annual.length}Y/${f.history.quarterly.length}Q history, coverage ${f.coverageScore}%, ${issues} failed data checks.`;
}
