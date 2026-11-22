"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
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
  AlertTriangle,
  Building2,
  CheckCircle2,
  Globe2,
  Home,
  Layers,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Sliders,
  TrendingUp,
} from "lucide-react";
import {
  BondValuationResult,
  RealEstateCategory,
  RealEstateInputs,
  RealEstateLeaseStructure,
  RealEstatePropertyClass,
} from "@/lib/types";
import {
  analyzeRealEstateDeal,
  buildRealEstatePresetInputs,
  compareRealEstateClasses,
  compareRealEstateMarkets,
  getRealEstateClass,
  getRealEstateMarket,
  REAL_ESTATE_CLASSES,
  REAL_ESTATE_MARKETS,
  summarizeResidentialVsCommercial,
} from "@/lib/quant-engine";

interface RealEstateAnalysisLabProps {
  initialInputs?: RealEstateInputs;
  bondValuation?: BondValuationResult;
}

type SubView = "proforma" | "classes" | "markets";

function fmtUsd(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

const LEASE_LABELS: Record<RealEstateLeaseStructure, string> = {
  gross: "Gross Lease",
  modified_gross: "Modified Gross",
  nnn: "Triple Net (NNN)",
  short_term: "Short-Term / Dynamic",
};

export function RealEstateAnalysisLab({
  initialInputs,
  bondValuation,
}: RealEstateAnalysisLabProps) {
  const [subView, setSubView] = useState<SubView>("proforma");

  const defaultInputs = useMemo(
    () =>
      initialInputs ??
      buildRealEstatePresetInputs("small_multifamily", "sudbury-on", 680000),
    [initialInputs]
  );

  const [inputs, setInputs] = useState<RealEstateInputs>(defaultInputs);
  const [rateStressBps, setRateStressBps] = useState<number>(0);
  const [regionFilter, setRegionFilter] = useState<"All" | "Canada" | "US" | "Global">("All");
  const [classCategoryFilter, setClassCategoryFilter] = useState<"all" | RealEstateCategory>("all");

  useEffect(() => {
    setInputs(defaultInputs);
  }, [defaultInputs]);

  const activeClassId: RealEstatePropertyClass =
    inputs.propertyClass ?? "small_multifamily";
  const activeMarketId: string = inputs.marketId ?? "sudbury-on";
  const activeProfile = getRealEstateClass(activeClassId);
  const activeMarket = getRealEstateMarket(activeMarketId);

  const dealResult = useMemo(
    () => analyzeRealEstateDeal(inputs, { includeComparisons: false }),
    [inputs]
  );

  const classMatrix = useMemo(
    () => compareRealEstateClasses(activeMarketId, rateStressBps / 100),
    [activeMarketId, rateStressBps]
  );

  const resiVsComm = useMemo(
    () => summarizeResidentialVsCommercial(classMatrix, activeMarket),
    [classMatrix, activeMarket]
  );

  const marketMatrix = useMemo(
    () => compareRealEstateMarkets(activeClassId, rateStressBps / 100),
    [activeClassId, rateStressBps]
  );

  const filteredClasses = useMemo(
    () =>
      classCategoryFilter === "all"
        ? classMatrix
        : classMatrix.filter((c) => c.category === classCategoryFilter),
    [classMatrix, classCategoryFilter]
  );

  const filteredMarkets = useMemo(
    () =>
      regionFilter === "All"
        ? marketMatrix
        : marketMatrix.filter((m) => m.region === regionFilter),
    [marketMatrix, regionFilter]
  );

  const handleLoadDefaults = (
    nextClass: RealEstatePropertyClass,
    nextMarket: string
  ) => {
    setInputs(buildRealEstatePresetInputs(nextClass, nextMarket));
  };

  const handleCategoryQuickSwitch = (cat: RealEstateCategory) => {
    const firstClass = REAL_ESTATE_CLASSES.find((c) => c.category === cat);
    if (!firstClass) return;
    setInputs(buildRealEstatePresetInputs(firstClass.id, activeMarketId));
  };

  const statusBadge = {
    PASS: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    WARN: "bg-amber-500/15 text-amber-300 border-amber-500/35",
    BREACH: "bg-rose-500/15 text-rose-300 border-rose-500/35",
  };

  const covenantBreaches = dealResult.lenderCovenantChecks.filter(
    (c) => c.status === "BREACH"
  ).length;
  const covenantWarns = dealResult.lenderCovenantChecks.filter(
    (c) => c.status === "WARN"
  ).length;
  const overallCovenantStatus =
    covenantBreaches > 0 ? "BREACH" : covenantWarns > 0 ? "WARN" : "PASS";

  return (
    <div className="space-y-4">
      {/* Top Sub-Navigation & Context Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSubView("proforma")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              subView === "proforma"
                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Deal Underwriter &amp; Pro Forma
          </button>
          <button
            type="button"
            onClick={() => setSubView("classes")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              subView === "classes"
                ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40"
                : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Residential vs. Commercial (10 Classes)
          </button>
          <button
            type="button"
            onClick={() => setSubView("markets")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              subView === "markets"
                ? "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/40"
                : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" />
            Cross-Market Screener (10 Markets)
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
              dealResult.category === "commercial"
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {dealResult.category}
          </span>
          <span className="font-mono text-slate-300">
            {activeProfile.shortLabel} · {activeMarket.name}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 1: DEAL UNDERWRITER & PRO FORMA                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {subView === "proforma" && (
        <div className="space-y-4">
          {/* Class, Market & Lease Selector Bar */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Segment
                </label>
                <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-slate-900 p-0.5">
                  <button
                    type="button"
                    onClick={() => handleCategoryQuickSwitch("residential")}
                    className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                      dealResult.category === "residential"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Home className="h-3 w-3" />
                    Resi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCategoryQuickSwitch("commercial")}
                    className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-semibold transition ${
                      dealResult.category === "commercial"
                        ? "bg-cyan-500/20 text-cyan-300"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Building2 className="h-3 w-3" />
                    Comm
                  </button>
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Property Class
                </label>
                <select
                  value={activeClassId}
                  onChange={(e) =>
                    handleLoadDefaults(
                      e.target.value as RealEstatePropertyClass,
                      activeMarketId
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <optgroup label="Residential Classes">
                    {REAL_ESTATE_CLASSES.filter((c) => c.category === "residential").map(
                      (c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      )
                    )}
                  </optgroup>
                  <optgroup label="Commercial Classes">
                    {REAL_ESTATE_CLASSES.filter((c) => c.category === "commercial").map(
                      (c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      )
                    )}
                  </optgroup>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Market Benchmark
                </label>
                <select
                  value={activeMarketId}
                  onChange={(e) =>
                    handleLoadDefaults(activeClassId, e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  {REAL_ESTATE_MARKETS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.tier})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Lease Structure
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <select
                    value={inputs.leaseStructure ?? activeProfile.defaultLeaseStructure}
                    onChange={(e) => {
                      const nextLease = e.target.value as RealEstateLeaseStructure;
                      const defaultRecovery =
                        nextLease === "nnn"
                          ? 85
                          : nextLease === "modified_gross"
                          ? 45
                          : 0;
                      setInputs({
                        ...inputs,
                        leaseStructure: nextLease,
                        reimbursementRecoveryPct: defaultRecovery,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {(Object.keys(LEASE_LABELS) as RealEstateLeaseStructure[]).map(
                      (k) => (
                        <option key={k} value={k}>
                          {LEASE_LABELS[k]}
                        </option>
                      )
                    )}
                  </select>
                  <button
                    type="button"
                    title="Reset to Class & Market Benchmark Defaults"
                    onClick={() => handleLoadDefaults(activeClassId, activeMarketId)}
                    className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
              <span>
                <strong className="text-slate-200">{activeMarket.name}:</strong>{" "}
                {activeMarket.highlights}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Pop +{activeMarket.populationGrowthPct}% · Jobs +{activeMarket.jobGrowthPct}% · Supply{" "}
                {activeMarket.supplyPipelinePct}% · Rent Control: {activeMarket.rentControlRisk}
              </span>
            </div>
          </div>

          {/* Real Estate KPI Strip */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <MetricPill
              label="Going-In Cap"
              value={`${dealResult.goingInCapRatePct}%`}
              sub={`${dealResult.capRateSpreadToBenchmarkBps >= 0 ? "+" : ""}${dealResult.capRateSpreadToBenchmarkBps}bps vs mkt`}
              tone={dealResult.capRateSpreadToBenchmarkBps >= 0 ? "emerald" : "amber"}
            />
            <MetricPill
              label="Levered IRR"
              value={`${dealResult.leveredIrrPct}%`}
              sub={`Unlev ${dealResult.unleveredIrrPct}% · AT ${dealResult.afterTaxIrrPct}%`}
              tone={dealResult.leveredIrrPct >= 12 ? "emerald" : dealResult.leveredIrrPct >= 8 ? "cyan" : "rose"}
            />
            <MetricPill
              label="Cash-on-Cash"
              value={`${dealResult.cashOnCashPct}%`}
              sub={`Yr1 CF ${fmtUsd(dealResult.year1CashFlow)}`}
              tone={dealResult.cashOnCashPct >= 6 ? "emerald" : dealResult.cashOnCashPct >= 2 ? "amber" : "rose"}
            />
            <MetricPill
              label="DSCR / Debt Yield"
              value={`${dealResult.dscr}x`}
              sub={`DY ${dealResult.debtYieldPct}% · LTV ${dealResult.ltvPct}%`}
              tone={dealResult.dscr >= activeProfile.minLenderDscr ? "emerald" : "rose"}
            />
            <MetricPill
              label="Equity Multiple"
              value={`${dealResult.equityMultiple}x`}
              sub={`Unlev ${dealResult.unleveredEquityMultiple}x · ${inputs.holdYears}Y`}
              tone="cyan"
            />
            <MetricPill
              label="Break-Even Occ."
              value={`${dealResult.breakEvenOccupancyPct}%`}
              sub={`$${dealResult.pricePerUnitOrSqft.toLocaleString()}/${dealResult.unitLabel === "units" ? "unit" : "sf"}`}
              tone={dealResult.breakEvenOccupancyPct <= 82 ? "emerald" : "amber"}
            />
          </div>

          {/* Main Pro Forma Grid: Controls Left (5) + Charts/Covenants/Heatmap Right (7) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left: Interactive Underwriting Sliders */}
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white">
                    {dealResult.propertyName}
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Equity {fmtUsd(dealResult.totalCashInvested)} · Debt {fmtUsd(dealResult.loanAmount)} ({dealResult.ltvPct}% LTV)
                  </p>
                </div>
                <Sliders className="h-4 w-4 text-emerald-400" />
              </div>

              {/* Numeric Quick Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400">Purchase Price ($)</label>
                  <input
                    type="number"
                    step={25000}
                    value={inputs.purchasePrice}
                    onChange={(e) =>
                      setInputs({
                        ...inputs,
                        purchasePrice: Math.max(50000, Number(e.target.value) || 50000),
                      })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Gross Annual Rent ($)</label>
                  <input
                    type="number"
                    step={2400}
                    value={inputs.grossAnnualRent}
                    onChange={(e) =>
                      setInputs({
                        ...inputs,
                        grossAnnualRent: Math.max(5000, Number(e.target.value) || 5000),
                      })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-xs text-emerald-300"
                  />
                </div>
              </div>

              {/* Sliders */}
              <SliderRow
                label="Mortgage / Debt Interest Rate"
                valueDisplay={`${inputs.mortgageRatePct.toFixed(2)}%`}
                value={inputs.mortgageRatePct}
                min={2.5}
                max={9.5}
                step={0.1}
                accent="accent-amber-500"
                valueClass="text-amber-300"
                onChange={(v) => setInputs({ ...inputs, mortgageRatePct: v })}
              />

              <SliderRow
                label="Exit Cap Rate"
                valueDisplay={`${inputs.exitCapRatePct.toFixed(2)}% (Mkt ${dealResult.benchmarkCapRatePct}%)`}
                value={inputs.exitCapRatePct}
                min={3.5}
                max={10.5}
                step={0.15}
                accent="accent-cyan-500"
                valueClass="text-cyan-300"
                onChange={(v) => setInputs({ ...inputs, exitCapRatePct: v })}
              />

              <SliderRow
                label="Down Payment (Equity %)"
                valueDisplay={`${inputs.downPaymentPct}% (LTV ${100 - inputs.downPaymentPct}%)`}
                value={inputs.downPaymentPct}
                min={10}
                max={60}
                step={5}
                accent="accent-emerald-500"
                valueClass="text-emerald-300"
                onChange={(v) => setInputs({ ...inputs, downPaymentPct: v })}
              />

              <SliderRow
                label="Vacancy Rate"
                valueDisplay={`${inputs.vacancyRatePct.toFixed(1)}%`}
                value={inputs.vacancyRatePct}
                min={1}
                max={25}
                step={0.5}
                accent="accent-rose-500"
                valueClass="text-rose-300"
                onChange={(v) => setInputs({ ...inputs, vacancyRatePct: v })}
              />

              <SliderRow
                label="Annual Rent Growth"
                valueDisplay={`${inputs.annualRentGrowthPct.toFixed(1)}% / yr`}
                value={inputs.annualRentGrowthPct}
                min={-1}
                max={8}
                step={0.25}
                accent="accent-emerald-500"
                valueClass="text-emerald-300"
                onChange={(v) => setInputs({ ...inputs, annualRentGrowthPct: v })}
              />

              <div className="grid grid-cols-2 gap-3">
                <SliderRow
                  label="Hold Period"
                  valueDisplay={`${inputs.holdYears} yrs`}
                  value={inputs.holdYears}
                  min={3}
                  max={15}
                  step={1}
                  accent="accent-violet-500"
                  valueClass="text-violet-300"
                  onChange={(v) => setInputs({ ...inputs, holdYears: v })}
                />
                <SliderRow
                  label="Interest-Only (IO)"
                  valueDisplay={`${inputs.interestOnlyYears ?? 0} yrs`}
                  value={inputs.interestOnlyYears ?? 0}
                  min={0}
                  max={Math.max(0, inputs.holdYears - 1)}
                  step={1}
                  accent="accent-cyan-500"
                  valueClass="text-cyan-300"
                  onChange={(v) => setInputs({ ...inputs, interestOnlyYears: v })}
                />
              </div>

              {dealResult.category === "commercial" && (
                <SliderRow
                  label="NNN / CAM Expense Recovery"
                  valueDisplay={`${inputs.reimbursementRecoveryPct ?? activeProfile.reimbursementRecoveryPct}%`}
                  value={
                    inputs.reimbursementRecoveryPct ??
                    activeProfile.reimbursementRecoveryPct
                  }
                  min={0}
                  max={100}
                  step={5}
                  accent="accent-sky-500"
                  valueClass="text-sky-300"
                  onChange={(v) =>
                    setInputs({ ...inputs, reimbursementRecoveryPct: v })
                  }
                />
              )}

              {/* Bottom Summary Strip */}
              <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 text-[11px]">
                <div>
                  <span className="text-slate-500">Year-1 NOI / Debt Svc</span>
                  <div className="font-mono font-bold text-slate-200">
                    {fmtUsd(dealResult.year1Noi)} / {fmtUsd(dealResult.annualDebtService)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Projected Exit Value</span>
                  <div className="font-mono font-bold text-emerald-300">
                    {fmtUsd(dealResult.projectedExitValue)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Cap Spread vs 10Y UST</span>
                  <div
                    className={`font-mono font-bold ${
                      dealResult.capRateSpreadToRiskFreeBps >= 150
                        ? "text-emerald-300"
                        : "text-amber-300"
                    }`}
                  >
                    {dealResult.capRateSpreadToRiskFreeBps >= 0 ? "+" : ""}
                    {dealResult.capRateSpreadToRiskFreeBps} bps
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Annual Dep. Tax Shield</span>
                  <div className="font-mono font-bold text-cyan-300">
                    +{fmtUsd(dealResult.annualDepreciationShield)}/yr
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Cash Flow & Equity Build Chart + Lender Covenants + Sensitivity Grid */}
            <div className="space-y-4 lg:col-span-7">
              {/* Cash Flow & Equity Waterfall Chart */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    {inputs.holdYears}-Year Pro Forma: NOI, Cash Flow &amp; Net Equity Build
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Lease: {LEASE_LABELS[dealResult.leaseStructure]}
                  </span>
                </div>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={dealResult.yearlyCashFlows}
                      margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="year"
                        stroke="#64748b"
                        fontSize={10}
                        tickFormatter={(v) => `Yr ${v}`}
                      />
                      <YAxis
                        yAxisId="cf"
                        stroke="#64748b"
                        fontSize={10}
                        tickFormatter={(v) => fmtUsd(Number(v))}
                      />
                      <YAxis
                        yAxisId="eq"
                        orientation="right"
                        stroke="#22d3ee"
                        fontSize={10}
                        tickFormatter={(v) => fmtUsd(Number(v))}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0b1120",
                          borderColor: "#334155",
                          borderRadius: "10px",
                          fontSize: "11px",
                        }}
                        formatter={(value, name) => [fmtUsd(Number(value)), String(name)]}
                        labelFormatter={(label) => `Hold Year ${label}`}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      <Bar
                        yAxisId="cf"
                        dataKey="noi"
                        name="NOI"
                        fill="#10b981"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={24}
                      />
                      <Bar
                        yAxisId="cf"
                        dataKey="cashFlowBeforeTax"
                        name="Pre-Tax Cash Flow"
                        fill="#f59e0b"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={24}
                      />
                      <Line
                        yAxisId="eq"
                        type="monotone"
                        dataKey="netEquity"
                        name="Net Equity"
                        stroke="#22d3ee"
                        strokeWidth={2.2}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Lender Covenants Check */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Institutional Lender Covenants ({activeProfile.shortLabel})
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      statusBadge[overallCovenantStatus]
                    }`}
                  >
                    {overallCovenantStatus === "PASS" ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : overallCovenantStatus === "WARN" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <ShieldAlert className="h-3 w-3" />
                    )}
                    {overallCovenantStatus}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {dealResult.lenderCovenantChecks.map((chk) => (
                    <div
                      key={chk.name}
                      className="rounded-lg border border-slate-800/90 bg-slate-900/50 p-2"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-200">{chk.name}</span>
                        <span
                          className={`rounded border px-1.5 py-0.2 text-[9px] font-bold ${
                            statusBadge[chk.status]
                          }`}
                        >
                          {chk.status}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-slate-400">
                        <span>Actual: <strong className="text-white">{chk.actual}</strong></span>
                        <span>Limit: {chk.limit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sensitivity Matrix */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Rate vs. Exit Cap Sensitivity (Levered IRR % / Cash-on-Cash %)
                  </span>
                  <span className="text-[10px] text-slate-400">±100bps Rate / ±75bps Cap</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-center font-mono text-[11px]">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="p-1.5 text-left text-[10px]">Rate \ Exit Cap</th>
                        {Array.from(
                          new Set(dealResult.sensitivityGrid.map((c) => c.exitCapRatePct))
                        ).map((c) => (
                          <th key={c} className="p-1.5">
                            {c}%
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(
                        new Set(dealResult.sensitivityGrid.map((c) => c.mortgageRatePct))
                      ).map((r) => (
                        <tr key={r} className="border-t border-slate-800/70">
                          <td className="p-1.5 text-left font-semibold text-slate-300">
                            {r}%
                          </td>
                          {Array.from(
                            new Set(dealResult.sensitivityGrid.map((c) => c.exitCapRatePct))
                          ).map((cap) => {
                            const cell = dealResult.sensitivityGrid.find(
                              (c) => c.mortgageRatePct === r && c.exitCapRatePct === cap
                            );
                            if (!cell) return <td key={cap} />;
                            const bg =
                              cell.leveredIrrPct >= 14
                                ? "bg-emerald-500/25 text-emerald-200"
                                : cell.leveredIrrPct >= 9
                                ? "bg-emerald-500/10 text-emerald-300"
                                : cell.leveredIrrPct >= 4
                                ? "bg-amber-500/10 text-amber-300"
                                : "bg-rose-500/20 text-rose-300";
                            return (
                              <td key={cap} className="p-1">
                                <div className={`rounded-md px-2 py-1.5 ${bg}`}>
                                  <div className="font-bold">{cell.leveredIrrPct}% IRR</div>
                                  <div className="text-[9px] opacity-80">
                                    CoC {cell.cashOnCashPct}%
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

                {bondValuation && (
                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-[11px]">
                    <span className="font-bold text-sky-300">
                      Fixed Income Benchmark ({bondValuation.issuer}):
                    </span>{" "}
                    YTM {bondValuation.ytmPct}% · Mod Duration {bondValuation.modifiedDuration}y ·
                    Convexity {bondValuation.convexity} · +100bps Shock:{" "}
                    <span className="font-mono text-rose-300">
                      {bondValuation.rateShocks.find((s) => s.bpsChange === 100)?.pctChange}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 2: CROSS-CLASS COMPARISON (RESIDENTIAL VS. COMMERCIAL)     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {subView === "classes" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Target Market
                </label>
                <select
                  value={activeMarketId}
                  onChange={(e) =>
                    setInputs({ ...inputs, marketId: e.target.value })
                  }
                  className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                >
                  {REAL_ESTATE_MARKETS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.region})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Filter Segment
                </label>
                <div className="mt-1 flex gap-1">
                  {(["all", "residential", "commercial"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setClassCategoryFilter(cat)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                        classCategoryFilter === cat
                          ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40"
                          : "bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-w-[200px]">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Interest Rate Stress</span>
                <span
                  className={`font-mono font-bold ${
                    rateStressBps > 0
                      ? "text-rose-300"
                      : rateStressBps < 0
                      ? "text-emerald-300"
                      : "text-slate-200"
                  }`}
                >
                  {rateStressBps >= 0 ? "+" : ""}
                  {rateStressBps} bps
                </span>
              </div>
              <input
                type="range"
                min={-150}
                max={200}
                step={25}
                value={rateStressBps}
                onChange={(e) => setRateStressBps(Number(e.target.value))}
                className="mt-1 w-full accent-amber-500"
              />
            </div>
          </div>

          {/* Residential vs. Commercial Executive Summary */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <Home className="h-3.5 w-3.5" /> Residential (5 Classes)
                </span>
                <span className="font-mono text-[10px] text-slate-400">Gross / STR</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-slate-400">Avg Levered IRR</span>
                  <div className="font-bold text-white">{resiVsComm.residentialAvgIrrPct}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Avg Cap Rate</span>
                  <div className="font-bold text-emerald-300">{resiVsComm.residentialAvgCapPct}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Avg Cash-on-Cash</span>
                  <div className="font-bold text-slate-200">{resiVsComm.residentialAvgCoCPct}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Avg DSCR</span>
                  <div className="font-bold text-slate-200">{resiVsComm.residentialAvgDscr}x</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
                  <Building2 className="h-3.5 w-3.5" /> Commercial (5 Classes)
                </span>
                <span className="font-mono text-[10px] text-slate-400">NNN / Mod-Gross</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-slate-400">Avg Levered IRR</span>
                  <div className="font-bold text-white">{resiVsComm.commercialAvgIrrPct}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Avg Cap Rate</span>
                  <div className="font-bold text-cyan-300">{resiVsComm.commercialAvgCapPct}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Avg Cash-on-Cash</span>
                  <div className="font-bold text-slate-200">{resiVsComm.commercialAvgCoCPct}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Avg DSCR</span>
                  <div className="font-bold text-slate-200">{resiVsComm.commercialAvgDscr}x</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-violet-300">
                  <TrendingUp className="h-3.5 w-3.5" /> Allocation Verdict
                </span>
                <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-200">
                  {resiVsComm.recommendedTilt}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                {resiVsComm.rationale}
              </p>
            </div>
          </div>

          {/* Chart: Cross-Class Levered IRR & Cap Rate */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                Cross-Class Return Profile in {activeMarket.name} (Levered IRR % vs. Going-In Cap %)
              </span>
              <span className="text-[10px] text-slate-400">
                Click any row below to load into Deal Underwriter
              </span>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={filteredClasses}
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="shortLabel" stroke="#64748b" fontSize={10} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={10}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0b1120",
                      borderColor: "#334155",
                      borderRadius: "10px",
                      fontSize: "11px",
                    }}
                    formatter={(val, name) => [`${val}%`, String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <ReferenceLine y={12} stroke="#10b981" strokeDasharray="3 3" />
                  <Bar
                    dataKey="leveredIrrPct"
                    name="Levered IRR %"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  >
                    {filteredClasses.map((entry) => (
                      <Cell
                        key={entry.propertyClass}
                        fill={
                          entry.category === "commercial" ? "#22d3ee" : "#10b981"
                        }
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="goingInCapRatePct"
                    name="Going-In Cap %"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 10-Class Interactive Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-900/70 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">Property Class</th>
                  <th className="px-2 py-2.5">Seg</th>
                  <th className="px-2 py-2.5">Lease</th>
                  <th className="px-2 py-2.5 text-right">Cap Rate</th>
                  <th className="px-2 py-2.5 text-right">CoC</th>
                  <th className="px-2 py-2.5 text-right">DSCR</th>
                  <th className="px-2 py-2.5 text-right">Debt Yield</th>
                  <th className="px-2 py-2.5 text-right">Lev IRR</th>
                  <th className="px-2 py-2.5 text-right">Score</th>
                  <th className="px-3 py-2.5 text-right">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
                {filteredClasses.map((row) => (
                  <tr
                    key={row.propertyClass}
                    onClick={() => {
                      handleLoadDefaults(row.propertyClass, activeMarketId);
                      setSubView("proforma");
                    }}
                    className={`cursor-pointer transition hover:bg-slate-800/60 ${
                      row.propertyClass === activeClassId ? "bg-emerald-500/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-sans font-semibold text-white">
                      {row.label}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase ${
                          row.category === "commercial"
                            ? "bg-cyan-500/15 text-cyan-300"
                            : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {row.category === "commercial" ? "COMM" : "RESI"}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-sans text-[10px] uppercase text-slate-400">
                      {row.leaseStructure.replace("_", " ")}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-200">
                      {row.goingInCapRatePct}%
                    </td>
                    <td
                      className={`px-2 py-2 text-right ${
                        row.cashOnCashPct >= 5 ? "text-emerald-300" : "text-amber-300"
                      }`}
                    >
                      {row.cashOnCashPct}%
                    </td>
                    <td
                      className={`px-2 py-2 text-right ${
                        row.dscr >= 1.25 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {row.dscr}x
                    </td>
                    <td className="px-2 py-2 text-right text-slate-300">
                      {row.debtYieldPct}%
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-white">
                      {row.leveredIrrPct}%
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-cyan-300">
                      {row.riskAdjustedScore}
                    </td>
                    <td className="px-3 py-2 text-right font-sans">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          row.verdict === "Attractive"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : row.verdict === "Core Hold"
                            ? "bg-cyan-500/15 text-cyan-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {row.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 3: CROSS-MARKET SCREENER (10 MARKETS)                      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {subView === "markets" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Property Class to Screen
                </label>
                <select
                  value={activeClassId}
                  onChange={(e) =>
                    handleLoadDefaults(
                      e.target.value as RealEstatePropertyClass,
                      activeMarketId
                    )
                  }
                  className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                >
                  <optgroup label="Residential Classes">
                    {REAL_ESTATE_CLASSES.filter((c) => c.category === "residential").map(
                      (c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      )
                    )}
                  </optgroup>
                  <optgroup label="Commercial Classes">
                    {REAL_ESTATE_CLASSES.filter((c) => c.category === "commercial").map(
                      (c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      )
                    )}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Region
                </label>
                <div className="mt-1 flex gap-1">
                  {(["All", "Canada", "US", "Global"] as const).map((reg) => (
                    <button
                      key={reg}
                      type="button"
                      onClick={() => setRegionFilter(reg)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        regionFilter === reg
                          ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                          : "bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                    >
                      {reg}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-w-[200px]">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Interest Rate Stress</span>
                <span className="font-mono font-bold text-amber-300">
                  {rateStressBps >= 0 ? "+" : ""}
                  {rateStressBps} bps
                </span>
              </div>
              <input
                type="range"
                min={-150}
                max={200}
                step={25}
                value={rateStressBps}
                onChange={(e) => setRateStressBps(Number(e.target.value))}
                className="mt-1 w-full accent-amber-500"
              />
            </div>
          </div>

          {/* Chart: Cross-Market Composite Score & Levered IRR */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                <MapPin className="h-3.5 w-3.5 text-violet-400" />
                Cross-Market Ranking for {activeProfile.label} (Composite Score &amp; Projected IRR)
              </span>
              <span className="text-[10px] text-slate-400">
                Click any market row to underwrite
              </span>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={filteredMarkets}
                  margin={{ top: 8, right: 14, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="marketName"
                    stroke="#64748b"
                    fontSize={9}
                    tickFormatter={(s: string) => s.split(",")[0]}
                  />
                  <YAxis
                    yAxisId="score"
                    stroke="#8b5cf6"
                    fontSize={10}
                    domain={[0, 100]}
                  />
                  <YAxis
                    yAxisId="irr"
                    orientation="right"
                    stroke="#10b981"
                    fontSize={10}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0b1120",
                      borderColor: "#334155",
                      borderRadius: "10px",
                      fontSize: "11px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <Bar
                    yAxisId="score"
                    dataKey="compositeScore"
                    name="Composite Score (0-100)"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    yAxisId="irr"
                    type="monotone"
                    dataKey="leveredIrrPct"
                    name="Levered IRR %"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3.5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cross-Market Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-900/70 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">Market</th>
                  <th className="px-2 py-2.5">Tier</th>
                  <th className="px-2 py-2.5 text-right">Pop / Jobs</th>
                  <th className="px-2 py-2.5 text-right">Supply</th>
                  <th className="px-2 py-2.5 text-right">Cap Rate</th>
                  <th className="px-2 py-2.5 text-right">Rent Gr.</th>
                  <th className="px-2 py-2.5 text-right">DSCR</th>
                  <th className="px-2 py-2.5 text-right">Lev IRR</th>
                  <th className="px-2 py-2.5 text-right">Score</th>
                  <th className="px-3 py-2.5 text-right">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
                {filteredMarkets.map((m) => (
                  <tr
                    key={m.marketId}
                    onClick={() => {
                      handleLoadDefaults(activeClassId, m.marketId);
                      setSubView("proforma");
                    }}
                    className={`cursor-pointer transition hover:bg-slate-800/60 ${
                      m.marketId === activeMarketId ? "bg-violet-500/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-sans font-semibold text-white">
                      {m.marketName}
                    </td>
                    <td className="px-2 py-2 font-sans text-[10px] text-slate-400">
                      {m.tier}
                    </td>
                    <td className="px-2 py-2 text-right text-emerald-300">
                      +{m.populationGrowthPct}% / +{m.jobGrowthPct}%
                    </td>
                    <td
                      className={`px-2 py-2 text-right ${
                        m.supplyPipelinePct >= 5
                          ? "text-amber-300"
                          : "text-slate-300"
                      }`}
                    >
                      {m.supplyPipelinePct}%
                    </td>
                    <td className="px-2 py-2 text-right text-cyan-300">
                      {m.benchmarkCapRatePct}%
                    </td>
                    <td className="px-2 py-2 text-right text-slate-200">
                      {m.projectedRentGrowthPct}%
                    </td>
                    <td
                      className={`px-2 py-2 text-right ${
                        m.dscr >= 1.25 ? "text-emerald-300" : "text-amber-300"
                      }`}
                    >
                      {m.dscr}x
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-white">
                      {m.leveredIrrPct}%
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-violet-300">
                      {m.compositeScore}
                    </td>
                    <td className="px-3 py-2 text-right font-sans">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          m.verdict === "Top Pick"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : m.verdict === "Balanced"
                            ? "bg-cyan-500/15 text-cyan-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {m.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricPill({
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
  const colors = {
    emerald: "text-emerald-300 border-emerald-500/25",
    cyan: "text-cyan-300 border-cyan-500/25",
    amber: "text-amber-300 border-amber-500/25",
    rose: "text-rose-300 border-rose-500/25",
  };
  return (
    <div
      className={`rounded-xl border bg-slate-950/75 px-3 py-2 ${colors[tone]}`}
    >
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div className="mt-0.5 font-mono text-base font-bold">{value}</div>
      <div className="truncate font-mono text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}

function SliderRow({
  label,
  valueDisplay,
  value,
  min,
  max,
  step,
  accent,
  valueClass,
  onChange,
}: {
  label: string;
  valueDisplay: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accent: string;
  valueClass: string;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono font-bold ${valueClass}`}>{valueDisplay}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 w-full ${accent}`}
      />
    </div>
  );
}
