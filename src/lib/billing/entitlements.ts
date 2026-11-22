import type { PlanTier, RequestContext } from "../auth/types";

export interface PlanEntitlements {
  tier: PlanTier;
  displayName: string;
  monthlyPriceUsd: number | null; // null = custom enterprise pricing
  maxPortfolios: number;
  maxHouseholds: number;
  monthlyMcpCalls: number;
  monthlyAiRuns: number;
  liveMarketData: boolean;
  specialistSectorModels: boolean;
  whiteLabelReports: boolean;
  complianceAuditExport: boolean;
  zdrLlmRouting: boolean;
  ssoSaml: boolean;
  rateLimitPerMinute: number;
}

export const PLAN_CATALOG: Record<PlanTier, PlanEntitlements> = {
  free: {
    tier: "free",
    displayName: "Starter (Free)",
    monthlyPriceUsd: 0,
    maxPortfolios: 2,
    maxHouseholds: 0,
    monthlyMcpCalls: 100,
    monthlyAiRuns: 10,
    liveMarketData: false,
    specialistSectorModels: false,
    whiteLabelReports: false,
    complianceAuditExport: false,
    zdrLlmRouting: false,
    ssoSaml: false,
    rateLimitPerMinute: 20,
  },
  retail_pro: {
    tier: "retail_pro",
    displayName: "Retail Pro",
    monthlyPriceUsd: 29,
    maxPortfolios: 25,
    maxHouseholds: 0,
    monthlyMcpCalls: 2_500,
    monthlyAiRuns: 200,
    liveMarketData: true,
    specialistSectorModels: true,
    whiteLabelReports: false,
    complianceAuditExport: false,
    zdrLlmRouting: false,
    ssoSaml: false,
    rateLimitPerMinute: 60,
  },
  advisor: {
    tier: "advisor",
    displayName: "Financial Advisor (CFP / RIA)",
    monthlyPriceUsd: 249,
    maxPortfolios: 250,
    maxHouseholds: 150,
    monthlyMcpCalls: 15_000,
    monthlyAiRuns: 1_000,
    liveMarketData: true,
    specialistSectorModels: true,
    whiteLabelReports: true,
    complianceAuditExport: true,
    zdrLlmRouting: false,
    ssoSaml: false,
    rateLimitPerMinute: 120,
  },
  hedge_fund: {
    tier: "hedge_fund",
    displayName: "Hedge Fund & Institutional",
    monthlyPriceUsd: null,
    maxPortfolios: 10_000,
    maxHouseholds: 1_000,
    monthlyMcpCalls: 250_000,
    monthlyAiRuns: 20_000,
    liveMarketData: true,
    specialistSectorModels: true,
    whiteLabelReports: true,
    complianceAuditExport: true,
    zdrLlmRouting: true,
    ssoSaml: true,
    rateLimitPerMinute: 600,
  },
};

export interface OrgUsageSnapshot {
  orgId: string;
  periodYm: string;
  mcpCalls: number;
  aiRuns: number;
}

const orgTierOverrides = new Map<string, PlanTier>();
const orgUsageStore = new Map<string, OrgUsageSnapshot>();

function currentPeriodYm(): string {
  return new Date().toISOString().slice(0, 7);
}

export function setOrgTierOverride(orgId: string, tier: PlanTier): void {
  orgTierOverrides.set(orgId, tier);
}

export function getEffectiveTier(ctx: Pick<RequestContext, "orgId" | "tier">): PlanTier {
  return orgTierOverrides.get(ctx.orgId) ?? ctx.tier;
}

export function getEntitlements(ctx: Pick<RequestContext, "orgId" | "tier">): PlanEntitlements {
  return PLAN_CATALOG[getEffectiveTier(ctx)];
}

export function getOrgUsage(orgId: string, periodYm = currentPeriodYm()): OrgUsageSnapshot {
  const key = `${orgId}:${periodYm}`;
  return (
    orgUsageStore.get(key) ?? {
      orgId,
      periodYm,
      mcpCalls: 0,
      aiRuns: 0,
    }
  );
}

export function consumeQuota(
  ctx: Pick<RequestContext, "orgId" | "tier">,
  metric: "mcpCalls" | "aiRuns",
  amount = 1
): { allowed: boolean; used: number; limit: number; tier: PlanTier } {
  const ent = getEntitlements(ctx);
  const periodYm = currentPeriodYm();
  const key = `${ctx.orgId}:${periodYm}`;
  const current = getOrgUsage(ctx.orgId, periodYm);
  const limit = metric === "mcpCalls" ? ent.monthlyMcpCalls : ent.monthlyAiRuns;

  if (current[metric] + amount > limit) {
    return { allowed: false, used: current[metric], limit, tier: ent.tier };
  }

  const next: OrgUsageSnapshot = {
    ...current,
    [metric]: current[metric] + amount,
  };
  orgUsageStore.set(key, next);
  return { allowed: true, used: next[metric], limit, tier: ent.tier };
}

export function resetBillingStores(): void {
  orgTierOverrides.clear();
  orgUsageStore.clear();
}
