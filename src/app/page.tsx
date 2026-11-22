"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { InputWorkbench } from "@/components/InputWorkbench";
import { AgentDebateFeed } from "@/components/AgentDebateFeed";
import { CioMemoDashboard } from "@/components/CioMemoDashboard";
import { QuantAnalyticsPanel } from "@/components/QuantAnalyticsPanel";
import { AccessExpressionMatrix } from "@/components/AccessExpressionMatrix";
import { IntelligenceHub } from "@/components/IntelligenceHub";
import { GlobalTaxModule } from "@/components/GlobalTaxModule";
import { CompanyModelLab } from "@/components/CompanyModelLab";
import { SavedMemosDrawer } from "@/components/SavedMemosDrawer";
import { RebalanceSimulatorPanel } from "@/components/RebalanceSimulatorPanel";
import { IcWarRoom } from "@/components/IcWarRoom";
import { PRESET_SCENARIOS } from "@/lib/demo-scenarios";
import { listSavedMemos, saveMemo } from "@/lib/firebase";
import {
  defaultResidencyForJurisdiction,
  simulateCioRebalance,
} from "@/lib/quant-engine";
import {
  AgentDebateTurn,
  AnalysisRequestPayload,
  CioInvestmentMemo,
  CompleteAnalysisResult,
  DcfResult,
  ExperienceTier,
  ExpressionVehicle,
  Holding,
  IntelSignal,
  MacroShockScenarioResult,
  MonteCarloResult,
  PortfolioMetrics,
  RebalanceSimulationOptions,
  RoutingPlan,
  StreamEvent,
  UniversalQuantBundle,
  WarRoomMessage,
} from "@/lib/types";
import {
  AlertCircle,
  Award,
  BarChart3,
  CheckCircle2,
  Play,
  Radio,
  Swords,
} from "lucide-react";

type CanvasTab = "executive" | "war_room" | "quant_labs" | "intel_access";

export default function HomePage() {
  const [activePresetId, setActivePresetId] = useState<string | null>(
    PRESET_SCENARIOS[0].id
  );
  const [payload, setPayload] = useState<AnalysisRequestPayload>(
    PRESET_SCENARIOS[0].payload
  );

  const [hasServerKey, setHasServerKey] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const [activeMode, setActiveMode] = useState<"live-gemini" | "demo-simulation">(
    "demo-simulation"
  );
  const [modelUsed, setModelUsed] = useState("gemini-2.5-flash");

  const [experienceTier, setExperienceTier] = useState<ExperienceTier>("prosumer");
  const [activeCanvasTab, setActiveCanvasTab] = useState<CanvasTab>("executive");

  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [routingPlan, setRoutingPlan] = useState<RoutingPlan | null>(null);
  const [expressionVehicles, setExpressionVehicles] = useState<ExpressionVehicle[]>([]);
  const [intelSignals, setIntelSignals] = useState<IntelSignal[]>([]);
  const [customIntelSignals, setCustomIntelSignals] = useState<IntelSignal[]>([]);
  const [universalQuant, setUniversalQuant] = useState<UniversalQuantBundle | null>(null);
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics | null>(null);
  const [dcfResult, setDcfResult] = useState<DcfResult | null>(null);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloResult | null>(null);
  const [macroShocks, setMacroShocks] = useState<MacroShockScenarioResult[] | null>(null);
  const [debateTurns, setDebateTurns] = useState<AgentDebateTurn[]>([]);
  const [cioMemo, setCioMemo] = useState<CioInvestmentMemo | null>(null);
  const [completeResult, setCompleteResult] = useState<CompleteAnalysisResult | null>(null);

  // 1-Click Tax-Aware Rebalance Simulator state
  const [rebalanceSimOpen, setRebalanceSimOpen] = useState(false);
  const [rebalanceApplied, setRebalanceApplied] = useState(false);
  const [rebalanceOptions, setRebalanceOptions] = useState<RebalanceSimulationOptions>({
    residencyId: defaultResidencyForJurisdiction(PRESET_SCENARIOS[0].payload.jurisdiction),
    accountWrapper: "taxable",
    assumedUnrealizedGainPct: 25,
  });

  // Interactive IC War Room state
  const [warRoomMessages, setWarRoomMessages] = useState<WarRoomMessage[]>([]);

  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<
    "committee" | "global_tax" | "company_model"
  >("committee");
  const [savedMemos, setSavedMemos] = useState<CompleteAnalysisResult[]>([]);
  const [savedSource, setSavedSource] = useState<"firestore" | "local">("local");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved-firestore" | "saved-local"
  >("idle");

  // Load saved experience tier + health + memos on mount
  useEffect(() => {
    try {
      const storedTier = window.localStorage.getItem("thesislens_experience_tier");
      if (storedTier === "prosumer" || storedTier === "institutional") {
        setExperienceTier(storedTier);
      }
    } catch {
      // ignore storage errors
    }

    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        setHasServerKey(Boolean(d.hasServerGeminiKey));
        if (d.defaultModel) setModelUsed(d.defaultModel);
      })
      .catch(() => {});

    listSavedMemos().then(({ memos, source }) => {
      setSavedMemos(memos);
      setSavedSource(source);
    });
  }, []);

  const handleChangeExperienceTier = (tier: ExperienceTier) => {
    setExperienceTier(tier);
    try {
      window.localStorage.setItem("thesislens_experience_tier", tier);
    } catch {
      // ignore
    }
  };

  // Keep rebalance default residency synced when scenario jurisdiction changes
  useEffect(() => {
    setRebalanceOptions((prev) => ({
      ...prev,
      residencyId: defaultResidencyForJurisdiction(payload.jurisdiction),
    }));
  }, [payload.jurisdiction]);

  const rebalanceSimulation = useMemo(() => {
    if (!cioMemo || cioMemo.rebalancePlan.length === 0) return null;
    return simulateCioRebalance({
      holdings: payload.holdings,
      rebalancePlan: cioMemo.rebalancePlan,
      capital: payload.capital,
      monthlyContribution: payload.monthlyContribution,
      horizonYears: payload.horizonYears,
      options: rebalanceOptions,
    });
  }, [
    cioMemo,
    payload.holdings,
    payload.capital,
    payload.monthlyContribution,
    payload.horizonYears,
    rebalanceOptions,
  ]);

  const handleSelectPreset = (id: string) => {
    const found = PRESET_SCENARIOS.find((p) => p.id === id);
    if (!found) return;
    setActivePresetId(id);
    setPayload(found.payload);
    setRebalanceApplied(false);
  };

  const runAnalysis = async (customPayload?: AnalysisRequestPayload) => {
    const basePayload = customPayload ?? payload;
    const reqPayload: AnalysisRequestPayload =
      customIntelSignals.length > 0
        ? { ...basePayload, intelSignals: customIntelSignals }
        : basePayload;
    setIsRunning(true);
    setErrorMessage(null);
    setRoutingPlan(null);
    setExpressionVehicles([]);
    setDebateTurns([]);
    setCioMemo(null);
    setCompleteResult(null);
    setSaveStatus("idle");
    setRebalanceSimOpen(false);
    setRebalanceApplied(false);
    setWarRoomMessages([]);
    setStatusMessage("Initializing Universal Quant Suite & Specialist Workforce...");

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userApiKey.trim()) {
        headers["x-gemini-api-key"] = userApiKey.trim();
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify(reqPayload),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Analysis request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          const event = JSON.parse(jsonStr) as StreamEvent;
          if (event.type === "status") {
            setStatusMessage(event.message);
            setActiveMode(event.mode);
            setModelUsed(event.model);
          } else if (event.type === "routing_plan") {
            setRoutingPlan(event.plan);
          } else if (event.type === "quant_ready") {
            setPortfolioMetrics(event.portfolioMetrics);
            setDcfResult(event.dcfResult);
            setMonteCarlo(event.monteCarlo);
            setMacroShocks(event.macroShocks);
          } else if (event.type === "universal_quant_ready") {
            setUniversalQuant(event.quant);
          } else if (event.type === "access_vehicles") {
            setExpressionVehicles(event.vehicles);
          } else if (event.type === "intel_ready") {
            setIntelSignals(event.signals);
          } else if (event.type === "agent_turn") {
            setDebateTurns((prev) => [...prev, event.turn]);
          } else if (event.type === "cio_memo") {
            setCioMemo(event.memo);
          } else if (event.type === "complete") {
            setCompleteResult(event.result);
          } else if (event.type === "error") {
            setErrorMessage(event.message);
          }
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to run Universal Workforce."
      );
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    runAnalysis(PRESET_SCENARIOS[0].payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyRebalance = (proposedHoldings: Holding[]) => {
    setPayload((prev) => ({
      ...prev,
      holdings: proposedHoldings,
    }));
    setActivePresetId(null);
    setRebalanceApplied(true);
  };

  const handleSaveMemo = async () => {
    if (!completeResult) return;
    setSaveStatus("saving");
    const dest = await saveMemo(completeResult);
    setSaveStatus(dest === "firestore" ? "saved-firestore" : "saved-local");
    const { memos, source } = await listSavedMemos();
    setSavedMemos(memos);
    setSavedSource(source);
  };

  const handleLoadSaved = (memo: CompleteAnalysisResult) => {
    setPayload(memo.request);
    setActivePresetId(null);
    setActiveMode(memo.mode);
    setModelUsed(memo.modelUsed);
    setRoutingPlan(memo.routingPlan ?? null);
    setExpressionVehicles(memo.expressionVehicles ?? []);
    setIntelSignals(memo.intelSignals ?? []);
    setUniversalQuant(memo.universalQuant ?? null);
    setPortfolioMetrics(memo.portfolioMetrics);
    setDcfResult(memo.dcfResult);
    setMonteCarlo(memo.monteCarlo);
    setMacroShocks(memo.macroShocks);
    setDebateTurns(memo.debateTurns);
    setCioMemo(memo.cioMemo);
    setCompleteResult(memo);
    setSaveStatus("idle");
    setRebalanceSimOpen(false);
    setRebalanceApplied(false);
    setWarRoomMessages([]);
    setActiveCanvasTab("executive");
  };

  const canvasTabs: {
    id: CanvasTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
  }[] = [
    {
      id: "executive",
      label: "Executive & Rebalance",
      icon: Award,
      badge: cioMemo ? `${cioMemo.convictionScore}` : undefined,
    },
    {
      id: "war_room",
      label: "IC War Room",
      icon: Swords,
      badge: warRoomMessages.length > 0 ? warRoomMessages.length : debateTurns.length || undefined,
    },
    {
      id: "quant_labs",
      label: "Quant Labs",
      icon: BarChart3,
    },
    {
      id: "intel_access",
      label: experienceTier === "institutional" ? "Intel & Access Matrix" : "Intel Signals",
      icon: Radio,
      badge: intelSignals.length > 0 ? intelSignals.length : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-[#070b14]">
      <Header
        hasServerKey={hasServerKey}
        userApiKey={userApiKey}
        onSaveApiKey={(key) => {
          setUserApiKey(key);
          if (key) setActiveMode("live-gemini");
        }}
        activeMode={activeMode}
        savedCount={savedMemos.length}
        onOpenSaved={() => setSavedDrawerOpen(true)}
        activeWorkspace={activeWorkspace}
        onChangeWorkspace={setActiveWorkspace}
        experienceTier={experienceTier}
        onChangeExperienceTier={handleChangeExperienceTier}
      />

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        {errorMessage && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {rebalanceApplied && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                CIO Rebalance target weights have been applied to your portfolio in the
                left workbench.
              </span>
            </div>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => runAnalysis()}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              <span>Re-Run Committee on Updated Portfolio</span>
            </button>
          </div>
        )}

        {activeWorkspace === "global_tax" ? (
          <GlobalTaxModule
            initialJurisdiction={payload.jurisdiction ?? "Canada"}
            initialCapital={payload.capital}
            userApiKey={userApiKey}
          />
        ) : activeWorkspace === "company_model" ? (
          <CompanyModelLab
            userApiKey={userApiKey}
            onSendToCommittee={(summary) => {
              const nextPayload: AnalysisRequestPayload = {
                ...payload,
                title: summary.title,
                thesisPrompt: summary.thesisPrompt,
              };
              setPayload(nextPayload);
              setActivePresetId(null);
              setActiveWorkspace("committee");
              void runAnalysis(nextPayload);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Left Workbench */}
            <div className="lg:col-span-4 xl:col-span-3">
              <InputWorkbench
                payload={payload}
                onChange={(next) => {
                  setPayload(next);
                  setActivePresetId(null);
                  setRebalanceApplied(false);
                }}
                onRun={() => runAnalysis()}
                isRunning={isRunning}
                activePresetId={activePresetId}
                onSelectPreset={handleSelectPreset}
                experienceTier={experienceTier}
              />
            </div>

            {/* Right Tabbed Intelligence & Quant Canvas */}
            <div className="space-y-4 lg:col-span-8 xl:col-span-9">
              {/* Focused Analyst Workspace Tab Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800/90 bg-[#0d1424]/95 p-2 shadow-lg">
                <div className="flex flex-wrap items-center gap-1.5">
                  {canvasTabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeCanvasTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveCanvasTab(tab.id)}
                        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                          active
                            ? "bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-white ring-1 ring-cyan-500/40"
                            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                        }`}
                      >
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            active ? "text-cyan-300" : "text-slate-500"
                          }`}
                        />
                        <span>{tab.label}</span>
                        {tab.badge !== undefined && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                              active
                                ? "bg-cyan-500/25 text-cyan-200"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <span className="hidden px-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 xl:inline">
                  {experienceTier === "institutional"
                    ? "Institutional Desk View"
                    : "Prosumer Focus View"}
                </span>
              </div>

              {/* TAB 1: Executive Memo & Tax-Aware Rebalance Sandbox */}
              {activeCanvasTab === "executive" && (
                <div className="space-y-4">
                  {cioMemo ? (
                    <>
                      <CioMemoDashboard
                        memo={cioMemo}
                        mode={activeMode}
                        modelUsed={modelUsed}
                        onSaveMemo={handleSaveMemo}
                        savedStatus={saveStatus}
                        onToggleRebalanceSim={() =>
                          setRebalanceSimOpen((prev) => !prev)
                        }
                        rebalanceSimOpen={rebalanceSimOpen}
                        onOpenWarRoom={() => setActiveCanvasTab("war_room")}
                        experienceTier={experienceTier}
                      />

                      {rebalanceSimOpen && rebalanceSimulation && (
                        <RebalanceSimulatorPanel
                          simulation={rebalanceSimulation}
                          options={rebalanceOptions}
                          onChangeOptions={setRebalanceOptions}
                          onApplyRebalance={handleApplyRebalance}
                          onClose={() => setRebalanceSimOpen(false)}
                          appliedSuccess={rebalanceApplied}
                          experienceTier={experienceTier}
                        />
                      )}

                      {experienceTier === "institutional" &&
                        expressionVehicles.length > 0 && (
                          <AccessExpressionMatrix
                            vehicles={expressionVehicles}
                            jurisdiction={
                              routingPlan?.jurisdiction ??
                              payload.jurisdiction ??
                              "Canada"
                            }
                            outcomeQuestion={routingPlan?.outcomeQuestion}
                          />
                        )}
                    </>
                  ) : (
                    /* While running initial analysis before CIO Memo arrives, show live streaming feed */
                    <AgentDebateFeed
                      turns={debateTurns}
                      isRunning={isRunning}
                      statusMessage={statusMessage}
                      routingPlan={routingPlan}
                    />
                  )}
                </div>
              )}

              {/* TAB 2: Interactive IC War Room + Full Committee Transcript */}
              {activeCanvasTab === "war_room" && (
                <div className="space-y-4">
                  {cioMemo && universalQuant && (
                    <IcWarRoom
                      analysisRequest={payload}
                      cioMemo={cioMemo}
                      universalQuant={universalQuant}
                      rebalanceSimulation={rebalanceSimulation}
                      messages={warRoomMessages}
                      onAddMessages={(newMsgs) =>
                        setWarRoomMessages((prev) => [...prev, ...newMsgs])
                      }
                      userApiKey={userApiKey}
                      experienceTier={experienceTier}
                    />
                  )}

                  <AgentDebateFeed
                    turns={debateTurns}
                    isRunning={isRunning}
                    statusMessage={statusMessage}
                    routingPlan={routingPlan}
                  />
                </div>
              )}

              {/* TAB 3: Adaptive Quantitative Labs */}
              {activeCanvasTab === "quant_labs" &&
                portfolioMetrics &&
                dcfResult &&
                monteCarlo &&
                macroShocks && (
                  <QuantAnalyticsPanel
                    metrics={portfolioMetrics}
                    dcfResult={dcfResult}
                    dcfInputs={payload.dcfInputs}
                    monteCarlo={monteCarlo}
                    macroShocks={macroShocks}
                    universalQuant={universalQuant}
                    requestPayload={payload}
                    userApiKey={userApiKey}
                  />
                )}

              {/* TAB 4: Multi-Source Intel & Access Expression Matrix */}
              {activeCanvasTab === "intel_access" && (
                <div className="space-y-4">
                  {intelSignals.length > 0 && (
                    <IntelligenceHub
                      signals={intelSignals}
                      userApiKey={userApiKey}
                      onAddSignals={(newSigs) => {
                        setCustomIntelSignals((prev) => [...newSigs, ...prev]);
                        setIntelSignals((prev) => [...newSigs, ...prev]);
                      }}
                    />
                  )}

                  {expressionVehicles.length > 0 && (
                    <AccessExpressionMatrix
                      vehicles={expressionVehicles}
                      jurisdiction={
                        routingPlan?.jurisdiction ?? payload.jurisdiction ?? "Canada"
                      }
                      outcomeQuestion={routingPlan?.outcomeQuestion}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <SavedMemosDrawer
        open={savedDrawerOpen}
        onClose={() => setSavedDrawerOpen(false)}
        memos={savedMemos}
        source={savedSource}
        onSelect={handleLoadSaved}
      />
    </div>
  );
}
