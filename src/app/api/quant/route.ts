import { NextRequest, NextResponse } from "next/server";
import {
  analyzeBondDuration,
  analyzePortfolioMetrics,
  analyzeRealEstateDeal,
  evaluatePredictionBet,
  priceOptionStrategy,
  runDcfValuation,
  runMonteCarloSimulation,
  simulateVenturePowerLaw,
  stressTestMacroShocks,
} from "@/lib/quant-engine";
import {
  BondInputs,
  DcfInputs,
  Holding,
  OptionStrategyInputs,
  PredictionBetInputs,
  RealEstateInputs,
  VentureDealInputs,
} from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body as {
      type:
        | "dcf"
        | "montecarlo"
        | "portfolio"
        | "prediction"
        | "options"
        | "real_estate"
        | "bond"
        | "venture";
    };

    if (type === "dcf") {
      return NextResponse.json(runDcfValuation(body.dcfInputs as DcfInputs));
    }
    if (type === "montecarlo") {
      return NextResponse.json(runMonteCarloSimulation(body.params));
    }
    if (type === "portfolio") {
      const holdings = body.holdings as Holding[];
      const capital = Number(body.capital) || 50000;
      const metrics = analyzePortfolioMetrics(holdings, capital);
      const shocks = stressTestMacroShocks(holdings, capital);
      return NextResponse.json({ metrics, shocks });
    }
    if (type === "prediction") {
      return NextResponse.json(
        evaluatePredictionBet(body.predictionInputs as PredictionBetInputs)
      );
    }
    if (type === "options") {
      return NextResponse.json(
        priceOptionStrategy(body.optionInputs as OptionStrategyInputs)
      );
    }
    if (type === "real_estate") {
      return NextResponse.json(
        analyzeRealEstateDeal(body.realEstateInputs as RealEstateInputs)
      );
    }
    if (type === "bond") {
      return NextResponse.json(
        analyzeBondDuration(body.bondInputs as BondInputs)
      );
    }
    if (type === "venture") {
      return NextResponse.json(
        simulateVenturePowerLaw(body.ventureInputs as VentureDealInputs)
      );
    }

    return NextResponse.json(
      { error: "Unsupported quant calculation type" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quant calculation failed" },
      { status: 500 }
    );
  }
}
