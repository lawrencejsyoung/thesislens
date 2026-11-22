import type { ResolvedCitation } from "../analyst/types";
import type { GuidanceItem, KpiPoint } from "../dossier/types";
import type { TemplateId } from "../fundamentals/sector";
import type { AssumptionNote, CompanyModel, ModelAssumptions } from "../model/types";

export interface StoredCompany {
  ticker: string;
  cik: number;
  predecessorCiks: number[];
  name: string;
  templateId: TemplateId;
  currency: string;
  sic: string | null;
  fiscalYearEnd: string | null;
  inUniverse: boolean;
  marketCapUsd: number | null;
  adrRatio: number;
  updatedAt: string;
}

export interface StoredFact {
  companyTicker: string;
  periodId: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4 | null;
  periodStart: string;
  periodEnd: string;
  lineItem: string;
  value: number;
  tags: string[];
  method: string;
  accn?: string;
  form?: string;
  filedDate: string;
  currency: string;
}

export interface StoredDocChunk {
  id: string;
  companyTicker: string;
  accn?: string;
  form: string;
  filedDate: string;
  section: string;
  chunkIndex: number;
  title: string;
  content: string;
  tokenCount: number;
  embedding?: number[];
}

export interface StoredModelVersion {
  id: string;
  companyTicker: string;
  versionNumber: number;
  createdAt: string;
  asOf: string | null;
  modelType: "baseline" | "analyst" | "manual";
  triggerType: "manual" | "nightly" | "filing" | "backtest";
  triggerAccn?: string | null;
  templateId: TemplateId;
  currency: string;
  valuePerShare: number;
  probabilityWeightedValue: number;
  currentPrice: number | null;
  wacc: number;
  thesisSummary: string | null;
  assumptions: ModelAssumptions;
  notes: AssumptionNote[];
  citations: ResolvedCitation[];
  output: CompanyModel;
  parentVersionId: string | null;
}

export interface StoredJobRun {
  id: string;
  jobType: "nightly_refresh" | "filing_poller" | "analyst_batch" | "backtest";
  triggerSource: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  companiesProcessed: number;
  modelsUpdated: number;
  inputTokens: number;
  outputTokens: number;
  tokenCostUsd: number;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface SaveModelVersionInput {
  companyTicker: string;
  asOf: string | null;
  modelType: StoredModelVersion["modelType"];
  triggerType: StoredModelVersion["triggerType"];
  triggerAccn?: string | null;
  thesisSummary?: string | null;
  citations?: ResolvedCitation[];
  output: CompanyModel;
  parentVersionId?: string | null;
}

export interface ValuationStore {
  readonly backend: "memory" | "file" | "postgres";
  upsertCompany(company: StoredCompany): Promise<void>;
  getCompany(ticker: string): Promise<StoredCompany | null>;
  listCompanies(opts?: { inUniverseOnly?: boolean }): Promise<StoredCompany[]>;

  upsertFacts(facts: StoredFact[]): Promise<number>;
  getFacts(ticker: string, asOf?: string | null): Promise<StoredFact[]>;

  upsertKpis(ticker: string, kpis: KpiPoint[]): Promise<number>;
  getKpis(ticker: string, asOf?: string | null): Promise<KpiPoint[]>;

  upsertGuidance(ticker: string, items: GuidanceItem[]): Promise<number>;
  getGuidance(ticker: string, asOf?: string | null): Promise<GuidanceItem[]>;

  upsertDocChunks(chunks: StoredDocChunk[]): Promise<number>;
  searchDocChunks(
    ticker: string,
    opts: { asOf?: string | null; section?: string; queryEmbedding?: number[]; limit?: number }
  ): Promise<StoredDocChunk[]>;

  saveModelVersion(input: SaveModelVersionInput): Promise<StoredModelVersion>;
  getModelVersion(id: string): Promise<StoredModelVersion | null>;
  getLatestModelVersion(ticker: string): Promise<StoredModelVersion | null>;
  listModelVersions(ticker: string, limit?: number): Promise<StoredModelVersion[]>;

  recordRun(run: StoredJobRun): Promise<void>;
  listRuns(jobType?: StoredJobRun["jobType"], limit?: number): Promise<StoredJobRun[]>;
}
