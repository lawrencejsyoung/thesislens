"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import {
  CfaForensicResult,
  Holding,
} from "@/lib/types";
import {
  analyzeHedgeFundRisk,
  runLiquidityAndComplianceCheck,
} from "@/lib/quant-engine";

interface CfaHedgeFundLabProps {
  holdings: Holding[];
  initialAumUsd: number;
  forensics: CfaForensicResult;
}

function fmtUsd(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function CfaHedgeFundLab({
  holdings,
  initialAumUsd,
  forensics,
}: CfaHedgeFundLabProps) {
  const [aumMillions, setAumMillions] = useState<number>(
    Math.max(1, Math.round(initialAumUsd / 1_000_000) || 100)
  );
  const [maxAdvPct, setMaxAdvPct] = useState<number>(15);

  useEffect(() => {
    setAumMillions(Math.max(1, Math.round(initialAumUsd / 1_000_000) || 100));
  }, [initialAumUsd]);

  const liveAumUsd = aumMillions * 1_000_000;

  const liveRisk = useMemo(
    () => analyzeHedgeFundRisk(holdings, liveAumUsd),
    [holdings, liveAumUsd]
  );

  const liveCompliance = useMemo(
    () =>
      runLiquidityAndComplianceCheck(
        holdings,
        liveAumUsd,
        liveRisk,
        forensics,
        maxAdvPct
      ),
    [holdings, liveAumUsd, liveRisk, forensics, maxAdvPct]
  );

  const statusColors = {
    PASS: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    WARN: "bg-amber-500/15 text-amber-300 border-amber-500/35",
    BREACH: "bg-rose-500/15 text-rose-300 border-rose-500/35",
  };

  return (
    <div className="space-y-5">
      {/* Interactive AUM & Liquidity Participation Stress Bar */}
      <div className="rounded-xl border border-amber-500/25 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-200 uppercase tracking-wider">
              Institutional AUM & Capacity Stress Simulator
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              statusColors[liveCompliance.overallStatus]
            }`}
          >
            {liveCompliance.overallStatus === "PASS" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : liveCompliance.overallStatus === "WARN" ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" />
            )}
            Pre-Trade Compliance: {liveCompliance.overallStatus}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Simulated Fund AUM</span>
              <span className="font-mono font-semibold text-amber-300">
                ${aumMillions}M
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={500}
              step={5}
              value={aumMillions}
              onChange={(e) => setAumMillions(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>$5M Seed</span>
              <span>$100M Institutional</span>
              <span>$500M Capacity Test</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Max Daily ADV Participation Cap</span>
              <span className="font-mono font-semibold text-cyan-300">
                {maxAdvPct}% ADV
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={25}
              step={1}
              value={maxAdvPct}
              onChange={(e) => setMaxAdvPct(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>5% Stealth</span>
              <span>15% Institutional Std</span>
              <span>25% Urgent</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Hedge Fund Book KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-400">Gross / Net Exposure</div>
          <div className="text-base font-bold text-white mt-0.5">
            {liveRisk.grossExposurePct}% / {liveRisk.netExposurePct}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            L {liveRisk.longExposurePct}% · S {liveRisk.shortExposurePct}% · β-Net{" "}
            {liveRisk.betaAdjustedNetPct}%
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-400">99% 1M CVaR (Fat-Tail)</div>
          <div className="text-base font-bold text-rose-400 mt-0.5">
            -{liveRisk.cvar99MonthlyPct}% ({fmtUsd(liveRisk.cvar99MonthlyUsd)})
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            95% VaR: -{liveRisk.var95MonthlyPct}% ({fmtUsd(liveRisk.var95MonthlyUsd)})
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-400">Sharpe / Sortino / Calmar</div>
          <div className="text-base font-bold text-emerald-400 mt-0.5">
            {liveRisk.sharpeRatio} / {liveRisk.sortinoRatio} / {liveRisk.calmarRatio}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Net Ret {liveRisk.expectedNetReturnPct}% · Borrow -{liveRisk.shortBorrowDragBps}bps
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-400">Almgren-Chriss Slippage</div>
          <div className="text-base font-bold text-cyan-300 mt-0.5">
            {liveCompliance.totalEstimatedSlippageBps} bps (
            {fmtUsd(liveCompliance.totalEstimatedRebalanceSlippageUsd)})
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Weighted DTL: {liveCompliance.weightedDaysToLiquidate}d · Idio Alpha:{" "}
            {liveRisk.idiosyncraticRiskPct}%
          </div>
        </div>
      </div>

      {/* CFA Level II/III Forensic Accounting & Quality of Earnings */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              CFA Level II/III Forensic Accounting & Valuation ({forensics.ticker})
            </h3>
          </div>
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              forensics.beneishFlag === "CLEAN"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : "bg-rose-500/15 text-rose-300 border-rose-500/30"
            }`}
          >
            Beneish: {forensics.beneishFlag.replaceAll("_", " ")}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-3">
            <div className="text-slate-400 text-[11px]">Beneish M-Score</div>
            <div
              className={`text-lg font-bold mt-0.5 ${
                forensics.beneishMScore > -1.78 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {forensics.beneishMScore}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Threshold &gt; -1.78 | DSRI {forensics.beneishComponents.dsri} · GMI{" "}
              {forensics.beneishComponents.gmi}
            </div>
          </div>

          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-3">
            <div className="text-slate-400 text-[11px]">Altman Z-Score</div>
            <div
              className={`text-lg font-bold mt-0.5 ${
                forensics.altmanZone === "SAFE"
                  ? "text-emerald-400"
                  : forensics.altmanZone === "GREY"
                  ? "text-amber-300"
                  : "text-rose-400"
              }`}
            >
              {forensics.altmanZScore} ({forensics.altmanZone})
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Sloan Accruals {forensics.sloanAccrualsRatioPct}% · OCF/NI{" "}
              {forensics.cashConversionRatio}x
            </div>
          </div>

          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-3">
            <div className="text-slate-400 text-[11px]">DuPont 3-Stage ROE</div>
            <div className="text-lg font-bold text-cyan-300 mt-0.5">
              {forensics.dupontRoe.roePct}%
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {forensics.dupontRoe.netMarginPct}% Margin × {forensics.dupontRoe.assetTurnover}x
              Turn × {forensics.dupontRoe.financialLeverage}x Lev
            </div>
          </div>

          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-3">
            <div className="text-slate-400 text-[11px]">Bottom-Up Hamada WACC</div>
            <div className="text-lg font-bold text-violet-300 mt-0.5">
              {forensics.bottomUpWacc.waccPct}%
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              βL {forensics.bottomUpWacc.releveredBeta} · Ke {forensics.bottomUpWacc.costOfEquityPct}% ·
              Kd(1-t) {forensics.bottomUpWacc.afterTaxCostOfDebtPct}%
            </div>
          </div>
        </div>
      </div>

      {/* Factor Attribution Chart + Pre-Trade Compliance Scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
            Fama-French & Macro Factor Tilts (Net Book)
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={liveRisk.factorTilts}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="factor"
                  stroke="#94a3b8"
                  width={118}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <ReferenceLine x={0} stroke="#475569" />
                <Bar dataKey="exposure" name="Factor Beta" radius={[0, 4, 4, 0]}>
                  {liveRisk.factorTilts.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.exposure >= 0 ? "#10b981" : "#f43f5e"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Pre-Trade Compliance Guardrails
            </h3>
          </div>
          <div className="space-y-2">
            {liveCompliance.complianceChecks.map((rule) => (
              <div
                key={rule.ruleId}
                className="flex items-start justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2"
              >
                <div>
                  <div className="text-xs font-medium text-slate-200">
                    {rule.ruleName}
                  </div>
                  <div className="text-[11px] text-slate-400">{rule.detail}</div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                      statusColors[rule.status]
                    }`}
                  >
                    {rule.status}
                  </span>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    {rule.actual} / {rule.limit}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Position-Level Liquidity, Market Impact & Black-Litterman Sizing Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 overflow-x-auto">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
          Position Risk (MCTR), ADV Liquidity & Black-Litterman Optimal Sizing ({fmtUsd(liveAumUsd)})
        </h3>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] text-slate-400">
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3">Side</th>
              <th className="py-2 pr-3 text-right">Exposure</th>
              <th className="py-2 pr-3 text-right">BL Optimal</th>
              <th className="py-2 pr-3 text-right">% of Risk</th>
              <th className="py-2 pr-3 text-right">Days to Liq</th>
              <th className="py-2 text-right">Impact (bps)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {liveRisk.positionRisks.map((pos, idx) => {
              const liq = liveCompliance.positionLiquidity[idx];
              const bl = liveRisk.blackLittermanWeights[idx];
              return (
                <tr key={pos.ticker} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-3 font-mono font-semibold text-slate-100">
                    {pos.ticker}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        pos.side === "LONG"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {pos.side}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-slate-200">
                    {pos.signedWeightPct}% ({fmtUsd(pos.dollarExposure)})
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-cyan-300">
                    {bl?.optimalSignedWeightPct ?? pos.signedWeightPct}%
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-slate-300">
                    {pos.percentOfRisk}%
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    <span
                      className={
                        (liq?.daysToLiquidate ?? 0) > 5
                          ? "text-rose-400 font-semibold"
                          : (liq?.daysToLiquidate ?? 0) > 1
                          ? "text-amber-300"
                          : "text-emerald-400"
                      }
                    >
                      {liq?.daysToLiquidate ?? 0}d
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-slate-300">
                    {liq?.estimatedImpactBps ?? 0} bps
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
