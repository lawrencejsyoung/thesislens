"use client";

import React, { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  Compass,
  Download,
  FileText,
  Flame,
  Landmark,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  AdvisorBriefResponse,
  LifestylePlanResult,
} from "@/lib/lifestyle-types";
import { getDemographicMeta } from "@/lib/lifestyle-presets";

interface LifestyleAnalyticsCanvasProps {
  plan: LifestylePlanResult;
  brief: AdvisorBriefResponse | null;
  isGeneratingBrief: boolean;
  onGenerateBrief: () => void;
}

type TabKey = "trajectory" | "milestones" | "tax_risk" | "stress" | "advisor_brief";

function fmtCompact(val: number): string {
  const sign = val < 0 ? "-" : "";
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000).toLocaleString()}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function fmtExact(val: number): string {
  const sign = val < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(val)).toLocaleString()}`;
}

export function LifestyleAnalyticsCanvas({
  plan,
  brief,
  isGeneratingBrief,
  onGenerateBrief,
}: LifestyleAnalyticsCanvasProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("trajectory");
  const { inputs, kpis, projections, readinessPillars, riskChecklist, taxWaterfall, milestoneStatuses, stressTests, cashFlowBreakdown } = plan;
  const meta = getDemographicMeta(inputs.demographic);

  const successColor =
    kpis.successProbabilityPct >= 85
      ? "text-emerald-400"
      : kpis.successProbabilityPct >= 70
      ? "text-amber-400"
      : "text-rose-400";

  const readinessColor =
    kpis.readinessScore >= 80
      ? "text-emerald-400"
      : kpis.readinessScore >= 65
      ? "text-amber-400"
      : "text-rose-400";

  const handleExportMarkdown = () => {
    const lines: string[] = [
      `# Lifestyle & Wealth Plan — ${inputs.clientName}`,
      `**Client Archetype:** ${meta.label} (${inputs.jurisdiction})`,
      `**Horizon:** Age ${inputs.currentAge} → Retire Age ${inputs.retirementAge} → Plan to Age ${inputs.lifeExpectancy} | **Risk Profile:** ${inputs.riskProfile}`,
      ``,
      `## Executive KPIs`,
      `- **Monte Carlo Plan Success Rate:** ${kpis.successProbabilityPct}% (450 paths)`,
      `- **Lifestyle Readiness Score:** ${kpis.readinessScore}/100`,
      `- **Projected Liquid Portfolio at Retirement:** ${fmtCompact(kpis.projectedLiquidAtRetirement)}`,
      `- **Projected Total Net Worth at Retirement:** ${fmtCompact(kpis.projectedNetWorthAtRetirement)}`,
      `- **Current Annual Lifestyle Spend:** ${fmtExact(kpis.currentAnnualLifestyleSpend)} vs. **Safe 85%-Confidence Spend:** ${fmtExact(kpis.safeAnnualLifestyleSpend)}`,
      `- **Financial Independence Age:** ${kpis.financialIndependenceAge ?? "Beyond Horizon"}`,
      `- **Effective Tax Rate:** ${kpis.effectiveTaxRatePct}% | **Savings Rate:** ${kpis.savingsRatePct}% | **Emergency Runway:** ${kpis.emergencyRunwayMonths} months`,
      ``,
      `## Stress Test Impact`,
      ...stressTests.map(
        (s) =>
          `- **${s.name}:** ${s.successRatePct}% (${s.deltaSuccessPct >= 0 ? "+" : ""}${s.deltaSuccessPct} pts) | Terminal Median: ${fmtCompact(s.terminalMedianLiquid)}`
      ),
      ``,
      `## Risk & Protection Audit`,
      ...riskChecklist.map(
        (r) => `- [${r.status.toUpperCase()}] **${r.title}**: ${r.recommendation}`
      ),
    ];

    if (brief) {
      lines.push(
        ``,
        `## CFP Advisor Brief (${brief.modelUsed})`,
        `### ${brief.headline}`,
        brief.executiveSummary,
        ``,
        `### Demographic Playbook`,
        ...brief.demographicPlaybook.map((p) => `- ${p}`),
        ``,
        `### 90-Day Action Plan`,
        ...brief.actionPlan90Days.map(
          (a, idx) => `${idx + 1}. **[${a.owner}]** ${a.step} — *${a.impact}*`
        )
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inputs.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-lifestyle-plan.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Prepare cash flow waterfall items
  const cashFlowItems = [
    { name: "Taxes", value: cashFlowBreakdown.taxes, fill: "#f43f5e" },
    { name: "Essential", value: cashFlowBreakdown.essentialSpend, fill: "#38bdf8" },
    { name: "Discretionary", value: cashFlowBreakdown.discretionarySpend, fill: "#a78bfa" },
    { name: "Healthcare", value: cashFlowBreakdown.healthcareSpend, fill: "#2dd4bf" },
    { name: "Debt Service", value: cashFlowBreakdown.debtService, fill: "#fb923c" },
    { name: "Savings / Surplus", value: cashFlowBreakdown.savingsAndSurplus, fill: "#10b981" },
  ];

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "trajectory", label: "Trajectory & Monte Carlo", icon: TrendingUp },
    { key: "milestones", label: "Lifestyle & Milestones", icon: Compass },
    { key: "tax_risk", label: "Tax, Accounts & Risk Audit", icon: Landmark },
    { key: "stress", label: "Stress Tests & What-If", icon: Flame },
    { key: "advisor_brief", label: "CFP Advisor Brief", icon: Sparkles },
  ];

  return (
    <div className="space-y-4">
      {/* Top 6-Card KPI Command Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-3.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>Plan Success</span>
            <Target className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className={`mt-1.5 font-mono text-2xl font-bold ${successColor}`}>
            {kpis.successProbabilityPct}%
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            450 Monte Carlo paths
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-3.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>Readiness Score</span>
            <Award className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div className={`mt-1.5 font-mono text-2xl font-bold ${readinessColor}`}>
            {kpis.readinessScore}
            <span className="text-xs font-normal text-slate-500">/100</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            5-pillar CFP audit
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-3.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>Liquid @ Age {inputs.retirementAge}</span>
            <Layers className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-white">
            {fmtCompact(kpis.projectedLiquidAtRetirement)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            NW: {fmtCompact(kpis.projectedNetWorthAtRetirement)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-3.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>Safe Lifestyle / yr</span>
            <Activity className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-white">
            {fmtCompact(kpis.safeAnnualLifestyleSpend)}
          </div>
          <div
            className={`mt-0.5 text-[10px] font-medium ${
              kpis.lifestyleSpendGap >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {kpis.lifestyleSpendGap >= 0 ? "+" : ""}
            {fmtCompact(kpis.lifestyleSpendGap)} vs current
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-3.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>FI Target Age</span>
            <Compass className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-white">
            {kpis.financialIndependenceAge
              ? `Age ${kpis.financialIndependenceAge}`
              : "N/A"}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Goal: Age {inputs.retirementAge}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-3.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>Savings / Tax</span>
            <Landmark className="h-3.5 w-3.5 text-teal-400" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-white">
            {kpis.savingsRatePct}%
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Est. Tax: {kpis.effectiveTaxRatePct}% · {kpis.emergencyRunwayMonths}m cash
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs & Export */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-[#0c1322] p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleExportMarkdown}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
        >
          <Download className="h-3.5 w-3.5 text-cyan-400" />
          <span>Export Report</span>
        </button>
      </div>

      {/* TAB 1: TRAJECTORY & MONTE CARLO */}
      {activeTab === "trajectory" && (
        <div className="space-y-4">
          {/* Monte Carlo Wealth Cone */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Monte Carlo Liquid Wealth Cone &amp; Net Worth Trajectory
                </h3>
                <p className="text-xs text-slate-400">
                  P10 Bear / P50 Median / P90 Bull liquid portfolio bands vs. total net worth (expected {kpis.expectedReturnPct}% return, {kpis.portfolioVolatilityPct}% vol)
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  P50 Median
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-400/60" />
                  P90 Bull
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  P10 Stress
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Total Net Worth
                </span>
              </div>
            </div>

            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={projections}
                  margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="p90Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="age"
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `Age ${v}`}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => fmtCompact(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                    labelFormatter={(age) => `Age ${age}`}
                    formatter={(val: number, name: string) => [fmtExact(val), name]}
                  />
                  <ReferenceLine
                    x={inputs.retirementAge}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: `Retire (${inputs.retirementAge})`,
                      position: "top",
                      fill: "#fbbf24",
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="p90Portfolio"
                    name="P90 Bull Liquid"
                    stroke="#22d3ee"
                    strokeWidth={1.5}
                    fill="url(#p90Grad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="p50Portfolio"
                    name="P50 Median Liquid"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#p50Grad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="p10Portfolio"
                    name="P10 Bear Liquid"
                    stroke="#fb7185"
                    strokeWidth={1.8}
                    fill="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="totalNetWorth"
                    name="Total Net Worth (incl. Illiquid)"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Annual Income vs Lifestyle Spend Chart */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">
                Annual After-Tax Income vs. Inflation-Adjusted Lifestyle Spend
              </h3>
              <p className="text-xs text-slate-400">
                Includes Go-Go / Slow-Go / No-Go retirement spending smile, healthcare drift &amp; milestone cash flows
              </p>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={projections}
                  margin={{ top: 8, right: 16, left: 4, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="age"
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => `${v}`}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(v) => fmtCompact(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                    labelFormatter={(age) => `Age ${age}`}
                    formatter={(val: number, name: string) => [fmtExact(val), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <ReferenceLine x={inputs.retirementAge} stroke="#f59e0b" strokeDasharray="3 3" />
                  <Bar
                    dataKey="netIncome"
                    name="After-Tax Income (Active + Pension)"
                    fill="#0ea5e9"
                    opacity={0.75}
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="lifestyleSpend"
                    name="Lifestyle Spend"
                    stroke="#f43f5e"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIFESTYLE & MILESTONES */}
      {activeTab === "milestones" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Current Cash Flow Allocation */}
            <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
              <h3 className="text-sm font-semibold text-white">
                Annual Gross Cash Flow Allocation ({fmtExact(cashFlowBreakdown.grossIncome)})
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Breakdown of taxes, essential needs, discretionary lifestyle, debt service &amp; savings
              </p>
              <div className="mt-3 h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={cashFlowItems}
                    layout="vertical"
                    margin={{ top: 0, right: 20, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="#64748b"
                      fontSize={11}
                      tickFormatter={(v) => fmtCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={11}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "10px",
                        fontSize: "12px",
                      }}
                      formatter={(val: number) => [fmtExact(val), "Annual Amount"]}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {cashFlowItems.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Safe Lifestyle Spend Capacity vs Current Burn */}
            <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
              <h3 className="text-sm font-semibold text-white">
                Sustainable Lifestyle Spending Guardrails
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                85%-confidence Monte Carlo spending ceiling vs. current lifestyle burn
              </p>

              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Current Annual Lifestyle Burn</span>
                    <span className="font-mono font-bold text-white">
                      {fmtExact(kpis.currentAnnualLifestyleSpend)} / yr
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-400">85%-Confidence Safe Capacity</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {fmtExact(kpis.safeAnnualLifestyleSpend)} / yr
                    </span>
                  </div>
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        kpis.lifestyleSpendGap >= 0 ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (kpis.currentAnnualLifestyleSpend /
                              Math.max(1, kpis.safeAnnualLifestyleSpend)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    {kpis.lifestyleSpendGap >= 0 ? (
                      <span>
                        <strong className="text-emerald-300">
                          {fmtExact(kpis.lifestyleSpendGap)}/yr surplus capacity
                        </strong>{" "}
                        — client can expand travel/philanthropy or retire earlier.
                      </span>
                    ) : (
                      <span>
                        <strong className="text-rose-300">
                          {fmtExact(Math.abs(kpis.lifestyleSpendGap))}/yr above safe ceiling
                        </strong>{" "}
                        — recommend dialing discretionary spend or extending retirement age.
                      </span>
                    )}
                  </div>
                </div>

                {/* Retirement Spending Smile Summary */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      phase: "Go-Go Years",
                      ages: `${inputs.retirementAge}–${inputs.retirementAge + 9}`,
                      mult: "100%",
                      desc: "Peak travel & hobbies",
                    },
                    {
                      phase: "Slow-Go Years",
                      ages: `${inputs.retirementAge + 10}–${inputs.retirementAge + 19}`,
                      mult: "91%",
                      desc: "Home-centered pace",
                    },
                    {
                      phase: "No-Go / Care",
                      ages: `${inputs.retirementAge + 20}–${inputs.lifeExpectancy}`,
                      mult: "87% + LTC",
                      desc: "Healthcare escalation",
                    },
                  ].map((p) => (
                    <div
                      key={p.phase}
                      className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5"
                    >
                      <div className="text-[11px] font-semibold text-cyan-300">
                        {p.phase}
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-bold text-white">
                        {p.mult}
                      </div>
                      <div className="text-[10px] text-slate-400">Ages {p.ages}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{p.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Milestone Funding Timeline */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
            <h3 className="text-sm font-semibold text-white">
              Life Milestones &amp; Major Liquidity Events Funding Audit
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Evaluated against median P50 liquid portfolio at each target age
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-2 pr-3">Target Age</th>
                    <th className="py-2 pr-3">Milestone</th>
                    <th className="py-2 pr-3">Priority</th>
                    <th className="py-2 pr-3 text-right">Total Cash Impact</th>
                    <th className="py-2 pr-3 text-right">Est. Liquid @ Age</th>
                    <th className="py-2 text-right">Funding Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {milestoneStatuses.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-900/50">
                      <td className="py-2.5 pr-3 font-mono font-semibold text-cyan-300">
                        Age {m.age}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-100">
                        {m.title}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] uppercase text-slate-300">
                          {m.priority}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right font-mono font-semibold ${
                          m.totalCost < 0 ? "text-emerald-400" : "text-slate-200"
                        }`}
                      >
                        {m.totalCost < 0
                          ? `+${fmtExact(Math.abs(m.totalCost))}`
                          : `-${fmtExact(m.totalCost)}`}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-slate-300">
                        {fmtCompact(m.projectedLiquidAtAge)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                            m.fundedStatus === "fully_funded"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : m.fundedStatus === "inflow_event"
                              ? "bg-cyan-500/15 text-cyan-300"
                              : m.fundedStatus === "tight"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {m.fundedStatus.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {milestoneStatuses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No active milestones enabled. Add or enable milestones in the left workbench.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TAX, ACCOUNTS & RISK AUDIT */}
      {activeTab === "tax_risk" && (
        <div className="space-y-4">
          {/* 5-Pillar Readiness Scorecard */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
            <h3 className="text-sm font-semibold text-white">
              5-Pillar Lifestyle Readiness Audit ({kpis.readinessScore}/100)
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
              {readinessPillars.map((pillar) => (
                <div
                  key={pillar.id}
                  className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-200">
                      {pillar.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span
                      className={`font-mono text-xl font-bold ${
                        pillar.status === "strong"
                          ? "text-emerald-400"
                          : pillar.status === "watch"
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {pillar.score}
                    </span>
                    <span className="text-[10px] uppercase text-slate-500">
                      {pillar.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${
                        pillar.status === "strong"
                          ? "bg-emerald-500"
                          : pillar.status === "watch"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${pillar.score}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                    {pillar.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Tax-Smart Accumulation & Decumulation Waterfalls */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Accumulation Tax Waterfall ({inputs.jurisdiction})
                </h3>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {meta.shortLabel}
                </span>
              </div>
              <div className="mt-3 space-y-2.5">
                {taxWaterfall.accumulationOrder.map((step) => (
                  <div
                    key={step.order}
                    className="flex gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 font-mono text-xs font-bold text-emerald-300">
                      {step.order}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-white">
                          {step.vehicle}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-cyan-300">
                          {step.role}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        {step.rationale}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Decumulation / Retirement Withdrawal Order
                </h3>
                <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                  Tax-Smart Drawdown
                </span>
              </div>
              <div className="mt-3 space-y-2.5">
                {taxWaterfall.decumulationOrder.map((step) => (
                  <div
                    key={step.order}
                    className="flex gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 font-mono text-xs font-bold text-cyan-300">
                      {step.order}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-white">
                          {step.vehicle}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-amber-300">
                          {step.role}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        {step.rationale}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Risk & Protection Checklist */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
            <h3 className="text-sm font-semibold text-white">
              Demographic Risk Transfer, Insurance &amp; Estate Checklist
            </h3>
            <div className="mt-3 space-y-2">
              {riskChecklist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3"
                >
                  {item.status === "covered" ? (
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  ) : item.status === "review" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  ) : (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">
                          {item.title}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                          {item.category}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          item.status === "covered"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : item.status === "review"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-rose-500/15 text-rose-300"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {item.recommendation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: STRESS TESTS & WHAT-IF */}
      {activeTab === "stress" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4">
            <h3 className="text-sm font-semibold text-white">
              Real-Time Monte Carlo Stress Tests (Baseline: {kpis.successProbabilityPct}%)
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Includes macro shocks plus a tailored structural shock for {meta.label}
            </p>

            <div className="mt-4 h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      name: "Baseline Plan",
                      successRatePct: kpis.successProbabilityPct,
                      severity: "base",
                    },
                    ...stressTests.map((s) => ({
                      name: s.name,
                      successRatePct: s.successRatePct,
                      severity: s.impactSeverity,
                    })),
                  ]}
                  margin={{ top: 10, right: 16, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval={0} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                    formatter={(val: number) => [`${val}%`, "Success Rate"]}
                  />
                  <ReferenceLine y={85} stroke="#10b981" strokeDasharray="3 3" />
                  <Bar dataKey="successRatePct" radius={[5, 5, 0, 0]}>
                    {[
                      { severity: "base" },
                      ...stressTests.map((s) => ({ severity: s.impactSeverity })),
                    ].map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={
                          entry.severity === "base"
                            ? "#06b6d4"
                            : entry.severity === "low"
                            ? "#10b981"
                            : entry.severity === "moderate"
                            ? "#f59e0b"
                            : "#f43f5e"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {stressTests.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">{s.name}</h4>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {s.description}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      s.impactSeverity === "low"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : s.impactSeverity === "moderate"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {s.impactSeverity}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800/70 pt-3">
                  <div>
                    <div className="text-[10px] text-slate-500">Stressed Success</div>
                    <div className="font-mono text-lg font-bold text-white">
                      {s.successRatePct}%{" "}
                      <span
                        className={`text-xs ${
                          s.deltaSuccessPct >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        ({s.deltaSuccessPct >= 0 ? "+" : ""}
                        {s.deltaSuccessPct} pts)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Terminal Median</div>
                    <div className="font-mono text-lg font-bold text-white">
                      {fmtCompact(s.terminalMedianLiquid)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: CFP ADVISOR BRIEF */}
      {activeTab === "advisor_brief" && (
        <div className="rounded-xl border border-slate-800/90 bg-[#0c1322] p-5">
          {!brief ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="h-10 w-10 text-emerald-400/70" />
              <h3 className="mt-3 text-sm font-semibold text-white">
                Generate Tailored CFP Advisor Meeting Brief
              </h3>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                Synthesizes this client&apos;s Monte Carlo trajectory, tax waterfall,
                protection gaps, and stress tests into an executive wealth management
                brief and 90-day action plan.
              </p>
              <button
                type="button"
                onClick={onGenerateBrief}
                disabled={isGeneratingBrief}
                className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  {isGeneratingBrief
                    ? "Synthesizing Brief..."
                    : "Generate CFP Brief Now"}
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      {brief.mode === "live-gemini"
                        ? `Live ${brief.modelUsed}`
                        : brief.modelUsed}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {meta.label} · {inputs.jurisdiction}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-white">
                    {brief.headline}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onGenerateBrief}
                  disabled={isGeneratingBrief}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isGeneratingBrief ? "Refreshing..." : "Refresh Brief"}</span>
                </button>
              </div>

              <p className="text-xs leading-relaxed text-slate-300">
                {brief.executiveSummary}
              </p>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Demographic-Specific Tax &amp; Structural Playbook
                  </h4>
                  <ul className="mt-2.5 space-y-2 text-xs text-slate-300">
                    {brief.demographicPlaybook.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Lifestyle &amp; Trade-Off Analysis
                  </h4>
                  <ul className="mt-2.5 space-y-2 text-xs text-slate-300">
                    {brief.lifestyleTradeoffs.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 90-Day Action Plan */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Next 90-Day Implementation Roadmap
                </h4>
                <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {brief.actionPlan90Days.map((action, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-emerald-400">
                          STEP 0{idx + 1}
                        </span>
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                          {action.owner}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs font-semibold text-white">
                        {action.step}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        Impact: {action.impact}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Client Discovery Questions */}
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-violet-300">
                  High-Impact Client Meeting Discovery Questions
                </h4>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-slate-300">
                  {brief.clientMeetingQuestions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
