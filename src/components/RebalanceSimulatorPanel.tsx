"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ArrowRightLeft,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  X,
} from "lucide-react";
import {
  ExperienceTier,
  Holding,
  RebalanceAccountWrapper,
  RebalanceSimulationOptions,
  RebalanceSimulationResult,
  TaxResidencyId,
} from "@/lib/types";
import { TAX_RESIDENCY_PROFILES } from "@/lib/quant-engine";

interface RebalanceSimulatorPanelProps {
  simulation: RebalanceSimulationResult;
  options: RebalanceSimulationOptions;
  onChangeOptions: (next: RebalanceSimulationOptions) => void;
  onApplyRebalance: (proposedHoldings: Holding[]) => void;
  onClose?: () => void;
  appliedSuccess?: boolean;
  experienceTier: ExperienceTier;
}

const RESIDENCY_OPTIONS: { id: TaxResidencyId; label: string }[] = Object.values(
  TAX_RESIDENCY_PROFILES
).map((p) => ({ id: p.id, label: p.label }));

function fmtUsd(val: number): string {
  const sign = val < 0 ? "-" : "";
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function DeltaPill({
  value,
  suffix = "",
  goodWhenPositive = true,
}: {
  value: number;
  suffix?: string;
  goodWhenPositive?: boolean;
}) {
  const isGood = goodWhenPositive ? value > 0 : value < 0;
  const isNeutral = Math.abs(value) < 0.005;
  const cls = isNeutral
    ? "border-slate-700 bg-slate-800/80 text-slate-300"
    : isGood
    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
    : "border-rose-500/40 bg-rose-500/15 text-rose-300";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${cls}`}
    >
      {!isNeutral &&
        (value > 0 ? (
          <TrendingUp className="h-2.5 w-2.5" />
        ) : (
          <TrendingDown className="h-2.5 w-2.5" />
        ))}
      {value > 0 ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

export function RebalanceSimulatorPanel({
  simulation,
  options,
  onChangeOptions,
  onApplyRebalance,
  onClose,
  appliedSuccess = false,
  experienceTier,
}: RebalanceSimulatorPanelProps) {
  const { beforeMetrics, afterMetrics, deltas, taxImpact, positionDeltas } = simulation;

  const chartData = positionDeltas.map((p) => ({
    ticker: p.ticker,
    Current: p.currentWeightPct,
    Target: p.targetWeightPct,
  }));

  const verdictBadge =
    taxImpact.verdict === "TAX_FREE_WRAPPER"
      ? {
          cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
          label: "Tax-Free Wrapper · Execute Immediately",
          icon: ShieldCheck,
        }
      : taxImpact.verdict === "TAX_EFFICIENT"
      ? {
          cls: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
          label: "Tax-Efficient Rebalance",
          icon: CheckCircle2,
        }
      : {
          cls: "border-amber-500/40 bg-amber-500/15 text-amber-200",
          label: "Steep Tax Drag · Prefer New Cash Flows",
          icon: AlertTriangle,
        };

  const VerdictIcon = verdictBadge.icon;

  return (
    <div className="rounded-2xl border border-cyan-500/35 bg-gradient-to-b from-[var(--raised)] to-[var(--surface)] p-5 shadow-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/90 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-cyan-500/35 bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
              <ArrowRightLeft className="h-3 w-3" /> Before vs. After Rebalance Sandbox
            </span>
            <span
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${verdictBadge.cls}`}
            >
              <VerdictIcon className="h-3 w-3" /> {verdictBadge.label}
            </span>
          </div>
          <h3 className="mt-1.5 text-base font-bold text-white">
            Tax-Aware CIO Rebalance Impact Simulator
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {taxImpact.verdictExplanation}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={appliedSuccess}
            onClick={() => onApplyRebalance(simulation.proposedHoldings)}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
              appliedSuccess
                ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                : "border-emerald-500/50 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110"
            }`}
          >
            {appliedSuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Applied to draft</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Apply weights to draft</span>
              </>
            )}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close rebalance simulator"
              className="rounded-lg border border-slate-700/80 bg-slate-900/80 p-2 text-slate-400 transition hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tax Controls Bar */}
      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 md:grid-cols-3">
        <div>
          <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <Landmark className="h-3 w-3 text-cyan-400" /> Tax Residency
          </label>
          <select
            value={options.residencyId}
            onChange={(e) =>
              onChangeOptions({
                ...options,
                residencyId: e.target.value as TaxResidencyId,
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            {RESIDENCY_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Account Wrapper
          </span>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {(
              [
                { id: "taxable", label: "Taxable" },
                { id: "tax_sheltered", label: "Tax-Sheltered" },
              ] as { id: RebalanceAccountWrapper; label: string }[]
            ).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() =>
                  onChangeOptions({ ...options, accountWrapper: w.id })
                }
                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                  options.accountWrapper === w.id
                    ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                    : "border-slate-700/80 bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Assumed Unrealized Gain</span>
            <span className="font-mono text-cyan-300">
              {options.assumedUnrealizedGainPct}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={80}
            step={5}
            value={options.assumedUnrealizedGainPct}
            disabled={options.accountWrapper === "tax_sheltered"}
            onChange={(e) =>
              onChangeOptions({
                ...options,
                assumedUnrealizedGainPct: Number(e.target.value),
              })
            }
            className="mt-2.5 w-full accent-cyan-400 disabled:opacity-40"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0% (At Cost)</span>
            <span>LTCG: {taxImpact.ltcgRatePct}%</span>
            <span>80% (Big Winner)</span>
          </div>
        </div>
      </div>

      {/* Before vs After KPI Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Expected Return
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-sm text-slate-500 line-through">
              {beforeMetrics.expectedAnnualReturnPct}%
            </span>
            <span className="font-mono text-lg font-bold text-white">
              {afterMetrics.expectedAnnualReturnPct}%
            </span>
          </div>
          <div className="mt-1">
            <DeltaPill value={deltas.expectedReturnDeltaPct} suffix="%" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Sharpe Ratio
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-sm text-slate-500 line-through">
              {beforeMetrics.sharpeRatio}
            </span>
            <span className="font-mono text-lg font-bold text-white">
              {afterMetrics.sharpeRatio}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <DeltaPill value={deltas.sharpeDelta} />
            {experienceTier === "prosumer" && (
              <span className="text-[10px] text-slate-500">return/risk</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Volatility / Max DD
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-sm text-slate-500 line-through">
              {beforeMetrics.annualVolatilityPct}%
            </span>
            <span className="font-mono text-lg font-bold text-white">
              {afterMetrics.annualVolatilityPct}%
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <DeltaPill
              value={deltas.volatilityDeltaPct}
              suffix="%"
              goodWhenPositive={false}
            />
            <span className="font-mono text-[10px] text-slate-400">
              DD {deltas.maxDrawdownDeltaPct > 0 ? "+" : ""}
              {deltas.maxDrawdownDeltaPct}%
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Median Ending Wealth
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-white">
            {fmtUsd(simulation.afterMonteCarlo.medianEndingValue)}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`font-mono text-[10px] font-bold ${
                deltas.medianEndingValueDeltaUsd >= 0
                  ? "text-emerald-300"
                  : "text-rose-300"
              }`}
            >
              {deltas.medianEndingValueDeltaUsd >= 0 ? "+" : ""}
              {fmtUsd(deltas.medianEndingValueDeltaUsd)} vs current
            </span>
          </div>
        </div>

        <div className="col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 lg:col-span-1">
          <div className="text-[10px] uppercase tracking-wider text-amber-300">
            Est. Cap Gains Tax Drag
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-white">
            {fmtUsd(taxImpact.totalTaxDragUsd)}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-300">
            <span className="font-mono">{taxImpact.taxDragBps} bps</span>
            <span>
              {taxImpact.paybackMonths === 0
                ? "Instant"
                : taxImpact.paybackMonths !== null
                ? `~${taxImpact.paybackMonths}m payback`
                : "No alpha offset"}
            </span>
          </div>
        </div>
      </div>

      {/* Allocation Bar Chart + Trade & Tax Ticket Table */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 xl:col-span-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              Allocation Shift (Current vs. CIO Target %)
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              Turnover: {taxImpact.totalTurnoverPct}%
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="ticker"
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  axisLine={{ stroke: "#334155" }}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  axisLine={{ stroke: "#334155" }}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    fontSize: "11px",
                    borderRadius: "8px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="Current" fill="#64748b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Target" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 xl:col-span-7">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/90 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Current → Target</th>
                <th className="px-3 py-2">Trade ($)</th>
                <th className="px-3 py-2">Est. Tax Drag</th>
                {experienceTier === "institutional" && (
                  <th className="px-3 py-2">Realized Gain</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {positionDeltas.map((p) => (
                <tr key={p.ticker} className="hover:bg-slate-900/40">
                  <td className="px-3 py-2 font-mono font-bold text-white">
                    {p.ticker}
                    <div className="font-sans text-[10px] font-normal text-slate-400">
                      {p.action}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-200">
                    {p.currentWeightPct}% →{" "}
                    <span className="font-bold text-cyan-300">
                      {p.targetWeightPct}%
                    </span>
                    <span
                      className={`ml-1.5 text-[10px] ${
                        p.deltaWeightPct > 0
                          ? "text-emerald-400"
                          : p.deltaWeightPct < 0
                          ? "text-amber-400"
                          : "text-slate-500"
                      }`}
                    >
                      ({p.deltaWeightPct > 0 ? "+" : ""}
                      {p.deltaWeightPct}%)
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 font-mono font-semibold ${
                      p.tradeDollarAmount > 0
                        ? "text-emerald-300"
                        : p.tradeDollarAmount < 0
                        ? "text-amber-300"
                        : "text-slate-500"
                    }`}
                  >
                    {p.tradeDollarAmount > 0 ? "+" : ""}
                    {fmtUsd(p.tradeDollarAmount)}
                  </td>
                  <td className="px-3 py-2 font-mono text-rose-300">
                    {p.estimatedTaxDragUsd > 0
                      ? `-${fmtUsd(p.estimatedTaxDragUsd)}`
                      : "$0"}
                  </td>
                  {experienceTier === "institutional" && (
                    <td className="px-3 py-2 font-mono text-slate-400">
                      {p.estimatedRealizedGainUsd > 0
                        ? fmtUsd(p.estimatedRealizedGainUsd)
                        : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
