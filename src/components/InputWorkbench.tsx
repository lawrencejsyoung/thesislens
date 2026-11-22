"use client";

import React, { useRef, useState } from "react";
import {
  Play,
  Upload,
  Plus,
  Trash2,
  Sparkles,
  FileImage,
  FileUp,
  X,
  SlidersHorizontal,
  Search,
  Globe2,
  Compass,
} from "lucide-react";
import {
  PortfolioImportApplyPayload,
  PortfolioImporterModal,
} from "./PortfolioImporterModal";
import {
  AnalysisMode,
  AnalysisRequestPayload,
  ExperienceTier,
  Holding,
  Jurisdiction,
  LiveMarketQuote,
  OptionStrategyType,
  RealEstatePropertyClass,
  RiskProfile,
} from "@/lib/types";
import { PRESET_SCENARIOS } from "@/lib/demo-scenarios";
import {
  buildRealEstatePresetInputs,
  REAL_ESTATE_CLASSES,
  REAL_ESTATE_MARKETS,
} from "@/lib/quant-engine";

interface InputWorkbenchProps {
  payload: AnalysisRequestPayload;
  onChange: (next: AnalysisRequestPayload) => void;
  onRun: () => void;
  isRunning: boolean;
  activePresetId: string | null;
  onSelectPreset: (id: string) => void;
  experienceTier?: ExperienceTier;
}

const SECTORS: Holding["sector"][] = [
  "Technology",
  "Mining & Materials",
  "Energy",
  "Financials",
  "Healthcare",
  "Industrials",
  "Fixed Income",
  "Consumer",
  "Real Estate",
  "Crypto & Digital",
  "Event Contract",
  "Venture / Private",
];

const MODES: { id: AnalysisMode; label: string }[] = [
  { id: "hedge_fund", label: "$100M Fund" },
  { id: "any_outcome", label: "Any Outcome" },
  { id: "portfolio", label: "Portfolio" },
  { id: "prediction", label: "Prediction" },
  { id: "options", label: "Options" },
  { id: "real_assets", label: "Real Assets" },
  { id: "venture", label: "Venture" },
];

export function InputWorkbench({
  payload,
  onChange,
  onRun,
  isRunning,
  activePresetId,
  onSelectPreset,
  experienceTier = "prosumer",
}: InputWorkbenchProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [marketQuery, setMarketQuery] = useState("");
  const [marketResults, setMarketResults] = useState<LiveMarketQuote[]>([]);
  const [searchingMarkets, setSearchingMarkets] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);

  const activeMode: AnalysisMode = payload.analysisMode ?? "portfolio";
  const jurisdiction: Jurisdiction = payload.jurisdiction ?? "Canada";
  const hasShorts = payload.holdings.some((h) => h.side === "SHORT" || h.weightPct < 0);
  const grossExposure = payload.holdings.reduce(
    (s, h) => s + Math.abs(Number(h.weightPct) || 0),
    0
  );
  const netExposure = payload.holdings.reduce((s, h) => {
    const absW = Math.abs(Number(h.weightPct) || 0);
    return s + (h.side === "SHORT" || h.weightPct < 0 ? -absW : absW);
  }, 0);
  const totalWeight = grossExposure;

  const handleModeSwitch = (nextMode: AnalysisMode) => {
    const patch: Partial<AnalysisRequestPayload> = { analysisMode: nextMode };
    if (
      (nextMode === "prediction" || nextMode === "any_outcome") &&
      !payload.predictionInputs
    ) {
      patch.predictionInputs = {
        question: payload.title,
        venue: "Polymarket",
        side: "YES",
        yesPriceCents: 40,
        noPriceCents: 62,
        estimatedTrueProbPct: 55,
        feePct: 1.5,
        oracleRiskHaircutPct: 10,
        stakeCapital: payload.capital,
        resolutionDate: "2027-12-31",
      };
    }
    if (
      (nextMode === "options" || nextMode === "any_outcome") &&
      !payload.optionInputs
    ) {
      patch.optionInputs = {
        underlying: payload.dcfInputs.ticker,
        strategy: "bull_call_spread",
        spotPrice: payload.dcfInputs.currentPrice,
        strikePrice: Math.round(payload.dcfInputs.currentPrice * 1.02),
        upperStrikePrice: Math.round(payload.dcfInputs.currentPrice * 1.22),
        daysToExpiry: 150,
        impliedVolatilityPct: 40,
        riskFreeRatePct: 4.2,
        contracts: 5,
      };
    }
    if (nextMode === "real_assets" && !payload.realEstateInputs) {
      patch.realEstateInputs = buildRealEstatePresetInputs(
        "small_multifamily",
        "sudbury-on",
        680000
      );
    }
    if (nextMode === "venture" && !payload.ventureInputs) {
      patch.ventureInputs = {
        companyName: "Seed AI Startup SAFE",
        stage: "Seed",
        investmentAmount: 25000,
        valuationCap: 15000000,
        expectedDilutionPct: 45,
        failureProbPct: 58,
        modestExitProbPct: 24,
        breakoutProbPct: 13,
        powerLawProbPct: 5,
        holdYears: 8,
      };
    }
    onChange({ ...payload, ...patch });
  };

  const searchMarkets = async () => {
    setSearchingMarkets(true);
    try {
      const res = await fetch(
        `/api/markets?q=${encodeURIComponent(marketQuery || payload.title)}`
      );
      const data = await res.json();
      setMarketResults(Array.isArray(data.markets) ? data.markets : []);
    } catch {
      setMarketResults([]);
    } finally {
      setSearchingMarkets(false);
    }
  };

  const importMarketQuote = (m: LiveMarketQuote) => {
    onChange({
      ...payload,
      analysisMode: activeMode === "portfolio" ? "prediction" : activeMode,
      title: m.question,
      thesisPrompt: `Evaluate whether buying YES @ ${m.yesPriceCents}¢ on ${m.venue} ("${m.question}") is +EV, compare against liquid equity/options proxies for a ${jurisdiction} investor, and compute Risk-Adjusted Kelly sizing.`,
      predictionInputs: {
        question: m.question,
        venue: m.venue,
        side: "YES",
        yesPriceCents: m.yesPriceCents,
        noPriceCents: m.noPriceCents,
        estimatedTrueProbPct: Math.min(95, m.yesPriceCents + 12),
        feePct: m.venue === "Kalshi" ? 1.0 : 1.5,
        oracleRiskHaircutPct: m.venue === "Kalshi" ? 5 : 10,
        stakeCapital: payload.capital,
        resolutionDate: m.endDate,
      },
    });
    setMarketResults([]);
  };

  const updateHolding = (index: number, patch: Partial<Holding>) => {
    const next = payload.holdings.map((h, i) =>
      i === index ? { ...h, ...patch } : h
    );
    onChange({ ...payload, holdings: next });
  };

  const addHolding = () => {
    const next: Holding = {
      ticker: "MSFT",
      name: "Microsoft Corp.",
      sector: "Technology",
      weightPct: 10,
      currentPrice: 425,
      beta: 1.05,
      expectedAnnualReturnPct: 12.0,
      annualVolatilityPct: 23,
      dividendYieldPct: 0.7,
    };
    onChange({ ...payload, holdings: [...payload.holdings, next] });
  };

  const removeHolding = (index: number) => {
    if (payload.holdings.length <= 1) return;
    onChange({
      ...payload,
      holdings: payload.holdings.filter((_, i) => i !== index),
    });
  };

  const handleApplyPortfolioImport = (data: PortfolioImportApplyPayload) => {
    const nextHoldings =
      data.mode === "append"
        ? [...payload.holdings, ...data.holdings]
        : data.holdings;

    const patch: Partial<AnalysisRequestPayload> = {
      holdings: nextHoldings,
    };

    if (data.mode === "replace" && data.applyMetadata) {
      if (data.inferredCapital && data.inferredCapital >= 1000) {
        patch.capital = data.inferredCapital;
      }
      if (data.metadata) {
        if (data.metadata.title) patch.title = data.metadata.title;
        if (data.metadata.thesisPrompt) patch.thesisPrompt = data.metadata.thesisPrompt;
        if (data.metadata.analysisMode) patch.analysisMode = data.metadata.analysisMode;
        if (data.metadata.jurisdiction) patch.jurisdiction = data.metadata.jurisdiction;
        if (data.metadata.capital !== undefined) patch.capital = data.metadata.capital;
        if (data.metadata.monthlyContribution !== undefined) {
          patch.monthlyContribution = data.metadata.monthlyContribution;
        }
        if (data.metadata.horizonYears !== undefined) {
          patch.horizonYears = data.metadata.horizonYears;
        }
        if (data.metadata.riskProfile) patch.riskProfile = data.metadata.riskProfile;
      }
    }

    onChange({ ...payload, ...patch });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/pdf",
    ]);
    if (!allowedTypes.has(file.type)) {
      e.target.value = "";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      onChange({
        ...payload,
        attachmentBase64: base64,
        attachmentMimeType: file.type,
        attachmentName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/90 bg-[#0d1424] p-4 shadow-xl">
      {/* Universal Showcase Scenarios */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Universal Outcome Presets
          </span>
          <span className="text-[11px] text-emerald-400">7 Modes · $100M CFA</span>
        </div>
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {PRESET_SCENARIOS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                className={`w-full rounded-xl border p-2.5 text-left transition ${
                  active
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">
                    {preset.label}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      active
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {preset.badge}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode & Jurisdiction Switcher */}
      <div className="border-t border-slate-800/80 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Compass className="h-3.5 w-3.5 text-cyan-400" />
            Valuation &amp; Bet Mode
          </span>
          <div className="flex items-center gap-1">
            <Globe2 className="h-3 w-3 text-slate-400" />
            <select
              value={jurisdiction}
              onChange={(e) =>
                onChange({
                  ...payload,
                  jurisdiction: e.target.value as Jurisdiction,
                })
              }
              className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="Canada">Canada</option>
              <option value="US">US</option>
              <option value="Global">Global</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleModeSwitch(m.id)}
              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
                activeMode === m.id
                  ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Prediction Market Search (Polymarket / Kalshi) */}
      {(activeMode === "any_outcome" || activeMode === "prediction") && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              Live Polymarket / Kalshi Lookup
            </span>
            <span className="text-[9px] text-slate-400">1-Click Import</span>
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={marketQuery}
              onChange={(e) => setMarketQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchMarkets()}
              placeholder="Search: copper, Fed, AI, recession..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[11px] text-white focus:border-violet-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={searchMarkets}
              disabled={searchingMarkets}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/30"
            >
              <Search className="h-3 w-3" />
              {searchingMarkets ? "..." : "Find"}
            </button>
          </div>
          {marketResults.length > 0 && (
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
              {marketResults.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => importMarketQuote(m)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/90 p-2 text-left transition hover:border-violet-400/50"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-bold text-violet-300">
                      {m.venue} {m.live ? "· LIVE" : "· DEMO"}
                    </span>
                    <span className="font-mono text-emerald-300">
                      YES {m.yesPriceCents}¢ / NO {m.noPriceCents}¢
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-200">
                    {m.question}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Investment Thesis / Future Outcome Input */}
      <div className="border-t border-slate-800/80 pt-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Future Outcome / Investment Thesis
        </label>
        <input
          type="text"
          value={payload.title}
          onChange={(e) => onChange({ ...payload, title: e.target.value })}
          className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none"
          placeholder="Any investment, deal, or future outcome question..."
        />
        <textarea
          rows={3}
          value={payload.thesisPrompt}
          onChange={(e) => onChange({ ...payload, thesisPrompt: e.target.value })}
          className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs leading-relaxed text-slate-200 focus:border-emerald-500 focus:outline-none"
          placeholder="Describe the thesis, odds, deal terms, or ask the workforce how to bet on this outcome..."
        />
      </div>

      {/* Mode-Specific Quick Deal Parameters */}
      {payload.predictionInputs &&
        (activeMode === "prediction" || activeMode === "any_outcome") && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              Event Contract Parameters
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-slate-400">YES Price (¢)</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={payload.predictionInputs.yesPriceCents}
                  onChange={(e) =>
                    onChange({
                      ...payload,
                      predictionInputs: {
                        ...payload.predictionInputs!,
                        yesPriceCents: Number(e.target.value) || 50,
                      },
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-white"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-400">True Prob (%)</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={payload.predictionInputs.estimatedTrueProbPct}
                  onChange={(e) =>
                    onChange({
                      ...payload,
                      predictionInputs: {
                        ...payload.predictionInputs!,
                        estimatedTrueProbPct: Number(e.target.value) || 50,
                      },
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-emerald-300"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-400">Side</label>
                <select
                  value={payload.predictionInputs.side}
                  onChange={(e) =>
                    onChange({
                      ...payload,
                      predictionInputs: {
                        ...payload.predictionInputs!,
                        side: e.target.value as "YES" | "NO",
                      },
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-white"
                >
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </select>
              </div>
            </div>
          </div>
        )}

      {payload.optionInputs && activeMode === "options" && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
            Options Strategy Parameters
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-[9px] text-slate-400">Strategy</label>
              <select
                value={payload.optionInputs.strategy}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    optionInputs: {
                      ...payload.optionInputs!,
                      strategy: e.target.value as OptionStrategyType,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-white"
              >
                <option value="bull_call_spread">Bull Call Spread</option>
                <option value="long_call">Long Call</option>
                <option value="long_put">Long Put</option>
                <option value="bear_put_spread">Bear Put Spread</option>
                <option value="long_straddle">Long Straddle (Volatility)</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-400">Strike ($)</label>
              <input
                type="number"
                value={payload.optionInputs.strikePrice}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    optionInputs: {
                      ...payload.optionInputs!,
                      strikePrice: Number(e.target.value) || 100,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-white"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-400">IV (%)</label>
              <input
                type="number"
                value={payload.optionInputs.impliedVolatilityPct}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    optionInputs: {
                      ...payload.optionInputs!,
                      impliedVolatilityPct: Number(e.target.value) || 35,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-cyan-300"
              />
            </div>
          </div>
        </div>
      )}

      {payload.realEstateInputs && activeMode === "real_assets" && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              Real Estate Deal Parameters
            </span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] uppercase text-cyan-300">
              {payload.realEstateInputs.category ?? "residential"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-slate-400">Property Class</label>
              <select
                value={payload.realEstateInputs.propertyClass ?? "small_multifamily"}
                onChange={(e) => {
                  const nextClass = e.target.value as RealEstatePropertyClass;
                  const nextMarket = payload.realEstateInputs?.marketId ?? "sudbury-on";
                  onChange({
                    ...payload,
                    realEstateInputs: buildRealEstatePresetInputs(nextClass, nextMarket),
                  });
                }}
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-white"
              >
                <optgroup label="Residential">
                  {REAL_ESTATE_CLASSES.filter((c) => c.category === "residential").map(
                    (c) => (
                      <option key={c.id} value={c.id}>
                        {c.shortLabel}
                      </option>
                    )
                  )}
                </optgroup>
                <optgroup label="Commercial">
                  {REAL_ESTATE_CLASSES.filter((c) => c.category === "commercial").map(
                    (c) => (
                      <option key={c.id} value={c.id}>
                        {c.shortLabel}
                      </option>
                    )
                  )}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-400">Market</label>
              <select
                value={payload.realEstateInputs.marketId ?? "sudbury-on"}
                onChange={(e) => {
                  const nextMarket = e.target.value;
                  const nextClass =
                    payload.realEstateInputs?.propertyClass ?? "small_multifamily";
                  onChange({
                    ...payload,
                    realEstateInputs: buildRealEstatePresetInputs(nextClass, nextMarket),
                  });
                }}
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-white"
              >
                {REAL_ESTATE_MARKETS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-slate-400">Price ($)</label>
              <input
                type="number"
                step={10000}
                value={payload.realEstateInputs.purchasePrice}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    realEstateInputs: {
                      ...payload.realEstateInputs!,
                      purchasePrice: Number(e.target.value) || 500000,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-white"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-400">Rent/Yr ($)</label>
              <input
                type="number"
                step={1200}
                value={payload.realEstateInputs.grossAnnualRent}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    realEstateInputs: {
                      ...payload.realEstateInputs!,
                      grossAnnualRent: Number(e.target.value) || 48000,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-emerald-300"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-400">Rate (%)</label>
              <input
                type="number"
                step={0.1}
                value={payload.realEstateInputs.mortgageRatePct}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    realEstateInputs: {
                      ...payload.realEstateInputs!,
                      mortgageRatePct: Number(e.target.value) || 5.0,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-amber-300"
              />
            </div>
          </div>
        </div>
      )}

      {payload.ventureInputs && activeMode === "venture" && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">
            Venture SAFE Parameters
          </span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-slate-400">Check ($)</label>
              <input
                type="number"
                step={5000}
                value={payload.ventureInputs.investmentAmount}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    ventureInputs: {
                      ...payload.ventureInputs!,
                      investmentAmount: Number(e.target.value) || 25000,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-white"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-400">Val Cap ($M)</label>
              <input
                type="number"
                step={1}
                value={Math.round(payload.ventureInputs.valuationCap / 1_000_000)}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    ventureInputs: {
                      ...payload.ventureInputs!,
                      valuationCap: (Number(e.target.value) || 10) * 1_000_000,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-fuchsia-300"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-400">Fail %</label>
              <input
                type="number"
                min={10}
                max={90}
                value={payload.ventureInputs.failureProbPct}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    ventureInputs: {
                      ...payload.ventureInputs!,
                      failureProbPct: Number(e.target.value) || 55,
                    },
                  })
                }
                className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-rose-300"
              />
            </div>
          </div>
        </div>
      )}

      {/* Multimodal Attachment */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Multimodal Deal / Chart Upload
          </span>
          <span className="text-[10px] text-slate-500">PNG, JPG, PDF</span>
        </div>

        {payload.attachmentName ? (
          <div className="flex items-center justify-between rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <FileImage className="h-4 w-4 shrink-0 text-cyan-400" />
              <span className="truncate text-xs text-cyan-200">
                {payload.attachmentName}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...payload,
                  attachmentBase64: undefined,
                  attachmentMimeType: undefined,
                  attachmentName: undefined,
                })
              }
              className="rounded p-1 text-cyan-300 hover:bg-cyan-500/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-400 transition hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Term Sheet, Odds Screenshot, Pro Forma, or 10-K</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Capital & Mandate Parameters */}
      <div className="border-t border-slate-800/80 pt-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
          <span>Investor Mandate</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[10px] text-slate-400">Initial Capital ($)</label>
            <input
              type="number"
              min={1000}
              step={1000}
              value={payload.capital}
              onChange={(e) =>
                onChange({
                  ...payload,
                  capital: Math.max(1000, Number(e.target.value) || 0),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Monthly Add ($)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={payload.monthlyContribution}
              onChange={(e) =>
                onChange({
                  ...payload,
                  monthlyContribution: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Horizon (Years)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={payload.horizonYears}
              onChange={(e) =>
                onChange({
                  ...payload,
                  horizonYears: Math.min(30, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Risk Profile</label>
            <select
              value={payload.riskProfile}
              onChange={(e) =>
                onChange({ ...payload, riskProfile: e.target.value as RiskProfile })
              }
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Multi-Asset Positions Editor */}
      <div className="border-t border-slate-800/80 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Positions ({payload.holdings.length})
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`font-mono text-[11px] font-semibold ${
                hasShorts
                  ? "text-cyan-300"
                  : Math.abs(totalWeight - 100) < 0.5
                  ? "text-emerald-400"
                  : "text-amber-400"
              }`}
            >
              {hasShorts
                ? `G:${grossExposure.toFixed(0)}% / N:${netExposure.toFixed(0)}%`
                : `Sum: ${totalWeight.toFixed(0)}%`}
            </span>
            <button
              type="button"
              onClick={() => setImporterOpen(true)}
              title="Import portfolio from CSV or JSON"
              className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-500/20"
            >
              <FileUp className="h-3 w-3" /> Import
            </button>
            <button
              type="button"
              onClick={addHolding}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>

        <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
          {payload.holdings.map((h, idx) => {
            const isShort = h.side === "SHORT" || h.weightPct < 0;
            const showShortToggle =
              experienceTier === "institutional" || activeMode === "hedge_fund" || hasShorts;
            return (
              <div
                key={`${h.ticker}-${idx}`}
                className="grid grid-cols-12 items-center gap-1 rounded-lg border border-slate-800/80 bg-slate-950/70 p-1.5"
              >
                {showShortToggle && (
                  <button
                    type="button"
                    onClick={() =>
                      updateHolding(idx, {
                        side: isShort ? "LONG" : "SHORT",
                        weightPct: Math.abs(h.weightPct),
                      })
                    }
                    title="Toggle LONG / SHORT"
                    className={`col-span-1 rounded border py-1 text-center font-mono text-[10px] font-bold transition ${
                      isShort
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                        : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {isShort ? "S" : "L"}
                  </button>
                )}
                <input
                  type="text"
                  value={h.ticker}
                  onChange={(e) =>
                    updateHolding(idx, { ticker: e.target.value.toUpperCase() })
                  }
                  className={`${
                    showShortToggle ? "col-span-3" : "col-span-4"
                  } rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[10px] font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none`}
                  placeholder="TICKER"
                />
                <select
                  value={h.sector}
                  onChange={(e) =>
                    updateHolding(idx, {
                      sector: e.target.value as Holding["sector"],
                    })
                  }
                  className="col-span-4 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300 focus:border-emerald-500 focus:outline-none"
                >
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <div className="col-span-3 flex items-center rounded border border-slate-800 bg-slate-900 px-1.5 py-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.abs(h.weightPct)}
                    onChange={(e) =>
                      updateHolding(idx, { weightPct: Number(e.target.value) || 0 })
                    }
                    className="w-full bg-transparent font-mono text-[11px] text-white focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeHolding(idx)}
                  className="col-span-1 flex justify-center text-slate-500 hover:text-rose-400"
                  title="Remove position"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Run Button */}
      <button
        type="button"
        disabled={isRunning}
        onClick={onRun}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? (
          <>
            <Sparkles className="h-4 w-4 animate-spin" />
            <span>Dispatching Universal Workforce...</span>
          </>
        ) : (
          <>
            <Play className="h-4 w-4 fill-slate-950" />
            <span>Run Universal Valuation Workforce</span>
          </>
        )}
      </button>

      <PortfolioImporterModal
        open={importerOpen}
        onClose={() => setImporterOpen(false)}
        currentPayload={payload}
        onApplyImport={handleApplyPortfolioImport}
      />
    </div>
  );
}
