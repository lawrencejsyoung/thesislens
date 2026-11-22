"use client";

import React, { useMemo, useState } from "react";
import {
  Gavel,
  TrendingUp,
  ShieldAlert,
  Scale,
  Landmark,
  Swords,
  Send,
  Loader2,
  Terminal,
  ChevronDown,
  ChevronRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import {
  AnalysisRequestPayload,
  CioInvestmentMemo,
  ExperienceTier,
  RebalanceSimulationResult,
  UniversalQuantBundle,
  WarRoomMessage,
  WarRoomTargetRole,
} from "@/lib/types";

interface IcWarRoomProps {
  analysisRequest: AnalysisRequestPayload;
  cioMemo: CioInvestmentMemo;
  universalQuant: UniversalQuantBundle;
  rebalanceSimulation?: RebalanceSimulationResult | null;
  messages: WarRoomMessage[];
  onAddMessages: (newMsgs: WarRoomMessage[]) => void;
  userApiKey?: string;
  experienceTier: ExperienceTier;
}

const TARGET_ROLES: {
  id: WarRoomTargetRole;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  institutionalOnly?: boolean;
}[] = [
  {
    id: "cio",
    label: "CIO Chair",
    shortLabel: "CIO",
    icon: Gavel,
    accent: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  },
  {
    id: "bull",
    label: "Bull Strategist",
    shortLabel: "Bull",
    icon: TrendingUp,
    accent: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  },
  {
    id: "bear",
    label: "Bear Pre-Mortem",
    shortLabel: "Bear",
    icon: ShieldAlert,
    accent: "border-rose-500/40 bg-rose-500/15 text-rose-200",
  },
  {
    id: "bull_vs_bear",
    label: "Bull vs. Bear Clash",
    shortLabel: "Clash",
    icon: Swords,
    accent: "border-violet-500/40 bg-violet-500/15 text-violet-200",
  },
  {
    id: "tax_strategist",
    label: "Tax Strategist",
    shortLabel: "Tax",
    icon: Landmark,
    accent: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
  },
  {
    id: "cfa_risk",
    label: "CFA Risk Officer",
    shortLabel: "CFA Risk",
    icon: Scale,
    accent: "border-orange-500/40 bg-orange-500/15 text-orange-200",
    institutionalOnly: true,
  },
];

export function IcWarRoom({
  analysisRequest,
  cioMemo,
  universalQuant,
  rebalanceSimulation,
  messages,
  onAddMessages,
  userApiKey,
  experienceTier,
}: IcWarRoomProps) {
  const [targetRole, setTargetRole] = useState<WarRoomTargetRole>("bear");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const visibleRoles = useMemo(
    () =>
      TARGET_ROLES.filter(
        (r) => !r.institutionalOnly || experienceTier === "institutional"
      ),
    [experienceTier]
  );

  // Live conviction tracker: Base CIO score + sum of War Room deltas (clamped 0..100)
  const cumulativeDelta = useMemo(
    () =>
      messages.reduce(
        (sum, m) => sum + (m.sender === "agent" ? m.convictionDelta ?? 0 : 0),
        0
      ),
    [messages]
  );
  const liveConviction = Math.max(
    0,
    Math.min(100, cioMemo.convictionScore + cumulativeDelta)
  );

  const topTicker =
    analysisRequest.dcfInputs.ticker || analysisRequest.holdings[0]?.ticker || "NVDA";

  const advancedChips: { label: string; role: WarRoomTargetRole; prompt: string }[] = [
    {
      label: `Break ${topTicker}: +150bps WACC DCF`,
      role: "bear",
      prompt: `Run a pre-mortem stress test on ${topTicker} with +150bps WACC and slower FCF growth. What breaks this thesis?`,
    },
    {
      label: `Bull vs. Bear Clash on ${topTicker}`,
      role: "bull_vs_bear",
      prompt: `Debate ${topTicker} head-to-head: should we add into volatility or trim risk given current valuation and macro shocks?`,
    },
    {
      label: "After-Tax Rebalance Audit",
      role: "tax_strategist",
      prompt: `Evaluate the capital gains tax drag of the CIO rebalance plan under ${
        analysisRequest.jurisdiction ?? "Canada"
      } rules. Should we rebalance now or direct new cash flows?`,
    },
    {
      label: "Worst-Case Macro Shock",
      role: "bear",
      prompt:
        "If our worst macro shock hits tomorrow, how much do we lose and what is the cleanest hedge?",
    },
    ...(experienceTier === "institutional"
      ? [
          {
            label: "CFA Forensics & Liquidity Check",
            role: "cfa_risk" as WarRoomTargetRole,
            prompt:
              "Audit accounting quality (Beneish M-Score / Altman Z) and check portfolio liquidity & pre-trade compliance.",
          },
        ]
      : []),
  ];

  const smartChips = analysisRequest.audience === "beginner" ? [
    { label: "What could go wrong?", role: "bear" as const, prompt: "Explain the biggest modeled loss in dollars and what could cause it." },
    { label: "Why change the mix?", role: "cio" as const, prompt: "Explain the proposed allocation and one trade-off in everyday language." },
  ] : advancedChips;

  const sendQuestion = async (
    questionText: string,
    overrideRole?: WarRoomTargetRole
  ) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;
    const roleToUse = overrideRole ?? targetRole;
    if (overrideRole) setTargetRole(overrideRole);

    const userMsg: WarRoomMessage = {
      id: `wr-user-${Date.now()}`,
      sender: "user",
      targetRole: roleToUse,
      speakerLabel: "You",
      content: trimmed,
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };

    onAddMessages([userMsg]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userApiKey?.trim()) {
        headers["x-gemini-api-key"] = userApiKey.trim();
      }

      const resp = await fetch("/api/war-room", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: trimmed,
          targetRole: roleToUse,
          analysisRequest,
          cioMemo,
          universalQuant,
          rebalanceSummary: rebalanceSimulation
            ? {
                sharpeDelta: rebalanceSimulation.deltas.sharpeDelta,
                volatilityDeltaPct: rebalanceSimulation.deltas.volatilityDeltaPct,
                totalTaxDragUsd: rebalanceSimulation.taxImpact.totalTaxDragUsd,
                verdict: rebalanceSimulation.taxImpact.verdict,
              }
            : undefined,
          history: [...messages, userMsg].slice(-6).map((m) => ({
            sender: m.sender,
            speakerLabel: m.speakerLabel,
            content: m.content,
          })),
        }),
      });

      if (!resp.ok) {
        throw new Error(`War Room request failed (${resp.status})`);
      }

      const data = (await resp.json()) as { message: WarRoomMessage };
      onAddMessages([data.message]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reach Investment Committee."
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleTools = (id: string) =>
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-[var(--surface)] p-5 shadow-2xl">
      {/* Header + Live Conviction Tracker */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
              <Swords className="h-3 w-3" /> Committee follow-up
            </span>
          </div>
          <h3 className="mt-1.5 text-base font-bold text-white">
            Ask the committee
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Choose a specialist or start with a suggested question about this analysis.
          </p>
        </div>

        {/* Live Conviction Score Delta Pill */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Current conviction
          </div>
          <div className="mt-0.5 flex items-baseline justify-end gap-1.5">
            <span className="font-mono text-xs text-slate-500">
              Base {cioMemo.convictionScore}
            </span>
            <span className="text-slate-600">→</span>
            <span
              className={`font-mono text-2xl font-black ${
                liveConviction >= 75
                  ? "text-emerald-400"
                  : liveConviction >= 55
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}
            >
              {liveConviction}
            </span>
            <span className="font-mono text-[10px] text-slate-500">/100</span>
            {cumulativeDelta !== 0 && (
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                  cumulativeDelta > 0
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {cumulativeDelta > 0 ? "+" : ""}
                {cumulativeDelta}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Specialist Target Selector */}
      <div className="mt-4">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Direct Question To:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visibleRoles.map((r) => {
            const Icon = r.icon;
            const active = targetRole === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setTargetRole(r.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  active
                    ? r.accent
                    : "border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1-Click Smart Challenge Chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {smartChips.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            disabled={loading}
            onClick={() => sendQuestion(chip.prompt, chip.role)}
            className="flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3 text-cyan-400" />
            <span>{chip.label}</span>
          </button>
        ))}
      </div>

      {/* Transcript Feed */}
      <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
            Click any challenge chip above or ask your own stress-test question below to
            put the Investment Committee on the witness stand.
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === "user";
            const hasTools = Boolean(msg.toolCalls && msg.toolCalls.length > 0);
            const toolsOpen = Boolean(expandedTools[msg.id]);

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2.5 text-xs text-cyan-50">
                    <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-cyan-300/80">
                      <span className="font-semibold">
                        You → {TARGET_ROLES.find((r) => r.id === msg.targetRole)?.label}
                      </span>
                      <span className="font-mono">{msg.timestamp}</span>
                    </div>
                    <p className="leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{msg.speakerLabel}</span>
                    {msg.mode && (
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[9px] text-slate-400">
                        {msg.mode === "live-gemini" ? "GEMINI LIVE" : "QUANT ENGINE"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof msg.convictionDelta === "number" &&
                      msg.convictionDelta !== 0 && (
                        <span
                          className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            msg.convictionDelta > 0
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                              : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          Conviction {msg.convictionDelta > 0 ? "+" : ""}
                          {msg.convictionDelta}
                        </span>
                      )}
                    <span className="font-mono text-[10px] text-slate-500">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>

                {/* Primary Answer (or Bull vs Bear Split) */}
                {msg.rebuttalContent ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                        <TrendingUp className="h-3 w-3" /> Bull Strategist
                      </div>
                      <p className="whitespace-pre-line leading-relaxed text-slate-200">
                        {msg.content}
                      </p>
                    </div>
                    <div className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-300">
                        <ShieldAlert className="h-3 w-3" /> Bear Counter-Rebuttal
                      </div>
                      <p className="whitespace-pre-line leading-relaxed text-slate-200">
                        {msg.rebuttalContent}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2.5 whitespace-pre-line leading-relaxed text-slate-200">
                    {msg.content}
                  </p>
                )}

                {/* Key Takeaways */}
                {msg.keyTakeaways && msg.keyTakeaways.length > 0 && (
                  <ul className="mt-2.5 space-y-1 border-t border-slate-800/70 pt-2 text-[11px] text-slate-300">
                    {msg.keyTakeaways.map((tk, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-cyan-400" />
                        <span>{tk}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Expandable Live Quant Tool Trace */}
                {hasTools && (
                  <div className="mt-2.5 border-t border-slate-800/70 pt-2">
                    <button
                      type="button"
                      onClick={() => toggleTools(msg.id)}
                      className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-cyan-300 hover:text-cyan-200"
                    >
                      {toolsOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <Terminal className="h-3 w-3" />
                      <span>
                        Verified Quant Tool Calls ({msg.toolCalls!.length})
                      </span>
                    </button>
                    {toolsOpen && (
                      <div className="mt-2 space-y-1.5">
                        {msg.toolCalls!.map((tc) => (
                          <div
                            key={tc.id}
                            className="rounded-lg border border-slate-800 bg-slate-900/90 p-2 font-mono text-[10px]"
                          >
                            <div className="flex items-center justify-between text-cyan-300">
                              <span>
                                {tc.toolName}({JSON.stringify(tc.args)})
                              </span>
                              <span className="text-slate-500">{tc.durationMs}ms</span>
                            </div>
                            <div className="mt-1 text-slate-300">
                              → {tc.resultSummary}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-cyan-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>
              {TARGET_ROLES.find((r) => r.id === targetRole)?.label} is running quant
              tools and formulating a response...
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Question for the committee"
          placeholder={`Ask ${
            TARGET_ROLES.find((r) => r.id === targetRole)?.label
          } (e.g. "What if WACC rises +150bps?")`}
          className="flex-1 rounded-xl border border-slate-700/90 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          <span>Ask IC</span>
        </button>
      </form>
    </div>
  );
}
