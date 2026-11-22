import type { LineItemId } from "./line-items";
import type { FinancialHistory, FinancialPeriod, QualityCheck } from "./types";

/**
 * Data-quality checks on a normalized history. These gate what the model engine is allowed to
 * trust: a model built on a balance sheet that doesn't balance is wrong before it starts.
 */

const BALANCE_TOLERANCE = 0.01; // 1% of total assets
const SUM_TOLERANCE = 0.005; // 0.5%
const STALE_DAYS = 200;

/** Line items every template needs; banks and insurers use a different revenue concept. */
export const CORE_ITEMS: LineItemId[] = [
  "revenue",
  "netIncome",
  "epsDiluted",
  "dilutedShares",
  "totalAssets",
  "equity",
  "cash",
  "operatingCashFlow",
];
export const OPERATING_COMPANY_ITEMS: LineItemId[] = ["operatingIncome", "capex", "totalDebt"];
const FINANCIALS_TEMPLATES = new Set(["bank", "insurance", "capital-markets"]);

function pct(a: number, b: number): number {
  return b === 0 ? (a === 0 ? 0 : Infinity) : Math.abs(a - b) / Math.abs(b);
}

function balanceCheck(p: FinancialPeriod): QualityCheck {
  const v = p.values;
  const id = "balance-sheet-identity";
  if (v.totalAssets === undefined) {
    return { id, status: "skip", message: "Total assets not reported.", periodId: p.id };
  }
  // If liabilities were computed from the identity itself, the check is circular.
  const liabComputed = p.sources.totalLiabilities?.method === "computed";
  if (v.liabilitiesAndEquity !== undefined && (liabComputed || v.totalLiabilities === undefined)) {
    const diff = pct(v.liabilitiesAndEquity, v.totalAssets);
    return {
      id,
      status: diff <= BALANCE_TOLERANCE ? "pass" : "fail",
      message: `Assets vs liabilities+equity differ by ${(diff * 100).toFixed(2)}%.`,
      periodId: p.id,
    };
  }
  if (v.totalLiabilities === undefined || v.equityInclNci === undefined) {
    return { id, status: "skip", message: "Liabilities or equity missing.", periodId: p.id };
  }
  const diff = pct(v.totalLiabilities + v.equityInclNci + (v.mezzanineEquity ?? 0), v.totalAssets);
  return {
    id,
    status: diff <= BALANCE_TOLERANCE ? "pass" : diff <= 0.05 ? "warn" : "fail",
    message: `Assets vs liabilities+equity differ by ${(diff * 100).toFixed(2)}% (after mezzanine equity).`,
    periodId: p.id,
  };
}

function quartersSumCheck(history: FinancialHistory, item: LineItemId): QualityCheck[] {
  const out: QualityCheck[] = [];
  for (const fy of history.annual) {
    const qs = history.quarterly.filter((q) => q.fiscalYear === fy.fiscalYear);
    if (qs.length !== 4 || fy.values[item] === undefined) continue;
    // Only meaningful when every quarter was reported, not derived from the FY total.
    if (qs.some((q) => q.values[item] === undefined || q.sources[item]?.method !== "reported")) continue;
    const sum = qs.reduce((a, q) => a + (q.values[item] as number), 0);
    const diff = pct(sum, fy.values[item] as number);
    out.push({
      id: `quarters-sum-${item}`,
      status: diff <= SUM_TOLERANCE ? "pass" : "warn",
      message: `Reported quarters sum to within ${(diff * 100).toFixed(2)}% of FY ${item}.`,
      periodId: fy.id,
    });
  }
  return out;
}

function grossProfitCheck(p: FinancialPeriod): QualityCheck | null {
  const v = p.values;
  if (
    v.revenue === undefined ||
    v.costOfRevenue === undefined ||
    v.grossProfit === undefined ||
    p.sources.grossProfit?.method === "computed"
  ) {
    return null;
  }
  const diff = pct(v.revenue - v.costOfRevenue, v.grossProfit);
  return {
    id: "gross-profit-tie",
    status: diff <= SUM_TOLERANCE ? "pass" : "warn",
    message: `Revenue − cost of revenue vs reported gross profit differ by ${(diff * 100).toFixed(2)}%.`,
    periodId: p.id,
  };
}

function negativeDerivedCheck(history: FinancialHistory): QualityCheck[] {
  // A derived quarter with negative revenue means the YTD inputs don't line up.
  return history.quarterly
    .filter((q) => q.sources.revenue?.method === "derived" && (q.values.revenue ?? 0) < 0)
    .map((q) => ({
      id: "derived-quarter-sanity",
      status: "fail" as const,
      message: "Derived quarterly revenue is negative; YTD facts are inconsistent.",
      periodId: q.id,
    }));
}

export function coreItemsFor(templateId: string): LineItemId[] {
  if (templateId === "bank") {
    return [...CORE_ITEMS.filter((i) => i !== "revenue"), "netInterestIncome", "deposits"];
  }
  if (FINANCIALS_TEMPLATES.has(templateId)) return CORE_ITEMS;
  return [...CORE_ITEMS, ...OPERATING_COMPANY_ITEMS];
}

export function coverageScore(history: FinancialHistory, templateId: string): number {
  const latest = history.annual[history.annual.length - 1];
  if (!latest) return 0;
  const items = coreItemsFor(templateId);
  const present = items.filter((i) => latest.values[i] !== undefined).length;
  return Math.round((present / items.length) * 100);
}

export function runQualityChecks(
  history: FinancialHistory,
  templateId: string,
  today: string = new Date().toISOString().slice(0, 10)
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const latest = history.annual[history.annual.length - 1];

  if (!latest) {
    checks.push({ id: "has-annual-history", status: "fail", message: "No annual periods found in SEC data." });
    return checks;
  }

  const missing = coreItemsFor(templateId).filter((i) => latest.values[i] === undefined);
  checks.push({
    id: "core-coverage",
    status: missing.length === 0 ? "pass" : missing.length <= 2 ? "warn" : "fail",
    message: missing.length === 0 ? "All core line items present." : `Missing: ${missing.join(", ")}.`,
    periodId: latest.id,
  });

  for (const p of [...history.annual.slice(-5), ...history.quarterly.slice(-8)]) {
    checks.push(balanceCheck(p));
    const gp = grossProfitCheck(p);
    if (gp) checks.push(gp);
  }
  for (const item of ["revenue", "netIncome"] as LineItemId[]) {
    checks.push(...quartersSumCheck(history, item));
  }
  checks.push(...negativeDerivedCheck(history));

  const lastEnd = [...history.annual, ...history.quarterly].map((p) => p.end).sort().pop();
  const ageDays = lastEnd ? (Date.parse(today) - Date.parse(lastEnd)) / 86_400_000 : Infinity;
  checks.push({
    id: "freshness",
    status: ageDays <= STALE_DAYS ? "pass" : "warn",
    message: `Latest period ends ${lastEnd} (${Math.round(ageDays)} days ago).`,
  });

  const quarterlyAvailable = history.quarterly.length > 0;
  checks.push({
    id: "quarterly-history",
    status: quarterlyAvailable ? "pass" : "warn",
    message: quarterlyAvailable
      ? `${history.quarterly.length} quarterly periods.`
      : "No quarterly data (typical for 20-F filers, which report semi-annually or annually).",
  });

  return checks;
}
