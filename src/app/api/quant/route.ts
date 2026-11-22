import { NextRequest, NextResponse } from "next/server";
import {
  analyzeBondDuration,
  analyzeHedgeFundRisk,
  analyzePortfolioMetrics,
  analyzeRealEstateDeal,
  compareRealEstateClasses,
  compareRealEstateMarkets,
  evaluatePredictionBet,
  getRealEstateMarket,
  priceOptionStrategy,
  runCfaForensicAnalysis,
  runDcfValuation,
  runLiquidityAndComplianceCheck,
  runMonteCarloSimulation,
  simulateVenturePowerLaw,
  stressTestMacroShocks,
  summarizeResidentialVsCommercial,
} from "@/lib/quant-engine";
import {
  BondInputs,
  CfaForensicInputs,
  DcfInputs,
  Holding,
  OptionStrategyInputs,
  PredictionBetInputs,
  RealEstateInputs,
  RealEstatePropertyClass,
  VentureDealInputs,
} from "@/lib/types";
import {
  logServerError,
  readJsonBodyWithLimit,
} from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = await readJsonBodyWithLimit<Record<string, unknown>>(req, 256_000);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const body = parsed.data;
    const { type } = body as {
      type:
        | "dcf"
        | "montecarlo"
        | "portfolio"
        | "prediction"
        | "options"
        | "real_estate"
        | "real_estate_matrix"
        | "bond"
        | "venture"
        | "cfa_forensics"
        | "hedge_fund_risk";
    };

    if (type === "dcf") {
      return NextResponse.json(runDcfValuation(body.dcfInputs as DcfInputs));
    }
    if (type === "montecarlo") {
      return NextResponse.json(
        runMonteCarloSimulation(
          body.params as Parameters<typeof runMonteCarloSimulation>[0]
        )
      );
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
    if (type === "real_estate_matrix") {
      const marketId = String(body.marketId || "sudbury-on");
      const propertyClass = (body.propertyClass ||
        "small_multifamily") as RealEstatePropertyClass;
      const rateOffsetPct = Number(body.rateOffsetPct) || 0;
      const market = getRealEstateMarket(marketId);
      const classComparison = compareRealEstateClasses(market.id, rateOffsetPct);
      const marketComparison = compareRealEstateMarkets(propertyClass, rateOffsetPct);
      const residentialVsCommercial = summarizeResidentialVsCommercial(
        classComparison,
        market
      );
      return NextResponse.json({
        market,
        propertyClass,
        classComparison,
        marketComparison,
        residentialVsCommercial,
      });
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
    logServerError("api/quant:POST", err);
    return NextResponse.json(
      { error: "Quant calculation failed." },
      { status: 500 }
    );
  }
}
