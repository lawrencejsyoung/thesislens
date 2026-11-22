import { NextRequest, NextResponse } from "next/server";
import {
  fetchIntelligenceCorpus,
  ingestCustomIntelligence,
} from "@/lib/adapters/intel-ingestion";
import { IntelSourceType } from "@/lib/types";
import {
  extractSafeGeminiApiKey,
  logServerError,
  readJsonBodyWithLimit,
} from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_SOURCE_TYPES = new Set<IntelSourceType>([
  "newsletter",
  "podcast",
  "filing",
  "news",
  "macro",
]);

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 200);
    const tickersParam = (req.nextUrl.searchParams.get("tickers") || "").slice(0, 200);
    const tickers = tickersParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => /^[A-Z0-9.-]{1,12}$/.test(t))
      .slice(0, 10);

    const data = await fetchIntelligenceCorpus(q, tickers);
    return NextResponse.json(data);
  } catch (err) {
    logServerError("api/intel:GET", err);
    return NextResponse.json(
      { error: "Failed to fetch intelligence corpus." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBodyWithLimit<{
    sourceType?: IntelSourceType;
    sourceName?: string;
    title?: string;
    rawText?: string;
    feedUrl?: string;
    // Also supports Postmark / SendGrid inbound email webhook shapes
    Subject?: string;
    TextBody?: string;
    From?: string;
  }>(req, 256_000);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const body = parsed.data;
    const apiKey = extractSafeGeminiApiKey(req);
    const sourceType: IntelSourceType =
      body.sourceType && ALLOWED_SOURCE_TYPES.has(body.sourceType)
        ? body.sourceType
        : "newsletter";
    const sourceName = String(
      body.sourceName || body.From || "Inbound Newsletter / Research Feed"
    ).slice(0, 120);
    const title = (body.title || body.Subject)?.slice(0, 240);
    const rawText = (body.rawText || body.TextBody)?.slice(0, 50_000);
    const feedUrl = typeof body.feedUrl === "string" ? body.feedUrl.slice(0, 2048) : undefined;

    const result = await ingestCustomIntelligence({
      sourceType,
      sourceName,
      title,
      rawText,
      feedUrl,
      apiKey,
    });

    return NextResponse.json(result);
  } catch (err) {
    logServerError("api/intel:POST", err);
    const safeMessage =
      err instanceof Error &&
      (err.message.includes("Provide either") ||
        err.message.includes("URL") ||
        err.message.includes("Blocked") ||
        err.message.includes("not permitted") ||
        err.message.includes("maximum allowed size"))
        ? err.message
        : "Failed to ingest intelligence item.";
    return NextResponse.json({ error: safeMessage }, { status: 400 });
  }
}
