"use client";

import React, { useRef } from "react";
import {
  Play,
  Upload,
  Plus,
  Trash2,
  Sparkles,
  FileImage,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { AnalysisRequestPayload, Holding, RiskProfile } from "@/lib/types";
import { PRESET_SCENARIOS } from "@/lib/demo-scenarios";

interface InputWorkbenchProps {
  payload: AnalysisRequestPayload;
  onChange: (next: AnalysisRequestPayload) => void;
  onRun: () => void;
  isRunning: boolean;
  activePresetId: string | null;
  onSelectPreset: (id: string) => void;
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
];

export function InputWorkbench({
  payload,
  onChange,
  onRun,
  isRunning,
  activePresetId,
  onSelectPreset,
}: InputWorkbenchProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const totalWeight = payload.holdings.reduce((s, h) => s + (Number(h.weightPct) || 0), 0);

  const updateHolding = (index: number, patch: Partial<Holding>) => {
    const next = payload.holdings.map((h, i) => (i === index ? { ...h, ...patch } : h));
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      onChange({
        ...payload,
        attachmentBase64: base64,
        attachmentMimeType: file.type || "image/png",
        attachmentName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/90 bg-[#0d1424] p-4 shadow-xl">
      {/* Preset Selector */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Hackathon Demo Scenarios
          </span>
          <span className="text-[11px] text-emerald-400">1-Click Load</span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {PRESET_SCENARIOS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                className={`rounded-xl border p-2.5 text-left transition ${
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
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
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

      {/* Investment Thesis Input */}
      <div className="border-t border-slate-800/80 pt-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Investment Thesis / Question
        </label>
        <input
          type="text"
          value={payload.title}
          onChange={(e) => onChange({ ...payload, title: e.target.value })}
          className="mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none"
          placeholder="Portfolio or Stock Thesis Title"
        />
        <textarea
          rows={3}
          value={payload.thesisPrompt}
          onChange={(e) => onChange({ ...payload, thesisPrompt: e.target.value })}
          className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs leading-relaxed text-slate-200 focus:border-emerald-500 focus:outline-none"
          placeholder="Describe your investment thesis, macro concerns, or valuation question..."
        />
      </div>

      {/* Multimodal Attachment */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Multimodal Filing / Chart (Gemini Vision)
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
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-3 py-2.5 text-xs text-slate-400 transition hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Earnings Slide, Brokerage Screenshot, or 10-K PDF</span>
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
                onChange({ ...payload, capital: Math.max(1000, Number(e.target.value) || 0) })
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

      {/* Portfolio Holdings Editor */}
      <div className="border-t border-slate-800/80 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Portfolio Holdings ({payload.holdings.length})
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-[11px] font-semibold ${
                Math.abs(totalWeight - 100) < 0.5 ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              Sum: {totalWeight.toFixed(0)}%
            </span>
            <button
              type="button"
              onClick={addHolding}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>

        <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
          {payload.holdings.map((h, idx) => (
            <div
              key={`${h.ticker}-${idx}`}
              className="grid grid-cols-12 items-center gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/70 p-1.5"
            >
              <input
                type="text"
                value={h.ticker}
                onChange={(e) =>
                  updateHolding(idx, { ticker: e.target.value.toUpperCase() })
                }
                className="col-span-3 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 font-mono text-[11px] font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none"
                placeholder="TICKER"
              />
              <select
                value={h.sector}
                onChange={(e) =>
                  updateHolding(idx, {
                    sector: e.target.value as Holding["sector"],
                  })
                }
                className="col-span-5 rounded border border-slate-800 bg-slate-900 px-1.5 py-1 text-[10px] text-slate-300 focus:border-emerald-500 focus:outline-none"
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
                  value={h.weightPct}
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
                title="Remove holding"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
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
            <span>Convening Gemini Committee...</span>
          </>
        ) : (
          <>
            <Play className="h-4 w-4 fill-slate-950" />
            <span>Run Multi-Agent Investment Committee</span>
          </>
        )}
      </button>
    </div>
  );
}
