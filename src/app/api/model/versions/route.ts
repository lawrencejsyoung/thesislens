import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getValuationStore } from "@/lib/storage";
import { logServerError, readJsonBodyWithLimit } from "@/lib/security/validation";
import type { CompanyModel } from "@/lib/model/types";
import type { ResolvedCitation } from "@/lib/analyst/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveVersionSchema = z.object({
  ticker: z.string().trim().min(1).max(12),
  modelType: z.enum(["baseline", "analyst", "manual"]).default("manual"),
  triggerType: z.enum(["manual", "nightly", "filing", "backtest"]).default("manual"),
  thesisSummary: z.string().max(4000).nullable().optional(),
  citations: z.array(z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()),
});

/**
 * GET /api/model/versions?ticker=AAPL  -> list saved model versions & price-target history
 * GET /api/model/versions?id=mv_...    -> reopen a specific model version with exact inputs & citations
 */
export async function GET(req: NextRequest) {
  try {
    const store = getValuationStore();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const version = await store.getModelVersion(id);
      if (!version) return NextResponse.json({ error: "Model version not found." }, { status: 404 });
      return NextResponse.json({ version, backend: store.backend });
    }

    const ticker = req.nextUrl.searchParams.get("ticker");
    if (!ticker) {
      return NextResponse.json({ error: "Provide ticker or id query parameter." }, { status: 400 });
    }
    const versions = await store.listModelVersions(ticker, 30);
    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      backend: store.backend,
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        asOf: v.asOf,
        modelType: v.modelType,
        triggerType: v.triggerType,
        templateId: v.templateId,
        currency: v.currency,
        valuePerShare: Number(v.valuePerShare.toFixed(2)),
        probabilityWeightedValue: Number(v.probabilityWeightedValue.toFixed(2)),
        currentPrice: v.currentPrice,
        wacc: Number(v.wacc.toFixed(4)),
        thesisSummary: v.thesisSummary,
        citationCount: v.citations.length,
      })),
    });
  } catch (err) {
    logServerError("api/model/versions:GET", err);
    return NextResponse.json({ error: "Failed to load model versions." }, { status: 500 });
  }
}

/**
 * POST /api/model/versions
 * Persist a computed CompanyModel version with its exact inputs, notes, and citations.
 */
export async function POST(req: NextRequest) {
  const body = await readJsonBodyWithLimit<unknown>(req, 512_000);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  const parsed = saveVersionSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid version payload.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const store = getValuationStore();
    const output = parsed.data.output as unknown as CompanyModel;
    const saved = await store.saveModelVersion({
      companyTicker: parsed.data.ticker,
      asOf: output.asOf ?? null,
      modelType: parsed.data.modelType,
      triggerType: parsed.data.triggerType,
      thesisSummary: parsed.data.thesisSummary ?? null,
      citations: (parsed.data.citations ?? []) as ResolvedCitation[],
      output,
    });
    return NextResponse.json({ version: saved, backend: store.backend }, { status: 201 });
  } catch (err) {
    logServerError("api/model/versions:POST", err);
    return NextResponse.json({ error: "Failed to save model version." }, { status: 500 });
  }
}
