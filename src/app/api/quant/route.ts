import { NextRequest, NextResponse } from "next/server";
import {
  analyzePortfolioMetrics,
  runDcfValuation,
  runMonteCarloSimulation,
  stressTestMacroShocks,
} from "@/lib/quant-engine";
import { DcfInputs, Holding } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body as { type: "dcf" | "montecarlo" | "portfolio" };

    if (type === "dcf") {
      const result = runDcfValuation(body.dcfInputs as DcfInputs);
      return NextResponse.json(result);
    }

    if (type === "montecarlo") {
      const result = runMonteCarloSimulation(body.params);
      return NextResponse.json(result);
    }

    if (type === "portfolio") {
      const holdings = body.holdings as Holding[];
      const capital = Number(body.capital) || 50000;
      const metrics = analyzePortfolioMetrics(holdings, capital);
      const shocks = stressTestMacroShocks(holdings, capital);
      return NextResponse.json({ metrics, shocks });
    }

    return NextResponse.json({ error: "Unsupported quant calculation type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quant calculation failed" },
      { status: 500 }
    );
  }
}
