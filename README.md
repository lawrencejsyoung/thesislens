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
