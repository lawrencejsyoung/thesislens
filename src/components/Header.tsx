"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  KeyRound,
  History,
  CheckCircle2,
  Cpu,
  Landmark,
  ShieldCheck,
  X,
  Briefcase,
  Compass,
  User,
} from "lucide-react";
import { ExperienceTier } from "@/lib/types";

interface HeaderProps {
  hasServerKey: boolean;
  userApiKey: string;
  onSaveApiKey: (key: string) => void;
  activeMode: "live-gemini" | "demo-simulation";
  savedCount?: number;
  onOpenSaved?: () => void;
  activeWorkspace?: "committee" | "global_tax";
  onChangeWorkspace?: (workspace: "committee" | "global_tax") => void;
  experienceTier?: ExperienceTier;
  onChangeExperienceTier?: (tier: ExperienceTier) => void;
}

export function Header({
  hasServerKey,
  userApiKey,
  onSaveApiKey,
  activeMode,
  savedCount = 0,
  onOpenSaved,
  activeWorkspace = "committee",
  onChangeWorkspace,
  experienceTier = "prosumer",
  onChangeExperienceTier,
}: HeaderProps) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftKey, setDraftKey] = useState(userApiKey);

  const isLiveReady = hasServerKey || Boolean(userApiKey.trim());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveApiKey(draftKey.trim());
    setSettingsOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070b14]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 shadow-lg shadow-emerald-500/20">
              <Sparkles className="h-5 w-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  ThesisLens
                </h1>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  DevFest Sudbury &apos;26
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Autonomous Gemini Multi-Agent Investment Committee &amp; Quant Engine
              </p>
            </div>
          </div>

          {/* Module Navigation Switcher */}
          <nav className="hidden items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1 md:flex">
            <Link
              href="/"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                pathname === "/"
                  ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>Investment Committee</span>
            </Link>
            <Link
              href="/lifestyle"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                pathname?.startsWith("/lifestyle")
                  ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Lifestyle Planner</span>
            </Link>
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            {onChangeExperienceTier && activeWorkspace === "committee" && (
              <div
                className="hidden items-center rounded-lg border border-slate-700/90 bg-slate-900/90 p-0.5 sm:flex"
                role="group"
                aria-label="Adaptive Experience Mode"
              >
                <button
                  type="button"
                  onClick={() => onChangeExperienceTier("prosumer")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    experienceTier === "prosumer"
                      ? "bg-emerald-500/20 text-emerald-200 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <User className="h-3 w-3" />
                  <span>Prosumer</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeExperienceTier("institutional")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    experienceTier === "institutional"
                      ? "bg-amber-500/20 text-amber-200 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Briefcase className="h-3 w-3" />
                  <span>Institutional</span>
                </button>
              </div>
            )}

            {onChangeWorkspace && (
              <button
                type="button"
                onClick={() =>
                  onChangeWorkspace(
                    activeWorkspace === "global_tax" ? "committee" : "global_tax"
                  )
                }
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  activeWorkspace === "global_tax"
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200 shadow-sm shadow-emerald-500/20"
                    : "border-cyan-500/35 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                }`}
              >
                <Landmark className="h-3.5 w-3.5" />
                <span>
                  {activeWorkspace === "global_tax"
                    ? "Back to Committee"
                    : "Global Tax Consultant"}
                </span>
              </button>
            )}

            {/* Mode Pill */}
            <div
              className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium xl:flex ${
                isLiveReady && activeMode === "live-gemini"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : isLiveReady
                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-300"
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              {isLiveReady ? "Gemini 2.5 Flash Ready" : "Interactive Demo Mode"}
            </div>

            {onOpenSaved && (
              <button
                type="button"
                onClick={onOpenSaved}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <History className="h-3.5 w-3.5 text-cyan-400" />
                <span>Memos</span>
                {savedCount > 0 && (
                  <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300">
                    {savedCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setDraftKey(userApiKey);
                setSettingsOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{isLiveReady ? "API Connected" : "Connect Gemini Key"}</span>
            </button>
          </div>
        </div>

        {/* Mobile Module Switcher */}
        <div className="flex items-center gap-1.5 border-t border-slate-800/70 px-4 py-2 md:hidden">
          <Link
            href="/"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold ${
              pathname === "/"
                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                : "text-slate-400"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Investment Committee</span>
          </Link>
          <Link
            href="/lifestyle"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold ${
              pathname?.startsWith("/lifestyle")
                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                : "text-slate-400"
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Lifestyle Planner</span>
          </Link>
        </div>
      </header>

      {/* Gemini API Key Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0e1525] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-emerald-400" />
                <h2 className="text-base font-semibold text-white">
                  Google Gemini API Configuration
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Paste a free Google Gemini API key from{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 underline hover:text-emerald-300"
              >
                Google AI Studio
              </a>{" "}
              to run live 4-agent Gemini Function Calling, Multimodal Chart/PDF
              Extraction, and Structured CIO Memos. Your key stays in browser
              memory and is only sent to your local Next.js API route.
            </p>

            {hasServerKey && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  A server-side <code>GEMINI_API_KEY</code> is already configured
                  in <code>.env.local</code>.
                </span>
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Gemini API Key (optional override)
                </label>
                <input
                  type="password"
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <span>
                  Without an API key, ThesisLens automatically runs in{" "}
                  <strong className="text-slate-200">Interactive Demo Mode</strong>{" "}
                  using the full deterministic Quant Engine (DCF, 800-path Monte
                  Carlo, and Macro Stress Tests).
                </span>
              </div>

              <div className="flex items-center justify-end gap-2">
                {userApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftKey("");
                      onSaveApiKey("");
                      setSettingsOpen(false);
                    }}
                    className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                  >
                    Clear Key
                  </button>
                )}
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Save &amp; Enable Live Gemini
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
