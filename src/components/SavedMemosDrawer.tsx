"use client";

import { useEffect, useRef } from "react";
import { X, Clock, Database, HardDrive } from "lucide-react";
import { CompleteAnalysisResult } from "@/lib/types";

interface SavedMemosDrawerProps {
  open: boolean;
  onClose: () => void;
  memos: CompleteAnalysisResult[];
  source: "firestore" | "local";
  onSelect: (memo: CompleteAnalysisResult) => void;
}

export function SavedMemosDrawer({
  open,
  onClose,
  memos,
  source,
  onSelect,
}: SavedMemosDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <dialog ref={dialog} aria-labelledby="saved-memos-title" className="memo-dialog" onCancel={onClose}>
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 id="saved-memos-title" className="text-lg font-semibold">Saved memos</h2>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
              {source === "firestore" ? (
                <>
                  <Database className="h-3 w-3 text-emerald-400" /> Synced with Firebase Firestore
                </>
              ) : (
                <>
                  <HardDrive className="h-3 w-3 text-cyan-400" /> Saved in this browser
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close saved memos" onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {memos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
              No saved memos yet. Run an Investment Committee analysis and click{" "}
              <strong className="text-slate-200">Save Memo</strong>.
            </div>
          ) : (
            memos.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onSelect(m);
                  onClose();
                }}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-left transition hover:border-emerald-500/50 hover:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-white">
                    {m.title}
                  </span>
                  <span className="shrink-0 rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                    {m.cioMemo.rating} · {m.cioMemo.convictionScore}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">
                  {m.cioMemo.executiveSummary}
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                  <span className="font-mono">{m.mode}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </dialog>
  );
}
