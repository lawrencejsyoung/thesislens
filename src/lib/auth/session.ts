import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { constantTimeEquals } from "../security/validation";
import { verifyOAuthAccessToken } from "./oauth21";
import type { AuthSurface, OrgRole, PlanTier, RequestContext, ScopedApiKeyRecord } from "./types";
import type { Profile } from "../workspaces";

const scopedApiKeys = new Map<string, ScopedApiKeyRecord>();

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function registerScopedApiKey(params: {
  orgId: string;
  userId: string;
  name: string;
  role: OrgRole;
  tier: PlanTier;
  profile?: Profile;
  scopes?: string[];
  zdrEnforced?: boolean;
  expiresAt?: string | null;
}): { rawKey: string; record: ScopedApiKeyRecord } {
  const rawKey = `tl_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = hashApiKey(rawKey);
  const record: ScopedApiKeyRecord = {
    id: `key_${crypto.randomUUID()}`,
    orgId: params.orgId,
    userId: params.userId,
    name: params.name,
    keyHash,
    role: params.role,
    tier: params.tier,
    profile: params.profile ?? "retail",
    scopes: params.scopes ?? ["mcp:tools", "mcp:prompts", "mcp:resources", "quant:execute"],
    zdrEnforced: params.zdrEnforced ?? params.tier === "hedge_fund",
    expiresAt: params.expiresAt ?? null,
    revokedAt: null,
  };
  scopedApiKeys.set(keyHash, record);
  return { rawKey, record };
}

export function revokeScopedApiKey(keyId: string): boolean {
  for (const record of scopedApiKeys.values()) {
    if (record.id === keyId) {
      record.revokedAt = new Date().toISOString();
      return true;
    }
  }
  return false;
}

export function resetScopedApiKeyStore(): void {
  scopedApiKeys.clear();
}

export function detectAuthSurface(headers: Headers, isMcpRoute = false): AuthSurface {
  const explicit = (headers.get("x-thesislens-surface") || "").toLowerCase().trim();
  if (
    explicit === "mcp_gemini" ||
    explicit === "mcp_claude" ||
    explicit === "mcp_openai" ||
    explicit === "mcp_generic" ||
    explicit === "web" ||
    explicit === "api"
  ) {
    return explicit;
  }
  const ua = (headers.get("user-agent") || "").toLowerCase();
  if (ua.includes("claude") || ua.includes("anthropic")) return "mcp_claude";
  if (ua.includes("openai") || ua.includes("chatgpt")) return "mcp_openai";
  if (ua.includes("gemini") || ua.includes("antigravity")) return "mcp_gemini";
  return isMcpRoute ? "mcp_generic" : "web";
}

function lookupScopedApiKey(rawKey: string): ScopedApiKeyRecord | null {
  const hash = hashApiKey(rawKey);
  const record = scopedApiKeys.get(hash);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) return null;
  return record;
}

/**
 * Resolves the caller's tenant, user, role, plan tier, and surface from:
 * 1. OAuth 2.1 Bearer JWT (Claude.ai, ChatGPT, Gemini remote connectors)
 * 2. Scoped API Key (`Bearer tl_live_...` or `x-thesislens-api-key`)
 * 3. Legacy single-tenant `MCP_API_KEY` (backward compatibility)
 * 4. Anonymous dev context (only when unauthenticated access is permitted)
 */
export function resolveRequestContext(
  req: Pick<NextRequest, "headers"> & { nextUrl?: { origin?: string } },
  opts: { isMcpRoute?: boolean } = {}
): RequestContext | null {
  const surface = detectAuthSurface(req.headers, opts.isMcpRoute);
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const apiKeyHeader = req.headers.get("x-thesislens-api-key")?.trim() || "";
  const candidateKey = bearer.startsWith("tl_live_") ? bearer : apiKeyHeader;

  // 1. Scoped API Key
  if (candidateKey.startsWith("tl_live_")) {
    const keyRecord = lookupScopedApiKey(candidateKey);
    if (!keyRecord) return null;
    return {
      authenticated: true,
      authMethod: "api_key",
      userId: keyRecord.userId,
      orgId: keyRecord.orgId,
      role: keyRecord.role,
      tier: keyRecord.tier,
      profile: keyRecord.profile,
      scopes: keyRecord.scopes,
      surface,
      zdrEnforced: Boolean(keyRecord.zdrEnforced),
    };
  }

  // 2. OAuth 2.1 Bearer JWT
  if (bearer && bearer.split(".").length === 3) {
    const claims = verifyOAuthAccessToken(bearer);
    if (!claims) return null;
    return {
      authenticated: true,
      authMethod: "oauth21",
      userId: claims.sub,
      orgId: claims.org_id,
      role: claims.role,
      tier: claims.tier,
      profile: claims.profile,
      scopes: claims.scope.split(/\s+/).filter(Boolean),
      surface,
      zdrEnforced: Boolean(claims.zdr),
    };
  }

  // 3. Legacy static MCP_API_KEY (preserves existing GCP deployment configs)
  const legacyKey = process.env.MCP_API_KEY?.trim();
  if (legacyKey) {
    if (bearer && constantTimeEquals(bearer, legacyKey)) {
      return {
        authenticated: true,
        authMethod: "legacy_mcp_key",
        userId: "legacy_mcp_user",
        orgId: "org_default",
        role: "owner",
        tier: "hedge_fund",
        profile: "manager",
        scopes: ["mcp:tools", "mcp:prompts", "mcp:resources", "quant:execute"],
        surface,
        zdrEnforced: false,
      };
    }
    if (opts.isMcpRoute) return null;
  }

  // 4. Fail-closed in production when MCP route or AUTH_REQUIRED=true
  const isProd = process.env.NODE_ENV === "production";
  if (opts.isMcpRoute && isProd && process.env.MCP_ALLOW_UNAUTHENTICATED !== "true") {
    return null;
  }
  if (isProd && process.env.AUTH_REQUIRED === "true") {
    return null;
  }

  // Local development / demo mode fallback
  return {
    authenticated: false,
    authMethod: "anonymous_dev",
    userId: "dev_local_user",
    orgId: "org_dev_local",
    role: "owner",
    tier: "free",
    profile: "retail",
    scopes: ["mcp:tools", "mcp:prompts", "mcp:resources", "quant:execute"],
    surface,
    zdrEnforced: false,
  };
}
