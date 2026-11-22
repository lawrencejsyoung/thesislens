"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Cpu,
  History,
  Layers,
  Loader2,
  Play,
  Save,
  Search,
  Sparkles,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PresentedModel {
  ticker: string;
  name: string;
  templateId: string;
  currency: string;
  asOf: string | null;
  basePeriod: string;
  valuation: {
    valuePerShare: number;
    probabilityWeightedValue: number;
    currentPrice: number | null;
    upside: number | null;
    wacc: number;
    costOfEquity: number;
    leveredBeta: number;
    terminalGrowth: number;
    terminalRonic: number;
    enterpriseValue: number;
    equityValue: number;
    netDebt: number;
    terminalShareOfEv: number;
    impliedExitEvEbitda: number;
    valuationDate: string;
  };
  scenarios: {
    name: "bear" | "base" | "bull";
    probability: number;
    description: string;
    valuePerShare: number;
    revenueFinalYear: number;
    ebitMarginFinalYear: number;
    wacc: number;
  }[];
  sensitivity: { wacc: number; terminalGrowth: number; valuePerShare: number }[];
  history: { periodId: string; revenue: number; ebit: number | null; netIncome: number | null; epsDiluted: number | null }[];
  forecast: {
    period: string;
    revenue: number;
    revenueGrowth: number;
    ebit: number;
    ebitMargin: number;
    netIncome: number;
    epsDiluted: number;
    freeCashFlow: number;
    fcff: number;
    netDebt: number;
  }[];
  quarterlyOutlook: { periodId: string; revenue: number; epsDiluted: number; actual: boolean }[];
  assumptions: { key: string; value: string; basis: string; source: "baseline" | "template" | "override" }[];
  checks: { id: string; status: "pass" | "warn" | "fail"; message: string }[];
  warnings: string[];
  sectorValuation?: {
    method: string;
    label: string;
    summary: string;
    metrics: Record<string, number | string>;
    crossCheckValuePerShare?: number | null;
  };
  analyst?: {
    thesisSummary: string;
    baselineValuePerShare: number;
    rates: { riskFreeRate: number; equityRiskPremium: number; asOf: string; riskFreeSource: string; erpSource: string };
    keyRisks: string[];
    catalysts: string[];
    citations: {
      key: string;
      citationId: string;
      rationale: string;
      divergenceReason?: string;
      passage: { id: string; section: string; title: string; filed: string; form: string; text: string };
    }[];
    provider: string;
    modelName: string;
  };
}

interface VersionSummary {
  id: string;
  versionNumber: number;
  createdAt: string;
  asOf: string | null;
  modelType: string;
  triggerType: string;
  currency: string;
  valuePerShare: number;
  probabilityWeightedValue: number;
  currentPrice: number | null;
  wacc: number;
  thesisSummary: string | null;
  citationCount: number;
}

const QUICK_TICKERS = [
  { ticker: "AAPL", label: "AAPL (Hardware)" },
  { ticker: "MSFT", label: "MSFT (Software)" },
  { ticker: "NVDA", label: "NVDA (Semis)" },
  { ticker: "JPM", label: "JPM (Bank)" },
  { ticker: "XOM", label: "XOM (Energy)" },
  { ticker: "NVO", label: "NVO (Pharma)" },
  { ticker: "TSLA", label: "TSLA (Auto)" },
  { ticker: "AMT", label: "AMT (REIT)" },
  { ticker: "NEE", label: "NEE (Utility)" },
];

function fmtB(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toFixed(0);
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

interface CompanyModelLabProps {
  userApiKey?: string;
  onSendToCommittee?: (modelSummary: {
    ticker: string;
    name: string;
    thesisPrompt: string;
    title: string;
  }) => void;
}

export function CompanyModelLab({ userApiKey, onSendToCommittee }: CompanyModelLabProps) {
  const [ticker, setTicker] = useState("AAPL");
  const [priceInput, setPriceInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<"baseline" | "analyst">("baseline");
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<PresentedModel | null>(null);
  const [activeScenario, setActiveScenario] = useState<"bear" | "base" | "bull">("base");
  const [activeGridTab, setActiveGridTab] = useState<"statements" | "quarters" | "assumptions" | "sensitivity">("statements");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [savingVersion, setSavingVersion] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadVersions = useCallback(async (t: string) => {
    try {
      const res = await fetch(`/api/model/versions?ticker=${encodeURIComponent(t)}`);
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.versions ?? []);
    } catch {
      // ignore
    }
  }, []);

  const runModel = useCallback(
    async (targetTicker: string, useAnalyst: boolean) => {
      const clean = targetTicker.trim().toUpperCase();
      if (!clean) return;
      setLoading(true);
      setLoadingMode(useAnalyst ? "analyst" : "baseline");
      setError(null);
      setSaveMessage(null);
      try {
        const parsedPrice = priceInput.trim() ? Number(priceInput.trim()) : undefined;
        const res = await fetch("/api/model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: clean,
            currentPrice: parsedPrice && Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : undefined,
            detail: "full",
            analyst: useAnalyst,
            ...(useAnalyst && userApiKey ? { apiKey: userApiKey } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Failed to build model (${res.status}).`);
        }
        setModel(data as PresentedModel);
        setActiveScenario("base");
        await loadVersions(clean);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load company model.");
      } finally {
        setLoading(false);
      }
    },
    [priceInput, userApiKey, loadVersions]
  );

  useEffect(() => {
    void loadVersions(ticker);
  }, [ticker, loadVersions]);

  const handleSaveVersion = async () => {
    if (!model) return;
    setSavingVersion(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/model/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: model.ticker,
          modelType: model.analyst ? "analyst" : "baseline",
          triggerType: "manual",
          thesisSummary: model.analyst?.thesisSummary ?? null,
          citations: model.analyst?.citations ?? [],
          output: {
            ...model,
            base: { periodId: model.basePeriod },
            projections: model.forecast,
            notes: model.assumptions,
            assumptions: { years: model.forecast.length },
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save version.");
      setSaveMessage("Version saved to valuation history.");
      await loadVersions(model.ticker);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingVersion(false);
    }
  };

  const handleReopenVersion = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/model/versions?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok || !data.version?.output) throw new Error(data.error || "Could not reopen version.");
      const v = data.version;
      setModel(v.output as PresentedModel);
      setSaveMessage(`Reopened v${v.versionNumber} (${new Date(v.createdAt).toLocaleDateString()}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen version.");
    } finally {
      setLoading(false);
    }
  };

  const selectedScenarioObj = useMemo(() => {
    if (!model) return null;
    return model.scenarios.find((s) => s.name === activeScenario) ?? model.scenarios[1] ?? null;
  }, [model, activeScenario]);

  const sensitivityMatrix = useMemo(() => {
    if (!model || model.sensitivity.length === 0) return { waccs: [] as number[], gs: [] as number[], map: new Map<string, number>() };
    const waccs = Array.from(new Set(model.sensitivity.map((c) => c.wacc))).sort((a, b) => a - b);
    const gs = Array.from(new Set(model.sensitivity.map((c) => c.terminalGrowth))).sort((a, b) => a - b);
    const map = new Map<string, number>();
    for (const c of model.sensitivity) {
      map.set(`${c.wacc}_${c.terminalGrowth}`, c.valuePerShare);
    }
    return { waccs, gs, map };
  }, [model]);

  const versionChartData = useMemo(() => {
    return [...versions]
      .reverse()
      .map((v) => ({
        label: `v${v.versionNumber}`,
        date: new Date(v.createdAt).toLocaleDateString(),
        valuePerShare: v.valuePerShare,
        probWeighted: v.probabilityWeightedValue,
      }));
  }, [versions]);

  const handleSendToIc = () => {
    if (!model || !onSendToCommittee) return;
    const bear = model.scenarios.find((s) => s.name === "bear");
    const bull = model.scenarios.find((s) => s.name === "bull");
    const y1 = model.forecast[0];
    const prompt = [
      `Evaluate ${model.name} (${model.ticker}, ${model.templateId} template) using its ThesisLens Three-Statement Valuation Model.`,
      `Valuation: Base ${model.currency} ${model.valuation.valuePerShare.toFixed(2)}/share (Bear ${bear?.valuePerShare.toFixed(2)} / Bull ${bull?.valuePerShare.toFixed(2)}, Prob-Weighted ${model.valuation.probabilityWeightedValue.toFixed(2)}).`,
      model.valuation.currentPrice
        ? `Current Price: ${model.currency} ${model.valuation.currentPrice.toFixed(2)} (${fmtPct(model.valuation.upside)} implied upside/downside).`
        : "",
      `WACC / CoE: ${fmtPct(model.valuation.wacc, 2)}. ${y1 ? `${y1.period} Forecast: Revenue ${fmtB(y1.revenue)} (${fmtPct(y1.revenueGrowth)} YoY), EBIT Margin ${fmtPct(y1.ebitMargin)}, EPS ${y1.epsDiluted.toFixed(2)}.` : ""}`,
      model.sectorValuation ? `Sector Method (${model.sectorValuation.label}): ${model.sectorValuation.summary}` : "",
      model.analyst ? `AI Analyst Thesis: ${model.analyst.thesisSummary}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    onSendToCommittee({
      ticker: model.ticker,
      name: model.name,
      title: `${model.ticker} Three-Statement Valuation & IC Review`,
      thesisPrompt: prompt,
    });
  };

  return (
    <div className="space-y-5">
      {/* Control Bar */}
      <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-400" />
              <h1 className="page-title">Company valuation</h1>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                All 19 Sectors · SEC + Specialist Engines
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Linked three-statement models, FRED/Damodaran rates, specialist financial/real-asset engines, cited AI analyst overrides, and versioned price-target history.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-400">Ticker</label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && void runModel(ticker, false)}
                  placeholder="AAPL"
                  className="w-28 rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-2.5 font-mono text-xs font-bold text-white uppercase focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400">Current Price (opt.)</label>
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="e.g. 250"
                className="mt-1 w-28 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => void runModel(ticker, false)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading && loadingMode === "baseline" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              <span>Build Baseline</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => void runModel(ticker, true)}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
            >
              {loading && loadingMode === "analyst" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>Run AI Analyst</span>
            </button>
          </div>
        </div>

        {/* Quick Tickers */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_TICKERS.map((q) => (
            <button
              key={q.ticker}
              type="button"
              onClick={() => {
                setTicker(q.ticker);
                void runModel(q.ticker, false);
              }}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                ticker === q.ticker
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {!model && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-[#0b1220]/60 p-10 text-center">
          <Layers className="mx-auto h-10 w-10 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-300">Select a ticker and build a three-statement valuation model</p>
          <p className="mt-1 text-xs text-slate-500">
            Supports operating FCFF DCF plus specialist engines for Banks, Insurers, Asset Managers, REITs, Utilities, Commodities, Pharma rNPV, and Autos.
          </p>
        </div>
      )}

      {model && (
        <>
          {/* Valuation Headline + Bear/Base/Bull Toggle */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white">
                      {model.name} <span className="font-mono text-emerald-400">({model.ticker})</span>
                    </h3>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                      {model.templateId}
                    </span>
                    {model.sectorValuation && (
                      <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                        {model.sectorValuation.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Base {model.basePeriod} · Valuation Date {model.valuation.valuationDate} · Currency {model.currency}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingVersion}
                    onClick={() => void handleSaveVersion()}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{savingVersion ? "Saving..." : "Save Version"}</span>
                  </button>
                  {onSendToCommittee && (
                    <button
                      type="button"
                      onClick={handleSendToIc}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30"
                    >
                      <span>Send to IC Committee</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {saveMessage && (
                <p className="mt-2 text-xs text-emerald-300">{saveMessage}</p>
              )}

              {/* Bear / Base / Bull Toggle */}
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {model.scenarios.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setActiveScenario(s.name)}
                    className={`rounded-xl border p-3 text-left transition ${
                      activeScenario === s.name
                        ? s.name === "bull"
                          ? "border-emerald-500/60 bg-emerald-500/15"
                          : s.name === "bear"
                          ? "border-rose-500/60 bg-rose-500/15"
                          : "border-cyan-500/60 bg-cyan-500/15"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-slate-400">
                      <span>{s.name}</span>
                      <span>{(s.probability * 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 font-mono text-lg font-bold text-white">
                      {model.currency} {s.valuePerShare.toFixed(2)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">WACC {fmtPct(s.wacc, 2)}</div>
                  </button>
                ))}
              </div>

              {selectedScenarioObj && (
                <p className="mt-2.5 text-xs text-slate-400">
                  <strong className="uppercase text-slate-200">{selectedScenarioObj.name}:</strong> {selectedScenarioObj.description}
                </p>
              )}

              {model.sectorValuation && (
                <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                  <div className="text-xs font-semibold text-amber-200">{model.sectorValuation.label}</div>
                  <p className="mt-0.5 text-xs text-slate-300">{model.sectorValuation.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(model.sectorValuation.metrics).map(([k, val]) => (
                      <span key={k} className="rounded-md bg-slate-900/90 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                        {k}: <strong className="text-white">{String(val)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {model.analyst && (
                <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-200">
                    <Cpu className="h-3.5 w-3.5" />
                    <span>AI Analyst Thesis ({model.analyst.provider} · {model.analyst.citations.length} citations)</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-200">{model.analyst.thesisSummary}</p>
                  <div className="mt-1.5 text-[11px] text-slate-400">
                    Baseline {model.currency} {model.analyst.baselineValuePerShare.toFixed(2)} → Analyst {model.currency} {model.valuation.valuePerShare.toFixed(2)} · Rates: Rf {fmtPct(model.analyst.rates.riskFreeRate, 2)} ({model.analyst.rates.riskFreeSource})
                  </div>
                </div>
              )}
            </div>

            {/* Summary KPIs & Checks */}
            <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Prob-Weighted Target</span>
                <span className="font-mono text-lg font-bold text-emerald-300">
                  {model.currency} {model.valuation.probabilityWeightedValue.toFixed(2)}
                </span>
              </div>
              {model.valuation.currentPrice !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Current Price / Upside</span>
                  <span className={`font-mono font-bold ${(model.valuation.upside ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {model.currency} {model.valuation.currentPrice.toFixed(2)} ({(model.valuation.upside ?? 0) >= 0 ? "+" : ""}{fmtPct(model.valuation.upside)})
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-3 text-xs">
                <div>
                  <span className="text-slate-500">Enterprise Value</span>
                  <div className="font-mono font-semibold text-white">{fmtB(model.valuation.enterpriseValue)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Net Debt</span>
                  <div className="font-mono font-semibold text-white">{fmtB(model.valuation.netDebt)}</div>
                </div>
                <div>
                  <span className="text-slate-500">WACC / CoE</span>
                  <div className="font-mono font-semibold text-white">{fmtPct(model.valuation.wacc, 2)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Terminal Share</span>
                  <div className="font-mono font-semibold text-white">{fmtPct(model.valuation.terminalShareOfEv, 0)}</div>
                </div>
              </div>
              <div className="border-t border-slate-800 pt-3 space-y-1.5">
                {model.checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-1.5 text-[11px]">
                    <CheckCircle2
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        c.status === "pass" ? "text-emerald-400" : c.status === "warn" ? "text-amber-400" : "text-rose-400"
                      }`}
                    />
                    <span className="text-slate-300">{c.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Statement Grid, Quarters, Assumptions & Sensitivity */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
              {[
                { id: "statements", label: "Forecast Statements", icon: TrendingUp },
                { id: "quarters", label: "8-Quarter Outlook", icon: Layers },
                { id: "assumptions", label: `Assumptions & Citations (${model.assumptions.length})`, icon: BookOpen },
                { id: "sensitivity", label: "WACC × Growth Sensitivity", icon: Sparkles },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveGridTab(tab.id as typeof activeGridTab)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      activeGridTab === tab.id
                        ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {activeGridTab === "statements" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                      <th className="py-2 pr-3">Period</th>
                      <th className="py-2 px-3 text-right">Revenue</th>
                      <th className="py-2 px-3 text-right">YoY %</th>
                      <th className="py-2 px-3 text-right">EBIT</th>
                      <th className="py-2 px-3 text-right">EBIT %</th>
                      <th className="py-2 px-3 text-right">Net Inc</th>
                      <th className="py-2 px-3 text-right">EPS</th>
                      <th className="py-2 px-3 text-right">FCF</th>
                      <th className="py-2 pl-3 text-right">Net Debt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {model.history.map((h) => (
                      <tr key={h.periodId} className="bg-slate-950/30 text-slate-400">
                        <td className="py-2 pr-3 font-semibold text-slate-300">{h.periodId}</td>
                        <td className="py-2 px-3 text-right">{fmtB(h.revenue)}</td>
                        <td className="py-2 px-3 text-right">—</td>
                        <td className="py-2 px-3 text-right">{fmtB(h.ebit)}</td>
                        <td className="py-2 px-3 text-right">{h.ebit && h.revenue ? fmtPct(h.ebit / h.revenue) : "—"}</td>
                        <td className="py-2 px-3 text-right">{fmtB(h.netIncome)}</td>
                        <td className="py-2 px-3 text-right">{h.epsDiluted !== null ? h.epsDiluted.toFixed(2) : "—"}</td>
                        <td className="py-2 px-3 text-right">—</td>
                        <td className="py-2 pl-3 text-right">—</td>
                      </tr>
                    ))}
                    {model.forecast.map((f) => (
                      <tr key={f.period} className="text-slate-200 hover:bg-slate-900/50">
                        <td className="py-2 pr-3 font-semibold text-emerald-300">{f.period}</td>
                        <td className="py-2 px-3 text-right">{fmtB(f.revenue)}</td>
                        <td className="py-2 px-3 text-right">{fmtPct(f.revenueGrowth)}</td>
                        <td className="py-2 px-3 text-right">{fmtB(f.ebit)}</td>
                        <td className="py-2 px-3 text-right">{fmtPct(f.ebitMargin)}</td>
                        <td className="py-2 px-3 text-right">{fmtB(f.netIncome)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-white">{f.epsDiluted.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right">{fmtB(f.freeCashFlow)}</td>
                        <td className="py-2 pl-3 text-right">{fmtB(f.netDebt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeGridTab === "quarters" && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {model.quarterlyOutlook.map((q) => (
                  <div key={q.periodId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-white">{q.periodId}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          q.actual ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {q.actual ? "Actual" : "Est"}
                      </span>
                    </div>
                    <div className="mt-2 font-mono text-sm font-semibold text-slate-200">Rev {fmtB(q.revenue)}</div>
                    <div className="font-mono text-xs text-slate-400">EPS {q.epsDiluted.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}

            {activeGridTab === "assumptions" && (
              <div className="mt-4 space-y-2">
                {model.assumptions.map((n, idx) => (
                  <div key={`${n.key}_${idx}`} className="flex flex-col justify-between gap-1 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{n.key}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            n.source === "override"
                              ? "bg-cyan-500/20 text-cyan-300"
                              : n.source === "template"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {n.source}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{n.basis}</p>
                    </div>
                    <div className="font-mono text-sm font-bold text-emerald-300">{n.value}</div>
                  </div>
                ))}
              </div>
            )}

            {activeGridTab === "sensitivity" && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-center font-mono text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                      <th className="py-2 pr-3 text-left">WACC \ Terminal g</th>
                      {sensitivityMatrix.gs.map((g) => (
                        <th key={g} className="py-2 px-3">
                          {fmtPct(g, 2)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {sensitivityMatrix.waccs.map((w) => (
                      <tr key={w}>
                        <td className="py-2 pr-3 text-left font-semibold text-slate-300">{fmtPct(w, 2)}</td>
                        {sensitivityMatrix.gs.map((g) => {
                          const val = sensitivityMatrix.map.get(`${w}_${g}`);
                          const ref = model.valuation.currentPrice ?? model.valuation.valuePerShare;
                          const isAbove = typeof val === "number" && val >= ref;
                          return (
                            <td
                              key={g}
                              className={`py-2 px-3 font-semibold ${
                                isAbove ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
                              }`}
                            >
                              {typeof val === "number" ? `${model.currency} ${val.toFixed(2)}` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Price-Target History Across Saved Versions */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Price-Target History ({model.ticker})</h3>
              </div>
              <span className="text-xs text-slate-400">{versions.length} saved version(s)</span>
            </div>

            {versions.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                No saved versions yet for {model.ticker}. Click &ldquo;Save Version&rdquo; above (or run the nightly/filing jobs) to track target-price history over time.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="h-48 lg:col-span-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={versionChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="valuePerShare" name="Base Target" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="probWeighted" name="Prob-Weighted" stroke="#22d3ee" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => void handleReopenVersion(v.id)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-xs hover:border-cyan-500/40"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          v{v.versionNumber} · {v.modelType} ({v.triggerType})
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(v.createdAt).toLocaleDateString()} · {v.citationCount} citations
                        </div>
                      </div>
                      <div className="font-mono font-bold text-emerald-300">
                        {v.currency} {v.valuePerShare.toFixed(2)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
