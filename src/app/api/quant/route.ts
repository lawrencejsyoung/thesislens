import { NextRequest, NextResponse } from "next/server";
import {
  analyzeBondDuration,
  analyzeHedgeFundRisk,
  analyzePortfolioMetrics,
  analyzeRealEstateDeal,
  evaluatePredictionBet,
  priceOptionStrategy,
  runCfaForensicAnalysis,
  runDcfValuation,
  runLiquidityAndComplianceCheck,
  runMonteCarloSimulation,
  simulateVenturePowerLaw,
  stressTestMacroShocks,
} from "@/lib/quant-engine";
import {
  BondInputs,
  CfaForensicInputs,
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
        | "venture"
        | "cfa_forensics"
        | "hedge_fund_risk";
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
    if (type === "cfa_forensics") {
      return NextResponse.json(
        runCfaForensicAnalysis(body.cfaForensicInputs as CfaForensicInputs)
      );
    }
    if (type === "hedge_fund_risk") {
      const holdings = body.holdings as Holding[];
      const aumUsd = Number(body.aumUsd ?? body.capital) || 100_000_000;
      const maxAdvPct = Number(body.maxAdvParticipationPct) || 15;
      const risk = analyzeHedgeFundRisk(holdings, aumUsd);
      const forensics = body.cfaForensicInputs
        ? runCfaForensicAnalysis(body.cfaForensicInputs as CfaForensicInputs)
        : undefined;
      const compliance = runLiquidityAndComplianceCheck(
        holdings,
        aumUsd,
        risk,
        forensics,
        maxAdvPct
      );
      return NextResponse.json({ risk, compliance, forensics });
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
