"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  Coins,
  Globe2,
  Landmark,
  Loader2,
  MessageSquareText,
  Send,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  ForeignPropertyEntityType,
  ForeignRealEstateMarketId,
  ForeignSourceCountryId,
  GlobalTaxProfile,
  Jurisdiction,
  TaxConsultantMessage,
  TaxResidencyId,
} from "@/lib/types";
import {
  buildDefaultGlobalTaxProfile,
  FOREIGN_REAL_ESTATE_MARKETS,
  FOREIGN_SOURCE_COUNTRIES,
  runGlobalTaxAudit,
  TAX_RESIDENCY_PROFILES,
} from "@/lib/quant-engine";

interface GlobalTaxModuleProps {
  initialJurisdiction?: Jurisdiction;
  initialCapital?: number;
  userApiKey?: string;
}

type TaxSubView = "consultant" | "accounts" | "streams" | "business" | "foreign_re";

function fmtUsd(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

const ENTITY_OPTIONS: { id: ForeignPropertyEntityType; label: string }[] = [
  { id: "personal_direct", label: "Personal Direct" },
  { id: "home_corp", label: "Home-Country Corp" },
  { id: "local_llc", label: "Local LLC / SPV" },
  { id: "trust_fideicomiso", label: "Trust / Fideicomiso" },
];

export function GlobalTaxModule({
  initialJurisdiction = "Canada",
  initialCapital = 250000,
  userApiKey = "",
}: GlobalTaxModuleProps) {
  const [subView, setSubView] = useState<TaxSubView>("consultant");
  const [profile, setProfile] = useState<GlobalTaxProfile>(() =>
    buildDefaultGlobalTaxProfile(initialJurisdiction, initialCapital)
  );

  // Update portfolio capital if user switches scenario preset and hasn't manually changed residency
  useEffect(() => {
    setProfile((prev) => ({
      ...prev,
      portfolioValueUsd: Math.max(50_000, Math.min(25_000_000, initialCapital || prev.portfolioValueUsd)),
    }));
  }, [initialCapital]);

  const report = useMemo(() => runGlobalTaxAudit(profile), [profile]);

  // Pocket Tax Consultant chat state
  const [messages, setMessages] = useState<TaxConsultantMessage[]>([]);
  const [questionInput, setQuestionInput] = useState("");
  const [isConsulting, setIsConsulting] = useState(false);

  const quickPrompts = useMemo(
    () => [
      `Where should I hold ${FOREIGN_SOURCE_COUNTRIES[profile.foreignSourceCountry].label.split(" ")[0]} dividend ETFs vs. domestic stocks?`,
      `How do I access ${fmtUsd(profile.targetGainToAccessUsd)} of investment gains with minimal tax?`,
      `Should I buy ${FOREIGN_REAL_ESTATE_MARKETS[profile.foreignPropertyMarket].label} real estate personally, in a corp, or local LLC?`,
      `Compare salary vs. retained earnings vs. HoldCo for my ${fmtUsd(profile.businessAnnualProfitUsd)} profit business`,
      `What cross-border compliance traps (PFIC, T1135, Estate Tax, FIRPTA) apply to my profile?`,
      `Compare Buy-Borrow-Die (SBLOC) vs. Return of Capital vs. Long-Term Capital Gains`,
    ],
    [
      profile.foreignSourceCountry,
      profile.targetGainToAccessUsd,
      profile.foreignPropertyMarket,
      profile.businessAnnualProfitUsd,
    ]
  );

  const askConsultant = async (promptText?: string) => {
    const q = (promptText ?? questionInput).trim();
    if (!q || isConsulting) return;

    const userMsg: TaxConsultantMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!promptText) setQuestionInput("");
    setIsConsulting(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userApiKey.trim()) {
        headers["x-gemini-api-key"] = userApiKey.trim();
      }

      const res = await fetch("/api/tax-consultant", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: q,
          profile,
          history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tax consultant request failed");

      const replyMsg: TaxConsultantMessage = {
        id: `c-${Date.now()}`,
        role: "consultant",
        content: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        mode: data.mode,
        keyMetricsCited: data.keyMetricsCited ?? [],
        actionSteps: data.actionSteps ?? [],
        riskFlags: data.riskFlags ?? [],
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "consultant",
          content:
            err instanceof Error
              ? `Unable to reach tax consultant: ${err.message}`
              : "Unable to reach tax consultant.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsConsulting(false);
    }
  };

  // Chart data
  const accountChartData = useMemo(
    () =>
      report.accountLocations.map((a) => ({
        name: a.accountName.split("(")[0].trim().slice(0, 22),
        wealth: a.projected10YrWealthUsd,
        taxSaved: a.taxSavedVsTaxableUsd,
        category: a.category,
      })),
    [report.accountLocations]
  );

  const streamChartData = useMemo(
    () =>
      report.incomeStreams.map((s) => ({
        name: s.label.split("(")[0].trim().slice(0, 24),
        netSpendable: s.netSpendableUsd,
        totalDrag: s.domesticTaxUsd + s.foreignWithholdingUsd + s.borrowingOrFrictionUsd,
        effRate: s.effectiveTaxRatePct,
      })),
    [report.incomeStreams]
  );

  const businessChartData = useMemo(
    () =>
      report.businessStructures.map((b) => ({
        name: b.label.split("(")[0].trim().slice(0, 20),
        annualTax: b.totalAnnualTaxUsd,
        retained: b.retainedForReinvestmentUsd,
      })),
    [report.businessStructures]
  );

  const re = report.foreignRealEstate;
  const reChartData = [
    { name: "Pre-Tax IRR", value: re.preTaxIrrPct, fill: "#38bdf8" },
    { name: "After-Tax IRR", value: re.afterTaxIrrPct, fill: "#10b981" },
    { name: "Tax Drag", value: re.totalLifecycleTaxDragPct, fill: "#f43f5e" },
  ];

  const highAlertCount = report.complianceAlerts.filter((a) => a.severity === "HIGH").length;

  return (
    <div className="space-y-4">
      {/* Header Banner + Global Tax Profile Controls */}
      <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#0e192d] via-[#0b1322] to-[#0d1628] p-4 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Landmark className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white sm:text-base">
                  Global Tax Module — Tax Consultant in Your Pocket
                </h2>
                <p className="text-[11px] text-slate-400">
                  Cross-border asset location, tax-efficient accounts, business ownership, foreign real estate &amp; gain-access streams
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              Tax Score: {report.taxEfficiencyScore}/100
            </span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
              Est. Tax Alpha: {fmtUsd(report.estimatedAnnualTaxAlphaUsd)}/yr
            </span>
          </div>
        </div>

        {/* Core Profile Controls */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-800/80 pt-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Home Tax Residency
            </label>
            <select
              value={profile.residency}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  residency: e.target.value as TaxResidencyId,
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              {Object.values(TAX_RESIDENCY_PROFILES).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Foreign Investment Source
            </label>
            <select
              value={profile.foreignSourceCountry}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  foreignSourceCountry: e.target.value as ForeignSourceCountryId,
                }))
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              {Object.values(FOREIGN_SOURCE_COUNTRIES).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Annual Income</span>
              <span className="font-mono text-emerald-300">
                {fmtUsd(profile.annualOrdinaryIncomeUsd)}
              </span>
            </div>
            <input
              type="range"
              min={60000}
              max={750000}
              step={10000}
              value={profile.annualOrdinaryIncomeUsd}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  annualOrdinaryIncomeUsd: Number(e.target.value),
                }))
              }
              className="mt-2 w-full accent-emerald-500"
            />
            <div className="text-[10px] text-slate-500">
              Est. Marginal Rate: <span className="font-mono text-slate-300">{report.effectiveMarginalRatePct}%</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Portfolio Size</span>
              <span className="font-mono text-cyan-300">
                {fmtUsd(profile.portfolioValueUsd)}
              </span>
            </div>
            <input
              type="range"
              min={50000}
              max={5000000}
              step={50000}
              value={Math.min(5000000, profile.portfolioValueUsd)}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  portfolioValueUsd: Number(e.target.value),
                }))
              }
              className="mt-2 w-full accent-cyan-500"
            />
            <div className="text-[10px] text-slate-500">
              Foreign Weight: <span className="font-mono text-slate-300">{profile.foreignAllocationPct}%</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Foreign Allocation %</span>
              <span className="font-mono text-violet-300">
                {profile.foreignAllocationPct}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={profile.foreignAllocationPct}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  foreignAllocationPct: Number(e.target.value),
                }))
              }
              className="mt-2 w-full accent-violet-500"
            />
            <div className="text-[10px] text-slate-500">
              Horizon: <span className="font-mono text-slate-300">{profile.horizonYears} yrs</span> · Return {profile.expectedPreTaxReturnPct}%
            </div>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Best Account Wrapper
            </div>
            <div className="mt-0.5 truncate text-xs font-bold text-emerald-300">
              {report.bestAccountWrapper}
            </div>
            <div className="text-[10px] text-slate-500">
              +{fmtUsd(report.accountLocations[0]?.taxSavedVsTaxableUsd ?? 0)} vs taxable ({profile.horizonYears}Y)
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Lowest-Drag Gain Stream
            </div>
            <div className="mt-0.5 truncate text-xs font-bold text-cyan-300">
              {report.bestGainStream}
            </div>
            <div className="text-[10px] text-slate-500">
              {report.incomeStreams[0]?.effectiveTaxRatePct}% drag on {fmtUsd(profile.targetGainToAccessUsd)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Top Business Entity
            </div>
            <div className="mt-0.5 truncate text-xs font-bold text-amber-300">
              {report.bestBusinessStructure}
            </div>
            <div className="text-[10px] text-slate-500">
              {report.businessStructures[0]?.effectiveCombinedRatePct}% eff. · {report.businessStructures[0]?.exitEffectiveRatePct}% exit
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Compliance Radar
            </div>
            <div
              className={`mt-0.5 text-xs font-bold ${
                highAlertCount > 0 ? "text-rose-300" : "text-emerald-300"
              }`}
            >
              {report.complianceAlerts.length} Active Alert{report.complianceAlerts.length === 1 ? "" : "s"} ({highAlertCount} High)
            </div>
            <div className="truncate text-[10px] text-slate-500">
              {report.complianceAlerts[0]?.code ?? "Clean Cross-Border Profile"}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800/90 bg-slate-950/70 p-1.5">
        <SubTabButton
          active={subView === "consultant"}
          onClick={() => setSubView("consultant")}
          icon={MessageSquareText}
          label="Pocket Tax Consultant"
        />
        <SubTabButton
          active={subView === "accounts"}
          onClick={() => setSubView("accounts")}
          icon={Wallet}
          label="Accounts & Foreign WHT"
        />
        <SubTabButton
          active={subView === "streams"}
          onClick={() => setSubView("streams")}
          icon={Coins}
          label="Investment Gain Streams"
        />
        <SubTabButton
          active={subView === "business"}
          onClick={() => setSubView("business")}
          icon={Briefcase}
          label="Business Ownership"
        />
        <SubTabButton
          active={subView === "foreign_re"}
          onClick={() => setSubView("foreign_re")}
          icon={Building2}
          label="Foreign Real Estate"
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 1: POCKET TAX CONSULTANT (AI + DETERMINISTIC GROUNDING)   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subView === "consultant" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Interactive Chat Consultant */}
          <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/80 p-4 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Ask Your Pocket Cross-Border Tax Consultant
                </h3>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">
                Grounded in {report.residency.label} Math
              </span>
            </div>

            {/* Quick Prompt Chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => askConsultant(qp)}
                  disabled={isConsulting}
                  className="rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-left text-[11px] text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-50"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Message Feed */}
            <div className="mt-3 max-h-[420px] min-h-[220px] flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
                  <p className="font-semibold text-slate-200">
                    Ready for your cross-border tax scenario ({report.residency.label})
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Click any quick-ask scenario above or type a custom question about TFSA/RRSP/Roth/UCITS asset location, foreign withholding treaties, CCPC/HoldCo/QSBS business structures, foreign real estate (FIRPTA, NRST, Fideicomiso, LLC traps), or accessing investment gains via ROC, SBLOC borrowing, or dividends.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-3 text-xs ${
                      msg.role === "user"
                        ? "ml-8 border border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
                        : "mr-4 border border-slate-800 bg-[#0d1526] text-slate-200"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-semibold uppercase tracking-wider">
                        {msg.role === "user"
                          ? "You"
                          : msg.mode === "live-gemini"
                          ? "Gemini Pocket Tax Strategist"
                          : "Deterministic Tax Strategist"}
                      </span>
                      <span>{msg.timestamp}</span>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                    {msg.keyMetricsCited && msg.keyMetricsCited.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {msg.keyMetricsCited.map((m, i) => (
                          <span
                            key={i}
                            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}

                    {msg.actionSteps && msg.actionSteps.length > 0 && (
                      <div className="mt-2.5 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                          Action Plan
                        </div>
                        <ul className="mt-1 space-y-1 text-[11px] text-slate-300">
                          {msg.actionSteps.map((step, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {msg.riskFlags && msg.riskFlags.length > 0 && (
                      <div className="mt-2 rounded-lg border border-rose-500/25 bg-rose-500/5 p-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                          Compliance &amp; Trap Warnings
                        </div>
                        <ul className="mt-1 space-y-1 text-[11px] text-rose-200/90">
                          {msg.riskFlags.map((flag, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-rose-400" />
                              <span>{flag}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))
              )}

              {isConsulting && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-emerald-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing cross-border treaties, accounts, entities &amp; withholding rules...</span>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                askConsultant();
              }}
              className="mt-3 flex gap-2 border-t border-slate-800/80 pt-3"
            >
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Ask about TFSA vs RRSP, PFIC, CCPC HoldCo, FIRPTA, SBLOC borrowing..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isConsulting || !questionInput.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Consult</span>
              </button>
            </form>
            <p className="mt-2 text-[10px] text-slate-500">
              Educational &amp; quantitative structuring model — confirm final cross-border filings with a licensed local CPA or international tax counsel.
            </p>
          </div>

          {/* Right: Live Executive Playbook & Compliance Radar */}
          <div className="space-y-3.5 lg:col-span-5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  {report.residency.label} — Executive Playbook
                </h3>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                {report.residency.summaryNote}
              </p>
              <ul className="mt-3 space-y-2">
                {report.executivePlaybook.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5 text-[11px] text-slate-200"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Cross-Border Compliance Radar
                </h3>
              </div>
              <div className="mt-2.5 space-y-2">
                {report.complianceAlerts.length === 0 ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                    No high-risk cross-border compliance traps detected for current inputs.
                  </div>
                ) : (
                  report.complianceAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-lg border p-2.5 text-[11px] ${
                        alert.severity === "HIGH"
                          ? "border-rose-500/35 bg-rose-500/10 text-rose-100"
                          : "border-amber-500/35 bg-amber-500/10 text-amber-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{alert.title}</span>
                        <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[9px] uppercase">
                          {alert.code}
                        </span>
                      </div>
                      <p className="mt-1 opacity-90">{alert.summary}</p>
                      <p className="mt-1 font-medium text-white/95">
                        Fix: {alert.action}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 2: TAX-EFFICIENT ACCOUNTS & FOREIGN INVESTING             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subView === "accounts" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Bar Chart: 10Y After-Tax Wealth by Account */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 lg:col-span-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {profile.horizonYears}-Year After-Tax Wealth by Account Wrapper ({fmtUsd(profile.portfolioValueUsd)} Initial)
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Blended {100 - profile.foreignAllocationPct}% domestic + {profile.foreignAllocationPct}%{" "}
                {FOREIGN_SOURCE_COUNTRIES[profile.foreignSourceCountry].label}
              </p>
              <div className="mt-3 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={accountChartData} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      angle={-12}
                      textAnchor="end"
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      tickFormatter={(v) => fmtUsd(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        fontSize: "11px",
                        borderRadius: "8px",
                      }}
                      formatter={(val: number) => [fmtUsd(val), "Projected Wealth"]}
                    />
                    <Bar dataKey="wealth" radius={[6, 6, 0, 0]}>
                      {accountChartData.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={
                            entry.category === "tax_free"
                              ? "#10b981"
                              : entry.category === "tax_deferred" || entry.category === "offshore_ucits"
                              ? "#06b6d4"
                              : entry.category === "corporate"
                              ? "#a78bfa"
                              : "#64748b"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Foreign Source Treaty Note & Asset Location Matrix */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 lg:col-span-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Optimal Asset Location Matrix ({report.residency.label})
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {FOREIGN_SOURCE_COUNTRIES[profile.foreignSourceCountry].note}
              </p>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                {report.assetLocationMatrix.map((row) => (
                  <div
                    key={row.assetBucket}
                    className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-[11px]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-white">{row.assetLabel}</span>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        +{row.annualTaxDragSavedBps} bps/yr saved
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-[10px]">
                      <span className="text-emerald-300">
                        Best: <strong>{row.optimalAccount}</strong>
                      </span>
                      <span className="text-rose-300">
                        Avoid: <strong>{row.worstAccount}</strong>
                      </span>
                    </div>
                    <p className="mt-1 text-slate-400">{row.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detailed Account Wrapper Comparison Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white">
              Account-by-Account Tax Drag, Treaty Withholding &amp; Compounding
            </h3>
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="pb-2">Account Wrapper</th>
                  <th className="pb-2">Dom. CAGR</th>
                  <th className="pb-2">For. CAGR</th>
                  <th className="pb-2">WHT Drag</th>
                  <th className="pb-2">{profile.horizonYears}Y Wealth</th>
                  <th className="pb-2">vs. Taxable</th>
                  <th className="pb-2">Treaty &amp; Best-Fit Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {report.accountLocations.map((acc) => (
                  <tr key={acc.accountId} className="align-top hover:bg-slate-900/40">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-white">{acc.accountName}</div>
                      <div className="text-[10px] text-slate-400">{acc.contributionCapNote}</div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-emerald-300">
                      {acc.domesticAfterTaxCagrPct}%
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-cyan-300">
                      {acc.foreignAfterTaxCagrPct}%
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-amber-300">
                      {acc.foreignWithholdingDragBps} bps
                      {acc.ftcRecoverable && (
                        <span className="ml-1 text-[9px] text-emerald-400">(FTC)</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-mono font-bold text-white">
                      {fmtUsd(acc.projected10YrWealthUsd)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 font-mono font-bold ${
                        acc.taxSavedVsTaxableUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {acc.taxSavedVsTaxableUsd >= 0 ? "+" : ""}
                      {fmtUsd(acc.taxSavedVsTaxableUsd)}
                    </td>
                    <td className="py-2.5 text-[11px] text-slate-300">
                      <div>{acc.treatyNote}</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        <span className="text-emerald-300">Hold:</span> {acc.bestForAssets.join(" · ")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 3: ACCESSING DIFFERENT STREAMS OF INVESTMENT GAINS        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subView === "streams" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Accessing Investment Gains: 8-Stream After-Tax Cash Waterfall
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Compare receiving {fmtUsd(profile.targetGainToAccessUsd)} via Return of Capital, Buy-Borrow-Die (SBLOC), Corporate CDA/QSBS, LTCG, Eligible/Foreign Dividends, STCG, or Interest
                </p>
              </div>
              <div className="w-60">
                <div className="flex justify-between text-[10px] font-semibold uppercase text-slate-400">
                  <span>Target Gain / Distribution</span>
                  <span className="font-mono text-emerald-300">
                    {fmtUsd(profile.targetGainToAccessUsd)}
                  </span>
                </div>
                <input
                  type="range"
                  min={25000}
                  max={1000000}
                  step={25000}
                  value={profile.targetGainToAccessUsd}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      targetGainToAccessUsd: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full accent-emerald-500"
                />
              </div>
            </div>

            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={streamChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 20, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    type="number"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    tickFormatter={(v) => fmtUsd(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ fill: "#cbd5e1", fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      fontSize: "11px",
                      borderRadius: "8px",
                    }}
                    formatter={(val: number, name: string) => [
                      fmtUsd(val),
                      name === "netSpendable" ? "Net Spendable Cash" : "Tax / WHT / Borrow Drag",
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar
                    dataKey="netSpendable"
                    name="Net Spendable Cash"
                    stackId="a"
                    fill="#10b981"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="totalDrag"
                    name="Tax / WHT / Borrow Drag"
                    stackId="a"
                    fill="#f43f5e"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {report.incomeStreams.map((s, idx) => (
              <div
                key={s.streamId}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                        #{idx + 1}
                      </span>
                      <h4 className="text-xs font-bold text-white">{s.label}</h4>
                    </div>
                    <span className="text-[10px] text-slate-400">{s.category}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-emerald-300">
                      {fmtUsd(s.netSpendableUsd)}
                    </div>
                    <div className="font-mono text-[10px] text-rose-300">
                      {s.effectiveTaxRatePct}% drag
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg bg-slate-900/70 p-2 text-[10px]">
                  <div>
                    <span className="text-slate-400">Dom. Tax:</span>{" "}
                    <span className="font-mono text-white">{fmtUsd(s.domesticTaxUsd)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">WHT / Cost:</span>{" "}
                    <span className="font-mono text-amber-300">
                      {fmtUsd(s.foreignWithholdingUsd + s.borrowingOrFrictionUsd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Retention:</span>{" "}
                    <span className="font-mono text-emerald-300">{s.afterTaxRetentionPct}%</span>
                  </div>
                </div>

                <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                  {s.accessMechanism}
                </p>
                <p className="mt-1 text-[10px] text-amber-300/90">
                  Watch: {s.keyCaveat}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 4: OWNING BUSINESSES (CORP STRUCTURES & EXTRACTION)       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subView === "business" && (
        <div className="space-y-4">
          {/* Interactive Business Inputs */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex justify-between text-[10px] font-semibold uppercase text-slate-400">
                <span>Annual Business Profit</span>
                <span className="font-mono text-emerald-300">
                  {fmtUsd(profile.businessAnnualProfitUsd)}
                </span>
              </div>
              <input
                type="range"
                min={50000}
                max={2000000}
                step={25000}
                value={profile.businessAnnualProfitUsd}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    businessAnnualProfitUsd: Number(e.target.value),
                  }))
                }
                className="mt-1.5 w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-semibold uppercase text-slate-400">
                <span>Personal Salary / Draw</span>
                <span className="font-mono text-cyan-300">
                  {fmtUsd(profile.businessSalaryDrawUsd)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.min(profile.businessAnnualProfitUsd, 600000)}
                step={10000}
                value={Math.min(profile.businessSalaryDrawUsd, profile.businessAnnualProfitUsd)}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    businessSalaryDrawUsd: Number(e.target.value),
                  }))
                }
                className="mt-1.5 w-full accent-cyan-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-semibold uppercase text-slate-400">
                <span>Corp Passive Income</span>
                <span className="font-mono text-amber-300">
                  {fmtUsd(profile.businessPassiveIncomeUsd)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={200000}
                step={5000}
                value={profile.businessPassiveIncomeUsd}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    businessPassiveIncomeUsd: Number(e.target.value),
                  }))
                }
                className="mt-1.5 w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-semibold uppercase text-slate-400">
                <span>Projected Exit Value</span>
                <span className="font-mono text-violet-300">
                  {fmtUsd(profile.businessExitValueUsd)}
                </span>
              </div>
              <input
                type="range"
                min={250000}
                max={15000000}
                step={250000}
                value={profile.businessExitValueUsd}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    businessExitValueUsd: Number(e.target.value),
                  }))
                }
                className="mt-1.5 w-full accent-violet-500"
              />
            </div>
          </div>

          {/* Chart: Annual Tax vs Retained Capital */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Business Entity Comparison: Annual Tax Paid vs. Retained Capital to Reinvest
            </h3>
            <div className="mt-3 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={businessChartData} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => fmtUsd(v)} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      fontSize: "11px",
                      borderRadius: "8px",
                    }}
                    formatter={(val: number) => fmtUsd(val)}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="retained" name="Retained for Reinvestment" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="annualTax" name="Total Annual Tax" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Entity Cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {report.businessStructures.map((biz) => (
              <div
                key={biz.structureId}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white">{biz.label}</h4>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      Corp Tax Rate: {biz.corporateTaxRatePct}% · Combined Eff.: {biz.effectiveCombinedRatePct}%
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      biz.verdict === "OPTIMAL"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : biz.verdict === "VIABLE"
                        ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                        : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {biz.verdict}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-900/70 p-2.5 text-[11px]">
                  <div>
                    <div className="text-[10px] text-slate-400">Annual Tax</div>
                    <div className="font-mono font-bold text-rose-300">
                      {fmtUsd(biz.totalAnnualTaxUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Deferral Alpha</div>
                    <div className="font-mono font-bold text-emerald-300">
                      {biz.annualDeferralAdvantageUsd >= 0 ? "+" : ""}
                      {fmtUsd(biz.annualDeferralAdvantageUsd)}/yr
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Exit Tax ({biz.exitEffectiveRatePct}%)</div>
                    <div className="font-mono font-bold text-amber-300">
                      {fmtUsd(biz.exitTaxOnSaleUsd)}
                    </div>
                  </div>
                </div>

                <p className="mt-2.5 text-[11px] leading-relaxed text-slate-300">
                  {biz.keyTakeaway}
                </p>

                {biz.passiveGrindWarning && (
                  <div className="mt-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-2 text-[10px] text-amber-200">
                    {biz.passiveGrindWarning}
                  </div>
                )}
                {biz.cfcOrFapiWarning && (
                  <div className="mt-2 rounded-lg border border-rose-500/35 bg-rose-500/10 p-2 text-[10px] text-rose-200">
                    {biz.cfcOrFapiWarning}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 5: BUYING FOREIGN REAL ESTATE                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subView === "foreign_re" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Foreign Property Market
              </label>
              <select
                value={profile.foreignPropertyMarket}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    foreignPropertyMarket: e.target.value as ForeignRealEstateMarketId,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                {Object.values(FOREIGN_REAL_ESTATE_MARKETS).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Ownership Structure
              </label>
              <select
                value={profile.foreignPropertyEntity}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    foreignPropertyEntity: e.target.value as ForeignPropertyEntityType,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                {ENTITY_OPTIONS.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-semibold uppercase text-slate-400">
                <span>Purchase Price</span>
                <span className="font-mono text-emerald-300">
                  {fmtUsd(profile.foreignPropertyPriceUsd)}
                </span>
              </div>
              <input
                type="range"
                min={200000}
                max={3000000}
                step={50000}
                value={profile.foreignPropertyPriceUsd}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    foreignPropertyPriceUsd: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full accent-emerald-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-semibold uppercase text-slate-400">
                <span>Gross Rental Yield</span>
                <span className="font-mono text-cyan-300">
                  {profile.foreignPropertyGrossYieldPct}%
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={12}
                step={0.2}
                value={profile.foreignPropertyGrossYieldPct}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    foreignPropertyGrossYieldPct: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full accent-cyan-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-semibold uppercase text-slate-400">
                <span>Hold Period</span>
                <span className="font-mono text-violet-300">
                  {profile.foreignPropertyHoldYears} yrs
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={15}
                step={1}
                value={profile.foreignPropertyHoldYears}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    foreignPropertyHoldYears: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full accent-violet-500"
              />
            </div>
          </div>

          {/* Entity Alerts */}
          <div className="space-y-2">
            {re.entityStructureAlerts.map((alert, i) => {
              const isCritical =
                alert.includes("CRITICAL") ||
                alert.includes("Restricted") ||
                alert.includes("Cliff") ||
                alert.includes("NRST");
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                    isCritical
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                  }`}
                >
                  {isCritical ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  )}
                  <span>{alert}</span>
                </div>
              );
            })}
          </div>

          {/* Lifecycle Breakdown + IRR Chart */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-8">
              {/* Stage 1: Acquisition */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  1. Acquisition Friction
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-white">
                  {fmtUsd(re.totalAcquisitionFrictionUsd)}
                </div>
                <div className="mt-2.5 space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stamp / Transfer:</span>
                    <span className="font-mono">{fmtUsd(re.acquisitionStampAndTransferUsd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Foreign Surcharge:</span>
                    <span className="font-mono text-rose-300">
                      {fmtUsd(re.foreignBuyerSurchargeUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Legal / Entity Setup:</span>
                    <span className="font-mono">{fmtUsd(re.setupAndLegalUsd)}</span>
                  </div>
                </div>
              </div>

              {/* Stage 2: Ongoing Rental */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  2. Annual Rental Tax
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-emerald-300">
                  {fmtUsd(re.netAnnualAfterTaxCashflowUsd)}/yr
                </div>
                <div className="mt-2.5 space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gross Rent:</span>
                    <span className="font-mono">{fmtUsd(re.grossAnnualRentUsd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gross WHT Method:</span>
                    <span className="font-mono text-rose-300 line-through">
                      {fmtUsd(re.foreignRentalTaxGrossMethodUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Net Election Tax:</span>
                    <span className="font-mono text-emerald-300">
                      {fmtUsd(re.foreignRentalTaxNetElectionUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Home Top-Up (after FTC):</span>
                    <span className="font-mono text-amber-300">
                      {fmtUsd(re.homeCountryNetTaxAfterFtcUsd)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stage 3: Exit & Withholding */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
                  3. Exit (Year {profile.foreignPropertyHoldYears})
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-white">
                  {fmtUsd(re.netAfterTaxExitProceedsUsd)}
                </div>
                <div className="mt-2.5 space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gross Gain:</span>
                    <span className="font-mono">{fmtUsd(re.grossCapitalGainUsd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Foreign CGT:</span>
                    <span className="font-mono text-rose-300">
                      {fmtUsd(re.foreignExitCapitalGainsTaxUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Closing Withholding:</span>
                    <span className="font-mono text-amber-300">
                      {fmtUsd(re.mandatoryClosingWithholdingUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Home Exit Top-Up:</span>
                    <span className="font-mono">{fmtUsd(re.homeExitTopUpTaxUsd)}</span>
                  </div>
                </div>
              </div>

              {/* Closing Withholding & Estate Tax Cards */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 sm:col-span-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-[11px]">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Closing Withholding Rule
                    </div>
                    <p className="mt-1 text-slate-300">{re.closingWithholdingRule}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">
                      Foreign Estate / Inheritance Tax
                    </div>
                    <p className="mt-1 text-slate-300">{re.estateTaxExposureNote}</p>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      Recommended Structuring
                    </div>
                    <p className="mt-1 text-slate-300">{re.recommendedStructure}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: IRR Comparison Chart */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 lg:col-span-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Pre-Tax vs. After-Tax IRR
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Lifecycle cross-border tax drag: -{re.totalLifecycleTaxDragPct}% IRR
              </p>
              <div className="mt-3 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reChartData} margin={{ top: 10, right: 12, left: -12, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        fontSize: "11px",
                        borderRadius: "8px",
                      }}
                      formatter={(val: number) => [`${val}%`, "Rate"]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {reChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubTabButton({
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
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 shadow-sm"
          : "border border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
