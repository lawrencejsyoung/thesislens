"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Building2,
  Crown,
  GraduationCap,
  Stethoscope,
  Sunset,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { LifestyleWorkbench } from "@/components/lifestyle/LifestyleWorkbench";
import { LifestyleAnalyticsCanvas } from "@/components/lifestyle/LifestyleAnalyticsCanvas";
import { DEMOGRAPHIC_PROFILES, getDemographicMeta } from "@/lib/lifestyle-presets";
import { runLifestylePlan } from "@/lib/lifestyle-engine";
import {
  AdvisorBriefResponse,
  DemographicId,
  LifestylePlanInputs,
} from "@/lib/lifestyle-types";

const DEMOGRAPHIC_ICONS: Record<
  DemographicId,
  React.ComponentType<{ className?: string }>
> = {
  individual: User,
  couple: Users,
  business_owner: Building2,
  doctor: Stethoscope,
  executive: Briefcase,
  retiree: Sunset,
  hnw_family: Crown,
  young_professional: GraduationCap,
};

export function HouseholdPlanner({ userApiKey }: { userApiKey: string }) {
  const briefVersion = useRef(0);
  const [selectedDemographic, setSelectedDemographic] =
    useState<DemographicId>("couple");
  const [inputs, setInputs] = useState<LifestylePlanInputs>(
    () => getDemographicMeta("couple").defaultProfile
  );

  const [brief, setBrief] = useState<AdvisorBriefResponse | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Instant real-time deterministic + Monte Carlo lifestyle calculation
  const plan = useMemo(() => runLifestylePlan(inputs), [inputs]);
  const activeMeta = useMemo(
    () => getDemographicMeta(selectedDemographic),
    [selectedDemographic]
  );

  const generateBrief = async (customInputs?: LifestylePlanInputs) => {
    const target = customInputs ?? inputs;
    const version = ++briefVersion.current;
    setIsGeneratingBrief(true);
    setErrorMessage(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userApiKey.trim()) {
        headers["x-gemini-api-key"] = userApiKey.trim();
      }

      const res = await fetch("/api/lifestyle", {
        method: "POST",
        headers,
        body: JSON.stringify({ inputs: target, generateBrief: true }),
      });

      if (!res.ok) {
        throw new Error(`Brief generation failed (${res.status})`);
      }

      const data = (await res.json()) as {
        brief?: AdvisorBriefResponse;
        error?: string;
      };
      if (version === briefVersion.current && data.brief) setBrief(data.brief);
    } catch (err) {
      if (version !== briefVersion.current) return;
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to generate CFP brief"
      );
    } finally {
      if (version === briefVersion.current) setIsGeneratingBrief(false);
    }
  };

  const updateInputs = (next: LifestylePlanInputs) => {
    briefVersion.current++;
    setInputs(next);
    setBrief(null);
    setErrorMessage(null);
    setIsGeneratingBrief(false);
  };

  const handleSelectDemographic = (id: DemographicId) => {
    const meta = getDemographicMeta(id);
    setSelectedDemographic(id);
    updateInputs(meta.defaultProfile);
  };

  return (
    <div>
        {/* Top Module Hero & 8-Persona Demographic Switcher */}
        <section className="mb-5 rounded-2xl border border-slate-800/90 bg-gradient-to-br from-[var(--raised)] via-[var(--surface)] to-[var(--canvas)] p-4 sm:p-5">
          <h1 className="page-title">Household planning</h1>
          <p className="page-description">Choose a sample household, adjust its details, and review the plan before generating a client brief.</p>
          {/* 8 Demographic Archetype Cards */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {DEMOGRAPHIC_PROFILES.map((demo) => {
              const Icon = DEMOGRAPHIC_ICONS[demo.id];
              const isSelected = selectedDemographic === demo.id;
              return (
                <button
                  key={demo.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelectDemographic(demo.id)}
                  className={`group flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                    isSelected
                      ? "border-emerald-500/70 bg-emerald-500/12 shadow-lg shadow-emerald-500/10"
                      : "border-slate-800/90 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/70"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                        isSelected
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-900 text-slate-400 group-hover:text-slate-200"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-[9px] font-mono text-slate-500">
                      {demo.typicalAum.split("–")[0].trim()}
                    </span>
                  </div>
                  <div
                    className={`mt-2 text-xs font-semibold leading-tight ${
                      isSelected ? "text-emerald-200" : "text-slate-200"
                    }`}
                  >
                    {demo.shortLabel}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                    {demo.typicalAum}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Archetype Focus Strip */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-slate-800/70 bg-slate-950/60 px-3.5 py-2 text-[11px] text-slate-300">
            <span className="font-semibold text-emerald-300">
              {activeMeta.label} Priorities:
            </span>
            {activeMeta.keyFocusAreas.map((area, idx) => (
              <span key={idx} className="flex items-center gap-1.5 text-slate-400">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-cyan-400" />
                {area}
              </span>
            ))}
          </div>
        </section>

        {errorMessage && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main 12-Col Advisor Workspace */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left Client Workbench */}
          <div className="lg:col-span-4 xl:col-span-3">
            <LifestyleWorkbench
              inputs={inputs}
              onChange={updateInputs}
              onGenerateBrief={() => generateBrief()}
              isGeneratingBrief={isGeneratingBrief}
            />
          </div>

          {/* Right Analytics & Client Presentation Canvas */}
          <div className="lg:col-span-8 xl:col-span-9">
            <LifestyleAnalyticsCanvas
              plan={plan}
              brief={brief}
              isGeneratingBrief={isGeneratingBrief}
              onGenerateBrief={() => generateBrief()}
            />
          </div>
        </div>
    </div>
  );
}
