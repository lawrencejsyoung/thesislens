"use client";

import React, { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { InputWorkbench } from "@/components/InputWorkbench";
import { AgentDebateFeed } from "@/components/AgentDebateFeed";
import { CioMemoDashboard } from "@/components/CioMemoDashboard";
import { QuantAnalyticsPanel } from "@/components/QuantAnalyticsPanel";
import { AccessExpressionMatrix } from "@/components/AccessExpressionMatrix";
import { IntelligenceHub } from "@/components/IntelligenceHub";
import { GlobalTaxModule } from "@/components/GlobalTaxModule";
import { SavedMemosDrawer } from "@/components/SavedMemosDrawer";
import { PRESET_SCENARIOS } from "@/lib/demo-scenarios";
import { listSavedMemos, saveMemo } from "@/lib/firebase";
import {
  AgentDebateTurn,
  AnalysisRequestPayload,
  CioInvestmentMemo,
  CompleteAnalysisResult,
  DcfResult,
  ExpressionVehicle,
  IntelSignal,
  MacroShockScenarioResult,
  MonteCarloResult,
  PortfolioMetrics,
  RoutingPlan,
  StreamEvent,
  UniversalQuantBundle,
} from "@/lib/types";
import { AlertCircle } from "lucide-react";

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

  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<"committee" | "global_tax">(
    "committee"
  );
  const [savedMemos, setSavedMemos] = useState<CompleteAnalysisResult[]>([]);
  const [savedSource, setSavedSource] = useState<"firestore" | "local">("local");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved-firestore" | "saved-local"
  >("idle");

  useEffect(() => {
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

  const handleSelectPreset = (id: string) => {
    const found = PRESET_SCENARIOS.find((p) => p.id === id);
    if (!found) return;
    setActivePresetId(id);
    setPayload(found.payload);
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
  };

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
      />

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        {errorMessage && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {activeWorkspace === "global_tax" ? (
          <GlobalTaxModule
            initialJurisdiction={payload.jurisdiction ?? "Canada"}
            initialCapital={payload.capital}
            userApiKey={userApiKey}
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
              }}
              onRun={() => runAnalysis()}
              isRunning={isRunning}
              activePresetId={activePresetId}
              onSelectPreset={handleSelectPreset}
            />
          </div>

          {/* Right Intelligence & Quant Canvas */}
          <div className="space-y-5 lg:col-span-8 xl:col-span-9">
            {/* CIO Executive Memo */}
            {cioMemo && (
              <CioMemoDashboard
                memo={cioMemo}
                mode={activeMode}
                modelUsed={modelUsed}
                onSaveMemo={handleSaveMemo}
                savedStatus={saveStatus}
              />
            )}

            {/* Market Access & Expression Matrix ("Every Way to Bet") */}
            {expressionVehicles.length > 0 && (
              <AccessExpressionMatrix
                vehicles={expressionVehicles}
                jurisdiction={routingPlan?.jurisdiction ?? payload.jurisdiction ?? "Canada"}
                outcomeQuestion={routingPlan?.outcomeQuestion}
              />
            )}

            {/* Adaptive Quantitative Labs & Charts */}
            {portfolioMetrics && dcfResult && monteCarlo && macroShocks && (
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

            {/* Multi-Source Intelligence Hub (Newsletters, Podcasts, News, SEC Filings & Macro) */}
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

            {/* Live Multi-Agent DAG Workforce & Function Call Trace */}
            <AgentDebateFeed
              turns={debateTurns}
              isRunning={isRunning}
              statusMessage={statusMessage}
              routingPlan={routingPlan}
            />
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
