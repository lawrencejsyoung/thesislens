import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SecCompanyFacts, SecSubmissions, SecTickerMap } from "./sec-types";

/**
 * Minimal SEC EDGAR client.
 *
 * - SEC fair-access policy: at most 10 requests/second and a User-Agent that identifies the
 *   requester. Set SEC_USER_AGENT to "<App name> <contact email>" in any real deployment.
 * - Responses are cached on disk (SEC_CACHE_DIR, default .cache/sec) and in memory, so a
 *   universe refresh re-downloads each company at most once per TTL.
 * - If SEC is unreachable, a stale cached copy is served rather than failing.
 */

const DEFAULT_USER_AGENT = "ThesisLens/0.1 research tool (set SEC_USER_AGENT)";
const MIN_INTERVAL_MS = 125; // 8 req/s, under the SEC's 10 req/s ceiling
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;

export const SEC_TTL = {
  tickers: 24 * 3600_000,
  companyFacts: 6 * 3600_000,
  submissions: 6 * 3600_000,
} as const;

export class SecRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "SecRequestError";
  }
}

function userAgent(): string {
  return process.env.SEC_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function cacheDir(): string {
  return process.env.SEC_CACHE_DIR?.trim() || path.join(process.cwd(), ".cache", "sec");
}

// ── Global request pacing (shared by every caller in this process) ──────────
let nextSlot = 0;
async function acquireSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

const memoryCache = new Map<string, { at: number; data: unknown }>();
const MEMORY_CACHE_MAX = 64;
const inFlight = new Map<string, Promise<unknown>>();

function cacheFile(key: string): string {
  return path.join(cacheDir(), key.replace(/[^A-Za-z0-9._-]/g, "_"));
}

async function readDiskCache(key: string): Promise<{ at: number; data: unknown } | null> {
  try {
    const file = cacheFile(key);
    const [info, text] = await Promise.all([stat(file), readFile(file, "utf8")]);
    return { at: info.mtimeMs, data: JSON.parse(text) };
  } catch {
    return null;
  }
}

async function writeDiskCache(key: string, data: unknown): Promise<void> {
  try {
    const file = cacheFile(key);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, file);
  } catch {
    // Read-only filesystem or similar: memory cache still works.
  }
}

function remember(key: string, data: unknown) {
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { at: Date.now(), data });
}

async function fetchJsonOnce(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await acquireSlot();
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": userAgent(), Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return await res.json();
      if (res.status === 404) throw new SecRequestError(`SEC returned 404 for ${url}`, 404);
      lastError = new SecRequestError(`SEC returned HTTP ${res.status} for ${url}`, res.status);
      if (res.status !== 429 && res.status < 500) throw lastError;
    } catch (err) {
      if (err instanceof SecRequestError && err.status && err.status !== 429 && err.status < 500) {
        throw err;
      }
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new SecRequestError(`SEC request failed: ${url}`);
}

/** Fetch JSON through memory cache → disk cache → network, falling back to stale cache. */
export async function secGetJson<T>(url: string, cacheKey: string, ttlMs: number): Promise<T> {
  const mem = memoryCache.get(cacheKey);
  if (mem && Date.now() - mem.at < ttlMs) return mem.data as T;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending as Promise<T>;

  const task = (async () => {
    const disk = await readDiskCache(cacheKey);
    if (disk && Date.now() - disk.at < ttlMs) {
      remember(cacheKey, disk.data);
      return disk.data;
    }
    try {
      const data = await fetchJsonOnce(url);
      remember(cacheKey, data);
      await writeDiskCache(cacheKey, data);
      return data;
    } catch (err) {
      if (disk && !(err instanceof SecRequestError && err.status === 404)) {
        remember(cacheKey, disk.data);
        return disk.data;
      }
      throw err;
    }
  })();

  inFlight.set(cacheKey, task);
  try {
    return (await task) as T;
  } finally {
    inFlight.delete(cacheKey);
  }
}

export function padCik(cik: number | string): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

/** SEC lists share classes with a dash (BRK-B); users often type a dot (BRK.B). */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

export async function fetchTickerMap(): Promise<Map<string, { cik: number; title: string }>> {
  const raw = await secGetJson<SecTickerMap>(
    "https://www.sec.gov/files/company_tickers.json",
    "company_tickers.json",
    SEC_TTL.tickers
  );
  const map = new Map<string, { cik: number; title: string }>();
  for (const row of Object.values(raw)) {
    const key = normalizeTicker(row.ticker);
    if (!map.has(key)) map.set(key, { cik: row.cik_str, title: row.title });
  }
  return map;
}

export async function resolveCik(ticker: string): Promise<{ cik: number; title: string } | null> {
  const map = await fetchTickerMap();
  return map.get(normalizeTicker(ticker)) ?? null;
}

export function fetchCompanyFacts(cik: number | string): Promise<SecCompanyFacts> {
  const padded = padCik(cik);
  return secGetJson<SecCompanyFacts>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`,
    `companyfacts_${padded}.json`,
    SEC_TTL.companyFacts
  );
}

export function fetchSubmissions(cik: number | string): Promise<SecSubmissions> {
  const padded = padCik(cik);
  return secGetJson<SecSubmissions>(
    `https://data.sec.gov/submissions/CIK${padded}.json`,
    `submissions_${padded}.json`,
    SEC_TTL.submissions
  );
}
