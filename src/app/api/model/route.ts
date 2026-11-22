import { NextRequest, NextResponse } from "next/server";
import { UnknownTickerError } from "@/lib/fundamentals";
import { buildCompanyModel, ModelDataError, ModelInputError, ModelUnsupportedError } from "@/lib/model";
import { companyModelRequestObject, presentModel, toBuildOptions } from "@/lib/model/present";
import { logServerError, readJsonBodyWithLimit } from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/model
 * { "ticker": "AAPL", "currentPrice": 250, "drivers": { "revenueGrowth": [0.06, 0.05] }, "detail": "full" }
 * Builds a linked three-statement model and DCF from SEC fundamentals plus optional overrides.
 */
export async function POST(req: NextRequest) {
  const body = await readJsonBodyWithLimit<unknown>(req, 64_000);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

  const parsed = companyModelRequestObject.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 }
    );
  }

  try {
    const model = await buildCompanyModel(parsed.data.ticker, toBuildOptions(parsed.data));
    return NextResponse.json(presentModel(model, parsed.data.detail));
  } catch (err) {
    if (err instanceof UnknownTickerError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ModelInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ModelUnsupportedError || err instanceof ModelDataError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    logServerError("api/model:POST", err);
    return NextResponse.json({ error: "Failed to build company model." }, { status: 502 });
  }
}
