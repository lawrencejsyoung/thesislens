import { NextRequest, NextResponse } from "next/server";
import { searchPredictionMarkets } from "@/lib/adapters/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  try {
    const { markets, liveCount } = await searchPredictionMarkets(q);
    return NextResponse.json({
      query: q,
      liveCount,
      source: liveCount > 0 ? "live-api" : "synthetic-fallback",
      markets,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch markets",
        markets: [],
      },
      { status: 500 }
    );
  }
}
