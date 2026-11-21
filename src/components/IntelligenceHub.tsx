"use client";

import React, { useState } from "react";
import {
  FileText,
  Globe,
  Headphones,
  Mail,
  Newspaper,
  Plus,
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { IntelSignal, IntelSourceType } from "@/lib/types";

interface IntelligenceHubProps {
  signals: IntelSignal[];
  onAddSignals: (newSignals: IntelSignal[]) => void;
  userApiKey?: string;
}

const SOURCE_META: Record<
  IntelSourceType,
  { label: string; icon: React.ComponentType<{ className?: string }>; badge: string }
> = {
  newsletter: {
    label: "Newsletter",
    icon: Mail,
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  podcast: {
    label: "Podcast",
    icon: Headphones,
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  filing: {
    label: "SEC / Filing",
    icon: FileText,
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  },
  news: {
    label: "News Wire",
    icon: Newspaper,
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  macro: {
    label: "Macro / CB",
    icon: Globe,
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
};

export function IntelligenceHub({
  signals,
  onAddSignals,
  userApiKey,
}: IntelligenceHubProps) {
  const [filter, setFilter] = useState<"all" | IntelSourceType>("all");
  const [showIngest, setShowIngest] = useState(false);
  const [sourceType, setSourceType] = useState<IntelSourceType>("newsletter");
  const [sourceName, setSourceName] = useState("");
  const [title, setTitle] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

  const filtered =
    filter === "all"
      ? signals
      : signals.filter((s) => s.sourceType === filter);

  const avgSentiment =
    filtered.length > 0
      ? Math.round(
          filtered.reduce((acc, s) => acc + s.sentimentScore, 0) / filtered.length
        )
      : 0;

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsIngesting(true);
    setIngestMessage(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userApiKey?.trim()) {
        headers["x-gemini-api-key"] = userApiKey.trim();
      }
      const res = await fetch("/api/intel", {
        method: "POST",
        headers,
        body: JSON.stringify({
          sourceType,
          sourceName: sourceName.trim() || `Custom ${SOURCE_META[sourceType].label}`,
          title: title.trim() || undefined,
          feedUrl: feedUrl.trim() || undefined,
          rawText: rawText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ingestion failed");
      }
      if (Array.isArray(data.signals) && data.signals.length > 0) {
        onAddSignals(data.signals);
        setIngestMessage(
          `Ingested ${data.signals.length} signal(s) via ${data.extractionMode} pipeline. Re-run Committee to incorporate.`
        );
        setTitle("");
        setFeedUrl("");
        setRawText("");
      }
    } catch (err) {
      setIngestMessage(
        err instanceof Error ? err.message : "Could not ingest source."
      );
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30">
            <Radio className="h-4.5 w-4.5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Multi-Source Intelligence Corpus
            </h2>
            <p className="text-xs text-slate-400">
              Newsletters, Podcasts, SEC Filings, Financial Wires & Central Bank Macro Feeds
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-xs">
            <span className="text-slate-400">Net Sentiment:</span>
            <span
              className={`font-semibold ${
                avgSentiment >= 15
                  ? "text-emerald-400"
                  : avgSentiment <= -15
                  ? "text-rose-400"
                  : "text-amber-300"
              }`}
            >
              {avgSentiment >= 0 ? `+${avgSentiment}` : avgSentiment}/100
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowIngest((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/30 transition"
          >
            {showIngest ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showIngest ? "Close Ingestor" : "Ingest Newsletter / Podcast / RSS"}
          </button>
        </div>
      </div>

      {/* Custom Ingestor Form */}
      {showIngest && (
        <form
          onSubmit={handleIngest}
          className="mb-4 rounded-xl border border-indigo-500/30 bg-slate-950/80 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-200">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              Ingest Live RSS/Podcast Feed or Paste Newsletter / Transcript (Webhook-Ready: POST /api/intel)
            </div>
            <div className="flex gap-1.5">
              {(["newsletter", "podcast", "news", "filing", "macro"] as IntelSourceType[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSourceType(t)}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium border transition ${
                      sourceType === t
                        ? "bg-indigo-500/25 border-indigo-400 text-indigo-200"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {SOURCE_META[t].label}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="Source Name (e.g., Matt Levine, Odd Lots, Substack)"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <input
              type="url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="Optional Live RSS / Podcast XML URL (https://...)"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Headline / Episode Title (optional if using RSS URL)"
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />

          <textarea
            rows={3}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Or paste newsletter body, podcast transcript excerpt, or sell-side research note here... Gemini will extract tickers, sentiment, claims & catalysts."
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              Tip: Forward newsletters via Postmark/SendGrid webhook directly to{" "}
              <code className="text-indigo-300">POST /api/intel</code>.
            </span>
            <button
              type="submit"
              disabled={isIngesting}
              className="rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white transition"
            >
              {isIngesting ? "Extracting Signals..." : "Extract & Add to Corpus"}
            </button>
          </div>
          {ingestMessage && (
            <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">
              {ingestMessage}
            </p>
          )}
        </form>
      )}

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {(["all", "newsletter", "podcast", "filing", "news", "macro"] as const).map(
          (tab) => {
            const count =
              tab === "all"
                ? signals.length
                : signals.filter((s) => s.sourceType === tab).length;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                  filter === tab
                    ? "bg-slate-800 border-slate-600 text-white"
                    : "bg-slate-950/50 border-slate-800/80 text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab === "all" ? "All Sources" : SOURCE_META[tab].label} ({count})
              </button>
            );
          }
        )}
      </div>

      {/* Signals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((sig) => {
          const meta = SOURCE_META[sig.sourceType];
          const Icon = meta.icon;
          const isBull = sig.sentimentScore >= 15;
          const isBear = sig.sentimentScore <= -15;
          return (
            <div
              key={sig.id}
              className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5 flex flex-col justify-between gap-2.5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
                  >
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-slate-400">
                      Tier {sig.credibilityTier}
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold ${
                        isBull
                          ? "bg-emerald-500/15 text-emerald-300"
                          : isBear
                          ? "bg-rose-500/15 text-rose-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {isBull ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : isBear ? (
                        <TrendingDown className="h-3 w-3" />
                      ) : null}
                      {sig.sentimentScore >= 0 ? `+${sig.sentimentScore}` : sig.sentimentScore}
                    </span>
                    {sig.live && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                        LIVE
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-100 leading-snug">
                    {sig.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {sig.sourceName} · {sig.publishedAt}
                    {sig.durationLabel ? ` · ${sig.durationLabel}` : ""}
                  </p>
                </div>

                <ul className="space-y-1 text-[11px] text-slate-300">
                  {sig.keyClaims.slice(0, 2).map((claim, idx) => (
                    <li key={idx} className="leading-relaxed">
                      • {claim}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
                <div className="flex flex-wrap gap-1">
                  {sig.tickers.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-slate-900 border border-slate-700/70 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300"
                    >
                      ${t}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400">
                  Novelty {sig.noveltyScore}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
