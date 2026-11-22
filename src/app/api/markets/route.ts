import { NextRequest, NextResponse } from "next/server";
import { searchPredictionMarkets } from "@/lib/adapters/market-data";
import { logServerError } from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 200);
  try {
    const { markets, liveCount } = await searchPredictionMarkets(q);
    return NextResponse.json({
      query: q,
      liveCount,
      source: liveCount > 0 ? "live-api" : "synthetic-fallback",
      markets,
    });
  } catch (err) {
    logServerError("api/markets:GET", err);
    return NextResponse.json(
      {
        error: "Failed to fetch prediction markets.",
        markets: [],
      },
      { status: 500 }
    );
  }
}
