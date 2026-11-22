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

interface PgClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Cloud SQL Postgres + pgvector ValuationStore (Decision D3).
 * Connects via DATABASE_URL or Cloud SQL Unix socket (/cloudsql/<CLOUD_SQL_CONNECTION_NAME>).
 * Uses a lazy dynamic import of `pg` so the app stays lightweight when running in local/file mode.
 */
export class PostgresValuationStore implements ValuationStore {
  readonly backend = "postgres" as const;
  private poolPromise: Promise<PgClientLike> | null = null;

  constructor(private readonly connectionString: string) {}

  private async pool(): Promise<PgClientLike> {
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        // Dynamic import avoids bundling pg unless DATABASE_URL is configured
        const modName = "pg";
        const pg = (await import(/* webpackIgnore: true */ modName)) as {
          Pool: new (cfg: { connectionString: string; max?: number }) => PgClientLike;
        };
        return new pg.Pool({ connectionString: this.connectionString, max: 10 });
      })();
    }
    return this.poolPromise;
  }

  async upsertCompany(c: StoredCompany): Promise<void> {
    const db = await this.pool();
    await db.query(
      `INSERT INTO companies (ticker, cik, predecessor_ciks, name, template_id, currency, sic, fiscal_year_end, in_universe, market_cap_usd, adr_ratio, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (ticker) DO UPDATE SET
         cik = EXCLUDED.cik,
         predecessor_ciks = EXCLUDED.predecessor_ciks,
         name = EXCLUDED.name,
         template_id = EXCLUDED.template_id,
         currency = EXCLUDED.currency,
         sic = EXCLUDED.sic,
         fiscal_year_end = EXCLUDED.fiscal_year_end,
         in_universe = EXCLUDED.in_universe,
         market_cap_usd = EXCLUDED.market_cap_usd,
         adr_ratio = EXCLUDED.adr_ratio,
         updated_at = NOW()`,
      [
        c.ticker.toUpperCase(),
        c.cik,
        c.predecessorCiks,
        c.name,
        c.templateId,
        c.currency,
        c.sic,
        c.fiscalYearEnd,
        c.inUniverse,
        c.marketCapUsd,
        c.adrRatio,
      ]
    );
  }

  async getCompany(ticker: string): Promise<StoredCompany | null> {
    const db = await this.pool();
    const res = await db.query(`SELECT * FROM companies WHERE ticker = $1`, [ticker.toUpperCase()]);
    const row = res.rows[0];
    return row ? this.mapCompany(row) : null;
  }

  async listCompanies(opts?: { inUniverseOnly?: boolean }): Promise<StoredCompany[]> {
    const db = await this.pool();
    const sql = opts?.inUniverseOnly
      ? `SELECT * FROM companies WHERE in_universe = TRUE ORDER BY market_cap_usd DESC NULLS LAST, ticker ASC`
      : `SELECT * FROM companies ORDER BY market_cap_usd DESC NULLS LAST, ticker ASC`;
    const res = await db.query(sql);
    return res.rows.map((r) => this.mapCompany(r));
  }

  async upsertFacts(facts: StoredFact[]): Promise<number> {
    const db = await this.pool();
    for (const f of facts) {
      await db.query(
        `INSERT INTO facts (company_ticker, period_id, fiscal_year, fiscal_quarter, period_start, period_end, line_item, value, tags, method, accn, form, filed_date, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (company_ticker, period_id, line_item, filed_date) DO UPDATE SET value = EXCLUDED.value, tags = EXCLUDED.tags, method = EXCLUDED.method`,
        [
          f.companyTicker.toUpperCase(),
          f.periodId,
          f.fiscalYear,
          f.fiscalQuarter,
          f.periodStart,
          f.periodEnd,
          f.lineItem,
          f.value,
          f.tags,
          f.method,
          f.accn ?? null,
          f.form ?? null,
          f.filedDate,
          f.currency,
        ]
      );
    }
    return facts.length;
  }

  async getFacts(ticker: string, asOf?: string | null): Promise<StoredFact[]> {
    const db = await this.pool();
    const res = asOf
      ? await db.query(`SELECT * FROM facts WHERE company_ticker = $1 AND filed_date <= $2 ORDER BY period_end ASC`, [ticker.toUpperCase(), asOf])
      : await db.query(`SELECT * FROM facts WHERE company_ticker = $1 ORDER BY period_end ASC`, [ticker.toUpperCase()]);
    return res.rows.map((r) => ({
      companyTicker: String(r.company_ticker),
      periodId: String(r.period_id),
      fiscalYear: Number(r.fiscal_year),
      fiscalQuarter: r.fiscal_quarter === null ? null : (Number(r.fiscal_quarter) as 1 | 2 | 3 | 4),
      periodStart: String(r.period_start).slice(0, 10),
      periodEnd: String(r.period_end).slice(0, 10),
      lineItem: String(r.line_item),
      value: Number(r.value),
      tags: (r.tags as string[]) ?? [],
      method: String(r.method),
      accn: r.accn ? String(r.accn) : undefined,
      form: r.form ? String(r.form) : undefined,
      filedDate: String(r.filed_date).slice(0, 10),
      currency: String(r.currency),
    }));
  }

  async upsertKpis(ticker: string, kpis: KpiPoint[]): Promise<number> {
    const db = await this.pool();
    for (const k of kpis) {
      await db.query(
        `INSERT INTO kpis (company_ticker, period_id, metric, segment, value, unit, source, filed_date)
         VALUES ($1,$2,$3,NULL,$4,$5,$6,$7)`,
        [ticker.toUpperCase(), k.periodId, k.metric, k.value, k.unit, k.source, k.filed]
      );
    }
    return kpis.length;
  }

  async getKpis(ticker: string, asOf?: string | null): Promise<KpiPoint[]> {
    const db = await this.pool();
    const res = asOf
      ? await db.query(`SELECT * FROM kpis WHERE company_ticker = $1 AND filed_date <= $2`, [ticker.toUpperCase(), asOf])
      : await db.query(`SELECT * FROM kpis WHERE company_ticker = $1`, [ticker.toUpperCase()]);
    return res.rows.map((r) => ({
      periodId: String(r.period_id),
      metric: String(r.metric),
      value: Number(r.value),
      unit: String(r.unit),
      filed: String(r.filed_date).slice(0, 10),
      source: String(r.source),
    }));
  }

  async upsertGuidance(ticker: string, items: GuidanceItem[]): Promise<number> {
    const db = await this.pool();
    for (const g of items) {
      await db.query(
        `INSERT INTO guidance (id, company_ticker, target_period, metric, low_value, high_value, point_value, unit, quote, form, accn, filed_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET quote = EXCLUDED.quote, low_value = EXCLUDED.low_value, high_value = EXCLUDED.high_value`,
        [g.id, ticker.toUpperCase(), g.targetPeriod, g.metric, g.low ?? null, g.high ?? null, g.point ?? null, g.unit, g.quote, g.form, g.accn ?? null, g.filed]
      );
    }
    return items.length;
  }

  async getGuidance(ticker: string, asOf?: string | null): Promise<GuidanceItem[]> {
    const db = await this.pool();
    const res = asOf
      ? await db.query(`SELECT * FROM guidance WHERE company_ticker = $1 AND filed_date <= $2 ORDER BY filed_date DESC`, [ticker.toUpperCase(), asOf])
      : await db.query(`SELECT * FROM guidance WHERE company_ticker = $1 ORDER BY filed_date DESC`, [ticker.toUpperCase()]);
    return res.rows.map((r) => ({
      id: String(r.id),
      targetPeriod: String(r.target_period),
      metric: String(r.metric) as GuidanceItem["metric"],
      low: r.low_value === null ? null : Number(r.low_value),
      high: r.high_value === null ? null : Number(r.high_value),
      point: r.point_value === null ? null : Number(r.point_value),
      unit: String(r.unit) as GuidanceItem["unit"],
      quote: String(r.quote),
      form: String(r.form),
      accn: r.accn ? String(r.accn) : undefined,
      filed: String(r.filed_date).slice(0, 10),
    }));
  }

  async upsertDocChunks(chunks: StoredDocChunk[]): Promise<number> {
    const db = await this.pool();
    for (const c of chunks) {
      const vec = c.embedding ? `[${c.embedding.join(",")}]` : null;
      await db.query(
        `INSERT INTO doc_chunks (id, company_ticker, accn, form, filed_date, section, chunk_index, title, content, token_count, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector)
         ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding`,
        [c.id, c.companyTicker.toUpperCase(), c.accn ?? null, c.form, c.filedDate, c.section, c.chunkIndex, c.title, c.content, c.tokenCount, vec]
      );
    }
    return chunks.length;
  }

  async searchDocChunks(
    ticker: string,
    opts: { asOf?: string | null; section?: string; queryEmbedding?: number[]; limit?: number }
  ): Promise<StoredDocChunk[]> {
    const db = await this.pool();
    const params: unknown[] = [ticker.toUpperCase()];
    const clauses = ["company_ticker = $1"];
    if (opts.asOf) {
      params.push(opts.asOf);
      clauses.push(`filed_date <= $${params.length}`);
    }
    if (opts.section) {
      params.push(opts.section);
      clauses.push(`section = $${params.length}`);
    }
    let order = "filed_date DESC, chunk_index ASC";
    if (opts.queryEmbedding && opts.queryEmbedding.length > 0) {
      params.push(`[${opts.queryEmbedding.join(",")}]`);
      order = `embedding <=> $${params.length}::vector ASC`;
    }
    params.push(opts.limit ?? 20);
    const res = await db.query(
      `SELECT id, company_ticker, accn, form, filed_date, section, chunk_index, title, content, token_count
       FROM doc_chunks WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT $${params.length}`,
      params
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      companyTicker: String(r.company_ticker),
      accn: r.accn ? String(r.accn) : undefined,
      form: String(r.form),
      filedDate: String(r.filed_date).slice(0, 10),
      section: String(r.section),
      chunkIndex: Number(r.chunk_index),
      title: String(r.title),
      content: String(r.content),
      tokenCount: Number(r.token_count),
    }));
  }

  async saveModelVersion(input: SaveModelVersionInput): Promise<StoredModelVersion> {
    const db = await this.pool();
    const ticker = input.companyTicker.toUpperCase();
    const latest = await this.getLatestModelVersion(ticker);
    const nextVersion = (latest?.versionNumber ?? 0) + 1;
    const id = `mv_${ticker.toLowerCase()}_v${nextVersion}_${crypto.randomBytes(4).toString("hex")}`;
    const createdAt = new Date().toISOString();

    await db.query(
      `INSERT INTO model_versions
       (id, company_ticker, version_number, created_at, as_of, model_type, trigger_type, trigger_accn, template_id, currency, value_per_share, probability_weighted_value, current_price, wacc, thesis_summary, assumptions_json, notes_json, citations_json, output_json, parent_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        id,
        ticker,
        nextVersion,
        createdAt,
        input.asOf,
        input.modelType,
        input.triggerType,
        input.triggerAccn ?? null,
        input.output.templateId,
        input.output.currency,
        input.output.valuation.valuePerShare,
        input.output.probabilityWeightedValue,
        input.output.valuation.currentPrice,
        input.output.valuation.wacc,
        input.thesisSummary ?? null,
        JSON.stringify(input.output.assumptions),
        JSON.stringify(input.output.notes),
        JSON.stringify(input.citations ?? []),
        JSON.stringify(input.output),
        input.parentVersionId ?? latest?.id ?? null,
      ]
    );

    return {
      id,
      companyTicker: ticker,
      versionNumber: nextVersion,
      createdAt,
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
      parentVersionId: input.parentVersionId ?? latest?.id ?? null,
    };
  }

  async getModelVersion(id: string): Promise<StoredModelVersion | null> {
    const db = await this.pool();
    const res = await db.query(`SELECT * FROM model_versions WHERE id = $1`, [id]);
    return res.rows[0] ? this.mapVersion(res.rows[0]) : null;
  }

  async getLatestModelVersion(ticker: string): Promise<StoredModelVersion | null> {
    const list = await this.listModelVersions(ticker, 1);
    return list[0] ?? null;
  }

  async listModelVersions(ticker: string, limit = 50): Promise<StoredModelVersion[]> {
    const db = await this.pool();
    const res = await db.query(
      `SELECT * FROM model_versions WHERE company_ticker = $1 ORDER BY version_number DESC LIMIT $2`,
      [ticker.toUpperCase(), limit]
    );
    return res.rows.map((r) => this.mapVersion(r));
  }

  async recordRun(run: StoredJobRun): Promise<void> {
    const db = await this.pool();
    await db.query(
      `INSERT INTO runs (id, job_type, trigger_source, started_at, finished_at, status, companies_processed, models_updated, input_tokens, output_tokens, token_cost_usd, error_message, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET finished_at = EXCLUDED.finished_at, status = EXCLUDED.status, companies_processed = EXCLUDED.companies_processed, models_updated = EXCLUDED.models_updated, token_cost_usd = EXCLUDED.token_cost_usd, error_message = EXCLUDED.error_message`,
      [
        run.id,
        run.jobType,
        run.triggerSource,
        run.startedAt,
        run.finishedAt,
        run.status,
        run.companiesProcessed,
        run.modelsUpdated,
        run.inputTokens,
        run.outputTokens,
        run.tokenCostUsd,
        run.errorMessage,
        JSON.stringify(run.metadata),
      ]
    );
  }

  async listRuns(jobType?: StoredJobRun["jobType"], limit = 50): Promise<StoredJobRun[]> {
    const db = await this.pool();
    const res = jobType
      ? await db.query(`SELECT * FROM runs WHERE job_type = $1 ORDER BY started_at DESC LIMIT $2`, [jobType, limit])
      : await db.query(`SELECT * FROM runs ORDER BY started_at DESC LIMIT $1`, [limit]);
    return res.rows.map((r) => ({
      id: String(r.id),
      jobType: String(r.job_type) as StoredJobRun["jobType"],
      triggerSource: String(r.trigger_source),
      startedAt: new Date(String(r.started_at)).toISOString(),
      finishedAt: r.finished_at ? new Date(String(r.finished_at)).toISOString() : null,
      status: String(r.status) as StoredJobRun["status"],
      companiesProcessed: Number(r.companies_processed),
      modelsUpdated: Number(r.models_updated),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      tokenCostUsd: Number(r.token_cost_usd),
      errorMessage: r.error_message ? String(r.error_message) : null,
      metadata: (r.metadata_json as Record<string, unknown>) ?? {},
    }));
  }

  private mapCompany(r: Record<string, unknown>): StoredCompany {
    return {
      ticker: String(r.ticker),
      cik: Number(r.cik),
      predecessorCiks: (r.predecessor_ciks as number[]) ?? [],
      name: String(r.name),
      templateId: String(r.template_id) as StoredCompany["templateId"],
      currency: String(r.currency),
      sic: r.sic ? String(r.sic) : null,
      fiscalYearEnd: r.fiscal_year_end ? String(r.fiscal_year_end) : null,
      inUniverse: Boolean(r.in_universe),
      marketCapUsd: r.market_cap_usd === null ? null : Number(r.market_cap_usd),
      adrRatio: Number(r.adr_ratio ?? 1),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
    };
  }

  private mapVersion(r: Record<string, unknown>): StoredModelVersion {
    return {
      id: String(r.id),
      companyTicker: String(r.company_ticker),
      versionNumber: Number(r.version_number),
      createdAt: new Date(String(r.created_at)).toISOString(),
      asOf: r.as_of ? String(r.as_of).slice(0, 10) : null,
      modelType: String(r.model_type) as StoredModelVersion["modelType"],
      triggerType: String(r.trigger_type) as StoredModelVersion["triggerType"],
      triggerAccn: r.trigger_accn ? String(r.trigger_accn) : null,
      templateId: String(r.template_id) as StoredModelVersion["templateId"],
      currency: String(r.currency),
      valuePerShare: Number(r.value_per_share),
      probabilityWeightedValue: Number(r.probability_weighted_value),
      currentPrice: r.current_price === null ? null : Number(r.current_price),
      wacc: Number(r.wacc),
      thesisSummary: r.thesis_summary ? String(r.thesis_summary) : null,
      assumptions: r.assumptions_json as StoredModelVersion["assumptions"],
      notes: r.notes_json as StoredModelVersion["notes"],
      citations: (r.citations_json as StoredModelVersion["citations"]) ?? [],
      output: r.output_json as StoredModelVersion["output"],
      parentVersionId: r.parent_version_id ? String(r.parent_version_id) : null,
    };
  }
}
