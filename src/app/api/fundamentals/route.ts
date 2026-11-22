import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCompanyFundamentals, UnknownTickerError } from "@/lib/fundamentals";
import { fundamentalsRequestSchema, presentFundamentals } from "@/lib/fundamentals/present";
import { logServerError } from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  ...fundamentalsRequestSchema,
  annualPeriods: z.coerce.number().int().min(1).max(15).optional(),
  quarterlyPeriods: z.coerce.number().int().min(0).max(40).optional(),
  includeSources: z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

/**
 * GET /api/fundamentals?ticker=AAPL[&asOf=2024-06-30][&annualPeriods=5][&quarterlyPeriods=8][&includeSources=1]
 * Normalized annual + quarterly financial history from SEC EDGAR XBRL filings.
 */
export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query.", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 }
    );
  }
  const { ticker, asOf, ...view } = parsed.data;
  try {
    const fundamentals = await getCompanyFundamentals(ticker, { asOf });
    return NextResponse.json(presentFundamentals(fundamentals, view), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    if (err instanceof UnknownTickerError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    logServerError("api/fundamentals:GET", err);
    return NextResponse.json({ error: "Failed to load fundamentals from SEC EDGAR." }, { status: 502 });
  }
}
