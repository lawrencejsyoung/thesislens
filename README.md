# ThesisLens — Autonomous Gemini Multi-Agent Investment Committee

Built for **Hack @ DevFest Sudbury 2026 (GDG Sudbury / MLH Hack Day)**.

**ThesisLens** is an institutional-grade finance & investing intelligence system where **Google Gemini is the core reasoning and orchestration engine—not a thin chat wrapper**. It combines a **4-agent Gemini Investment Committee**, **real Gemini Function Calling** into a deterministic quantitative finance engine, **Multimodal Vision** for earnings slides / brokerage screenshots / 10-K PDFs, **Structured JSON Outputs**, and **Firebase Firestore** persistence.

---

## Why This Wins (GDE Evaluation Highlights)

1. **Zero-Hallucination Financial Math via Gemini Function Calling**:
   - Instead of asking an LLM to guess DCF valuations or Monte Carlo probabilities, our Bull & Bear Gemini agents actively invoke deterministic TypeScript quant tools (`run_dcf_valuation`, `run_monte_carlo_simulation`, `analyze_portfolio_metrics`, `stress_test_macro_shock`) via `@google/genai` function calling loops and cite verified outputs.
2. **True Multi-Agent Adversarial Architecture**:
   - **Agent 1 (Filing & Multimodal Extractor)**: Parses uploaded images/PDFs + portfolio structure using Gemini Vision.
   - **Agent 2 (Bull Thesis Strategist)**: Invokes DCF & 800-path Monte Carlo tools to build a data-backed compounding case.
   - **Agent 3 (Bear & Risk Auditor)**: Invokes HHI Concentration & 4-Regime Macro Shock tools to expose hidden tail risks.
   - **Agent 4 (Chief Investment Officer)**: Synthesizes the adversarial debate via **Gemini Structured JSON Schema (`responseSchema`)** into a typed Executive Investment Memo with Conviction Score (0–100), Action Rating, Catalysts, and Ticker-by-Ticker Rebalancing Plan.
3. **Northern Ontario / Sudbury Relevance**:
   - Includes a dedicated **"Sudbury Critical Minerals & AI Grid"** scenario (Vale Sudbury Nickel/Copper, Cameco Uranium, Eaton Grid Power, Alphabet AI Cloud, Canadian Bonds) alongside AI Semiconductor Core and Canadian TFSA All-Weather scenarios.
4. **Live Booth Demo Ready**:
   - Runs **100% live** with any free Google Gemini API key (`GEMINI_API_KEY` in `.env.local` or pasted in the in-app **Connect Gemini Key** modal).
   - Automatically falls back to an **Interactive Demo Mode** (still running 100% real DCF, Monte Carlo, and Macro Shock math) if no key is configured yet.

---

## Quick Start

```bash
npm install
cp .env.example .env.local
# Add your free GEMINI_API_KEY from https://aistudio.google.com/apikey
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional: Enable Firebase Firestore Persistence
Add your Firebase Web SDK keys to `.env.local` (see `.env.example`). ThesisLens will automatically sync saved Investment Memos to Firestore (`investment_memos` collection) and seamlessly fall back to browser localStorage if unconfigured.

### Deploy to Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

---

## Architecture

```
User Thesis + Portfolio + Earnings Slide/PDF
                    │
                    ▼
   Next.js SSE Streaming API (/api/analyze)
                    │
   ┌────────────────┴────────────────┐
   ▼                                 ▼
Deterministic Quant Engine     Google Gemini 2.5 Flash (@google/genai)
 • 5Y DCF + WACC Heatmap        • Agent 1: Multimodal Vision Extractor
 • 800-Path Monte Carlo         • Agent 2: Bull Strategist (Function Calling)
 • 4-Regime Macro Shocks        • Agent 3: Bear Risk Auditor (Function Calling)
 • Beta / Sharpe / HHI          • Agent 4: CIO Synthesizer (Structured JSON)
   └────────────────┬────────────────┘
                    ▼
   Interactive Terminal UI (Recharts + Live Tool Trace + Firestore Memos)
```

---

## 3-Minute DevFest Sudbury Live Pitch Flow

1. **Hook (20s)**: Retail investors either use spreadsheets that take hours or ask chatbots that hallucinate financial math. **ThesisLens** puts an autonomous 4-agent Gemini Investment Committee on your desk.
2. **Live Demo — Sudbury Critical Minerals (90s)**:
   - Click **Run Multi-Agent Investment Committee** on the *Sudbury Critical Minerals & AI Grid* preset.
   - Expand the **Gemini Function Calls** inside Agent 2 & Agent 3 to show judges real tool arguments (`run_dcf_valuation`, `stress_test_macro_shock`) and zero-hallucination math.
   - Switch to the **Interactive DCF** tab and drag the **WACC** and **5Y FCF Growth** sliders live to show the valuation sensitivity heatmap update in real time.
   - Switch to **Macro Shock Stress Test** to show how the portfolio behaves in a *+100bps Rate Shock* vs. *Critical Minerals Supercycle*.
3. **Multimodal & Firebase (40s)**: Upload an earnings chart screenshot so Agent 1 extracts financial signals via Gemini Vision, then click **Save Memo** to persist the structured CIO report.
4. **Close (30s)**: Built from scratch on Google Gemini 2.5 Flash (`@google/genai`), Next.js, TypeScript, Recharts, and Firebase—ready for retail investors, student investment clubs, and financial advisors.

---

## Connect Any AI Agent (MCP Server)

ThesisLens ships with a **dual-transport Model Context Protocol (MCP) server** so *any* AI agent (Antigravity, Claude Desktop, Claude Code, Cursor, Gemini CLI, OpenAI Agents SDK, or custom web agents) can call its deterministic quant engine, compare competing capital options head-to-head, and run adversarial Bull vs. Bear pre-mortems.

- **18 Tools**: `get_company_fundamentals`, `build_company_model`, `run_dcf_valuation`, `run_monte_carlo_projection`, `analyze_portfolio_risk`, `simulate_rebalance`, `underwrite_real_estate_deal`, `compare_real_estate_markets`, `analyze_bond_duration`, `evaluate_prediction_bet`, `price_option_strategy`, `simulate_venture_powerlaw`, `run_forensic_accounting_audit`, `audit_global_tax_strategy`, `search_prediction_markets`, `query_intelligence_corpus`, `compare_decision_options`, and `run_adversarial_committee`.
- **3 Decision-Coaching Prompts**: `decision-brief`, `buy-vs-invest`, `probabilistic-bet-sizing`.
- **3 Read-Only Resources**: `thesislens://markets/real-estate`, `thesislens://tax/residencies`, `thesislens://scenarios/presets`.

### Option A: Local `stdio` MCP Server (Claude Desktop, Cursor, Antigravity, Gemini CLI)

Add this to your MCP client config (e.g. `claude_desktop_config.json`, `.cursor/mcp.json`, or Antigravity MCP config):

```json
{
  "mcpServers": {
    "thesislens": {
      "command": "npx",
      "args": ["tsx", "src/mcp/stdio.ts"],
      "cwd": "/ABSOLUTE/PATH/TO/hackdevsudbury",
      "env": {
        "GEMINI_API_KEY": "optional-for-live-gemini-committee"
      }
    }
  }
}
```

> All tools except `get_company_fundamentals` and `build_company_model` (which read SEC EDGAR) work **100% deterministically with zero API key**. Providing `GEMINI_API_KEY` automatically upgrades `run_adversarial_committee` to live Gemini multi-agent debate.

### Option B: Remote Streamable HTTP MCP Endpoint (`/api/mcp`)

When the Next.js app is running locally (`npm run dev`) or deployed, any HTTP-capable MCP client can connect to:

```text
POST http://localhost:3000/api/mcp
```

- Optional auth: set `MCP_API_KEY` in `.env.local` to require `Authorization: Bearer <MCP_API_KEY>`.
- Optional per-request Gemini upgrade: pass `x-gemini-api-key: <key>`.

## Company Fundamentals (SEC EDGAR)

> Roadmap, open decisions and known limitations: [`docs/VALUATION_MODELS_PLAN.md`](docs/VALUATION_MODELS_PLAN.md).

ThesisLens builds a normalized financial history for any SEC-reporting company directly from
XBRL filings: no API key and no paid data feed. It covers US 10-K/10-Q filers and foreign
20-F/40-F filers (IFRS, in the reporting currency).

```text
GET /api/fundamentals?ticker=AAPL[&asOf=2024-06-30][&annualPeriods=5][&quarterlyPeriods=8][&includeSources=1]
```

- **About 50 canonical line items** across the income statement, balance sheet, cash flow and bank-specific lines. Each has ordered fallback XBRL tags, so tag changes over time (e.g. ASC 606) don't break a series.
- **Discrete quarters.** 10-Qs report cash flows year-to-date, and Q4 is never filed, so ThesisLens derives Q2 = H1 − Q1 and Q4 = FY − 9M.
- **Point-in-time.** `asOf` hides every filing made after that date, including later restatements, so backtests can't see the future.
- **Provenance.** With `includeSources=1`, every value carries its XBRL tag, filing accession number, form, filing date and how it was derived.
- **Quality checks.** Balance-sheet identity (including mezzanine equity), quarters summing to the year, gross-profit tie-out, core coverage and freshness.
- **Sector templates.** Each company maps to one of 19 valuation templates from its SIC code plus curated overrides (`src/lib/fundamentals/sector.ts`).
- **Holding-company reorganizations.** History from a predecessor registrant is merged in (e.g. ExxonMobil, 2026).

Set `SEC_USER_AGENT` (the SEC requires an app name plus contact email). Responses are cached
under `SEC_CACHE_DIR` (default `.cache/sec`).

```bash
npm run verify:fundamentals                   # offline tests on real trimmed SEC fixtures (CI)
npm run audit:fundamentals                    # live audit of the ~280-company universe
npm run audit:fundamentals -- AAPL XOM --as-of 2024-06-30
```

If you run behind an HTTPS proxy, Node's built-in `fetch` only uses it with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).

## Three-Statement Company Models & DCF

`build_company_model` (MCP) and `POST /api/model` turn a company's SEC history into a linked
income statement / balance sheet / cash-flow model and value it.

```bash
curl -X POST localhost:3000/api/model -H 'content-type: application/json' -d '{
  "ticker": "MSFT", "currentPrice": 480,
  "drivers":   { "revenueGrowth": [0.15, 0.13, 0.11], "ebitMargin": 0.46 },
  "rationale": { "revenueGrowth": "FY27 guide: low-to-mid teens (Q1 call)" },
  "detail": "full"
}'
```

| Layer | What it does |
|---|---|
| **Baseline** (`src/lib/model/baseline.ts`) | Derives every driver from reported history and records its basis. Year-1 growth and margin are anchored to reported year-to-date quarters. Growth fades to the terminal rate. Cyclical sectors fade margins to their through-cycle median. Sub-scale growth companies converge to a sector mature margin. Heavy capex fades to steady-state reinvestment (D&A + g × PP&E). |
| **Engine** (`engine.ts`) | Linked IS → CF → BS for 3–20 years. Cash is the only plug, with a revolver that draws below a cash floor and sweeps excess cash. The interest ↔ cash circularity is solved iteratively. Balance and cash-tie checks run every year. |
| **Valuation** (`valuation.ts`) | FCFF DCF with an exact stub period and mid-year discounting. CAPM WACC with relevered sector betas (market weights when `currentPrice` is given). Value-driver terminal value `NOPAT·(1 − g/RONIC)/(WACC − g)`. The bridge counts long-term marketable securities, minority and mezzanine equity. Outputs a 5×3 WACC × g sensitivity grid. |
| **Scenarios** | Bear / base / bull (±2pp growth fading out, ±2pp margin, ∓0.5pp WACC), probability-weighted. |
| **Overrides** | Any driver as a number or per-year path, plus financing and valuation inputs. Each override carries a rationale into the assumption notes. Unknown keys and out-of-range values are rejected. |
| **Templates** (`templates.ts`) | Per-sector beta, capital structure, terminal growth, RONIC spread, SBC treatment, cyclicality and mature margin. Banks, insurers and brokers are refused (they need residual-income models). REITs and utilities are marked indicative. |

```bash
npm run verify:model      # engine identities, closed-form DCF, value-driver economics, revolver, Apple end-to-end (CI)
npm run audit:models      # live: baseline model for every company in the universe, anomalies flagged
```

### Verification Scripts

```bash
npm run verify:quant   # Core quantitative engine invariants
npm run verify:mcp     # In-memory + real stdio MCP integration tests
npm run verify:fundamentals  # SEC XBRL normalization on real filing fixtures
npm run verify:model         # Three-statement engine + DCF invariants
```
