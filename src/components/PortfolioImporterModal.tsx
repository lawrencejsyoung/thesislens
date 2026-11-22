"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  FileUp,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  AnalysisRequestPayload,
  Holding,
} from "@/lib/types";
import {
  exportHoldingsToCsv,
  exportPortfolioToJson,
  ImportFormat,
  ImportedPortfolioMetadata,
  normalizeLongOnlyWeights,
  parsePortfolioImport,
  SAMPLE_PORTFOLIO_CSV,
  SAMPLE_PORTFOLIO_JSON,
} from "@/lib/portfolio-import";

export interface PortfolioImportApplyPayload {
  holdings: Holding[];
  mode: "replace" | "append";
  inferredCapital?: number;
  metadata?: ImportedPortfolioMetadata;
  applyMetadata: boolean;
}

interface PortfolioImporterModalProps {
  open: boolean;
  onClose: () => void;
  currentPayload: AnalysisRequestPayload;
  onApplyImport: (data: PortfolioImportApplyPayload) => void;
}

export function PortfolioImporterModal({
  open,
  onClose,
  currentPayload,
  onApplyImport,
}: PortfolioImporterModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [formatOverride, setFormatOverride] = useState<"auto" | ImportFormat>("auto");
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [normalizeWeights, setNormalizeWeights] = useState(false);
  const [applyMetadata, setApplyMetadata] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const parsed = useMemo(() => {
    if (!rawText.trim()) return null;
    return parsePortfolioImport(
      rawText,
      formatOverride === "auto" ? undefined : formatOverride,
      fileName
    );
  }, [rawText, formatOverride, fileName]);

  const previewHoldings = useMemo(() => {
    if (!parsed || parsed.holdings.length === 0) return [];
    return normalizeWeights
      ? normalizeLongOnlyWeights(parsed.holdings)
      : parsed.holdings;
  }, [parsed, normalizeWeights]);

  const hasShorts = previewHoldings.some(
    (h) => h.side === "SHORT" || h.weightPct < 0
  );
  const grossExposure = previewHoldings.reduce(
    (sum, h) => sum + Math.abs(h.weightPct),
    0
  );
  const netExposure = previewHoldings.reduce((sum, h) => {
    const absW = Math.abs(h.weightPct);
    return sum + (h.side === "SHORT" || h.weightPct < 0 ? -absW : absW);
  }, 0);

  if (!open) return null;

  const handleReadFile = (file: File) => {
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".json")) {
      setFormatOverride("json");
    } else if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
      setFormatOverride("csv");
    } else {
      setFormatOverride("auto");
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      setRawText(content);
    };
    reader.readAsText(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleReadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleReadFile(file);
  };

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConfirm = () => {
    if (previewHoldings.length === 0) return;
    onApplyImport({
      holdings: previewHoldings,
      mode: importMode,
      inferredCapital: parsed?.inferredCapital,
      metadata: parsed?.metadata,
      applyMetadata,
    });
    onClose();
  };

  const canImport = previewHoldings.length > 0;
  const hasMetadataOrCapital = Boolean(
    parsed?.inferredCapital || parsed?.metadata
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1120] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#0d1424] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/40">
              <FileUp className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Import Portfolio (CSV / JSON)
              </h2>
              <p className="text-[11px] text-slate-400">
                Upload a brokerage export, paste CSV/JSON, or export your current book.
                Supports weights, market values, or shares × price.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close importer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Quick Sample & Export Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-950/60 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Load Sample:
              </span>
              <button
                type="button"
                onClick={() => {
                  setRawText(SAMPLE_PORTFOLIO_CSV);
                  setFileName("sample-portfolio.csv");
                  setFormatOverride("csv");
                }}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-500/10"
              >
                <FileSpreadsheet className="h-3 w-3" />
                Sample CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setRawText(SAMPLE_PORTFOLIO_JSON);
                  setFileName("sample-portfolio.json");
                  setFormatOverride("json");
                }}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-cyan-300 transition hover:border-cyan-500/50 hover:bg-cyan-500/10"
              >
                <FileJson className="h-3 w-3" />
                Sample JSON
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Export Current:
              </span>
              <button
                type="button"
                onClick={() =>
                  triggerDownload(
                    exportHoldingsToCsv(currentPayload.holdings),
                    "thesislens-portfolio.csv",
                    "text/csv;charset=utf-8"
                  )
                }
                className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                <Download className="h-3 w-3" />
                CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerDownload(
                    exportPortfolioToJson(currentPayload),
                    "thesislens-portfolio.json",
                    "application/json;charset=utf-8"
                  )
                }
                className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                <Download className="h-3 w-3" />
                JSON
              </button>
            </div>
          </div>

          {/* Dropzone + File Upload */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition ${
              isDragging
                ? "border-emerald-400 bg-emerald-500/10"
                : "border-slate-700 bg-slate-950/60 hover:border-emerald-500/50 hover:bg-slate-900/60"
            }`}
          >
            <Upload className="mb-1.5 h-5 w-5 text-emerald-400" />
            <p className="text-xs font-semibold text-slate-200">
              Drop a <span className="text-emerald-300">.csv</span> or{" "}
              <span className="text-cyan-300">.json</span> file here, or click to browse
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Recognized columns: <code className="text-slate-400">ticker/symbol</code>,{" "}
              <code className="text-slate-400">name</code>,{" "}
              <code className="text-slate-400">sector</code>,{" "}
              <code className="text-slate-400">weightPct</code> (or{" "}
              <code className="text-slate-400">marketValue</code> /{" "}
              <code className="text-slate-400">shares</code> +{" "}
              <code className="text-slate-400">price</code>),{" "}
              <code className="text-slate-400">side</code>,{" "}
              <code className="text-slate-400">beta</code>
            </p>
            {fileName && (
              <span className="mt-2 rounded-full bg-slate-800 px-2.5 py-0.5 font-mono text-[10px] text-emerald-300">
                Loaded: {fileName}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.txt,text/csv,application/json"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* Paste / Edit Raw Input */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Or Paste CSV / JSON Payload
              </label>
              <div className="flex items-center gap-1.5">
                <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[10px]">
                  {(["auto", "csv", "json"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormatOverride(fmt)}
                      className={`rounded-md px-2 py-0.5 font-semibold uppercase transition ${
                        formatOverride === fmt
                          ? "bg-slate-800 text-emerald-300"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                {rawText && (
                  <button
                    type="button"
                    onClick={() => {
                      setRawText("");
                      setFileName(undefined);
                    }}
                    className="rounded-md px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              spellCheck={false}
              placeholder={`ticker,name,sector,weightPct,currentPrice\nNVDA,NVIDIA Corp.,Technology,30,142\nVALE,Vale S.A.,Mining & Materials,25,12.4\nRY.TO,Royal Bank of Canada,Financials,25,174.2\nXBB.TO,iShares Universe Bond ETF,Fixed Income,20,27.9`}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Errors & Warnings */}
          {parsed && parsed.errors.length > 0 && (
            <div className="space-y-1 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              {parsed.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {parsed && parsed.warnings.length > 0 && (
            <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
              {parsed.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Parsed Preview Table */}
          {previewHoldings.length > 0 && (
            <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">
                    Parsed Preview ({previewHoldings.length} positions ·{" "}
                    {parsed?.format.toUpperCase()})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      hasShorts
                        ? "bg-cyan-500/15 text-cyan-300"
                        : Math.abs(grossExposure - 100) < 0.5
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {hasShorts
                      ? `Gross ${grossExposure.toFixed(1)}% / Net ${netExposure.toFixed(1)}%`
                      : `Total Weight: ${grossExposure.toFixed(1)}%`}
                  </span>
                  {parsed?.inferredCapital && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                      Capital: ${parsed.inferredCapital.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="max-h-52 overflow-auto rounded-lg border border-slate-800/80">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-2.5 py-2">Side</th>
                      <th className="px-2.5 py-2">Ticker</th>
                      <th className="px-2.5 py-2">Name</th>
                      <th className="px-2.5 py-2">Sector</th>
                      <th className="px-2.5 py-2 text-right">Weight</th>
                      <th className="px-2.5 py-2 text-right">Price</th>
                      <th className="px-2.5 py-2 text-right">Beta</th>
                      <th className="px-2.5 py-2 text-right">Exp Ret</th>
                      <th className="px-2.5 py-2 text-right">Vol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {previewHoldings.map((h, idx) => {
                      const isShort = h.side === "SHORT" || h.weightPct < 0;
                      return (
                        <tr key={`${h.ticker}-${idx}`} className="hover:bg-slate-900/50">
                          <td className="px-2.5 py-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                isShort
                                  ? "bg-rose-500/15 text-rose-300"
                                  : "bg-emerald-500/15 text-emerald-300"
                              }`}
                            >
                              {isShort ? "SHORT" : "LONG"}
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 font-mono font-bold text-emerald-300">
                            {h.ticker}
                          </td>
                          <td className="max-w-[180px] truncate px-2.5 py-1.5 text-slate-200">
                            {h.name}
                          </td>
                          <td className="px-2.5 py-1.5 text-slate-400">{h.sector}</td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-white">
                            {Math.abs(h.weightPct).toFixed(2)}%
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-slate-300">
                            ${h.currentPrice.toLocaleString()}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-slate-300">
                            {h.beta.toFixed(2)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-emerald-300">
                            {h.expectedAnnualReturnPct.toFixed(1)}%
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-slate-300">
                            {h.annualVolatilityPct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Import Options */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-2.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Import mode:</span>
                  <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                    <button
                      type="button"
                      onClick={() => setImportMode("replace")}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        importMode === "replace"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Replace Current
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode("append")}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        importMode === "append"
                          ? "bg-cyan-500/20 text-cyan-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Append ({currentPayload.holdings.length} + {previewHoldings.length})
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {!hasShorts && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
                      <input
                        type="checkbox"
                        checked={normalizeWeights}
                        onChange={(e) => setNormalizeWeights(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 accent-emerald-500"
                      />
                      <span>Normalize weights to 100%</span>
                    </label>
                  )}

                  {hasMetadataOrCapital && importMode === "replace" && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
                      <input
                        type="checkbox"
                        checked={applyMetadata}
                        onChange={(e) => setApplyMetadata(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 accent-cyan-500"
                      />
                      <span>
                        Apply imported{" "}
                        {parsed?.inferredCapital
                          ? `capital ($${parsed.inferredCapital.toLocaleString()})`
                          : "mandate settings"}
                      </span>
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-[#0d1424] px-5 py-3">
          <span className="text-[11px] text-slate-500">
            Imported positions populate the left workbench immediately for committee analysis.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canImport}
              onClick={handleConfirm}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                Import {previewHoldings.length > 0 ? `${previewHoldings.length} ` : ""}
                Position{previewHoldings.length === 1 ? "" : "s"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
