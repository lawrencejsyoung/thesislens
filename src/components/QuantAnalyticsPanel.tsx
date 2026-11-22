"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
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
  Building2,
  Calculator,
  Flame,
  Landmark,
  PieChart,
  Rocket,
  ShieldCheck,
  Sigma,
  Target,
} from "lucide-react";
import { CfaHedgeFundLab } from "@/components/CfaHedgeFundLab";
import { RealEstateAnalysisLab } from "@/components/RealEstateAnalysisLab";
import { GlobalTaxModule } from "@/components/GlobalTaxModule";
import {
  AnalysisRequestPayload,
  DcfInputs,
  DcfResult,
  MacroShockScenarioResult,
  MonteCarloResult,
  PortfolioMetrics,
  UniversalQuantBundle,
} from "@/lib/types";
import {
  evaluatePredictionBet,
  priceOptionStrategy,
  runDcfValuation,
  simulateVenturePowerLaw,
} from "@/lib/quant-engine";

interface QuantAnalyticsPanelProps {
  metrics: PortfolioMetrics;
  dcfResult: DcfResult;
  dcfInputs: DcfInputs;
  monteCarlo: MonteCarloResult;
  macroShocks: MacroShockScenarioResult[];
  universalQuant?: UniversalQuantBundle | null;
  requestPayload?: AnalysisRequestPayload;
  userApiKey?: string;
}

type QuantTab =
  | "hedge_fund"
  | "prediction"
  | "options"
  | "real_assets"
  | "global_tax"
  | "venture"
  | "montecarlo"
  | "macro"
  | "dcf";

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
  universalQuant,
  requestPayload,
  userApiKey,
}: QuantAnalyticsPanelProps) {
  const hasHedgeFund = Boolean(universalQuant?.cfaForensics && universalQuant?.hedgeFundRisk);
  const hasPrediction = Boolean(universalQuant?.predictionValuation);
  const hasOptions = Boolean(universalQuant?.optionsValuation);
  const hasRealAssets = Boolean(universalQuant?.realAssetValuation);
  const hasVenture = Boolean(universalQuant?.ventureValuation);

  const isHedgeFundPrimary =
    hasHedgeFund &&
    (requestPayload?.analysisMode === "hedge_fund" ||
      (requestPayload?.capital ?? 0) >= 1_000_000);

  const defaultTab: QuantTab = isHedgeFundPrimary
    ? "hedge_fund"
    : hasPrediction
    ? "prediction"
    : hasOptions
    ? "options"
    : hasRealAssets
    ? "real_assets"
    : hasVenture
    ? "venture"
    : "montecarlo";

  const [activeTab, setActiveTab] = useState<QuantTab>(defaultTab);

  // Switch automatically to the most relevant lab when the mode/scenario changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, requestPayload?.title]);

  // ── Equity DCF Interactive Sliders ──
  const [waccOverride, setWaccOverride] = useState<number>(dcfInputs.waccPct);
  const [growthOverride, setGrowthOverride] = useState<number>(
    dcfInputs.revenueGrowthYear1To5Pct
  );
  const [terminalOverride, setTerminalOverride] = useState<number>(
    dcfInputs.terminalGrowthPct
  );
  useEffect(() => {
    setWaccOverride(dcfInputs.waccPct);
    setGrowthOverride(dcfInputs.revenueGrowthYear1To5Pct);
    setTerminalOverride(dcfInputs.terminalGrowthPct);
  }, [
    dcfInputs.ticker,
    dcfInputs.waccPct,
    dcfInputs.revenueGrowthYear1To5Pct,
    dcfInputs.terminalGrowthPct,
  ]);

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

  // ── Prediction Market Interactive Sliders ──
  const predBase = requestPayload?.predictionInputs;
  const [predTrueProb, setPredTrueProb] = useState<number>(
    predBase?.estimatedTrueProbPct ?? 54
  );
  const [predYesCents, setPredYesCents] = useState<number>(
    predBase?.yesPriceCents ?? 38
  );
  const [predOracleHaircut, setPredOracleHaircut] = useState<number>(
    predBase?.oracleRiskHaircutPct ?? 10
  );
  useEffect(() => {
    if (!predBase) return;
    setPredTrueProb(predBase.estimatedTrueProbPct);
    setPredYesCents(predBase.yesPriceCents);
    setPredOracleHaircut(predBase.oracleRiskHaircutPct);
  }, [predBase]);

  const livePrediction = useMemo(() => {
    if (!hasPrediction) return null;
    const base = predBase ?? {
      question: requestPayload?.title ?? "Future Outcome Contract",
      venue: "Polymarket",
      side: "YES" as const,
      yesPriceCents: 38,
      noPriceCents: 64,
      estimatedTrueProbPct: 54,
      feePct: 1.5,
      oracleRiskHaircutPct: 10,
      stakeCapital: requestPayload?.capital ?? 50000,
      resolutionDate: "2027-12-31",
    };
    return evaluatePredictionBet({
      ...base,
      yesPriceCents: predYesCents,
      noPriceCents: Math.min(99, Math.max(1, 102 - predYesCents)),
      estimatedTrueProbPct: predTrueProb,
      oracleRiskHaircutPct: predOracleHaircut,
    });
  }, [hasPrediction, predBase, predYesCents, predTrueProb, predOracleHaircut, requestPayload]);

  // ── Options Interactive Sliders ──
  const optBase = requestPayload?.optionInputs;
  const [optIv, setOptIv] = useState<number>(optBase?.impliedVolatilityPct ?? 38);
  const [optDte, setOptDte] = useState<number>(optBase?.daysToExpiry ?? 150);
  useEffect(() => {
    if (!optBase) return;
    setOptIv(optBase.impliedVolatilityPct);
    setOptDte(optBase.daysToExpiry);
  }, [optBase]);

  const liveOptions = useMemo(() => {
    if (!hasOptions) return null;
    const base = optBase ?? {
      underlying: dcfInputs.ticker,
      strategy: "bull_call_spread" as const,
      spotPrice: dcfInputs.currentPrice,
      strikePrice: Math.round(dcfInputs.currentPrice * 1.02),
      upperStrikePrice: Math.round(dcfInputs.currentPrice * 1.22),
      daysToExpiry: 150,
      impliedVolatilityPct: 38,
      riskFreeRatePct: 4.2,
      contracts: 5,
    };
    return priceOptionStrategy({
      ...base,
      impliedVolatilityPct: optIv,
      daysToExpiry: optDte,
    });
  }, [hasOptions, optBase, optIv, optDte, dcfInputs]);

  // ── Real Estate KPI Summary ──
  const liveRealEstate = universalQuant?.realAssetValuation ?? null;

  // ── Venture Power-Law Interactive Sliders ──
  const vcBase = requestPayload?.ventureInputs;
  const [vcFailPct, setVcFailPct] = useState<number>(vcBase?.failureProbPct ?? 58);
  const [vcDilutionPct, setVcDilutionPct] = useState<number>(
    vcBase?.expectedDilutionPct ?? 45
  );
  useEffect(() => {
    if (!vcBase) return;
    setVcFailPct(vcBase.failureProbPct);
    setVcDilutionPct(vcBase.expectedDilutionPct);
  }, [vcBase]);

  const liveVenture = useMemo(() => {
    if (!hasVenture || !vcBase) return universalQuant?.ventureValuation ?? null;
    return simulateVenturePowerLaw({
      ...vcBase,
      failureProbPct: vcFailPct,
      expectedDilutionPct: vcDilutionPct,
    });
  }, [hasVenture, vcBase, vcFailPct, vcDilutionPct, universalQuant]);

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
          sub={`Yield ${metrics.weightedDividendYieldPct}%`}
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
        {livePrediction ? (
          <KpiCard
            label="Event Bet Edge"
            value={`${livePrediction.edgePct >= 0 ? "+" : ""}${livePrediction.edgePct}%`}
            sub={`Kelly ${livePrediction.riskAdjustedKellyPct}% · EV ${livePrediction.expectedRoiPct}%`}
            tone={livePrediction.edgePct > 0 ? "emerald" : "rose"}
          />
        ) : liveRealEstate ? (
          <KpiCard
            label="Levered IRR"
            value={`${liveRealEstate.leveredIrrPct}%`}
            sub={`DSCR ${liveRealEstate.dscr}x · Cap ${liveRealEstate.goingInCapRatePct}%`}
            tone={liveRealEstate.dscr >= 1.2 ? "emerald" : "amber"}
          />
        ) : liveVenture ? (
          <KpiCard
            label="Venture Mean MOIC"
            value={`${liveVenture.meanMoic}x`}
            sub={`Median ${liveVenture.medianMoic}x · IRR ${liveVenture.expectedIrrPct}%`}
            tone={liveVenture.meanMoic >= 2.5 ? "emerald" : "amber"}
          />
        ) : (
          <KpiCard
            label={`${liveDcf.ticker} DCF Fair Value`}
            value={`$${liveDcf.impliedSharePrice}`}
            sub={`${liveDcf.upsidePct >= 0 ? "+" : ""}${liveDcf.upsidePct}% vs $${liveDcf.currentPrice}`}
            tone={liveDcf.upsidePct >= 0 ? "emerald" : "rose"}
          />
        )}
      </div>

      {/* Main Chart Card with Adaptive Tabs */}
      <div className="rounded-2xl border border-slate-800/90 bg-[#0d1424] p-4 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {hasHedgeFund && (
              <TabButton
                active={activeTab === "hedge_fund"}
                onClick={() => setActiveTab("hedge_fund")}
                icon={ShieldCheck}
                label="CFA & $100M Fund Risk"
              />
            )}
            {hasPrediction && (
              <TabButton
                active={activeTab === "prediction"}
                onClick={() => setActiveTab("prediction")}
                icon={Target}
                label="Prediction EV & Kelly"
              />
            )}
            {hasOptions && (
              <TabButton
                active={activeTab === "options"}
                onClick={() => setActiveTab("options")}
                icon={Sigma}
                label="Options Payoff & Greeks"
              />
            )}
            <TabButton
              active={activeTab === "real_assets"}
              onClick={() => setActiveTab("real_assets")}
              icon={Building2}
              label="Real Estate Lab"
            />
            <TabButton
              active={activeTab === "global_tax"}
              onClick={() => setActiveTab("global_tax")}
              icon={Landmark}
              label="Global Tax Consultant"
            />
            {hasVenture && (
              <TabButton
                active={activeTab === "venture"}
                onClick={() => setActiveTab("venture")}
                icon={Rocket}
                label="Venture Power-Law"
              />
            )}
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
              label="6-Regime Stress Test"
            />
            <TabButton
              active={activeTab === "dcf"}
              onClick={() => setActiveTab("dcf")}
              icon={Calculator}
              label={`Equity DCF (${liveDcf.ticker})`}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Deterministic Quant Suite</span>
          </div>
        </div>

        {/* TAB: CFA & $100M HEDGE FUND RISK LAB */}
        {activeTab === "hedge_fund" && universalQuant?.cfaForensics && requestPayload && (
          <CfaHedgeFundLab
            holdings={requestPayload.holdings}
            initialAumUsd={requestPayload.capital}
            forensics={universalQuant.cfaForensics}
          />
        )}

        {/* TAB: GLOBAL TAX CONSULTANT MODULE */}
        {activeTab === "global_tax" && (
          <GlobalTaxModule
            initialJurisdiction={requestPayload?.jurisdiction ?? "Canada"}
            initialCapital={requestPayload?.capital ?? 250000}
            userApiKey={userApiKey}
          />
        )}

        {/* TAB: PREDICTION MARKET EV & KELLY LAB */}
        {activeTab === "prediction" && livePrediction && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-5">
              <div>
                <span className="text-xs font-bold text-white">
                  Live Prediction EV &amp; Kelly Lab ({livePrediction.venue})
                </span>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                  {livePrediction.question}
                </p>
              </div>

              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Calibrated True YES Prob</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {predTrueProb}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={95}
                  step={1}
                  value={predTrueProb}
                  onChange={(e) => setPredTrueProb(Number(e.target.value))}
                  className="mt-1 w-full accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Market YES Price</span>
                  <span className="font-mono font-bold text-violet-300">
                    {predYesCents}¢ (Fair {livePrediction.fairImpliedProbPct}%)
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={95}
                  step={1}
                  value={predYesCents}
                  onChange={(e) => setPredYesCents(Number(e.target.value))}
                  className="mt-1 w-full accent-violet-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Oracle / Resolution Risk Haircut</span>
                  <span className="font-mono font-bold text-amber-300">
                    {predOracleHaircut}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={35}
                  step={1}
                  value={predOracleHaircut}
                  onChange={(e) => setPredOracleHaircut(Number(e.target.value))}
                  className="mt-1 w-full accent-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 text-[11px]">
                <div>
                  <span className="text-slate-500">Expected ROI / Dollar</span>
                  <div
                    className={`font-mono font-bold ${
                      livePrediction.expectedRoiPct >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {livePrediction.expectedRoiPct >= 0 ? "+" : ""}
                    {livePrediction.expectedRoiPct}%
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Risk-Adj Kelly Stake</span>
                  <div className="font-mono font-bold text-cyan-300">
                    {livePrediction.riskAdjustedKellyPct}% ({fmtUsd(livePrediction.recommendedDollarStake)})
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Full / Half Kelly</span>
                  <div className="font-mono text-slate-200">
                    {livePrediction.fullKellyPct}% / {livePrediction.halfKellyPct}%
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Breakeven Prob</span>
                  <div className="font-mono text-slate-200">
                    {livePrediction.breakevenProbPct}% (Vig {livePrediction.overroundPct}%)
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-7">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-white">
                  True Probability vs. Entry Price EV Matrix (ROI % / Kelly %)
                </span>
                <span className="text-[10px] text-slate-400">Green = +EV Edge</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-center font-mono text-[11px]">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="p-1.5 text-left text-[10px]">True Prob \ Price</th>
                      {Array.from(
                        new Set(livePrediction.sensitivityGrid.map((c) => c.entryPriceCents))
                      ).map((p) => (
                        <th key={p} className="p-1.5">
                          {p}¢
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      new Set(livePrediction.sensitivityGrid.map((c) => c.trueProbPct))
                    ).map((tp) => (
                      <tr key={tp} className="border-t border-slate-800/70">
                        <td className="p-1.5 text-left font-semibold text-slate-300">
                          {tp}%
                        </td>
                        {Array.from(
                          new Set(livePrediction.sensitivityGrid.map((c) => c.entryPriceCents))
                        ).map((ep) => {
                          const cell = livePrediction.sensitivityGrid.find(
                            (c) => c.trueProbPct === tp && c.entryPriceCents === ep
                          );
                          if (!cell) return <td key={ep} />;
                          const bg =
                            cell.expectedRoiPct >= 20
                              ? "bg-emerald-500/25 text-emerald-200"
                              : cell.expectedRoiPct > 0
                              ? "bg-emerald-500/10 text-emerald-300"
                              : cell.expectedRoiPct >= -12
                              ? "bg-amber-500/10 text-amber-300"
                              : "bg-rose-500/20 text-rose-300";
                          return (
                            <td key={ep} className="p-1">
                              <div className={`rounded-md px-2 py-1.5 ${bg}`}>
                                <div className="font-bold">
                                  {cell.expectedRoiPct >= 0 ? "+" : ""}
                                  {cell.expectedRoiPct}%
                                </div>
                                <div className="text-[9px] opacity-80">
                                  Kelly {cell.halfKellyPct}%
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
        )}

        {/* TAB: OPTIONS PAYOFF & BLACK-SCHOLES GREEKS LAB */}
        {activeTab === "options" && liveOptions && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-4">
                <div>
                  <span className="text-xs font-bold text-white">
                    {liveOptions.underlying} {liveOptions.strategy.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Spot ${liveOptions.spotPrice} · Strike ${liveOptions.strikePrice}
                    {liveOptions.upperStrikePrice ? ` / $${liveOptions.upperStrikePrice}` : ""}
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Implied Volatility (IV)</span>
                    <span className="font-mono font-bold text-cyan-300">{optIv}%</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={95}
                    step={1}
                    value={optIv}
                    onChange={(e) => setOptIv(Number(e.target.value))}
                    className="mt-1 w-full accent-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Days to Expiry (DTE)</span>
                    <span className="font-mono font-bold text-emerald-300">{optDte}d</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={365}
                    step={5}
                    value={optDte}
                    onChange={(e) => setOptDte(Number(e.target.value))}
                    className="mt-1 w-full accent-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 text-[11px]">
                  <div>
                    <span className="text-slate-500">Capital at Risk</span>
                    <div className="font-mono font-bold text-rose-300">
                      {fmtUsd(liveOptions.totalCapitalAtRisk)}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Max Profit</span>
                    <div className="font-mono font-bold text-emerald-300">
                      {liveOptions.maxProfit === null
                        ? "Unlimited"
                        : fmtUsd(liveOptions.maxProfit)}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Prob of Profit</span>
                    <div className="font-mono font-bold text-cyan-300">
                      {liveOptions.probabilityOfProfitPct}%
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Breakeven(s)</span>
                    <div className="font-mono text-white">
                      {liveOptions.breakevens.map((b) => `$${b}`).join(" / ")}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 border-t border-slate-800 pt-2 text-center font-mono text-[10px]">
                  <div className="rounded bg-slate-900 p-1.5">
                    <div className="text-slate-500">Δ Delta</div>
                    <div className="font-bold text-emerald-300">{liveOptions.greeks.delta}</div>
                  </div>
                  <div className="rounded bg-slate-900 p-1.5">
                    <div className="text-slate-500">Γ Gamma</div>
                    <div className="font-bold text-cyan-300">{liveOptions.greeks.gamma}</div>
                  </div>
                  <div className="rounded bg-slate-900 p-1.5">
                    <div className="text-slate-500">Θ Theta</div>
                    <div className="font-bold text-rose-300">{liveOptions.greeks.thetaPerDay}</div>
                  </div>
                  <div className="rounded bg-slate-900 p-1.5">
                    <div className="text-slate-500">ν Vega</div>
                    <div className="font-bold text-violet-300">{liveOptions.greeks.vegaPer1PctIv}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-8">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Payoff Diagram: Expiry P&amp;L vs. Mid-Life BSM Value ($)
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Debit: ${liveOptions.netDebitPerShare}/sh
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={liveOptions.payoffCurve} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="spotPrice"
                        stroke="#64748b"
                        fontSize={10}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={10}
                        tickFormatter={(v) => fmtUsd(Number(v))}
                      />
                      <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0b1120",
                          borderColor: "#334155",
                          borderRadius: "10px",
                          fontSize: "12px",
                        }}
                        formatter={(value, name) => [fmtUsd(Number(value)), String(name)]}
                        labelFormatter={(label) => `Underlying Spot: $${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="expiryPnl"
                        name="At Expiry P&L"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="midLifePnl"
                        name="Mid-Life BSM P&L"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: COMPREHENSIVE REAL ESTATE ANALYSIS LAB (RESIDENTIAL & COMMERCIAL) */}
        {activeTab === "real_assets" && (
          <RealEstateAnalysisLab
            initialInputs={requestPayload?.realEstateInputs}
            bondValuation={universalQuant?.bondValuation}
          />
        )}

        {/* TAB: VENTURE POWER-LAW LAB */}
        {activeTab === "venture" && liveVenture && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-5">
              <div>
                <span className="text-xs font-bold text-white">
                  {liveVenture.companyName} ({liveVenture.stage})
                </span>
                <p className="text-[11px] text-slate-400">
                  Check {fmtUsd(liveVenture.investmentAmount)} · Diluted Own{" "}
                  {liveVenture.dilutedOwnershipPct}%
                </p>
              </div>

              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Startup Failure Probability</span>
                  <span className="font-mono font-bold text-rose-300">{vcFailPct}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={85}
                  step={1}
                  value={vcFailPct}
                  onChange={(e) => setVcFailPct(Number(e.target.value))}
                  className="mt-1 w-full accent-rose-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Expected Cumulative Dilution</span>
                  <span className="font-mono font-bold text-fuchsia-300">
                    {vcDilutionPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={75}
                  step={5}
                  value={vcDilutionPct}
                  onChange={(e) => setVcDilutionPct(Number(e.target.value))}
                  className="mt-1 w-full accent-fuchsia-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 text-[11px]">
                <div>
                  <span className="text-slate-500">Mean vs. Median MOIC</span>
                  <div className="font-mono font-bold text-emerald-300">
                    {liveVenture.meanMoic}x / {liveVenture.medianMoic}x
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Expected IRR / P90</span>
                  <div className="font-mono font-bold text-cyan-300">
                    {liveVenture.expectedIrrPct}% / {liveVenture.p90Moic}x
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Loss Odds (&lt;1x)</span>
                  <div className="font-mono font-bold text-rose-300">
                    {liveVenture.probabilityOfLossPct}%
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Breakeven Exit Val</span>
                  <div className="font-mono font-bold text-white">
                    {fmtUsd(liveVenture.breakevenExitValuation)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 lg:col-span-7">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-white">
                  1,200-Path Power-Law Exit Distribution (Probability %)
                </span>
                <span className="text-[10px] text-slate-400">
                  Exp Ending Value: {fmtUsd(liveVenture.expectedEndingValue)}
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={liveVenture.exitDistribution}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="bucket" stroke="#64748b" fontSize={10} />
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
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="probabilityPct" name="Probability %" radius={[6, 6, 0, 0]}>
                      {liveVenture.exitDistribution.map((entry, idx) => (
                        <Cell
                          key={entry.bucket}
                          fill={
                            idx === 0
                              ? "#f43f5e"
                              : idx === 1
                              ? "#f59e0b"
                              : idx === 2
                              ? "#22d3ee"
                              : "#10b981"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB: MONTE CARLO */}
        {activeTab === "montecarlo" && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {monteCarlo.horizonYears}-Year Monte Carlo Wealth Projection ({monteCarlo.simulations} Paths)
                </h3>
                <p className="text-xs text-slate-400">
                  P10 Downside:{" "}
                  <strong className="font-mono text-rose-300">
                    {fmtUsd(monteCarlo.downsideP10Value)}
                  </strong>{" "}
                  · Median (P50):{" "}
                  <strong className="font-mono text-emerald-300">
                    {fmtUsd(monteCarlo.medianEndingValue)}
                  </strong>{" "}
                  · P90 Upside:{" "}
                  <strong className="font-mono text-cyan-300">
                    {fmtUsd(monteCarlo.upsideP90Value)}
                  </strong>
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
                <AreaChart
                  data={monteCarlo.trajectory}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                >
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
                    formatter={(value, name) => [fmtUsd(Number(value)), String(name)]}
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

            <div className="mt-4 border-t border-slate-800/80 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <PieChart className="h-3.5 w-3.5 text-cyan-400" />
                <span>Cross-Asset Exposure Breakdown</span>
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

        {/* TAB: 6-REGIME MACRO SHOCK STRESS TEST */}
        {activeTab === "macro" && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-bold text-white">
                Cross-Asset Regime Stress-Test Impact (% Portfolio Move)
              </h3>
              <p className="text-xs text-slate-400">
                Beta-adjusted shock modeling across 6 institutional macro &amp; liquidity regimes
              </p>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={macroShocks}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={10}
                    tickFormatter={(v: string) =>
                      v.length > 18 ? `${v.slice(0, 16)}…` : v
                    }
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
                    formatter={(v) => {
                      const val = Number(v);
                      return [`${val >= 0 ? "+" : ""}${val}%`, "Portfolio Impact"];
                    }}
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
                      Worst Hit:{" "}
                      <strong className="font-mono text-rose-300">
                        {s.worstHitHolding}
                      </strong>
                    </span>
                    <span>
                      Best Hedge:{" "}
                      <strong className="font-mono text-emerald-300">
                        {s.bestHedgeHolding}
                      </strong>
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

        {/* TAB: INTERACTIVE EQUITY DCF */}
        {activeTab === "dcf" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
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
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
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
