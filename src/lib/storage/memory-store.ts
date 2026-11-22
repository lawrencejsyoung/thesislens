import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { GuidanceItem, KpiPoint } from "../dossier/types";
import type {
  SaveModelVersionInput,
  StoredCompany,
  StoredDocChunk,
  StoredFact,
  StoredJobRun,
  StoredModelVersion,
  ValuationStore,
} from "./types";

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

interface SnapshotData {
  companies: Record<string, StoredCompany>;
  facts: Record<string, StoredFact[]>;
  kpis: Record<string, KpiPoint[]>;
  guidance: Record<string, GuidanceItem[]>;
  docChunks: Record<string, StoredDocChunk[]>;
  modelVersions: StoredModelVersion[];
  runs: StoredJobRun[];
}

/**
 * In-memory (with optional JSON file persistence) ValuationStore.
 * Implements all 7 Phase 4 tables including cosine-similarity vector search on doc_chunks,
 * enabling full local development and offline CI tests without a running Postgres instance.
 */
export class MemoryValuationStore implements ValuationStore {
  readonly backend: "memory" | "file";
  private readonly filePath: string | null;
  private data: SnapshotData = {
    companies: {},
    facts: {},
    kpis: {},
    guidance: {},
    docChunks: {},
    modelVersions: [],
    runs: [],
  };

  constructor(filePath?: string | null) {
    this.filePath = filePath ?? null;
    this.backend = this.filePath ? "file" : "memory";
    if (this.filePath && existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<SnapshotData>;
        this.data = {
          companies: raw.companies ?? {},
          facts: raw.facts ?? {},
          kpis: raw.kpis ?? {},
          guidance: raw.guidance ?? {},
          docChunks: raw.docChunks ?? {},
          modelVersions: raw.modelVersions ?? [],
          runs: raw.runs ?? [],
        };
      } catch {
        // start fresh if corrupt
      }
    }
  }

  private persist() {
    if (!this.filePath) return;
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
    } catch {
      // ignore read-only fs
    }
  }

  async upsertCompany(company: StoredCompany): Promise<void> {
    this.data.companies[company.ticker.toUpperCase()] = { ...company, ticker: company.ticker.toUpperCase() };
    this.persist();
  }

  async getCompany(ticker: string): Promise<StoredCompany | null> {
    return this.data.companies[ticker.toUpperCase()] ?? null;
  }

  async listCompanies(opts?: { inUniverseOnly?: boolean }): Promise<StoredCompany[]> {
    let list = Object.values(this.data.companies);
    if (opts?.inUniverseOnly) list = list.filter((c) => c.inUniverse);
    return list.sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0) || a.ticker.localeCompare(b.ticker));
  }

  async upsertFacts(facts: StoredFact[]): Promise<number> {
    let count = 0;
    for (const f of facts) {
      const key = f.companyTicker.toUpperCase();
      const list = this.data.facts[key] ?? [];
      const idx = list.findIndex(
        (x) => x.periodId === f.periodId && x.lineItem === f.lineItem && x.filedDate === f.filedDate
      );
      if (idx >= 0) list[idx] = f;
      else list.push(f);
      this.data.facts[key] = list;
      count++;
    }
    this.persist();
    return count;
  }

  async getFacts(ticker: string, asOf?: string | null): Promise<StoredFact[]> {
    const list = this.data.facts[ticker.toUpperCase()] ?? [];
    return asOf ? list.filter((f) => f.filedDate <= asOf) : [...list];
  }

  async upsertKpis(ticker: string, kpis: KpiPoint[]): Promise<number> {
    const key = ticker.toUpperCase();
    const list = this.data.kpis[key] ?? [];
    for (const k of kpis) {
      const idx = list.findIndex((x) => x.periodId === k.periodId && x.metric === k.metric && x.filed === k.filed);
      if (idx >= 0) list[idx] = k;
      else list.push(k);
    }
    this.data.kpis[key] = list;
    this.persist();
    return kpis.length;
  }

  async getKpis(ticker: string, asOf?: string | null): Promise<KpiPoint[]> {
    const list = this.data.kpis[ticker.toUpperCase()] ?? [];
    return asOf ? list.filter((k) => k.filed <= asOf) : [...list];
  }

  async upsertGuidance(ticker: string, items: GuidanceItem[]): Promise<number> {
    const key = ticker.toUpperCase();
    const list = this.data.guidance[key] ?? [];
    for (const item of items) {
      const idx = list.findIndex((x) => x.id === item.id);
      if (idx >= 0) list[idx] = item;
      else list.push(item);
    }
    this.data.guidance[key] = list;
    this.persist();
    return items.length;
  }

  async getGuidance(ticker: string, asOf?: string | null): Promise<GuidanceItem[]> {
    const list = this.data.guidance[ticker.toUpperCase()] ?? [];
    return asOf ? list.filter((g) => g.filed <= asOf) : [...list];
  }

  async upsertDocChunks(chunks: StoredDocChunk[]): Promise<number> {
    for (const c of chunks) {
      const key = c.companyTicker.toUpperCase();
      const list = this.data.docChunks[key] ?? [];
      const idx = list.findIndex((x) => x.id === c.id);
      if (idx >= 0) list[idx] = c;
      else list.push(c);
      this.data.docChunks[key] = list;
    }
    this.persist();
    return chunks.length;
  }

  async searchDocChunks(
    ticker: string,
    opts: { asOf?: string | null; section?: string; queryEmbedding?: number[]; limit?: number }
  ): Promise<StoredDocChunk[]> {
    let list = this.data.docChunks[ticker.toUpperCase()] ?? [];
    if (opts.asOf) list = list.filter((c) => c.filedDate <= opts.asOf!);
    if (opts.section) list = list.filter((c) => c.section === opts.section);
    if (opts.queryEmbedding && opts.queryEmbedding.length > 0) {
      list = [...list].sort((a, b) => {
        const sa = a.embedding ? cosineSimilarity(opts.queryEmbedding!, a.embedding) : -1;
        const sb = b.embedding ? cosineSimilarity(opts.queryEmbedding!, b.embedding) : -1;
        return sb - sa;
      });
    } else {
      list = [...list].sort((a, b) => b.filedDate.localeCompare(a.filedDate) || a.chunkIndex - b.chunkIndex);
    }
    return list.slice(0, opts.limit ?? 20);
  }

  async saveModelVersion(input: SaveModelVersionInput): Promise<StoredModelVersion> {
    const ticker = input.companyTicker.toUpperCase();
    const existing = this.data.modelVersions.filter((v) => v.companyTicker === ticker);
    const nextVersion = existing.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;

    const row: StoredModelVersion = {
      id: `mv_${ticker.toLowerCase()}_v${nextVersion}_${crypto.randomBytes(4).toString("hex")}`,
      companyTicker: ticker,
      versionNumber: nextVersion,
      createdAt: new Date().toISOString(),
      asOf: input.asOf,
      modelType: input.modelType,
      triggerType: input.triggerType,
      triggerAccn: input.triggerAccn ?? null,
      templateId: input.output.templateId,
      currency: input.output.currency,
      valuePerShare: input.output.valuation.valuePerShare,
      probabilityWeightedValue: input.output.probabilityWeightedValue,
      currentPrice: input.output.valuation.currentPrice,
      wacc: input.output.valuation.wacc,
      thesisSummary: input.thesisSummary ?? null,
      assumptions: input.output.assumptions,
      notes: input.output.notes,
      citations: input.citations ?? [],
      output: input.output,
      parentVersionId: input.parentVersionId ?? (existing.length > 0 ? existing[existing.length - 1].id : null),
    };

    this.data.modelVersions.push(row);
    this.persist();
    return row;
  }

  async getModelVersion(id: string): Promise<StoredModelVersion | null> {
    return this.data.modelVersions.find((v) => v.id === id) ?? null;
  }

  async getLatestModelVersion(ticker: string): Promise<StoredModelVersion | null> {
    const list = await this.listModelVersions(ticker, 1);
    return list[0] ?? null;
  }

  async listModelVersions(ticker: string, limit = 50): Promise<StoredModelVersion[]> {
    const key = ticker.toUpperCase();
    return this.data.modelVersions
      .filter((v) => v.companyTicker === key)
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .slice(0, limit);
  }

  async recordRun(run: StoredJobRun): Promise<void> {
    const idx = this.data.runs.findIndex((r) => r.id === run.id);
    if (idx >= 0) this.data.runs[idx] = run;
    else this.data.runs.push(run);
    this.persist();
  }

  async listRuns(jobType?: StoredJobRun["jobType"], limit = 50): Promise<StoredJobRun[]> {
    return this.data.runs
      .filter((r) => !jobType || r.jobType === jobType)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }
}
