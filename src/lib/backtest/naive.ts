import type { FinancialPeriod } from "../fundamentals/types";
import type { ForecastPoint } from "./types";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Phase 5 Naive Seasonal Baseline:
 * Forecasts target quarter Q_t as same quarter last year (Q_{t-4}) * trailing 4-quarter YoY growth.
 */
export function forecastNaiveSeasonal(
  visibleQuarters: FinancialPeriod[],
  targetFiscalYear: number,
  targetFiscalQuarter: 1 | 2 | 3 | 4
): ForecastPoint {
  const sorted = [...visibleQuarters].sort((a, b) => a.end.localeCompare(b.end));
  const sameQPriorYear = sorted.find(
    (q) => q.fiscalYear === targetFiscalYear - 1 && q.fiscalQuarter === targetFiscalQuarter
  );

  // Compute trailing YoY growth from available pairs in the last 4 visible quarters
  const revGrowths: number[] = [];
  const epsGrowths: number[] = [];
  for (const q of sorted.slice(-4)) {
    const py = sorted.find((p) => p.fiscalYear === q.fiscalYear - 1 && p.fiscalQuarter === q.fiscalQuarter);
    if (!py) continue;
    const r0 = py.values.revenue;
    const r1 = q.values.revenue;
    if (typeof r0 === "number" && r0 > 0 && typeof r1 === "number") {
      revGrowths.push(clamp((r1 - r0) / r0, -0.4, 0.6));
    }
    const e0 = py.values.epsDiluted;
    const e1 = q.values.epsDiluted;
    if (typeof e0 === "number" && Math.abs(e0) > 0.05 && typeof e1 === "number") {
      epsGrowths.push(clamp((e1 - e0) / Math.abs(e0), -0.5, 0.8));
    }
  }

  const avgRevG = revGrowths.length > 0 ? revGrowths.reduce((a, b) => a + b, 0) / revGrowths.length : 0.05;
  const avgEpsG = epsGrowths.length > 0 ? epsGrowths.reduce((a, b) => a + b, 0) / epsGrowths.length : avgRevG;

  const latest = sorted[sorted.length - 1];
  const baseRev = sameQPriorYear?.values.revenue ?? latest?.values.revenue ?? 0;
  const baseEps = sameQPriorYear?.values.epsDiluted ?? latest?.values.epsDiluted ?? 0;

  return {
    revenue: baseRev * (1 + avgRevG),
    epsDiluted: baseEps + Math.abs(baseEps) * avgEpsG,
  };
}
