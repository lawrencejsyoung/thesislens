import type { Profile } from "../workspaces";

export type PlanTier = "free" | "retail_pro" | "advisor" | "hedge_fund";

export type OrgRole = "owner" | "admin" | "analyst" | "advisor" | "viewer";

export type AuthSurface =
  | "web"
  | "mcp_gemini"
  | "mcp_claude"
  | "mcp_openai"
  | "mcp_generic"
  | "api";

export type AuthMethod = "oauth21" | "api_key" | "session" | "legacy_mcp_key" | "anonymous_dev";

export interface RequestContext {
  authenticated: boolean;
  authMethod: AuthMethod;
  userId: string;
  orgId: string;
  email?: string;
  role: OrgRole;
  tier: PlanTier;
  profile: Profile;
  scopes: string[];
  surface: AuthSurface;
  zdrEnforced: boolean;
}

export interface ScopedApiKeyRecord {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  keyHash: string;
  role: OrgRole;
  tier: PlanTier;
  profile: Profile;
  scopes: string[];
  zdrEnforced?: boolean;
  expiresAt?: string | null;
  revokedAt?: string | null;
}
