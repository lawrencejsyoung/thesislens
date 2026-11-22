-- Phase 4: ThesisLens Valuation Models Schema (Cloud SQL Postgres + pgvector, Decision D3)
-- Idempotent initial migration.

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. companies: ticker, CIK, predecessor CIKs, template, currency, universe membership
CREATE TABLE IF NOT EXISTS companies (
  ticker            TEXT PRIMARY KEY,
  cik               INTEGER NOT NULL,
  predecessor_ciks  INTEGER[] NOT NULL DEFAULT '{}',
  name              TEXT NOT NULL,
  template_id       TEXT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  sic               TEXT,
  fiscal_year_end   TEXT,
  in_universe       BOOLEAN NOT NULL DEFAULT TRUE,
  market_cap_usd    DOUBLE PRECISION,
  adr_ratio         DOUBLE PRECISION NOT NULL DEFAULT 1,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_cik ON companies (cik);
CREATE INDEX IF NOT EXISTS idx_companies_template ON companies (template_id);
CREATE INDEX IF NOT EXISTS idx_companies_universe_mcap ON companies (in_universe, market_cap_usd DESC NULLS LAST);

-- 2. facts: normalized line items per period with tag, accession number, and filing date
CREATE TABLE IF NOT EXISTS facts (
  id                BIGSERIAL PRIMARY KEY,
  company_ticker    TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
  period_id         TEXT NOT NULL,
  fiscal_year       INTEGER NOT NULL,
  fiscal_quarter    SMALLINT,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  line_item         TEXT NOT NULL,
  value             DOUBLE PRECISION NOT NULL,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  method            TEXT NOT NULL,
  accn              TEXT,
  form              TEXT,
  filed_date        DATE NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  UNIQUE (company_ticker, period_id, line_item, filed_date)
);

CREATE INDEX IF NOT EXISTS idx_facts_ticker_pit ON facts (company_ticker, filed_date, period_id);

-- 3. kpis: segment and operating KPIs per period with source
CREATE TABLE IF NOT EXISTS kpis (
  id                BIGSERIAL PRIMARY KEY,
  company_ticker    TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
  period_id         TEXT NOT NULL,
  metric            TEXT NOT NULL,
  segment           TEXT,
  value             DOUBLE PRECISION NOT NULL,
  unit              TEXT NOT NULL,
  source            TEXT NOT NULL,
  accn              TEXT,
  filed_date        DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kpis_ticker_pit ON kpis (company_ticker, filed_date, metric);

-- 4. guidance: dated guidance items linked to their filing
CREATE TABLE IF NOT EXISTS guidance (
  id                TEXT PRIMARY KEY,
  company_ticker    TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
  target_period     TEXT NOT NULL,
  metric            TEXT NOT NULL,
  low_value         DOUBLE PRECISION,
  high_value        DOUBLE PRECISION,
  point_value       DOUBLE PRECISION,
  unit              TEXT NOT NULL,
  quote             TEXT NOT NULL,
  form              TEXT NOT NULL,
  accn              TEXT,
  filed_date        DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guidance_ticker_pit ON guidance (company_ticker, filed_date);

-- 5. doc_chunks: filing and release text sections with pgvector embeddings (768-dim Gemini text-embedding-004)
CREATE TABLE IF NOT EXISTS doc_chunks (
  id                TEXT PRIMARY KEY,
  company_ticker    TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
  accn              TEXT,
  form              TEXT NOT NULL,
  filed_date        DATE NOT NULL,
  section           TEXT NOT NULL,
  chunk_index       INTEGER NOT NULL DEFAULT 0,
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  token_count       INTEGER NOT NULL DEFAULT 0,
  embedding         vector(768)
);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_ticker_pit ON doc_chunks (company_ticker, filed_date, section);
-- Vector similarity index (cosine distance)
CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding ON doc_chunks USING hnsw (embedding vector_cosine_ops);

-- 6. model_versions: assumptions, notes, outputs, and citations per model run
CREATE TABLE IF NOT EXISTS model_versions (
  id                          TEXT PRIMARY KEY,
  company_ticker              TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
  version_number              INTEGER NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  as_of                       DATE,
  model_type                  TEXT NOT NULL CHECK (model_type IN ('baseline', 'analyst', 'manual')),
  trigger_type                TEXT NOT NULL CHECK (trigger_type IN ('manual', 'nightly', 'filing', 'backtest')),
  trigger_accn                TEXT,
  template_id                 TEXT NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'USD',
  value_per_share             DOUBLE PRECISION NOT NULL,
  probability_weighted_value  DOUBLE PRECISION NOT NULL,
  current_price               DOUBLE PRECISION,
  wacc                        DOUBLE PRECISION NOT NULL,
  thesis_summary              TEXT,
  assumptions_json            JSONB NOT NULL,
  notes_json                  JSONB NOT NULL,
  citations_json              JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_json                 JSONB NOT NULL,
  parent_version_id           TEXT REFERENCES model_versions(id),
  UNIQUE (company_ticker, version_number)
);

CREATE INDEX IF NOT EXISTS idx_model_versions_ticker_created ON model_versions (company_ticker, created_at DESC);

-- 7. runs: job runs (nightly refresh, filing poller, analyst batch)
CREATE TABLE IF NOT EXISTS runs (
  id                   TEXT PRIMARY KEY,
  job_type             TEXT NOT NULL CHECK (job_type IN ('nightly_refresh', 'filing_poller', 'analyst_batch', 'backtest')),
  trigger_source       TEXT NOT NULL,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at          TIMESTAMPTZ,
  status               TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  companies_processed  INTEGER NOT NULL DEFAULT 0,
  models_updated       INTEGER NOT NULL DEFAULT 0,
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  token_cost_usd       DOUBLE PRECISION NOT NULL DEFAULT 0,
  error_message        TEXT,
  metadata_json        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_runs_job_started ON runs (job_type, started_at DESC);
