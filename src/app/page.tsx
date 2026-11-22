"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceOverview } from "@/components/WorkspaceOverview";
import { AgentConnections } from "@/components/AgentConnections";
import { HouseholdPlanner } from "@/components/lifestyle/HouseholdPlanner";
import { Profile, profiles, isProfile, Workspace, workspaceLabels } from "@/lib/workspaces";
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

const starter = PRESET_SCENARIOS.find(s => s.id === profiles.beginner.preset)!;

export default function HomePage() {
  const pathname = usePathname();
  const defaultWorkspace = pathname === "/lifestyle" ? "planner" : "overview";
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(defaultWorkspace);
  const [visitedPlanner, setVisitedPlanner] = useState(defaultWorkspace === "planner");
  const [profile, setProfile] = useState<Profile>("beginner");
  const [analyzedPayload, setAnalyzedPayload] = useState<AnalysisRequestPayload | null>(null);
  const resultVersion = useRef(0);
  const activeVersion = resultVersion.current;
  const currentRun = useRef<AbortController | null>(null);
  const experienceTier: ExperienceTier = profile === "manager" ? "institutional" : "prosumer";
  const navigate = (workspace: Workspace) => {
    setActiveWorkspace(workspace);
    if (workspace === "planner") setVisitedPlanner(true);
    if (window.location.hash !== "#" + workspace) window.location.hash = workspace;
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const syncLocation = () => {
      const hash = window.location.hash.slice(1);
      if (hash === "main-content") return;
      const key = Object.hasOwn(workspaceLabels, hash) ? hash as Workspace : defaultWorkspace;
      setActiveWorkspace(key);
      if (key === "planner") setVisitedPlanner(true);
    };
    syncLocation();
    window.addEventListener("hashchange", syncLocation);
    return () => window.removeEventListener("hashchange", syncLocation);
  }, [defaultWorkspace]);
  useEffect(() => () => currentRun.current?.abort(), []);
  const [activePresetId, setActivePresetId] = useState<string | null>(
    starter.id
  );
  const [payload, setPayload] = useState<AnalysisRequestPayload>(
    starter.payload
  );

  const [hasServerKey, setHasServerKey] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const [activeMode, setActiveMode] = useState<"live-gemini" | "demo-simulation">(
    "demo-simulation"
  );
  const [modelUsed, setModelUsed] = useState("gemini-2.5-flash");

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
    residencyId: defaultResidencyForJurisdiction(starter.payload.jurisdiction),
    accountWrapper: "taxable",
    assumedUnrealizedGainPct: 25,
  });

  // Interactive IC War Room state
  const [warRoomMessages, setWarRoomMessages] = useState<WarRoomMessage[]>([]);

  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [savedMemos, setSavedMemos] = useState<CompleteAnalysisResult[]>([]);
  const [savedSource, setSavedSource] = useState<"firestore" | "local">("local");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved-firestore" | "saved-local"
  >("idle");

  // Load saved experience tier + health + memos on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("thesislens_profile");
      const legacy = window.localStorage.getItem("thesislens_experience_tier");
      const restored = isProfile(stored) ? stored : legacy === "institutional" ? "manager" : legacy === "prosumer" ? "retail" : "beginner";
      setProfile(restored);
      const initial = PRESET_SCENARIOS.find(s => s.id === profiles[restored].preset)!;
      setPayload(initial.payload);
      setActivePresetId(initial.id);
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

  const changeProfile = (next: Profile) => {
    setProfile(next);
    try { window.localStorage.setItem("thesislens_profile", next); } catch { /* Storage is optional. */ }
    navigate("overview");
  };

  // Keep rebalance default residency synced when scenario jurisdiction changes
  useEffect(() => {
    setRebalanceOptions((prev) => ({
      ...prev,
      residencyId: defaultResidencyForJurisdiction(analyzedPayload?.jurisdiction ?? payload.jurisdiction),
    }));
  }, [analyzedPayload?.jurisdiction, payload.jurisdiction]);

  const resultInputs = analyzedPayload ?? payload;
  const rebalanceSimulation = useMemo(() => {
    if (!cioMemo || !cioMemo.rebalancePlan.length) return null;
    return simulateCioRebalance({ ...resultInputs, rebalancePlan: cioMemo.rebalancePlan, options: rebalanceOptions });
  }, [cioMemo, resultInputs, rebalanceOptions]);

  const handleSelectPreset = (id: string) => {
    const found = PRESET_SCENARIOS.find((p) => p.id === id);
    if (!found) return;
    setActivePresetId(id);
    setCustomIntelSignals([]);
    setPayload(found.payload);
    setRebalanceApplied(false);
  };

  const runAnalysis = async (customPayload?: AnalysisRequestPayload) => {
    const basePayload = customPayload ?? payload;
    const reqPayload: AnalysisRequestPayload = {
      ...basePayload, audience: profile,
      intelSignals: customIntelSignals.length ? customIntelSignals : basePayload.intelSignals,
    };
    resultVersion.current++;
    currentRun.current?.abort();
    const controller = new AbortController();
    currentRun.current = controller;
    setAnalyzedPayload(basePayload);
    setPortfolioMetrics(null);
    setDcfResult(null);
    setMonteCarlo(null);
    setMacroShocks(null);
    setUniversalQuant(null);
    setIntelSignals([]);
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
    setStatusMessage("Preparing the analysis…");

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
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Analysis request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let terminalEvent = false;
      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return;
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
            terminalEvent = true;
            setCompleteResult(event.result);
            setActiveMode(event.result.mode);
            setModelUsed(event.result.modelUsed);
          } else if (event.type === "error") {
            terminalEvent = true;
            setErrorMessage(event.message);
          }
        }
      }
      if (!terminalEvent) throw new Error("The analysis was interrupted. Run it again to finish.");
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to run Universal Workforce."
      );
    } finally {
      if (currentRun.current === controller) setIsRunning(false);
    }
  };

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
    const version = resultVersion.current;
    try {
      const dest = await saveMemo(completeResult);
      if (version === resultVersion.current) setSaveStatus(dest === "firestore" ? "saved-firestore" : "saved-local");
    } catch {
      if (version === resultVersion.current) {
        setSaveStatus("idle");
        setErrorMessage("The memo could not be saved. Check available browser storage and try again.");
      }
      return;
    }
    const { memos, source } = await listSavedMemos();
    setSavedMemos(memos);
    setSavedSource(source);
  };

  const handleLoadSaved = (memo: CompleteAnalysisResult) => {
    resultVersion.current++;
    currentRun.current?.abort();
    currentRun.current = null;
    setIsRunning(false);
    setStatusMessage("");
    setErrorMessage(null);
    setAnalyzedPayload(memo.request);
    setCustomIntelSignals([]);
    navigate("committee");
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
      label: "Decision memo",
      icon: Award,
      badge: cioMemo ? `${cioMemo.convictionScore}` : undefined,
    },
    {
      id: "war_room",
      label: "Ask the committee",
      icon: Swords,
      badge: warRoomMessages.length > 0 ? warRoomMessages.length : debateTurns.length || undefined,
    },
    {
      id: "quant_labs",
      label: "Scenario tests",
      icon: BarChart3,
    },
    {
      id: "intel_access",
      label: "Evidence & access",
      icon: Radio,
      badge: intelSignals.length > 0 ? intelSignals.length : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <Header profile={profile} onProfile={changeProfile} workspace={activeWorkspace} onNavigate={navigate}
        hasServerKey={hasServerKey} userApiKey={userApiKey} onSaveApiKey={setUserApiKey}
        savedCount={savedMemos.length} onOpenSaved={() => setSavedDrawerOpen(true)} />
      <main className="workspace-main" id="main-content" tabIndex={-1}>
        {visitedPlanner && <div hidden={activeWorkspace !== "planner"}><HouseholdPlanner userApiKey={userApiKey}/></div>}
        {activeWorkspace === "committee" && errorMessage && (
          <div role="alert" className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {activeWorkspace === "committee" && rebalanceApplied && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                The proposed weights have been applied to your draft portfolio.
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

        {activeWorkspace === "overview" || activeWorkspace === "library" ? (
          <WorkspaceOverview profile={profile} showLibrary={activeWorkspace === "library"} onLibrary={open => navigate(open ? "library" : "overview")} onNavigate={navigate}
            onExample={id => { handleSelectPreset(id); setActiveCanvasTab("executive"); navigate("committee"); }} />
        ) : activeWorkspace === "agents" ? <AgentConnections profile={profile}/> : activeWorkspace === "planner" ? null : activeWorkspace === "global_tax" ? (
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
              navigate("committee");
              setActiveCanvasTab("executive");
              void runAnalysis(nextPayload);
            }}
          />
        ) : (
          <section>
            <h1 className="page-title">Portfolio research</h1>
            <p className="page-description">{profiles[profile].prompt}</p>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Left Workbench */}
            <div className="min-w-0 lg:col-span-4">
              <InputWorkbench
                payload={payload}
                onChange={(next) => {
                  setPayload(next);
                  setActivePresetId(null);
                  setRebalanceApplied(false);
                }}
                onRun={() => {
                  setActiveCanvasTab("executive");
                  void runAnalysis();
                  document.getElementById("research-results")?.focus();
                }}
                isRunning={isRunning}
                activePresetId={activePresetId}
                onSelectPreset={handleSelectPreset}
                experienceTier={experienceTier}
              />
            </div>

            {/* Right Tabbed Intelligence & Quant Canvas */}
            <div id="research-results" tabIndex={-1} className="min-w-0 space-y-4 lg:col-span-8">
              {analyzedPayload && analyzedPayload !== payload && <p className="result-note" role="status">These results use the previous inputs. Run the analysis to update them.</p>}
              {/* Focused Analyst Workspace Tab Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800/90 bg-[var(--surface)]/95 p-2 shadow-lg">
                <div className="flex flex-wrap items-center gap-1.5">
                  {canvasTabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeCanvasTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        aria-pressed={active}
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

              </div>
              {!isRunning && !cioMemo && activeCanvasTab !== "war_room" && <div className="system-panel empty-panel">
                <BarChart3 size={24}/><h2>{errorMessage ? "Analysis incomplete" : "Ready when you are"}</h2>
                <p>{({executive: "Review the inputs and run an analysis to see the investment case, its risks, and a proposed allocation.", quant_labs: "Run the portfolio first to explore projections, stress tests, and valuations using its holdings.", intel_access: "Run the portfolio to see its research signals and available investment vehicles."})[activeCanvasTab]}</p>
              </div>}
              {isRunning && activeCanvasTab !== "executive" && activeCanvasTab !== "war_room" && <p role="status" className="result-note">{statusMessage}</p>}
              {/* TAB 1: Executive Memo & Tax-Aware Rebalance Sandbox */}
              {activeCanvasTab === "executive" && (
                <div className="space-y-4">
                  {cioMemo ? (
                    <>
                      {profile === "beginner" && monteCarlo && <article className="system-panel beginner-brief">
                        <h2>What could my savings become?</h2>
                        <p>After {monteCarlo.horizonYears} years, the middle modeled outcome is <strong>${monteCarlo.medianEndingValue.toLocaleString("en-US")}</strong>. The middle 80% of simulated outcomes range from ${monteCarlo.downsideP10Value.toLocaleString("en-US")} to ${monteCarlo.upsideP90Value.toLocaleString("en-US")}.</p>
                        <p>These estimates use your starting balance, monthly savings, and assumed returns. Try a different contribution and run the analysis again.</p>
                      </article>}
                      <CioMemoDashboard
                        memo={cioMemo}
                        mode={activeMode}
                        modelUsed={modelUsed}
                        onSaveMemo={handleSaveMemo}
                        savedStatus={saveStatus}
                        onToggleRebalanceSim={analyzedPayload !== payload ? undefined : () =>
                          setRebalanceSimOpen((prev) => !prev)
                        }
                        rebalanceSimOpen={rebalanceSimOpen}
                        onOpenWarRoom={() => setActiveCanvasTab("war_room")}
                        experienceTier={experienceTier}
                      />

                      {rebalanceSimOpen && rebalanceSimulation && (rebalanceApplied || analyzedPayload === payload) && (
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
                    isRunning ? <AgentDebateFeed
                      turns={debateTurns}
                      isRunning={isRunning}
                      statusMessage={statusMessage}
                      routingPlan={routingPlan}
                    /> : null
                  )}
                </div>
              )}

              {/* TAB 2: Interactive IC War Room + Full Committee Transcript */}
              {activeCanvasTab === "war_room" && (
                <div className="space-y-4">
                  {cioMemo && universalQuant && (
                    <IcWarRoom
                      analysisRequest={{ ...resultInputs, audience: profile }}
                      cioMemo={cioMemo}
                      universalQuant={universalQuant}
                      rebalanceSimulation={rebalanceSimulation}
                      messages={warRoomMessages}
                      onAddMessages={(newMsgs) => {
                        if (resultVersion.current === activeVersion) setWarRoomMessages(prev => [...prev, ...newMsgs]);
                      }}
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
                    dcfInputs={resultInputs.dcfInputs}
                    monteCarlo={monteCarlo}
                    macroShocks={macroShocks}
                    universalQuant={universalQuant}
                    requestPayload={resultInputs}
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
          </div></section>
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
