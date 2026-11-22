"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, CircleDot, History, KeyRound, Orbit, X } from "lucide-react";
import { isProfile, Profile, profiles, Workspace, workspaceLabels } from "@/lib/workspaces";

interface HeaderProps {
  profile: Profile;
  onProfile: (profile: Profile) => void;
  workspace: Workspace;
  onNavigate: (workspace: Workspace) => void;
  hasServerKey: boolean;
  userApiKey: string;
  onSaveApiKey: (key: string) => void;
  savedCount: number;
  onOpenSaved: () => void;
}

export function Header({ profile, onProfile, workspace, onNavigate, hasServerKey, userApiKey, onSaveApiKey, savedCount, onOpenSaved }: HeaderProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const [draftKey, setDraftKey] = useState("");
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <header className="app-header">
    <div className="header-inner">
      <button className="wordmark" onClick={() => onNavigate("overview")} aria-label="ThesisLens workspace"><Orbit aria-hidden="true" />ThesisLens</button>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className={workspace === "overview" ? "current" : ""} onClick={() => onNavigate("overview")}>Workspace</button>
        <details ref={menu} className="tool-menu" onKeyDown={e => { if (e.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
          <summary>Tools <ChevronDown size={14}/></summary>
          <div>{(Object.keys(workspaceLabels) as Workspace[]).filter(key => key !== "overview").map(key =>
            <button key={key} aria-current={workspace === key ? "page" : undefined} onClick={() => { onNavigate(key); if (menu.current) menu.current.open = false; }}>{workspaceLabels[key]}</button>
          )}</div>
        </details>
        <button onClick={onOpenSaved}><History size={15}/>Memos{savedCount ? ` (${savedCount})` : ""}</button>
      </nav>
      <div className="header-controls">
        <label className="profile-select"><BookOpen size={16}/><select aria-label="Workspace profile" value={profile} onChange={e => { if (isProfile(e.target.value)) onProfile(e.target.value); }}>
          {Object.entries(profiles).map(([id, item]) => <option value={id} key={id}>{item.label}</option>)}</select><ChevronDown size={14}/></label>
        <button className="connection" onClick={() => { setDraftKey(userApiKey); dialog.current?.showModal(); }} aria-label="Gemini connection settings">
          <CircleDot size={15}/>{hasServerKey || userApiKey ? "Gemini ready" : "Demo mode"}
        </button>
      </div>
    </div>
    <dialog ref={dialog} className="settings-dialog" aria-labelledby="connection-title">
      <div className="flex items-center justify-between"><KeyRound size={21}/><button aria-label="Close settings" onClick={() => dialog.current?.close()}><X size={20}/></button></div>
      <h2 id="connection-title">Gemini connection</h2>
      <p>Demo mode runs the financial models and provides a simulated committee. Connect Gemini for live analysis and document interpretation.</p>
      {hasServerKey && <p>A server key is configured. You can use it or supply your own.</p>}
      <form onSubmit={e => { e.preventDefault(); onSaveApiKey(draftKey.trim()); dialog.current?.close(); }}>
        <label>Optional Gemini API key<input type="password" value={draftKey} onChange={e => setDraftKey(e.target.value)} autoComplete="off"/></label>
        <p>Your key stays in memory for this session and is sent to the app server for Gemini requests.</p>
        <button className="primary-action" type="submit">Save settings</button>
      </form>
    </dialog>
  </header>;
}
