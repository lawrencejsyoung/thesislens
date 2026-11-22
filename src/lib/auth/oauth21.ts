import crypto from "node:crypto";
import { constantTimeEquals } from "../security/validation";
import type { OrgRole, PlanTier } from "./types";
import type { Profile } from "../workspaces";

export interface OAuthClientRecord {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
  createdAt: string;
}

export interface OAuthAuthCodeRecord {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  userId: string;
  orgId: string;
  role: OrgRole;
  tier: PlanTier;
  profile: Profile;
  scopes: string[];
  expiresAtMs: number;
  used: boolean;
}

export interface OAuthJwtClaims {
  iss: string;
  sub: string;
  aud: string;
  org_id: string;
  role: OrgRole;
  tier: PlanTier;
  profile: Profile;
  scope: string;
  client_id: string;
  zdr?: boolean;
  iat: number;
  exp: number;
  jti: string;
}

const clients = new Map<string, OAuthClientRecord>();
const authCodes = new Map<string, OAuthAuthCodeRecord>();
const revokedJtis = new Set<string>();

function getSigningSecret(): string {
  const configured = process.env.THESISLENS_OAUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("THESISLENS_OAUTH_SECRET must be set in production for OAuth 2.1 tokens.");
  }
  return "thesislens-dev-oauth-secret-do-not-use-in-prod";
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

export function signOAuthAccessToken(
  claims: Omit<OAuthJwtClaims, "iat" | "exp" | "jti">,
  ttlSeconds = 3600
): { token: string; expiresIn: number; jti: string } {
  const now = Math.floor(Date.now() / 1000);
  const jti = `jti_${crypto.randomUUID()}`;
  const fullClaims: OAuthJwtClaims = {
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
    jti,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify(fullClaims));
  const data = `${header}.${payload}`;
  const sig = base64UrlEncode(
    crypto.createHmac("sha256", getSigningSecret()).update(data).digest()
  );
  return { token: `${data}.${sig}`, expiresIn: ttlSeconds, jti };
}

export function verifyOAuthAccessToken(
  token: string,
  expectedAudience?: string
): OAuthJwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  let secret: string;
  try {
    secret = getSigningSecret();
  } catch {
    return null;
  }

  const expectedSig = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest()
  );
  if (!constantTimeEquals(sigB64, expectedSig)) return null;

  try {
    const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const claims = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as OAuthJwtClaims;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp <= now) return null;
    if (revokedJtis.has(claims.jti)) return null;
    if (expectedAudience && claims.aud !== expectedAudience) return null;
    if (!claims.sub || !claims.org_id) return null;
    return claims;
  } catch {
    return null;
  }
}

export function revokeOAuthToken(jti: string): void {
  revokedJtis.add(jti);
}

/**
 * Dynamic Client Registration (RFC 7591) required by Claude.ai, ChatGPT, and Gemini MCP connectors.
 */
export function registerOAuthClient(input: {
  client_name?: string;
  redirect_uris?: string[];
  scope?: string;
}): OAuthClientRecord {
  const redirectUris = Array.isArray(input.redirect_uris) ? input.redirect_uris : [];
  if (redirectUris.length === 0) {
    throw new Error("Dynamic client registration requires at least one redirect_uri.");
  }
  for (const uri of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error(`Invalid redirect_uri: ${uri}`);
    }
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
      throw new Error("redirect_uri must use https:// (or http://localhost for local dev).");
    }
  }

  const clientId = `tl_client_${crypto.randomBytes(12).toString("hex")}`;
  const record: OAuthClientRecord = {
    clientId,
    clientName: (input.client_name || "MCP Client").slice(0, 120),
    redirectUris,
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    scope: input.scope || "mcp:tools mcp:prompts mcp:resources",
    createdAt: new Date().toISOString(),
  };
  clients.set(clientId, record);
  return record;
}

export function getOAuthClient(clientId: string): OAuthClientRecord | null {
  return clients.get(clientId) ?? null;
}

/**
 * Issues a short-lived PKCE S256 authorization code after user consent.
 */
export function issueAuthorizationCode(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  userId: string;
  orgId: string;
  role: OrgRole;
  tier: PlanTier;
  profile: Profile;
  scopes: string[];
}): string {
  const client = clients.get(params.clientId);
  if (!client) throw new Error("Unknown OAuth client_id.");
  if (!client.redirectUris.includes(params.redirectUri)) {
    throw new Error("redirect_uri does not match registered client.");
  }
  if ((params.codeChallengeMethod ?? "S256") !== "S256") {
    throw new Error("OAuth 2.1 requires PKCE code_challenge_method=S256.");
  }
  if (!params.codeChallenge || params.codeChallenge.length < 43) {
    throw new Error("Invalid PKCE code_challenge.");
  }

  const code = `tl_code_${crypto.randomBytes(24).toString("hex")}`;
  authCodes.set(code, {
    code,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: "S256",
    userId: params.userId,
    orgId: params.orgId,
    role: params.role,
    tier: params.tier,
    profile: params.profile,
    scopes: params.scopes,
    expiresAtMs: Date.now() + 5 * 60_000,
    used: false,
  });
  return code;
}

export function computePkceS256Challenge(codeVerifier: string): string {
  return base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());
}

/**
 * Exchanges an authorization code + PKCE code_verifier for an OAuth 2.1 Bearer JWT.
 */
export function exchangeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  issuer: string;
  audience: string;
}): {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
} {
  const record = authCodes.get(params.code);
  if (!record) throw new Error("Invalid authorization code.");
  if (record.used) {
    authCodes.delete(params.code);
    throw new Error("Authorization code already used.");
  }
  if (Date.now() > record.expiresAtMs) {
    authCodes.delete(params.code);
    throw new Error("Authorization code expired.");
  }
  if (record.clientId !== params.clientId || record.redirectUri !== params.redirectUri) {
    throw new Error("client_id or redirect_uri mismatch.");
  }

  const computed = computePkceS256Challenge(params.codeVerifier);
  if (!constantTimeEquals(computed, record.codeChallenge)) {
    throw new Error("PKCE code_verifier verification failed.");
  }

  record.used = true;
  authCodes.delete(params.code);

  const scope = record.scopes.join(" ");
  const signed = signOAuthAccessToken({
    iss: params.issuer,
    sub: record.userId,
    aud: params.audience,
    org_id: record.orgId,
    role: record.role,
    tier: record.tier,
    profile: record.profile,
    scope,
    client_id: record.clientId,
    zdr: record.tier === "hedge_fund",
  });

  return {
    access_token: signed.token,
    token_type: "Bearer",
    expires_in: signed.expiresIn,
    scope,
  };
}

export function buildProtectedResourceMetadata(origin: string) {
  const cleanOrigin = origin.replace(/\/$/, "");
  return {
    resource: `${cleanOrigin}/api/mcp`,
    authorization_servers: [cleanOrigin],
    bearer_methods_supported: ["header"],
    scopes_supported: [
      "mcp:tools",
      "mcp:prompts",
      "mcp:resources",
      "quant:execute",
      "model:override",
      "household:manage",
    ],
    resource_documentation: `${cleanOrigin}/api/openapi.json`,
  };
}

export function buildAuthorizationServerMetadata(origin: string) {
  const cleanOrigin = origin.replace(/\/$/, "");
  return {
    issuer: cleanOrigin,
    authorization_endpoint: `${cleanOrigin}/api/oauth/authorize`,
    token_endpoint: `${cleanOrigin}/api/oauth/token`,
    registration_endpoint: `${cleanOrigin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [
      "mcp:tools",
      "mcp:prompts",
      "mcp:resources",
      "quant:execute",
      "model:override",
      "household:manage",
    ],
  };
}

export function resetOAuthStores(): void {
  clients.clear();
  authCodes.clear();
  revokedJtis.clear();
}
