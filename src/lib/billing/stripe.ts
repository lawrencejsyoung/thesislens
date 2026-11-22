import crypto from "node:crypto";
import type { PlanTier } from "../auth/types";
import { constantTimeEquals } from "../security/validation";
import { setOrgTierOverride } from "./entitlements";

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      customer?: string;
      status?: string;
      metadata?: Record<string, string>;
      items?: {
        data?: Array<{
          price?: { id?: string; lookup_key?: string };
        }>;
      };
    };
  };
}

const processedEventIds = new Set<string>();

/**
 * Verifies a Stripe `Stripe-Signature` header (`t=...,v1=...`) using HMAC-SHA256
 * with constant-time comparison and a 5-minute replay tolerance window.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  const parts = signatureHeader.split(",").map((s) => s.trim());
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (k === "t" && v) {
      const parsed = Number(v);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (k === "v1" && v) {
      signatures.push(v);
    }
  }

  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(nowSec - timestamp) > toleranceSec) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  return signatures.some((sig) => constantTimeEquals(sig, expected));
}

export function mapStripePriceToTier(priceIdOrKey: string | undefined): PlanTier {
  const normalized = (priceIdOrKey || "").toLowerCase();
  if (normalized.includes("hedge") || normalized.includes("enterprise") || normalized.includes("institutional")) {
    return "hedge_fund";
  }
  if (normalized.includes("advisor") || normalized.includes("cfp") || normalized.includes("ria")) {
    return "advisor";
  }
  if (normalized.includes("retail") || normalized.includes("pro") || normalized.includes("power")) {
    return "retail_pro";
  }
  return "free";
}

export function processStripeEvent(event: StripeWebhookEvent): {
  handled: boolean;
  duplicate: boolean;
  orgId?: string;
  tier?: PlanTier;
} {
  if (processedEventIds.has(event.id)) {
    return { handled: true, duplicate: true };
  }
  processedEventIds.add(event.id);

  const obj = event.data?.object;
  const orgId = obj?.metadata?.org_id;
  if (!orgId) {
    return { handled: false, duplicate: false };
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const active = obj.status === "active" || obj.status === "trialing";
    const priceKey =
      obj.metadata?.plan_tier ||
      obj.items?.data?.[0]?.price?.lookup_key ||
      obj.items?.data?.[0]?.price?.id;
    const tier: PlanTier = active ? mapStripePriceToTier(priceKey) : "free";
    setOrgTierOverride(orgId, tier);
    return { handled: true, duplicate: false, orgId, tier };
  }

  if (event.type === "customer.subscription.deleted") {
    setOrgTierOverride(orgId, "free");
    return { handled: true, duplicate: false, orgId, tier: "free" };
  }

  return { handled: false, duplicate: false, orgId };
}

export function resetStripeEventStore(): void {
  processedEventIds.clear();
}
