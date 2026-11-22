-- Phase 1 Productionization: Multi-Tenant Auth, Households, Saved Memos, OAuth 2.1, API Keys & Audit Logs
-- Builds on 001_initial_valuation_schema.sql (idempotent migration).

-- 1. Organizations (tenants: individual retail accounts, RIA advisor firms, hedge funds)
CREATE TABLE IF NOT EXISTS organizations (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  tier                TEXT NOT NULL DEFAULT 'free'
                        CHECK (tier IN ('free', 'retail_pro', 'advisor', 'hedge_fund')),
  stripe_customer_id  TEXT UNIQUE,
  stripe_sub_id       TEXT,
  zdr_enforced        BOOLEAN NOT NULL DEFAULT FALSE,
  custom_branding     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_tier ON organizations (tier);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  external_auth_id  TEXT UNIQUE,
  email             TEXT NOT NULL UNIQUE,
  display_name      TEXT,
  default_profile   TEXT NOT NULL DEFAULT 'retail'
                      CHECK (default_profile IN ('beginner', 'retail', 'planner', 'manager')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Organization Memberships (RBAC)
CREATE TABLE IF NOT EXISTS org_memberships (
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'advisor', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships (user_id);

-- 4. Client Households (CFP Financial Advisor / RIA CRM workspace)
CREATE TABLE IF NOT EXISTS client_households (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  advisor_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name     TEXT NOT NULL,
  residency        TEXT NOT NULL DEFAULT 'canada_on',
  profile_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_households_org ON client_households (org_id, updated_at DESC);

-- 5. Saved Portfolios & Investment Committee Memos (replaces unauthenticated Firestore collection)
CREATE TABLE IF NOT EXISTS saved_memos (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id      TEXT REFERENCES client_households(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  audience          TEXT NOT NULL DEFAULT 'retail',
  action_rating     TEXT,
  conviction_score  INTEGER,
  provenance_hash   TEXT NOT NULL,
  payload_json      JSONB NOT NULL,
  result_json       JSONB NOT NULL,
  approved_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_memos_org_created ON saved_memos (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_memos_household ON saved_memos (household_id, created_at DESC);

-- 6. Scoped API Keys (programmatic & hedge fund desk access)
CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  scopes        TEXT[] NOT NULL DEFAULT '{mcp:read,quant:execute}',
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys (org_id);

-- 7. OAuth 2.1 Clients (Dynamic Client Registration for Claude, ChatGPT, Gemini remote MCP)
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id       TEXT PRIMARY KEY,
  client_name     TEXT NOT NULL,
  redirect_uris   TEXT[] NOT NULL,
  grant_types     TEXT[] NOT NULL DEFAULT '{authorization_code,refresh_token}',
  response_types  TEXT[] NOT NULL DEFAULT '{code}',
  scope           TEXT NOT NULL DEFAULT 'mcp:tools mcp:prompts mcp:resources',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. OAuth 2.1 Tokens
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash   TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scopes       TEXT[] NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_org_user ON oauth_tokens (org_id, user_id);

-- 9. Immutable Compliance Audit Log (SEC Rule 204-2 / FINRA / CIRO books-and-records)
CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  org_id          TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  surface         TEXT NOT NULL
                    CHECK (surface IN ('web', 'mcp_gemini', 'mcp_claude', 'mcp_openai', 'mcp_generic', 'api')),
  action          TEXT NOT NULL,
  tool_name       TEXT,
  input_hash      TEXT NOT NULL,
  output_hash     TEXT,
  provenance_hash TEXT,
  model_provider  TEXT,
  tokens_used     INTEGER NOT NULL DEFAULT 0,
  cost_usd        DOUBLE PRECISION NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'denied', 'error')),
  metadata_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tool ON audit_logs (tool_name, created_at DESC);

-- 10. Scope model_versions to organizations (NULL org_id = shared baseline model)
ALTER TABLE model_versions
  ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_model_versions_org ON model_versions (org_id, company_ticker, created_at DESC);

-- 11. Monthly Usage Metering (Stripe billing & quota enforcement)
CREATE TABLE IF NOT EXISTS usage_meters (
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_ym       TEXT NOT NULL, -- e.g. '2026-11'
  mcp_calls       INTEGER NOT NULL DEFAULT 0,
  ai_runs         INTEGER NOT NULL DEFAULT 0,
  live_quotes     INTEGER NOT NULL DEFAULT 0,
  token_cost_usd  DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, period_ym)
);

-- 12. Row-Level Security (RLS) for strict tenant isolation
ALTER TABLE client_households ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'client_households' AND policyname = 'tenant_isolation_households'
  ) THEN
    CREATE POLICY tenant_isolation_households ON client_households
      USING (org_id = current_setting('app.current_org_id', true));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_memos' AND policyname = 'tenant_isolation_memos'
  ) THEN
    CREATE POLICY tenant_isolation_memos ON saved_memos
      USING (org_id = current_setting('app.current_org_id', true));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'tenant_isolation_api_keys'
  ) THEN
    CREATE POLICY tenant_isolation_api_keys ON api_keys
      USING (org_id = current_setting('app.current_org_id', true));
  END IF;
END $$;
