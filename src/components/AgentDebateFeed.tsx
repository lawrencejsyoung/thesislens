"use client";

import React, { useState } from "react";
import {
  FileSearch,
  TrendingUp,
  ShieldAlert,
  Gavel,
  Terminal,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  Loader2,
  Compass,
  BrainCircuit,
  Sigma,
  Building2,
  LineChart,
  GitBranch,
  Scale,
  ShieldCheck,
  Radio,
} from "lucide-react";
import { AgentDebateTurn, AgentRole, RoutingPlan } from "@/lib/types";

interface AgentDebateFeedProps {
  turns: AgentDebateTurn[];
  isRunning: boolean;
  statusMessage: string;
  routingPlan?: RoutingPlan | null;
}

const ROLE_STYLES: Record<
  AgentRole,
  {
    icon: React.ComponentType<{ className?: string }>;
    border: string;
    badge: string;
    accentText: string;
  }
> = {
  router: {
    icon: GitBranch,
    border: "border-cyan-500/35",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    accentText: "text-cyan-300",
  },
  access_scout: {
    icon: Compass,
    border: "border-teal-500/35",
    badge: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    accentText: "text-teal-300",
  },
  extractor: {
    icon: FileSearch,
    border: "border-cyan-500/30",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    accentText: "text-cyan-300",
  },
  equity_quant: {
    icon: LineChart,
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    accentText: "text-emerald-300",
  },
  cfa_forensic: {
    icon: Scale,
    border: "border-amber-500/35",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    accentText: "text-amber-300",
  },
  risk_officer: {
    icon: ShieldCheck,
    border: "border-orange-500/35",
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    accentText: "text-orange-300",
  },
  intel_analyst: {
    icon: Radio,
    border: "border-indigo-500/35",
    badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    accentText: "text-indigo-300",
  },
  superforecaster: {
    icon: BrainCircuit,
    border: "border-violet-500/35",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    accentText: "text-violet-300",
  },
  derivatives_quant: {
    icon: Sigma,
    border: "border-sky-500/35",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    accentText: "text-sky-300",
  },
  real_assets_quant: {
    icon: Building2,
    border: "border-fuchsia-500/35",
    badge: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
    accentText: "text-fuchsia-300",
  },
  bull: {
    icon: TrendingUp,
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    accentText: "text-emerald-300",
  },
  bear: {
    icon: ShieldAlert,
    border: "border-rose-500/30",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    accentText: "text-rose-300",
  },
  cio: {
    icon: Gavel,
    border: "border-amber-500/40",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    accentText: "text-amber-300",
  },
};

export function AgentDebateFeed({
  turns,
  isRunning,
  statusMessage,
  routingPlan,
}: AgentDebateFeedProps) {
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-[#0d1424] p-4 shadow-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-sm font-bold text-white">
            Live Multi-Agent Workforce Trace &amp; Deterministic Tool Calls
          </h2>
          <p className="text-xs text-slate-400">
            Dynamic specialist fan-out invoking DCF, Prediction EV/Kelly, Black-Scholes, Real Assets &amp; Power-Law engines
          </p>
        </div>
        {isRunning && (
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{statusMessage || "Analyzing..."}</span>
          </div>
        )}
      </div>

      {/* Dynamic Specialist Routing Roster */}
      {routingPlan && (
        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>
              Activated Roster ({routingPlan.activatedSpecialists.length} Agents ·{" "}
              {routingPlan.jurisdiction} Mandate)
            </span>
            <span className="font-mono text-cyan-300">
              Mode: {routingPlan.analysisMode.replace("_", " ")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {routingPlan.activatedSpecialists.map((spec, idx) => {
              const st = ROLE_STYLES[spec.role] || ROLE_STYLES.extractor;
              return (
                <span
                  key={`${spec.role}-${idx}`}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${st.badge}`}
                >
                  {spec.label}
                  {spec.parallel && (
                    <span className="rounded bg-black/30 px-1 font-mono text-[9px] opacity-80">
                      ∥
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {turns.length === 0 && !isRunning ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/50 py-10 text-center">
          <Terminal className="h-8 w-8 text-slate-600" />
          <p className="mt-2 text-xs font-medium text-slate-300">
            Universal Workforce ready. Select any asset class or future outcome and click Run.
          </p>
          <p className="mt-1 max-w-md text-[11px] text-slate-500">
            The Intake Router dynamically spawns the right valuation specialists and maps cross-venue ways to bet on your thesis.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {turns.map((turn) => {
            const style = ROLE_STYLES[turn.role] || ROLE_STYLES.extractor;
            const Icon = style.icon;
            return (
              <div
                key={turn.id}
                className={`rounded-xl border ${style.border} bg-slate-950/70 p-3.5 transition`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg border ${style.badge}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-bold ${style.accentText}`}>
                          {turn.agentName}
                        </span>
                        {turn.parallelGroup && (
                          <span className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                            {turn.parallelGroup}
                          </span>
                        )}
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      </div>
                      <p className="text-xs font-medium text-white">{turn.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    {turn.confidencePct !== undefined && (
                      <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                        Conf: {turn.confidencePct}%
                      </span>
                    )}
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <Clock className="h-3 w-3" />
                      {turn.timestamp}
                    </span>
                  </div>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-slate-200">
                  {turn.summary}
                </p>

                {turn.keyPoints.length > 0 && (
                  <ul className="mt-2 space-y-1 pl-4 text-xs text-slate-300">
                    {turn.keyPoints.map((pt, i) => (
                      <li key={i} className="list-disc leading-relaxed">
                        {pt}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Gemini Function Call Logs */}
                {turn.toolCalls.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-slate-800/80 pt-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <Terminal className="h-3 w-3 text-cyan-400" />
                      <span>Gemini Function Calls ({turn.toolCalls.length})</span>
                    </div>
                    {turn.toolCalls.map((tc) => {
                      const open = Boolean(expandedTools[tc.id]);
                      return (
                        <div
                          key={tc.id}
                          className="rounded-lg border border-slate-800 bg-[#070b14] px-2.5 py-1.5"
                        >
                          <button
                            type="button"
                            onClick={() => toggleTool(tc.id)}
                            className="flex w-full items-center justify-between gap-2 text-left"
                          >
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              {open ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              )}
                              <code className="font-mono text-[11px] font-semibold text-cyan-300">
                                {tc.toolName}()
                              </code>
                              <span className="truncate text-[11px] text-slate-400">
                                → {tc.resultSummary}
                              </span>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] text-slate-500">
                              {tc.durationMs}ms
                            </span>
                          </button>
                          {open && (
                            <div className="mt-2 border-t border-slate-800/80 pt-2 font-mono text-[10px] text-slate-300">
                              <div className="text-slate-500">Arguments:</div>
                              <pre className="mt-0.5 overflow-x-auto text-emerald-300">
                                {JSON.stringify(tc.args, null, 2)}
                              </pre>
                              <div className="mt-1.5 text-slate-500">Tool Output:</div>
                              <div className="mt-0.5 text-slate-200">
                                {tc.resultSummary}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
