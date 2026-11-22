import path from "node:path";
import { MemoryValuationStore } from "./memory-store";
import { PostgresValuationStore } from "./postgres-store";
import type { ValuationStore } from "./types";

export * from "./types";
export { MemoryValuationStore } from "./memory-store";
export { PostgresValuationStore } from "./postgres-store";

let singleton: ValuationStore | null = null;

/**
 * Returns the configured ValuationStore:
 * - Cloud SQL Postgres when DATABASE_URL is set (Decision D3).
 * - Local JSON-backed store (.cache/valuation-store.json) otherwise.
 */
export function getValuationStore(): ValuationStore {
  if (singleton) return singleton;
  if (process.env.DATABASE_URL) {
    singleton = new PostgresValuationStore(process.env.DATABASE_URL);
    return singleton;
  }
  const cacheDir = process.env.SEC_CACHE_DIR || path.join(process.cwd(), ".cache");
  singleton = new MemoryValuationStore(path.join(cacheDir, "valuation-store.json"));
  return singleton;
}
