"use client";

import { useEffect, useState } from "react";
import { Cable, Check, Copy, Terminal } from "lucide-react";
import { Profile, profiles } from "@/lib/workspaces";

export function AgentConnections({ profile }: { profile: Profile }) {
  const [endpoint, setEndpoint] = useState("/api/mcp");
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => { setEndpoint(new URL("/api/mcp", window.location.origin).href); }, []);
  const config = profiles[profile];
  return <section className="agent-guide"><p className="section-label"><Cable size={14}/>Integrations</p><h1 className="page-title">Agent connections</h1>
    <p className="page-description">Give your own assistant access to the same valuation, portfolio risk, and decision tools.</p>
    <div className="guide-grid"><article className="system-panel"><h2>Connect an MCP client</h2><p>In your client’s MCP settings, add a Streamable HTTP server using this endpoint.</p>
      <div className="endpoint"><code>{endpoint}</code><button aria-label="Copy endpoint" onClick={async () => {
        try { await navigator.clipboard.writeText(endpoint); setCopyStatus("Endpoint copied"); } catch { setCopyStatus("Select the endpoint to copy it manually"); }
      }}>{copyStatus === "Endpoint copied" ? <Check size={16}/> : <Copy size={16}/>}</button></div><small role="status">{copyStatus}</small>
      <p>If the host requires authentication, configure its bearer token in your MCP client. The app must be reachable from that client.</p>
      <details><summary>Run locally over stdio</summary><p>From the project directory, install dependencies, then configure your client to start this command with the project as its working directory.</p><pre>npx tsx src/mcp/stdio.ts</pre></details>
    </article><article className="system-panel"><Terminal size={20}/><h2>Start a decision brief</h2><p>Choose the <code>decision-brief</code> prompt and pass these arguments.</p>
      <pre>{JSON.stringify({ decision: config.prompt, audience: profile }, null, 2)}</pre>
      <p>{config.agent}</p></article></div>
    <article className="system-panel mt-4"><h2>Discover capabilities</h2><dl className="discovery-list">
      <div><dt>Tools</dt><dd>List tools to see accepted inputs for financial models, risk, property underwriting, bet sizing, and committee review.</dd></div>
      <div><dt>Prompts</dt><dd>Choose a decision brief, compare buying property with investing, or size a probabilistic bet.</dd></div>
      <div><dt>Resources</dt><dd>Read scenario presets, property-market benchmarks, and tax-residency profiles before choosing assumptions.</dd></div>
    </dl></article></section>;
}
