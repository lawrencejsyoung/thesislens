import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MARKET_DEFAULTS } from "../model/baseline";
import type { RatesProvider, RatesSnapshot } from "./types";

/**
 * Damodaran annual implied equity risk premium (US S&P 500 start-of-year estimates).
 * Used as the free ERP benchmark (Decision D1) with point-in-time year lookup.
 */
export const DAMODARAN_IMPLIED_ERP_BY_YEAR: Record<number, number> = {
  2015: 0.0578,
  2016: 0.0612,
  2017: 0.0569,
  2018: 0.0508,
  2019: 0.0596,
  2020: 0.052,
  2021: 0.0472,
  2022: 0.0424,
  2023: 0.0594,
  2024: 0.046,
  2025: 0.0433,
  2026: 0.0435,
};

/**
 * Built-in quarterly fallback table for US 10Y Treasury (DGS10) so point-in-time backtests
 * and offline CI runs still get realistic historical risk-free rates without network calls.
 */
const DGS10_OFFLINE_FALLBACK: { date: string; rate: number }[] = [
  { date: "2020-03-31", rate: 0.007 },
  { date: "2020-06-30", rate: 0.0066 },
  { date: "2020-09-30", rate: 0.0069 },
  { date: "2020-12-31", rate: 0.0093 },
  { date: "2021-03-31", rate: 0.0174 },
  { date: "2021-06-30", rate: 0.0145 },
  { date: "2021-09-30", rate: 0.0152 },
  { date: "2021-12-31", rate: 0.0152 },
  { date: "2022-03-31", rate: 0.0232 },
  { date: "2022-06-30", rate: 0.0298 },
  { date: "2022-09-30", rate: 0.0383 },
  { date: "2022-12-31", rate: 0.0388 },
  { date: "2023-03-31", rate: 0.0348 },
  { date: "2023-06-30", rate: 0.0381 },
  { date: "2023-09-30", rate: 0.0459 },
  { date: "2023-12-31", rate: 0.0388 },
  { date: "2024-03-31", rate: 0.042 },
  { date: "2024-06-30", rate: 0.0436 },
  { date: "2024-09-30", rate: 0.0381 },
  { date: "2024-12-31", rate: 0.0458 },
  { date: "2025-03-31", rate: 0.0423 },
  { date: "2025-06-30", rate: 0.0425 },
  { date: "2025-09-30", rate: 0.0415 },
  { date: "2025-12-31", rate: 0.0428 },
  { date: "2026-03-31", rate: 0.0422 },
  { date: "2026-06-30", rate: 0.0425 },
  { date: "2026-09-30", rate: 0.042 },
  { date: "2026-11-22", rate: 0.0425 },
];

export interface FredObservation {
  date: string;
  rate: number;
}

export function parseFredDgs10Csv(csv: string): FredObservation[] {
  const out: FredObservation[] = [];
  for (const rawLine of csv.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("DATE") || line.startsWith("observation_date")) continue;
    const [date, val] = line.split(",");
    if (!date || !val || val === ".") continue;
    const pct = Number(val);
    if (!Number.isFinite(pct) || pct < 0 || pct > 25) continue;
    out.push({ date: date.trim(), rate: pct / 100 });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function lookupRateAsOf(series: FredObservation[], asOf: string): FredObservation | null {
  let best: FredObservation | null = null;
  for (const obs of series) {
    if (obs.date <= asOf) best = obs;
    else break;
  }
  return best;
}

export function damodaranErpForDate(asOf: string): { erp: number; year: number } {
  const year = Number(asOf.slice(0, 4));
  if (Number.isFinite(year) && DAMODARAN_IMPLIED_ERP_BY_YEAR[year] !== undefined) {
    return { erp: DAMODARAN_IMPLIED_ERP_BY_YEAR[year], year };
  }
  const years = Object.keys(DAMODARAN_IMPLIED_ERP_BY_YEAR).map(Number).sort((a, b) => a - b);
  const clamped = year < years[0] ? years[0] : years[years.length - 1];
  return { erp: DAMODARAN_IMPLIED_ERP_BY_YEAR[clamped] ?? MARKET_DEFAULTS.equityRiskPremium, year: clamped };
}

export class FredDamodaranRatesProvider implements RatesProvider {
  readonly id = "fred-damodaran";
  private memorySeries: FredObservation[] | null = null;
  private fetchedAt = 0;
  private readonly allowNetwork: boolean;
  private readonly cacheFile: string;

  constructor(opts: { allowNetwork?: boolean; cacheDir?: string } = {}) {
    this.allowNetwork = opts.allowNetwork ?? process.env.NODE_ENV !== "test";
    const dir = opts.cacheDir ?? process.env.SEC_CACHE_DIR ?? path.join(process.cwd(), ".cache", "rates");
    this.cacheFile = path.join(dir, "fred-dgs10.csv");
  }

  private async loadSeries(): Promise<{ series: FredObservation[]; source: string }> {
    const ttlMs = 12 * 60 * 60 * 1000;
    if (this.memorySeries && Date.now() - this.fetchedAt < ttlMs) {
      return { series: this.memorySeries, source: "FRED DGS10 (10Y Treasury)" };
    }

    if (this.allowNetwork) {
      try {
        const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10", {
          signal: AbortSignal.timeout(5_000),
          headers: { "User-Agent": process.env.SEC_USER_AGENT || "ThesisLens" },
        });
        if (res.ok) {
          const csv = await res.text();
          const parsed = parseFredDgs10Csv(csv);
          if (parsed.length > 0) {
            this.memorySeries = parsed;
            this.fetchedAt = Date.now();
            try {
              mkdirSync(path.dirname(this.cacheFile), { recursive: true });
              writeFileSync(this.cacheFile, csv, "utf8");
            } catch {
              // ignore read-only fs
            }
            return { series: parsed, source: "FRED DGS10 (10Y Treasury, live)" };
          }
        }
      } catch {
        // fall through to disk cache or offline table
      }
    }

    if (existsSync(this.cacheFile)) {
      try {
        const parsed = parseFredDgs10Csv(readFileSync(this.cacheFile, "utf8"));
        if (parsed.length > 0) {
          this.memorySeries = parsed;
          this.fetchedAt = Date.now();
          return { series: parsed, source: "FRED DGS10 (10Y Treasury, cached)" };
        }
      } catch {
        // fall through
      }
    }

    return { series: DGS10_OFFLINE_FALLBACK, source: "FRED DGS10 (offline historical table)" };
  }

  async getRates(asOf?: string | null): Promise<RatesSnapshot> {
    const targetDate = asOf ?? new Date().toISOString().slice(0, 10);
    const { series, source } = await this.loadSeries();
    const obs = lookupRateAsOf(series, targetDate);
    const { erp, year } = damodaranErpForDate(targetDate);

    return {
      riskFreeRate: obs ? obs.rate : MARKET_DEFAULTS.riskFreeRate,
      equityRiskPremium: erp,
      asOf: obs ? obs.date : targetDate,
      riskFreeSource: obs ? `${source} as of ${obs.date}` : "Default 10Y Treasury fallback",
      erpSource: `Damodaran implied US ERP (${year})`,
    };
  }
}

export class StaticRatesProvider implements RatesProvider {
  readonly id = "static";
  constructor(private readonly snapshot: RatesSnapshot) {}
  async getRates(): Promise<RatesSnapshot> {
    return this.snapshot;
  }
}
