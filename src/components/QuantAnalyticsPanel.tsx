"use client";

import React, { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  BarChart3,
  Calculator,
  Flame,
  PieChart,
} from "lucide-react";
import {
  DcfInputs,
  DcfResult,
  MacroShockScenarioResult,
  MonteCarloResult,
  PortfolioMetrics,
} from "@/lib/types";
import { runDcfValuation } from "@/lib/quant-engine";

interface QuantAnalyticsPanelProps {
  metrics: PortfolioMetrics;
  dcfResult: DcfResult;
  dcfInputs: DcfInputs;
  monteCarlo: MonteCarloResult;
  macroShocks: MacroShockScenarioResult[];
}

function fmtUsd(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

export function QuantAnalyticsPanel({
  metrics,
  dcfInputs,
  monteCarlo,
  macroShocks,
}: QuantAnalyticsPanelProps) {
  const [activeTab, setActiveTab] = useState<"montecarlo" | "macro" | "dcf">(
    "montecarlo"
  );

  // Interactive DCF slider overrides so judges can stress-test valuation live!
  const [waccOverride, setWaccOverride] = useState<number>(dcfInputs.waccPct);
  const [growthOverride, setGrowthOverride] = useState<number>(
    dcfInputs.revenueGrowthYear1To5Pct
  );
  const [terminalOverride, setTerminalOverride] = useState<number>(
    dcfInputs.terminalGrowthPct
  );

  // Sync sliders whenever a new scenario is loaded
  React.useEffect(() => {
    setWaccOverride(dcfInputs.waccPct);
    setGrowthOverride(dcfInputs.revenueGrowthYear1To5Pct);
    setTerminalOverride(dcfInputs.terminalGrowthPct);
  }, [dcfInputs.ticker, dcfInputs.waccPct, dcfInputs.revenueGrowthYear1To5Pct, dcfInputs.terminalGrowthPct]);

  const liveDcf = useMemo(
    () =>
      runDcfValuation({
        ...dcfInputs,
        waccPct: waccOverride,
        revenueGrowthYear1To5Pct: growthOverride,
        terminalGrowthPct: terminalOverride,
      }),
    [dcfInputs, waccOverride, growthOverride, terminalOverride]
  );

  const uniqueWacc = Array.from(new Set(liveDcf.sensitivityGrid.map((c) => c.waccPct)));
  const uniqueTg = Array.from(
    new Set(liveDcf.sensitivityGrid.map((c) => c.terminalGrowthPct))
  );

  return (
    <div className="space-y-4">
      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Expected CAGR"
          value={`${metrics.expectedAnnualReturnPct}%`}
          sub={`Div Yield ${metrics.weightedDividendYieldPct}%`}
          tone="emerald"
        />
        <KpiCard
          label="Annual Volatility"
          value={`${metrics.annualVolatilityPct}%`}
          sub={`Beta ${metrics.weightedBeta}`}
          tone="cyan"
        />
        <KpiCard
          label="Sharpe Ratio"
          value={`${metrics.sharpeRatio}`}
          sub="Risk-Adjusted"
          tone={metrics.sharpeRatio >= 0.55 ? "emerald" : "amber"}
        />
        <KpiCard
          label="Est. Max Drawdown"
          value={`-${metrics.estimatedMaxDrawdownPct}%`}
          sub="99% Tail Year"
          tone="rose"
        />
        <KpiCard
          label="Concentration HHI"
          value={`${metrics.concentrationHhi}`}
          sub={metrics.concentrationLabel}
          tone={metrics.concentrationHhi > 3000 ? "amber" : "emerald"}
        />
        <KpiCard
          label={`${liveDcf.ticker} DCF Fair Value`}
          value={`$${liveDcf.impliedSharePrice}`}
          sub={`${liveDcf.upsidePct >= 0 ? "+" : ""}${liveDcf.upsidePct}% vs $${liveDcf.currentPrice}`}
          tone={liveDcf.upsidePct >= 0 ? "emerald" : "rose"}
        />
      </div>

      {/* Main Chart Card with Tabs */}
      <div className="rounded-2xl border border-slate-800/90 bg-[#0d1424] p-4 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TabButton
              active={activeTab === "montecarlo"}
              onClick={() => setActiveTab("montecarlo")}
              icon={Activity}
              label="Monte Carlo Cone"
            />
            <TabButton
              active={activeTab === "macro"}
              onClick={() => setActiveTab("macro")}
              icon={Flame}
              label="Macro Shock Stress Test"
            />
            <TabButton
              active={activeTab === "dcf"}
              onClick={() => setActiveTab("dcf")}
              icon={Calculator}
              label={`Interactive DCF (${liveDcf.ticker})`}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Deterministic TypeScript Quant Engine</span>
          </div>
        </div>

        {/* TAB 1: MONTE CARLO */}
        {activeTab === "montecarlo" && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {monteCarlo.horizonYears}-Year Monte Carlo Wealth Projection ({monteCarlo.simulations} Paths)
                </h3>
                <p className="text-xs text-slate-400">
                  P10 Downside: <strong className="font-mono text-rose-300">{fmtUsd(monteCarlo.downsideP10Value)}</strong>{" "}
                  · Median (P50): <strong className="font-mono text-emerald-300">{fmtUsd(monteCarlo.medianEndingValue)}</strong>{" "}
                  · P90 Upside: <strong className="font-mono text-cyan-300">{fmtUsd(monteCarlo.upsideP90Value)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-emerald-300">
                  2x Odds: {monteCarlo.probabilityOfDoublingPct}%
                </span>
                <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-rose-300">
                  Loss Odds: {monteCarlo.probabilityOfLossPct}%
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monteCarlo.trajectory} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="p90Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="year"
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `Yr ${v}`}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => fmtUsd(Number(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0b1120",
                      borderColor: "#334155",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => [fmtUsd(value), name]}
                    labelFormatter={(label) => `Year ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="p90"
                    name="P90 Upside"
                    stroke="#22d3ee"
                    strokeWidth={1.5}
                    fill="url(#p90Grad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="p50"
                    name="P50 Median"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#p50Grad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="p10"
                    name="P10 Downside"
                    stroke="#fb7185"
                    strokeWidth={1.5}
                    fillOpacity={0}
                  />
                  <Area
                    type="monotone"
                    dataKey="contributed"
                    name="Total Contributed"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    fillOpacity={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Sector Breakdown Strip */}
            <div className="mt-4 border-t border-slate-800/80 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <PieChart className="h-3.5 w-3.5 text-cyan-400" />
                <span>Sector Exposure Breakdown</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {metrics.sectorBreakdown.map((s) => (
                  <div
                    key={s.sector}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-xs"
                  >
                    <span className="text-slate-300">{s.sector}</span>
                    <span className="font-mono font-bold text-emerald-300">
                      {s.weightPct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MACRO SHOCK STRESS TEST */}
        {activeTab === "macro" && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-white">
                Macro Regime Stress-Test Impact (% Portfolio Move)
              </h3>
              <p className="text-xs text-slate-400">
                Beta-adjusted sector shock modeling across 4 institutional macro scenarios
              </p>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={macroShocks} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={10}
                    tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 20)}…` : v)}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ReferenceLine y={0} stroke="#475569" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0b1120",
                      borderColor: "#334155",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                    formatter={(val: number) => [`${val >= 0 ? "+" : ""}${val}%`, "Portfolio Impact"]}
                  />
                  <Bar dataKey="portfolioImpactPct" radius={[6, 6, 0, 0]}>
                    {macroShocks.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={entry.portfolioImpactPct >= 0 ? "#10b981" : "#f43f5e"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {macroShocks.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">{s.name}</span>
                    <span
                      className={`font-mono text-xs font-bold ${
                        s.portfolioImpactPct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {s.portfolioImpactPct >= 0 ? "+" : ""}
                      {s.portfolioImpactPct}% ({fmtUsd(s.dollarImpact)})
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{s.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-300">
                    <span>
                      Worst Hit: <strong className="font-mono text-rose-300">{s.worstHitHolding}</strong>
                    </span>
                    <span>
                      Best Hedge: <strong className="font-mono text-emerald-300">{s.bestHedgeHolding}</strong>
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-cyan-300">
                    Hedge Playbook: {s.recommendedHedge}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: INTERACTIVE DCF & SENSITIVITY MATRIX */}
        {activeTab === "dcf" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Live Sliders */}
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Live DCF Assumptions ({liveDcf.ticker})
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    Market: ${liveDcf.currentPrice}
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">5-Year FCF Growth</span>
                    <span className="font-mono font-bold text-emerald-300">
                      {growthOverride.toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    step={0.5}
                    value={growthOverride}
                    onChange={(e) => setGrowthOverride(Number(e.target.value))}
                    className="mt-1 w-full accent-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Discount Rate (WACC)</span>
                    <span className="font-mono font-bold text-cyan-300">
                      {waccOverride.toFixed(2)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={15}
                    step={0.25}
                    value={waccOverride}
                    onChange={(e) => setWaccOverride(Number(e.target.value))}
                    className="mt-1 w-full accent-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Terminal Growth Rate</span>
                    <span className="font-mono font-bold text-amber-300">
                      {terminalOverride.toFixed(2)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.5}
                    max={5}
                    step={0.25}
                    value={terminalOverride}
                    onChange={(e) => setTerminalOverride(Number(e.target.value))}
                    className="mt-1 w-full accent-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 text-[11px]">
                  <div>
                    <span className="text-slate-500">Enterprise Value</span>
                    <div className="font-mono font-bold text-white">
                      ${liveDcf.enterpriseValueBillions}B
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Implied Share Price</span>
                    <div
                      className={`font-mono font-bold ${
                        liveDcf.upsidePct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      ${liveDcf.impliedSharePrice} ({liveDcf.upsidePct >= 0 ? "+" : ""}
                      {liveDcf.upsidePct}%)
                    </div>
                  </div>
                </div>
              </div>

              {/* Sensitivity Heatmap */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-7">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    WACC vs. Terminal Growth Valuation Matrix
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Green = Undervalued vs ${liveDcf.currentPrice}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-center font-mono text-[11px]">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="p-1.5 text-left text-[10px]">WACC \ Term g</th>
                        {uniqueTg.map((tg) => (
                          <th key={tg} className="p-1.5">
                            {tg}%
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueWacc.map((w) => (
                        <tr key={w} className="border-t border-slate-800/70">
                          <td className="p-1.5 text-left font-semibold text-slate-300">
                            {w}%
                          </td>
                          {uniqueTg.map((tg) => {
                            const cell = liveDcf.sensitivityGrid.find(
                              (c) => c.waccPct === w && c.terminalGrowthPct === tg
                            );
                            if (!cell) return <td key={tg} />;
                            const bg =
                              cell.upsidePct >= 15
                                ? "bg-emerald-500/25 text-emerald-200"
                                : cell.upsidePct >= 0
                                ? "bg-emerald-500/10 text-emerald-300"
                                : cell.upsidePct >= -15
                                ? "bg-amber-500/10 text-amber-300"
                                : "bg-rose-500/20 text-rose-300";
                            return (
                              <td key={tg} className="p-1">
                                <div className={`rounded-md px-2 py-1.5 ${bg}`}>
                                  <div className="font-bold">${cell.impliedSharePrice}</div>
                                  <div className="text-[9px] opacity-80">
                                    {cell.upsidePct >= 0 ? "+" : ""}
                                    {cell.upsidePct}%
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "cyan" | "amber" | "rose";
}) {
  const toneColor = {
    emerald: "text-emerald-400",
    cyan: "text-cyan-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-800/90 bg-[#0d1424] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-extrabold ${toneColor}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
          : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
