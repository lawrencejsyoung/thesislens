"use client";

import React from "react";
import {
  Compass,
  ExternalLink,
  Globe2,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import { ExpressionVehicle, Jurisdiction } from "@/lib/types";

interface AccessExpressionMatrixProps {
  vehicles: ExpressionVehicle[];
  jurisdiction: Jurisdiction;
  outcomeQuestion?: string;
}

const ASSET_BADGE: Record<string, string> = {
  prediction_market: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  option: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  equity: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  etf: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  real_estate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  private_venture: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  fixed_income: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  commodity_future: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  crypto: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  custom_outcome: "bg-slate-800 text-slate-300 border-slate-700",
};

function ScoreBar({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-semibold text-slate-200">{value}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${Math.min(100, Math.max(4, value))}%` }}
        />
      </div>
    </div>
  );
}

export function AccessExpressionMatrix({
  vehicles,
  jurisdiction,
  outcomeQuestion,
}: AccessExpressionMatrixProps) {
  if (!vehicles || vehicles.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-[var(--surface)] p-4 shadow-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">
              Market Access &amp; Expression Matrix — Every Way to Bet on This Outcome
            </h2>
          </div>
          {outcomeQuestion && (
            <p className="mt-0.5 text-xs text-slate-400">
              Ranked cross-venue pathways for <span className="text-slate-200">&ldquo;{outcomeQuestion}&rdquo;</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
          <Globe2 className="h-3.5 w-3.5" />
          <span>{jurisdiction} Access Lens</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((v, idx) => (
          <div
            key={v.id}
            className={`flex flex-col justify-between rounded-xl border p-3.5 transition ${
              idx === 0
                ? "border-emerald-500/45 bg-emerald-500/[0.06]"
                : "border-slate-800 bg-slate-950/70 hover:border-slate-700"
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                      ASSET_BADGE[v.assetClass] || ASSET_BADGE.custom_outcome
                    }`}
                  >
                    {v.assetClass.replace("_", " ")}
                  </span>
                  {v.dataProvenance === "LIVE" && (
                    <span className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300">
                      <Sparkles className="h-2.5 w-2.5" /> LIVE ODDS
                    </span>
                  )}
                </div>
                <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                  Kelly &le; {v.recommendedKellyPct}%
                </span>
              </div>

              <h3 className="mt-2 text-xs font-bold text-white">{v.name}</h3>
              <p className="mt-0.5 text-[11px] font-medium text-cyan-300">
                {v.venue} · <span className="text-slate-400">{v.jurisdictionAccess}</span>
              </p>

              <p className="mt-2 rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-1.5 font-mono text-[11px] text-slate-200">
                {v.instrumentSummary}
              </p>

              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-emerald-300">
                  <Zap className="h-3 w-3" /> {v.impliedProbabilityOrReturn}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Fee/Vig ~{v.estimatedFeeOrVigPct}%
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                <ScoreBar
                  label="Capital Efficiency"
                  value={v.capitalEfficiencyScore}
                  colorClass="bg-emerald-400"
                />
                <ScoreBar
                  label="Convexity / Asymmetry"
                  value={v.convexityScore}
                  colorClass="bg-cyan-400"
                />
                <ScoreBar
                  label="Liquidity"
                  value={v.liquidityScore}
                  colorClass="bg-violet-400"
                />
              </div>
            </div>

            <div className="mt-3 border-t border-slate-800/80 pt-2">
              <div className="flex items-start gap-1.5 text-[10px] leading-relaxed text-rose-300/90">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-rose-400" />
                <span>{v.keyRisk}</span>
              </div>
              {v.accessUrl && /^https?:\/\//i.test(v.accessUrl.trim()) && (
                <a
                  href={v.accessUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-400 hover:text-cyan-300"
                >
                  Inspect Venue <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
