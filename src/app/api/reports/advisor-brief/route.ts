import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/rbac";
import { getEntitlements } from "@/lib/billing/entitlements";
import { recordAuditEvent } from "@/lib/compliance/provenance";
import { generateAdvisorClientBrief } from "@/lib/reports/advisor-brief";
import { readJsonBodyWithLimit } from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const briefSchema = z.object({
  firmName: z.string().min(1).max(160),
  advisorName: z.string().min(1).max(120),
  clientName: z.string().min(1).max(160),
  residency: z.string().min(2).max(64),
  horizonYears: z.number().int().min(1).max(60).optional(),
  capitalUsd: z.number().nonnegative().optional(),
  goals: z.array(z.string().min(1).max(300)).min(1).max(20),
  clientFacts: z.array(z.string().min(1).max(300)).max(30).default([]),
  assumptions: z.array(z.string().min(1).max(300)).max(30).default([]),
  recommendations: z.array(z.string().min(1).max(300)).max(20).default([]),
  meetingQuestions: z.array(z.string().min(1).max(300)).max(20).default([]),
  customDisclosure: z.string().max(1000).optional(),
  format: z.enum(["json", "markdown", "html"]).default("json"),
});

export async function POST(req: NextRequest) {
  const ctx = resolveRequestContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const entitlements = getEntitlements(ctx);
  if (
    ctx.authMethod !== "anonymous_dev" &&
    (!entitlements.whiteLabelReports || !hasPermission(ctx, "report:export_branded"))
  ) {
    return NextResponse.json(
      {
        error: "Branded Advisor Client Briefs require the Financial Advisor or Hedge Fund tier.",
        requiredTier: "advisor",
      },
      { status: 403 }
    );
  }

  const raw = await readJsonBodyWithLimit<unknown>(req, 128_000);
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: raw.status });
  }

  const parsed = briefSchema.safeParse(raw.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid brief payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const brief = generateAdvisorClientBrief(parsed.data);
  recordAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.userId,
    surface: ctx.surface,
    action: "report:advisor_brief",
    inputHash: brief.provenance.inputHash,
    outputHash: brief.provenance.outputHash,
    provenanceHash: brief.provenance.provenanceHash,
    tokensUsed: 0,
    costUsd: 0,
    status: "ok",
    metadata: { format: parsed.data.format, firmName: parsed.data.firmName },
  });

  if (parsed.data.format === "html") {
    return new NextResponse(brief.html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (parsed.data.format === "markdown") {
    return new NextResponse(brief.markdown, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(brief);
}
