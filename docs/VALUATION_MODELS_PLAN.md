# Plan: Sell-Side-Grade Valuation Models for the Top 500 Stocks

**Goal:** ThesisLens automatically builds and maintains company valuation models comparable to
sell-side analyst models for the ~500 largest listed companies worldwide. That means linked
three-statement models driven by business drivers, anchored to guidance and consensus,
valued with sector-appropriate methods, and updated after every filing.

**Status (2026-11-22):** Phases 1 and 2 are complete on branch `claude/sleepy-johnson-9ngojn`.
Phases 3–6 haven't started.

---

## Guiding rules

1. **The LLM proposes assumptions and code computes everything.** Every number in a model comes
   from deterministic TypeScript. Every assumption must cite a source: a reported figure, a filing
   passage, guidance or consensus.
2. **Use data with as-of dates from day one.** Every value keeps the date its filing was made,
   so backtests can rebuild what was knowable at any past date.
3. **Don't break what exists.** `runDcfValuation`, the original MCP tools and the demo scenarios
   are untouched. The new engine sits alongside as new tools and routes.
4. **Follow the repo's test style.** Each phase adds a `scripts/verify-*.ts` check that runs
   offline in CI, plus a live `audit:*` script for the whole universe.

---

## Phase 1: data foundation (SEC EDGAR, free) ✅ Done

Commit `9f044a1`. Code in `src/lib/fundamentals/`.

- `sec-client.ts`: SEC EDGAR client. Paced at 8 req/s (the SEC limit is 10), cached on disk
  and in memory, serves a stale copy when SEC is unreachable, and sends a User-Agent from
  `SEC_USER_AGENT`.
- `line-items.ts`: about 50 standard line items (income statement, balance sheet, cash flow,
  bank lines). Each has ordered fallback tags in `us-gaap` and `ifrs-full`, plus sum and minus
  rules.
- `normalize.ts`:
  - Builds the fiscal calendar from period dates.
  - Derives single quarters from year-to-date figures (Q2 = H1 − Q1, Q4 = FY − 9M) and
    estimates Q4 diluted shares and EPS.
  - Applies the point-in-time `asOf` cutoff, so restatements stay hidden until they're filed.
  - Records where every value came from (tag, filing accession number, form, filing date,
    method).
- `checks.ts`: balance-sheet identity (including mezzanine equity), quarters summing to the
  year, gross-profit tie-out, core coverage and freshness.
- `sector.ts`: maps each company to one of 19 sector templates from its SIC code plus curated
  overrides.
- `universe.ts`: a hand-maintained seed list of about 280 large SEC filers. It supports merging
  a predecessor company's history after a holding-company reorganization (ExxonMobil, 2026).
- Interfaces: `GET /api/fundamentals` and the `get_company_fundamentals` MCP tool.
- Tests: `npm run verify:fundamentals` (CI, real trimmed filings) and
  `npm run audit:fundamentals` (live).

**Result:** all 278 companies load, mean core coverage is 96.5%, and 266 pass every data check.
The rest are flagged because their source data really is inconsistent.

## Phase 2: three-statement engine, templates and valuation ✅ Done

Commit `f41e1ca`. Code in `src/lib/model/`.

- `baseline.ts`: sets every driver from the company's own history and records its basis.
  - Year 1 is anchored to the quarters already reported this fiscal year.
  - Growth fades to the terminal rate.
  - Cyclical sectors fade margins toward their through-cycle median.
  - Sub-scale growth companies converge to a sector mature margin.
  - Heavy capex fades to a steady state (D&A + g × PP&E).
- `engine.ts`: linked income statement → cash flow → balance sheet for 3–20 years.
  - Cash is the only plug. A revolver draws when cash would fall below a floor and is paid
    down with excess cash.
  - The interest ↔ cash circularity is solved iteratively.
- `valuation.ts`: FCFF DCF.
  - CAPM WACC with relevered sector betas, using market-value weights when a price is supplied.
  - Exact stub period and mid-year discounting.
  - Value-driver terminal value: NOPAT·(1 − g/RONIC)/(WACC − g).
  - The EV-to-equity bridge deducts net debt (net of cash and long-term marketable securities),
    minority interest and mezzanine equity.
  - WACC × terminal-growth sensitivity grid.
- `templates.ts`: per-sector settings: beta, target capital structure, terminal growth, RONIC
  spread, SBC treatment, cyclicality and mature margin.
- Bear/base/bull scenarios, a probability-weighted value and an 8-quarter outlook.
- Overrides: any driver as a number or per-year path, with a rationale. Unknown keys and
  out-of-range values are rejected.
- Interfaces: `POST /api/model` and the `build_company_model` MCP tool (18 MCP tools total).
- Tests: `npm run verify:model` (CI) covers engine identities, the closed-form DCF,
  value-driver economics, the revolver, an Apple end-to-end model and point-in-time.
  `npm run audit:models` (live) sweeps the whole universe.

**Result:** 231 of the 278 companies get a model. The 46 financials are refused by design, and
one company lacks share data. Every model balances and its cash ties out.

---

## Phase 3: company dossier and LLM analyst ⏳ Next

The goal is to turn the mechanical baseline into an analyst view anchored to guidance, call
transcripts and filing text.

- `src/lib/dossier/`: builds a compact context pack per company (about 20–40k tokens) containing:
  - history as CSV (from Phase 1)
  - segment and KPI history
  - a dated guidance log
  - the prior model's assumptions
  - the filing and transcript passages relevant to each driver
- **Segments and KPIs:** from the SEC Financial Statement & Notes datasets (companyfacts has no
  segment detail), with LLM extraction from 10-K/10-Q filings where those fall short. Segments
  must sum to reported totals or the data is rejected.
- **Guidance:** extracted from earnings press releases (8-K exhibit 99.1).
- `src/lib/analyst/`: the LLM writes its assumption overrides into the Phase 2 schema.
  - Tools: `get_filing_section`, `get_kpi_history`, `get_guidance`, and `run_model`, so it can
    see the result and revise.
  - A validator rejects assumptions with no citation or outside sector limits, and flags any
    that differ from guidance without an explanation.
- **Cost:** sector instructions, the template schema and worked examples form a shared prompt
  prefix that gets cached, so each company pays only for its own pack.
- **Provider:** an `AnalystModel` interface. Gemini stays the default and other providers can be
  added (see decision D4).

## Phase 4: storage, automatic refresh and UI

- **Postgres on Cloud SQL, with pgvector for text search** (see decision D3). Tables:
  - `companies`
  - `facts` (with filing dates)
  - `kpis`
  - `guidance`
  - `doc_chunks`
  - `model_versions` (assumptions and outputs, versioned)
  - `runs`
- **Cloud Run Jobs:**
  - a nightly refresh of the whole universe
  - a poller for new EDGAR filings that re-models only the affected company, using a
    "what changed since the last model" prompt
- **UI:** a new Company Model tab showing:
  - the statement grid
  - each driver with its citation
  - scenario toggles
  - price-target history

  The existing IC committee also gets the full model as input.

## Phase 5: backtesting, before expanding coverage

- For 50 companies, rebuild the model as of each of the last 8 quarters using `asOf`
  (Phase 1 already supports this).
- Measure next-quarter revenue and EPS error against a naive seasonal baseline. Comparing
  against historical consensus needs a vendor (decision D1).
- **Gate:** coverage doesn't expand until the models beat the baseline.

## Phase 6: full coverage

- **Remaining sector models:**
  - banks: residual income, price to tangible book
  - insurers: embedded value / ROE
  - brokers and asset managers
  - REITs: NAV, AFFO
  - utilities: rate base × allowed ROE
  - oil & gas and mining: commodity deck, reserve NAV
  - pharma: risk-adjusted pipeline value by asset
  - autos: separate captive-finance debt
- **Non-US data:** EU filings via ESEF iXBRL, Japan via the EDINET API, and a vendor for
  everything else.
- **Consensus estimates feed.**
- **True top-500 ranking** by market cap, which needs a market-data feed.

---

## Decisions

These need an answer from the project owner. Each has a working default so building can
continue.

| # | Decision | Options | Current default | What depends on it |
|---|---|---|---|---|
| D1 | **Data budget** | (a) free only: SEC, FRED, Damodaran; (b) cheap feed (FMP, EODHD, ~$20–100/mo); (c) institutional (FactSet, LSEG, Visible Alpha) | (a) free only | **Share prices:** today `currentPrice` must be passed in by hand. **Rates:** the risk-free rate (4.25%) and ERP (4.5%) are fixed defaults. **Betas:** sector approximations, not regressions. **Also:** the real top-500 ranking, consensus comparison (Phase 5) and non-US coverage (Phase 6). |
| D2 | **SEC contact string** | Any "AppName contact@domain" | Generic string, no email | The SEC asks every client to identify itself and can block anonymous traffic. Set `SEC_USER_AGENT` before deploying. |
| D3 | **Storage** | (a) Postgres on Cloud SQL + pgvector; (b) stay on file cache + Firestore; (c) other | File cache under `.cache/sec` (Phases 1–3 need nothing more) | Phase 4: versioned models, the filing-text index, refresh jobs. |
| D4 | **LLM for the analyst** | (a) keep Gemini; (b) add Claude as an option behind the same interface; (c) switch | Not decided; nothing LLM-related changed yet | Phase 3: the analyst step that writes cited assumptions. |

## Known limitations (as of Phase 2)

- **Baseline values are opinion-free.** They aren't sell-side quality until Phase 3 adds
  guidance and analyst judgement.
- **Cyclicals at peak:** revenue isn't mean-reverted. The model flags these cases
  (e.g. Micron 2026).
- **Banks, insurers and brokers** are refused until Phase 6. **Utilities and REITs** are
  marked indicative only.
- **Auto captive-finance debt** (Ford Credit, GM Financial) is counted as industrial debt.
- **Foreign filers:** values are in the reporting currency, and ADR prices and ratios aren't
  converted.
- **SEC data gaps:**
  - TSM and Toyota stop at FY2024 because the SEC hasn't processed their latest 20-Fs yet.
  - Some companies tag EPS and share counts only by share class (e.g. V, BRK), which the
    companyfacts feed doesn't include.
  - Some utilities report capex only in company-specific tags, so it's estimated from the PP&E
    roll-forward.

## Running it

```bash
npm run verify:fundamentals && npm run verify:model     # offline, in CI
npm run audit:fundamentals                              # live data audit (~280 companies)
npm run audit:models                                    # live baseline model sweep
# Behind an HTTPS proxy, Node's fetch needs NODE_USE_ENV_PROXY=1 (Node >= 22.21)
```
