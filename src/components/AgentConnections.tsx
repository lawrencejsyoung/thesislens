"use client";

import { useEffect, useState } from "react";
import { Cable, Check, Copy, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import { Profile, profiles } from "@/lib/workspaces";

type PlatformId = "gemini" | "claude" | "openai";

const PLATFORM_LABELS: Record<PlatformId, { name: string; badge: string; summary: string }> = {
  gemini: {
    name: "Google Gemini",
    badge: "Antigravity · Gemini CLI · Vertex",
    summary:
      "Install via Antigravity plugin (plugins/antigravity), Gemini CLI extension (gemini-extension.json), or Vertex AI Extension using the OpenAPI 3.1 spec.",
  },
  claude: {
    name: "Anthropic Claude",
    badge: "Claude.ai · Desktop · Claude Code",
    summary:
      "Connect as a Remote MCP Connector with OAuth 2.1 + PKCE, or install the native Claude plugin (.claude-plugin/plugin.json) with persona skills.",
  },
  openai: {
    name: "OpenAI",
    badge: "ChatGPT Apps · Custom GPT · Agents SDK",
    summary:
      "Connect ChatGPT via Streamable HTTP MCP + OAuth 2.1, import /api/openapi.json for Custom GPT Actions, or use getOpenAIFunctionTools() in the Agents SDK.",
  },
};

export function AgentConnections({ profile }: { profile: Profile }) {
  const [origin, setOrigin] = useState("https://api.thesislens.ai");
  const [platform, setPlatform] = useState<PlatformId>("gemini");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const mcpEndpoint = `${origin}/api/mcp`;
  const oauthDiscovery = `${origin}/.well-known/oauth-protected-resource`;
  const openApiUrl = `${origin}/api/openapi.json`;
  const config = profiles[profile];
  const platformMeta = PLATFORM_LABELS[platform];

  const snippet =
    platform === "gemini"
      ? JSON.stringify(
          {
            mcpServers: {
              thesislens: {
                transport: "streamable-http",
                url: mcpEndpoint,
                auth: { type: "oauth2", resourceMetadataUrl: oauthDiscovery },
              },
            },
          },
          null,
          2
        )
      : platform === "claude"
        ? JSON.stringify(
            {
              mcpServers: {
                thesislens: {
                  type: "http",
                  url: mcpEndpoint,
                },
              },
            },
            null,
            2
          )
        : JSON.stringify(
            {
              mcp_endpoint: mcpEndpoint,
              oauth_protected_resource: oauthDiscovery,
              openapi_spec: openApiUrl,
            },
            null,
            2
          );

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied`);
    } catch {
      setCopyStatus(`Select the ${label.toLowerCase()} to copy manually`);
    }
  };

  return (
    <section className="agent-guide">
      <p className="section-label">
        <Cable size={14} />
        Multi-Platform Plugin Hub
      </p>
      <h1 className="page-title">Connect Gemini, Claude &amp; OpenAI</h1>
      <p className="page-description">
        Give your assistant direct access to ThesisLens&apos;s deterministic valuation, portfolio
        risk, tax-wrapper, and committee tools with OAuth 2.1, plan metering, and audit provenance.
      </p>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="AI Platform">
        {(["gemini", "claude", "openai"] as PlatformId[]).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={platform === id}
            onClick={() => setPlatform(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              platform === id
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {PLATFORM_LABELS[id].name}
          </button>
        ))}
      </div>

      <div className="guide-grid">
        <article className="system-panel">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
            {platformMeta.badge}
          </p>
          <h2>{platformMeta.name} Plugin Configuration</h2>
          <p>{platformMeta.summary}</p>
          <div className="endpoint">
            <code>{mcpEndpoint}</code>
            <button
              aria-label="Copy MCP endpoint"
              onClick={() => copyText(mcpEndpoint, "Endpoint")}
            >
              {copyStatus === "Endpoint copied" ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <pre>{snippet}</pre>
          <div className="flex items-center gap-3 mt-2">
            <button
              className="text-xs underline text-slate-700"
              onClick={() => copyText(snippet, "Config JSON")}
            >
              Copy config JSON
            </button>
            <button
              className="text-xs underline text-slate-700"
              onClick={() => copyText(openApiUrl, "OpenAPI URL")}
            >
              Copy OpenAPI 3.1 URL
            </button>
            <small role="status" className="text-xs text-emerald-700">
              {copyStatus}
            </small>
          </div>
        </article>

        <article className="system-panel">
          <Terminal size={20} />
          <h2>Start a decision brief ({config.label})</h2>
          <p>
            Choose the <code>decision-brief</code> prompt and pass these arguments:
          </p>
          <pre>{JSON.stringify({ decision: config.prompt, audience: profile }, null, 2)}</pre>
          <p>{config.agent}</p>
          <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 flex items-start gap-2">
            <ShieldCheck size={16} className="shrink-0 mt-0.5 text-emerald-700" />
            <span>
              Protected by OAuth 2.1 + PKCE (<code>/.well-known/oauth-protected-resource</code>) or
              scoped <code>tl_live_*</code> API keys with SHA-256 calculation provenance and
              compliance audit logging.
            </span>
          </div>
        </article>
      </div>

      <article className="system-panel mt-4">
        <h2>
          <Sparkles size={16} className="inline mr-1.5" />
          Commercial Tiers &amp; Capabilities
        </h2>
        <dl className="discovery-list">
          <div>
            <dt>Retail Investors (Free / Pro)</dt>
            <dd>
              19 deterministic quant &amp; SEC EDGAR valuation tools across Gemini, Claude, and
              ChatGPT, plus tax-wrapper optimization (TFSA, RRSP, Roth, 401k, ISA).
            </dd>
          </div>
          <div>
            <dt>Financial Advisors (CFP / RIA)</dt>
            <dd>
              Multi-client household CRM, white-labeled Client Review Briefs (
              <code>POST /api/reports/advisor-brief</code>), and immutable SEC/FINRA/CIRO audit
              logs.
            </dd>
          </div>
          <div>
            <dt>Hedge Funds &amp; Institutional</dt>
            <dd>
              RBAC + RLS multi-tenancy, Zero-Data-Retention (ZDR) LLM routing (Gemini / Claude /
              OpenAI), specialist sector models, and high-throughput API/MCP quotas.
            </dd>
          </div>
        </dl>
      </article>
    </section>
  );
}
