"use client";

import React from "react";
import {
  Award,
  TrendingUp,
  AlertTriangle,
  Zap,
  BookmarkPlus,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Scale,
  Compass,
  ListChecks,
} from "lucide-react";
import { ActionRating, CioInvestmentMemo } from "@/lib/types";

interface CioMemoDashboardProps {
  memo: CioInvestmentMemo;
  mode: "live-gemini" | "demo-simulation";
  modelUsed: string;
  onSaveMemo: () => void;
  savedStatus: "idle" | "saving" | "saved-firestore" | "saved-local";
}

const RATING_COLORS: Record<ActionRating, string> = {
  "STRONG BUY": "border-emerald-400/50 bg-emerald-500/20 text-emerald-200",
  "STRONG BET": "border-violet-400/50 bg-violet-500/20 text-violet-200",
  BUY: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  HOLD: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  HEDGE: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
  TRIM: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  PASS: "border-slate-600 bg-slate-800 text-slate-300",
  AVOID: "border-rose-500/40 bg-rose-500/15 text-rose-300",
};

const ACTION_BADGE: Record<string, string> = {
  ADD: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  BET: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  HOLD: "bg-slate-800 text-slate-300 border-slate-700",
  TRIM: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  HEDGE: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  PASS: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function CioMemoDashboard({
  memo,
  mode,
  modelUsed,
  onSaveMemo,
  savedStatus,
}: CioMemoDashboardProps) {
  const scoreColor =
    memo.convictionScore >= 75
      ? "text-emerald-400"
      : memo.convictionScore >= 55
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-[#10192d] to-[#0b1220] p-5 shadow-2xl">
      {/* Top Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              <Award className="h-3 w-3" /> CIO Universal Investment &amp; Outcome Memo
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-[10px] text-slate-400">
              {mode === "live-gemini" ? `LIVE · ${modelUsed}` : modelUsed}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-bold tracking-tight text-white">
            {memo.headline}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
            {memo.executiveSummary}
          </p>
        </div>

        {/* Conviction Gauge + Rating */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span
              className={`rounded-lg border px-3 py-1 text-xs font-extrabold tracking-wider ${
                RATING_COLORS[memo.rating] || RATING_COLORS.HOLD
              }`}
            >
              {memo.rating}
            </span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`font-mono text-3xl font-black ${scoreColor}`}>
                {memo.convictionScore}
              </span>
              <span className="font-mono text-xs text-slate-500">/100</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Conviction Score
            </span>
          </div>

          <button
            type="button"
            onClick={onSaveMemo}
            disabled={savedStatus === "saving"}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-300"
          >
            {savedStatus === "saved-firestore" || savedStatus === "saved-local" ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  {savedStatus === "saved-firestore" ? "Saved to Firestore" : "Saved"}
                </span>
              </>
            ) : (
              <>
                <BookmarkPlus className="h-3.5 w-3.5 text-cyan-400" />
                <span>Save Memo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Valuation Verdict & Optimal Expression Stack */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              Quantitative Valuation Verdict
            </span>
            <p className="mt-0.5 text-xs text-slate-200">{memo.valuationVerdict}</p>
          </div>
        </div>

        {memo.recommendedExpressionSummary && (
          <div className="flex items-start gap-2.5 rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
            <Compass className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                Recommended Expression Stack &amp; Kelly Sizing
              </span>
              <p className="mt-0.5 text-xs text-slate-200">
                {memo.recommendedExpressionSummary}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bull vs Bear Grid */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
            <TrendingUp className="h-4 w-4" />
            <span>Bull Case &amp; Asymmetric Drivers</span>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-200">
            {memo.bullThesisHighlights.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            <span>Bear Risk &amp; Microstructure Flags</span>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-200">
            {memo.bearRiskFlags.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <ArrowDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Venue Access & Execution Checklist */}
      {memo.accessChecklist && memo.accessChecklist.length > 0 && (
        <div className="mt-4 rounded-xl border border-teal-500/25 bg-teal-500/5 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-teal-300">
            <ListChecks className="h-4 w-4" />
            <span>Venue Access &amp; Execution Playbook</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            {memo.accessChecklist.map((item, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-800/90 bg-slate-950/70 p-2.5 text-[11px]"
              >
                <div className="font-semibold text-white">{item.step}</div>
                <div className="mt-1 font-mono text-[10px] text-cyan-300">
                  {item.venue}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {item.accountNote}
                </div>
                <div className="mt-1.5 border-t border-slate-800 pt-1 text-[10px] text-rose-300/90">
                  Invalidation: {item.invalidationTrigger}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catalysts */}
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
          <Zap className="h-4 w-4" />
          <span>Key Catalysts &amp; Resolution Milestones</span>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {memo.catalysts.map((cat, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5 text-[11px] leading-relaxed text-slate-300"
            >
              {cat}
            </div>
          ))}
        </div>
      </div>

      {/* Rebalance Plan Table */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-white">
          <Shield className="h-4 w-4 text-emerald-400" />
          <span>Actionable Position-Sizing &amp; Rebalance Plan</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Instrument</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target Wt</th>
                <th className="px-3 py-2">CIO Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
              {memo.rebalancePlan.map((row, idx) => (
                <tr key={`${row.ticker}-${idx}`} className="hover:bg-slate-900/40">
                  <td className="px-3 py-2 font-mono font-bold text-white">
                    {row.ticker}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${
                        ACTION_BADGE[row.action] || ACTION_BADGE.HOLD
                      }`}
                    >
                      {row.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-200">
                    {row.targetWeightPct}%
                  </td>
                  <td className="px-3 py-2 text-slate-300">{row.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[11px] italic text-slate-400">
        {memo.timeHorizonNote} — For educational &amp; research purposes; not registered financial advice.
      </p>
    </div>
  );
}
