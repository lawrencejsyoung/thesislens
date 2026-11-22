import { NextRequest, NextResponse } from "next/server";
import {
  processStripeEvent,
  StripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe";
import { recordAuditEvent, sha256Hex } from "@/lib/compliance/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook secret is not configured." },
      { status: 503 }
    );
  }

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verifyStripeWebhookSignature(rawBody, sig, webhookSecret)) {
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(rawBody) as StripeWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Malformed JSON webhook body." }, { status: 400 });
  }

  const outcome = processStripeEvent(event);
  if (outcome.orgId && !outcome.duplicate) {
    recordAuditEvent({
      orgId: outcome.orgId,
      userId: "stripe_webhook",
      surface: "api",
      action: `billing:${event.type}`,
      inputHash: sha256Hex({ eventId: event.id, type: event.type }),
      tokensUsed: 0,
      costUsd: 0,
      status: "ok",
      metadata: { tier: outcome.tier },
    });
  }

  return NextResponse.json({ received: true, ...outcome });
}
