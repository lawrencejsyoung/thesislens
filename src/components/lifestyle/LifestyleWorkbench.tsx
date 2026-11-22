"use client";

import React, { useState } from "react";
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  DollarSign,
  HeartPulse,
  Plus,
  Shield,
  Sliders,
  Sparkles,
  Stethoscope,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import {
  LifestyleMilestone,
  LifestylePlanInputs,
  MilestoneCategory,
  PlanningJurisdiction,
  RiskProfile,
} from "@/lib/lifestyle-types";

interface LifestyleWorkbenchProps {
  inputs: LifestylePlanInputs;
  onChange: (next: LifestylePlanInputs) => void;
  onGenerateBrief: () => void;
  isGeneratingBrief: boolean;
}

type SectionKey =
  | "identity"
  | "cashflow"
  | "balance"
  | "demographic"
  | "protection"
  | "milestones";

const RISK_OPTIONS: { value: RiskProfile; label: string; sub: string }[] = [
  { value: "conservative", label: "Conservative", sub: "4.8% / 7% vol" },
  { value: "balanced", label: "Balanced", sub: "6.4% / 11% vol" },
  { value: "growth", label: "Growth", sub: "7.6% / 14.5% vol" },
  { value: "aggressive", label: "Aggressive", sub: "8.8% / 18% vol" },
];

const MILESTONE_CATEGORIES: { value: MilestoneCategory; label: string }[] = [
  { value: "real_estate", label: "Real Estate" },
  { value: "education", label: "Education" },
  { value: "lifestyle", label: "Lifestyle / Travel" },
  { value: "business", label: "Business / Exit" },
  { value: "healthcare", label: "Healthcare / LTC" },
  { value: "legacy", label: "Legacy / Giving" },
  { value: "sabbatical", label: "Sabbatical / Pivot" },
];

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1000,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-400">
        {label}
      </label>
      <div className="relative mt-1">
        {prefix && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`w-full rounded-lg border border-slate-700/80 bg-slate-950/90 py-1.5 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none ${
            prefix ? "pl-6" : "pl-2.5"
          } ${suffix ? "pr-7" : "pr-2.5"}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function LifestyleWorkbench({
  inputs,
  onChange,
  onGenerateBrief,
  isGeneratingBrief,
}: LifestyleWorkbenchProps) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    identity: true,
    cashflow: true,
    balance: true,
    demographic: true,
    protection: false,
    milestones: true,
  });

  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneAge, setNewMilestoneAge] = useState(
    Math.min(inputs.lifeExpectancy - 2, inputs.currentAge + 6)
  );
  const [newMilestoneAmount, setNewMilestoneAmount] = useState(50000);
  const [newMilestoneCategory, setNewMilestoneCategory] =
    useState<MilestoneCategory>("lifestyle");

  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const update = <K extends keyof LifestylePlanInputs>(
    field: K,
    value: LifestylePlanInputs[K]
  ) => {
    onChange({ ...inputs, [field]: value });
  };

  const updateSpecific = (
    field: keyof LifestylePlanInputs["specifics"],
    value: number | boolean
  ) => {
    onChange({
      ...inputs,
      specifics: {
        ...inputs.specifics,
        [field]: value,
      },
    });
  };

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMilestoneTitle.trim()) return;
    const item: LifestyleMilestone = {
      id: `custom-${Date.now()}`,
      title: newMilestoneTitle.trim(),
      category: newMilestoneCategory,
      age: newMilestoneAge,
      amount: newMilestoneAmount,
      durationYears: 1,
      enabled: true,
      priority: "important",
    };
    update("milestones", [...inputs.milestones, item]);
    setNewMilestoneTitle("");
  };

  const toggleMilestone = (id: string) => {
    update(
      "milestones",
      inputs.milestones.map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      )
    );
  };

  const deleteMilestone = (id: string) => {
    update(
      "milestones",
      inputs.milestones.filter((m) => m.id !== id)
    );
  };

  return (
    <div className="space-y-3">
      {/* Primary Action CTA */}
      <button
        type="button"
        onClick={onGenerateBrief}
        disabled={isGeneratingBrief}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4" />
        <span>
          {isGeneratingBrief
            ? "Synthesizing CFP Advisory Brief..."
            : "Generate CFP Advisor Brief"}
        </span>
      </button>

      {/* 1. Client Identity & Horizon */}
      <div className="rounded-xl border border-slate-800/90 bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => toggleSection("identity")}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-white">
            <Users className="h-3.5 w-3.5 text-emerald-400" />
            Client Profile &amp; Horizon
          </span>
          {openSections.identity ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {openSections.identity && (
          <div className="space-y-3 border-t border-slate-800/70 px-3.5 py-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400">
                Client / Household Name
              </label>
              <input
                type="text"
                value={inputs.clientName}
                onChange={(e) => update("clientName", e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/90 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Jurisdiction Toggle */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400">
                Tax &amp; Account Jurisdiction
              </label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {(["Canada", "United States"] as PlanningJurisdiction[]).map(
                  (jur) => (
                    <button
                      key={jur}
                      type="button"
                      onClick={() => update("jurisdiction", jur)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        inputs.jurisdiction === jur
                          ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                          : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {jur === "Canada" ? "🇨🇦 Canada" : "🇺🇸 United States"}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label="Current Age"
                value={inputs.currentAge}
                onChange={(v) => update("currentAge", v)}
                step={1}
                min={18}
                max={90}
              />
              <NumberField
                label="Retire Age"
                value={inputs.retirementAge}
                onChange={(v) => update("retirementAge", v)}
                step={1}
                min={inputs.currentAge}
                max={85}
              />
              <NumberField
                label="Plan To Age"
                value={inputs.lifeExpectancy}
                onChange={(v) => update("lifeExpectancy", v)}
                step={1}
                min={inputs.currentAge + 10}
                max={105}
              />
            </div>

            {/* Risk Profile */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400">
                Portfolio Risk Profile
              </label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {RISK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update("riskProfile", opt.value)}
                    className={`rounded-lg border px-2 py-1.5 text-left transition ${
                      inputs.riskProfile === opt.value
                        ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-200"
                        : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-[11px] font-semibold">{opt.label}</div>
                    <div className="text-[10px] opacity-75">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Income & Lifestyle Cash Flow */}
      <div className="rounded-xl border border-slate-800/90 bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => toggleSection("cashflow")}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-white">
            <DollarSign className="h-3.5 w-3.5 text-cyan-400" />
            Income &amp; Lifestyle Burn (Annual)
          </span>
          {openSections.cashflow ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {openSections.cashflow && (
          <div className="space-y-2.5 border-t border-slate-800/70 px-3.5 py-3">
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Primary Gross Income"
                value={inputs.primaryIncome}
                onChange={(v) => update("primaryIncome", v)}
                prefix="$"
                step={5000}
              />
              <NumberField
                label="Partner Income"
                value={inputs.partnerIncome}
                onChange={(v) => update("partnerIncome", v)}
                prefix="$"
                step={5000}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Business / Equity / Passive"
                value={inputs.passiveOrBusinessIncome}
                onChange={(v) => update("passiveOrBusinessIncome", v)}
                prefix="$"
                step={2500}
              />
              <NumberField
                label="Annual Savings Target"
                value={inputs.annualSavingsContribution}
                onChange={(v) => update("annualSavingsContribution", v)}
                prefix="$"
                step={2500}
              />
            </div>

            <div className="my-1 border-t border-slate-800/70 pt-2">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                After-Tax Lifestyle Spending Architecture
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Essential Living (Needs)"
                  value={inputs.essentialAnnualSpend}
                  onChange={(v) => update("essentialAnnualSpend", v)}
                  prefix="$"
                  step={2000}
                />
                <NumberField
                  label="Discretionary (Wants)"
                  value={inputs.discretionaryAnnualSpend}
                  onChange={(v) => update("discretionaryAnnualSpend", v)}
                  prefix="$"
                  step={2000}
                />
                <NumberField
                  label="Healthcare / Wellness"
                  value={inputs.healthcareAnnualSpend}
                  onChange={(v) => update("healthcareAnnualSpend", v)}
                  prefix="$"
                  step={500}
                />
                <NumberField
                  label="Annual Debt Service"
                  value={inputs.annualDebtService}
                  onChange={(v) => update("annualDebtService", v)}
                  prefix="$"
                  step={1000}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Retire Spend Ratio"
                value={inputs.retirementSpendRatioPct}
                onChange={(v) => update("retirementSpendRatioPct", v)}
                suffix="%"
                step={2}
                min={50}
                max={120}
              />
              <NumberField
                label="Inflation Assumption"
                value={inputs.inflationRatePct}
                onChange={(v) => update("inflationRatePct", v)}
                suffix="%"
                step={0.1}
                min={1}
                max={7}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Balance Sheet & Tax Buckets */}
      <div className="rounded-xl border border-slate-800/90 bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => toggleSection("balance")}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-white">
            <Wallet className="h-3.5 w-3.5 text-amber-400" />
            Balance Sheet &amp; Tax Buckets
          </span>
          {openSections.balance ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {openSections.balance && (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-800/70 px-3.5 py-3">
            <NumberField
              label={
                inputs.jurisdiction === "Canada"
                  ? "RRSP / IPP (Tax-Def)"
                  : "401(k) / IRA (Tax-Def)"
              }
              value={inputs.taxDeferredAssets}
              onChange={(v) => update("taxDeferredAssets", v)}
              prefix="$"
              step={10000}
            />
            <NumberField
              label={
                inputs.jurisdiction === "Canada"
                  ? "TFSA / FHSA (Tax-Free)"
                  : "Roth / HSA (Tax-Free)"
              }
              value={inputs.taxFreeAssets}
              onChange={(v) => update("taxFreeAssets", v)}
              prefix="$"
              step={5000}
            />
            <NumberField
              label="Taxable / Corp / HoldCo"
              value={inputs.taxableAndCorpAssets}
              onChange={(v) => update("taxableAndCorpAssets", v)}
              prefix="$"
              step={10000}
            />
            <NumberField
              label="Cash / Emergency Fund"
              value={inputs.cashEmergencyFund}
              onChange={(v) => update("cashEmergencyFund", v)}
              prefix="$"
              step={5000}
            />
            <NumberField
              label="Illiquid (Home / Biz)"
              value={inputs.illiquidEquityAssets}
              onChange={(v) => update("illiquidEquityAssets", v)}
              prefix="$"
              step={25000}
            />
            <NumberField
              label="Total Liabilities"
              value={inputs.totalLiabilities}
              onChange={(v) => update("totalLiabilities", v)}
              prefix="$"
              step={10000}
            />
          </div>
        )}
      </div>

      {/* 4. Demographic-Specific Structural Levers */}
      <div className="rounded-xl border border-slate-800/90 bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => toggleSection("demographic")}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-white">
            {inputs.demographic === "doctor" ? (
              <Stethoscope className="h-3.5 w-3.5 text-rose-400" />
            ) : inputs.demographic === "business_owner" ? (
              <Building2 className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Sliders className="h-3.5 w-3.5 text-violet-400" />
            )}
            Demographic-Specific Levers
          </span>
          {openSections.demographic ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {openSections.demographic && (
          <div className="space-y-2.5 border-t border-slate-800/70 px-3.5 py-3">
            {inputs.demographic === "business_owner" && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Est. Business Valuation"
                  value={inputs.specifics.businessValuation ?? 2500000}
                  onChange={(v) => updateSpecific("businessValuation", v)}
                  prefix="$"
                  step={100000}
                />
                <NumberField
                  label="Target Exit Age"
                  value={inputs.specifics.businessExitAge ?? inputs.retirementAge}
                  onChange={(v) => updateSpecific("businessExitAge", v)}
                  step={1}
                />
                <NumberField
                  label="Corp Retained Earnings"
                  value={inputs.specifics.corporateRetainedEarnings ?? 500000}
                  onChange={(v) => updateSpecific("corporateRetainedEarnings", v)}
                  prefix="$"
                  step={25000}
                />
                <NumberField
                  label="Salary vs. Dividend %"
                  value={inputs.specifics.salaryDividendSplitPct ?? 65}
                  onChange={(v) => updateSpecific("salaryDividendSplitPct", v)}
                  suffix="%"
                  step={5}
                  max={100}
                />
              </div>
            )}

            {inputs.demographic === "doctor" && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Medical School Debt"
                  value={inputs.specifics.medicalSchoolDebt ?? 200000}
                  onChange={(v) => updateSpecific("medicalSchoolDebt", v)}
                  prefix="$"
                  step={10000}
                />
                <NumberField
                  label="Part-Time / Locum Age"
                  value={inputs.specifics.partTimeTransitionAge ?? 54}
                  onChange={(v) => updateSpecific("partTimeTransitionAge", v)}
                  step={1}
                />
                <NumberField
                  label="Own-Occ Disability %"
                  value={inputs.specifics.ownOccDisabilityCoveragePct ?? 65}
                  onChange={(v) =>
                    updateSpecific("ownOccDisabilityCoveragePct", v)
                  }
                  suffix="%"
                  step={5}
                  max={85}
                />
                <NumberField
                  label="Practice Buy-In Age"
                  value={inputs.specifics.practiceBuyInAge ?? 41}
                  onChange={(v) => updateSpecific("practiceBuyInAge", v)}
                  step={1}
                />
              </div>
            )}

            {inputs.demographic === "executive" && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Annual RSU / Equity Vest"
                  value={inputs.specifics.annualEquityVest ?? 200000}
                  onChange={(v) => updateSpecific("annualEquityVest", v)}
                  prefix="$"
                  step={10000}
                />
                <NumberField
                  label="Concentrated Stock %"
                  value={inputs.specifics.concentratedStockPct ?? 40}
                  onChange={(v) => updateSpecific("concentratedStockPct", v)}
                  suffix="%"
                  step={5}
                  max={100}
                />
              </div>
            )}

            {inputs.demographic === "couple" && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Dependents / Children"
                  value={inputs.specifics.dependentsCount ?? 2}
                  onChange={(v) => updateSpecific("dependentsCount", v)}
                  step={1}
                  max={10}
                />
                <NumberField
                  label="Annual Childcare Cost"
                  value={inputs.specifics.childcareAnnual ?? 15000}
                  onChange={(v) => updateSpecific("childcareAnnual", v)}
                  prefix="$"
                  step={1000}
                />
              </div>
            )}

            {inputs.demographic === "hnw_family" && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Annual Philanthropy"
                  value={inputs.specifics.philanthropyAnnual ?? 75000}
                  onChange={(v) => updateSpecific("philanthropyAnnual", v)}
                  prefix="$"
                  step={5000}
                />
                <NumberField
                  label="LTC Concierge Budget"
                  value={inputs.specifics.longTermCareAnnualBudget ?? 100000}
                  onChange={(v) => updateSpecific("longTermCareAnnualBudget", v)}
                  prefix="$"
                  step={5000}
                />
              </div>
            )}

            {/* Government Pension Timing (Applies to all personas) */}
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label={
                  inputs.jurisdiction === "Canada"
                    ? "Est. CPP + OAS / yr"
                    : "Est. Social Security / yr"
                }
                value={inputs.specifics.govPensionAnnual ?? 32000}
                onChange={(v) => updateSpecific("govPensionAnnual", v)}
                prefix="$"
                step={2000}
              />
              <NumberField
                label="Pension Start Age"
                value={inputs.specifics.govPensionStartAge ?? 65}
                onChange={(v) => updateSpecific("govPensionStartAge", v)}
                step={1}
                min={60}
                max={70}
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. Protection & Estate Readiness Flags */}
      <div className="rounded-xl border border-slate-800/90 bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => toggleSection("protection")}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-white">
            <Shield className="h-3.5 w-3.5 text-teal-400" />
            Risk Transfer &amp; Estate Checklist
          </span>
          {openSections.protection ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {openSections.protection && (
          <div className="space-y-2 border-t border-slate-800/70 px-3.5 py-3">
            {[
              {
                key: "hasDisabilityInsurance" as const,
                label:
                  inputs.demographic === "doctor"
                    ? "Own-Occupation Specialty Disability"
                    : "Long-Term Disability Insurance",
                icon: HeartPulse,
              },
              {
                key: "hasLifeInsurance" as const,
                label:
                  inputs.demographic === "business_owner"
                    ? "Key-Person / Buy-Sell Life Insurance"
                    : "Term / Permanent Life Insurance",
                icon: Shield,
              },
              {
                key: "hasEstateWillAndPoa" as const,
                label: "Updated Will, POA & Beneficiaries",
                icon: Briefcase,
              },
              {
                key: "hasUmbrellaOrMalpractice" as const,
                label:
                  inputs.demographic === "doctor"
                    ? "Malpractice / CMPA & Umbrella Policy"
                    : "Personal Umbrella / Liability Shield",
                icon: Shield,
              },
            ].map((item) => {
              const checked = inputs[item.key];
              return (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/60 px-2.5 py-2 text-xs transition hover:border-slate-700"
                >
                  <span className="text-slate-300">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => update(item.key, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-emerald-500"
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Life Milestones Builder */}
      <div className="rounded-xl border border-slate-800/90 bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => toggleSection("milestones")}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-white">
            <Calendar className="h-3.5 w-3.5 text-sky-400" />
            Life Milestones ({inputs.milestones.filter((m) => m.enabled).length})
          </span>
          {openSections.milestones ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {openSections.milestones && (
          <div className="space-y-2.5 border-t border-slate-800/70 px-3.5 py-3">
            <div className="space-y-1.5">
              {inputs.milestones.map((m) => {
                const isInflow = m.amount < 0;
                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                      m.enabled
                        ? "border-slate-700/80 bg-slate-950/70"
                        : "border-slate-800/50 bg-slate-950/30 opacity-50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        onChange={() => toggleMilestone(m.id)}
                        className="h-3.5 w-3.5 accent-emerald-500"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-200">
                          {m.title}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Age {m.age}
                          {(m.durationYears ?? 1) > 1
                            ? ` (${m.durationYears} yrs)`
                            : ""}{" "}
                          ·{" "}
                          <span
                            className={
                              isInflow
                                ? "font-semibold text-emerald-400"
                                : "text-slate-300"
                            }
                          >
                            {isInflow ? "+" : "-"}$
                            {Math.abs(m.amount).toLocaleString()}
                            {(m.durationYears ?? 1) > 1 ? "/yr" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteMilestone(m.id)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                      title="Remove milestone"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Quick Add Milestone Form */}
            <form
              onSubmit={handleAddMilestone}
              className="space-y-2 rounded-lg border border-dashed border-slate-700/80 bg-slate-950/50 p-2.5"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Add Life Event (Negative $ = Windfall / Exit)
              </div>
              <input
                type="text"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                placeholder="e.g., Sailboat, MBA, Inheritance..."
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="number"
                  value={newMilestoneAge}
                  onChange={(e) => setNewMilestoneAge(Number(e.target.value) || 40)}
                  placeholder="Age"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-mono text-white"
                />
                <input
                  type="number"
                  value={newMilestoneAmount}
                  step={5000}
                  onChange={(e) =>
                    setNewMilestoneAmount(Number(e.target.value) || 0)
                  }
                  placeholder="$ Cost"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-mono text-white"
                />
                <select
                  value={newMilestoneCategory}
                  onChange={(e) =>
                    setNewMilestoneCategory(e.target.value as MilestoneCategory)
                  }
                  className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200"
                >
                  {MILESTONE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 py-1 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Milestone
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
