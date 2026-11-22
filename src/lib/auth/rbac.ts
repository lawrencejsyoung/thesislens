import type { OrgRole, PlanTier, RequestContext } from "./types";

export type Permission =
  | "quant:execute"
  | "mcp:invoke"
  | "model:read"
  | "model:override"
  | "memo:write"
  | "memo:approve_ic"
  | "household:manage"
  | "report:export_branded"
  | "compliance:export_audit"
  | "billing:manage"
  | "llm:zdr_routing";

const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  owner: [
    "quant:execute",
    "mcp:invoke",
    "model:read",
    "model:override",
    "memo:write",
    "memo:approve_ic",
    "household:manage",
    "report:export_branded",
    "compliance:export_audit",
    "billing:manage",
    "llm:zdr_routing",
  ],
  admin: [
    "quant:execute",
    "mcp:invoke",
    "model:read",
    "model:override",
    "memo:write",
    "memo:approve_ic",
    "household:manage",
    "report:export_branded",
    "compliance:export_audit",
    "billing:manage",
    "llm:zdr_routing",
  ],
  analyst: [
    "quant:execute",
    "mcp:invoke",
    "model:read",
    "model:override",
    "memo:write",
    "llm:zdr_routing",
  ],
  advisor: [
    "quant:execute",
    "mcp:invoke",
    "model:read",
    "model:override",
    "memo:write",
    "household:manage",
    "report:export_branded",
  ],
  viewer: ["quant:execute", "model:read"],
};

const TIER_REQUIRED_FOR_PERMISSION: Partial<Record<Permission, PlanTier[]>> = {
  "household:manage": ["advisor", "hedge_fund"],
  "report:export_branded": ["advisor", "hedge_fund"],
  "memo:approve_ic": ["hedge_fund"],
  "compliance:export_audit": ["advisor", "hedge_fund"],
  "llm:zdr_routing": ["hedge_fund"],
};

export function hasPermission(ctx: RequestContext, permission: Permission): boolean {
  const roleAllowed = ROLE_PERMISSIONS[ctx.role]?.includes(permission) ?? false;
  if (!roleAllowed) return false;

  const allowedTiers = TIER_REQUIRED_FOR_PERMISSION[permission];
  if (allowedTiers && !allowedTiers.includes(ctx.tier)) {
    return false;
  }
  return true;
}

export function assertPermission(ctx: RequestContext, permission: Permission): void {
  if (!hasPermission(ctx, permission)) {
    throw new PermissionDeniedError(
      `Permission "${permission}" denied for role "${ctx.role}" on tier "${ctx.tier}".`
    );
  }
}

export function assertTenantAccess(ctx: RequestContext, resourceOrgId: string): void {
  if (ctx.orgId !== resourceOrgId) {
    throw new PermissionDeniedError("Cross-tenant access denied.");
  }
}

export class PermissionDeniedError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}
