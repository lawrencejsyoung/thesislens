import { NextRequest, NextResponse } from "next/server";
import {
  fetchIntelligenceCorpus,
  ingestCustomIntelligence,
} from "@/lib/adapters/intel-ingestion";
import { IntelSourceType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") || "";
    const tickersParam = req.nextUrl.searchParams.get("tickers") || "";
    const tickers = tickersParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    const data = await fetchIntelligenceCorpus(q, tickers);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch intelligence corpus",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      sourceType?: IntelSourceType;
      sourceName?: string;
      title?: string;
      rawText?: string;
      feedUrl?: string;
      // Also supports Postmark / SendGrid inbound email webhook shapes
      Subject?: string;
      TextBody?: string;
      From?: string;
    };

    const apiKey = req.headers.get("x-gemini-api-key") || undefined;
    const sourceType: IntelSourceType = body.sourceType ?? "newsletter";
    const sourceName =
      body.sourceName || body.From || "Inbound Newsletter / Research Feed";
    const title = body.title || body.Subject;
    const rawText = body.rawText || body.TextBody;

    const result = await ingestCustomIntelligence({
      sourceType,
      sourceName,
      title,
      rawText,
      feedUrl: body.feedUrl,
      apiKey,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to ingest intelligence item",
      },
      { status: 400 }
    );
  }
}
