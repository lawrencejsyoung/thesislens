import crypto from "node:crypto";
import type { AuthSurface } from "../auth/types";
import type { Profile } from "../workspaces";

export const ENGINE_VERSION = "thesislens-quant-1.0.0";
export const DISCLAIMER_VERSION = "2026-11-v1";

export interface CalculationProvenance {
  engineVersion: string;
  disclaimerVersion: string;
  computedAt: string;
  inputHash: string;
  outputHash: string;
  provenanceHash: string;
  deterministic: boolean;
  disclaimer: string;
}

export interface AuditLogEntry {
  id: string;
  orgId: string;
  userId: string;
  surface: AuthSurface;
  action: string;
  toolName?: string;
  inputHash: string;
  outputHash?: string;
  provenanceHash?: string;
  modelProvider?: string;
  tokensUsed: number;
  costUsd: number;
  status: "ok" | "denied" | "error";
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const DISCLAIMERS: Record<Profile, string> = {
  beginner:
    "Educational simulation only — not personalized investment, tax, or legal advice. Verify assumptions before making financial decisions.",
  retail:
    "Deterministic quantitative analysis for informational purposes only — not investment or tax advice. Past performance and modeled scenarios do not guarantee future results.",
  planner:
    "Advisor decision-support output prepared from stated client inputs and deterministic models. Review all assumptions, tax rules, and suitability obligations before client delivery.",
  manager:
    "Institutional research and deterministic risk output. Verify market data, liquidity, borrow availability, and mandate constraints prior to trade execution.",
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function sha256Hex(payload: unknown): string {
  const serialized = typeof payload === "string" ? payload : stableStringify(payload);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export function getRegulatoryDisclaimer(profile: Profile = "retail"): string {
  return DISCLAIMERS[profile] ?? DISCLAIMERS.retail;
}

export function buildCalculationProvenance(params: {
  toolName: string;
  input: unknown;
  output: unknown;
  deterministic: boolean;
  profile?: Profile;
  computedAt?: string;
}): CalculationProvenance {
  const computedAt = params.computedAt ?? new Date().toISOString();
  const inputHash = sha256Hex(params.input);
  const outputHash = sha256Hex(params.output);
  const provenanceHash = sha256Hex({
    engineVersion: ENGINE_VERSION,
    toolName: params.toolName,
    inputHash,
    outputHash,
  });

  return {
    engineVersion: ENGINE_VERSION,
    disclaimerVersion: DISCLAIMER_VERSION,
    computedAt,
    inputHash,
    outputHash,
    provenanceHash,
    deterministic: params.deterministic,
    disclaimer: getRegulatoryDisclaimer(params.profile ?? "retail"),
  };
}

export interface AuditSink {
  record(entry: AuditLogEntry): void | Promise<void>;
  listByOrg(orgId: string, limit?: number): AuditLogEntry[];
  clear(): void;
}

const MAX_IN_MEMORY_AUDIT_ENTRIES = 2_000;

class InMemoryAuditSink implements AuditSink {
  private entries: AuditLogEntry[] = [];

  record(entry: AuditLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_IN_MEMORY_AUDIT_ENTRIES) {
      this.entries.shift();
    }
    if (process.env.STRUCTURED_AUDIT_STDOUT === "true") {
      console.error(JSON.stringify({ severity: "INFO", type: "thesislens_audit", ...entry }));
    }
  }

  listByOrg(orgId: string, limit = 100): AuditLogEntry[] {
    return this.entries
      .filter((e) => e.orgId === orgId)
      .slice(-Math.max(1, limit))
      .reverse();
  }

  clear(): void {
    this.entries = [];
  }
}

let activeAuditSink: AuditSink = new InMemoryAuditSink();

export function setAuditSink(sink: AuditSink): void {
  activeAuditSink = sink;
}

export function getAuditSink(): AuditSink {
  return activeAuditSink;
}

export function recordAuditEvent(
  event: Omit<AuditLogEntry, "id" | "createdAt">
): AuditLogEntry {
  const entry: AuditLogEntry = {
    ...event,
    id: `aud_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  void activeAuditSink.record(entry);
  return entry;
}
