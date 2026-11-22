import type { CompanyFundamentals } from "../../fundamentals/types";
import type { CompanyModel, SectorValuationDetail } from "../types";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Enhances a base FCFF CompanyModel with Phase 6 specialist valuations for:
 * - REITs (`reit`): 50/50 blend of NAV (NOI / capRate - netDebt) and AFFO multiple
 * - Utilities (`utility`): Regulated Rate Base x Allowed ROE residual-income valuation
 * - Oil & Gas / Mining (`energy`, `materials`): Commodity Price-Deck + Reserve NAV blend
 */
export function applyRealAssetSectorValuation(model: CompanyModel, f: CompanyFundamentals): CompanyModel {
  const shares = Math.max(1, model.valuation.sharesForValuation);
  const y1 = model.projections[0];
  const latest = f.history.annual[f.history.annual.length - 1];
  const v = latest?.values ?? {};

  if (model.templateId === "reit") {
    // NOI proxy = EBIT + D&A (EBITDA) * 0.92 (property-level NOI before corporate G&A)
    const noi = Math.max(1, y1.ebitda * 0.92);
    // Implied cap rate anchored to risk-free rate + 185bps REIT spread
    const capRate = clamp(model.assumptions.valuation.riskFreeRate + 0.0185, 0.045, 0.085);
    const grossAssetValue = noi / capRate;
    const navEquity = Math.max(1, grossAssetValue - model.valuation.netDebt - model.valuation.minorityAndOther);
    const navPerShare = navEquity / shares;

    // FFO = Net Income + D&A; AFFO = FFO - recurring maintenance capex (~35% of total capex)
    const ffo = Math.max(1, y1.netIncome + y1.depreciationAmortization);
    const affo = Math.max(1, ffo - y1.capex * 0.35);
    const affoPerShare = affo / shares;
    const affoMultiple = clamp(1 / Math.max(0.03, model.valuation.costOfEquity - model.assumptions.valuation.terminalGrowth), 10, 24);
    const affoValuePerShare = affoPerShare * affoMultiple;

    const blendedValue = 0.5 * navPerShare + 0.5 * affoValuePerShare;
    const scale = model.valuation.valuePerShare > 0 ? blendedValue / model.valuation.valuePerShare : 1;

    const sectorValuation: SectorValuationDetail = {
      method: "reit-nav-affo",
      label: "REIT NAV + AFFO Multiple Blend",
      summary: `50/50 blend of NAV (${model.currency} ${navPerShare.toFixed(2)}/sh @ ${(capRate * 100).toFixed(2)}% cap rate) and AFFO (${affoMultiple.toFixed(1)}x ${model.currency} ${affoPerShare.toFixed(2)}/sh = ${affoValuePerShare.toFixed(2)}).`,
      metrics: {
        noiB: Number((noi / 1e9).toFixed(2)),
        capRatePct: Number((capRate * 100).toFixed(2)),
        navPerShare: Number(navPerShare.toFixed(2)),
        affoPerShare: Number(affoPerShare.toFixed(2)),
        affoMultiple: Number(affoMultiple.toFixed(1)),
        affoValuePerShare: Number(affoValuePerShare.toFixed(2)),
      },
      crossCheckValuePerShare: Number(model.valuation.valuePerShare.toFixed(2)),
    };

    return rescaleModelValue(model, blendedValue, scale, sectorValuation, [
      {
        key: "reitValuation",
        value: `${model.currency} ${blendedValue.toFixed(2)}/sh`,
        basis: sectorValuation.summary,
        source: "template",
      },
    ]);
  }

  if (model.templateId === "utility") {
    // Regulated Rate Base approximated by Net PP&E; typical regulated equity layer = 50%
    const rateBase = Math.max(1, model.base.ppe || v.ppe || model.base.equity * 2);
    const equityLayer = 0.5;
    const equityRateBase = rateBase * equityLayer;
    const allowedRoe = clamp(model.assumptions.valuation.riskFreeRate + 0.055, 0.085, 0.115);
    const ke = Math.max(0.06, model.valuation.costOfEquity);
    const g = clamp(model.assumptions.valuation.terminalGrowth, 0.015, Math.min(0.04, ke - 0.015));

    // Regulated justified P/RateBase-Equity = (Allowed ROE - g) / (Ke - g)
    const justifiedPB = clamp((allowedRoe - g) / (ke - g), 0.7, 2.2);
    const rateBaseEquityVal = equityRateBase * justifiedPB;
    const rateBasePerShare = rateBaseEquityVal / shares;
    // Blend 70% Regulated Rate-Base model + 30% DCF
    const blendedValue = 0.7 * rateBasePerShare + 0.3 * Math.max(0, model.valuation.valuePerShare);
    const scale = model.valuation.valuePerShare > 0 ? blendedValue / model.valuation.valuePerShare : 1;

    const sectorValuation: SectorValuationDetail = {
      method: "utility-rate-base",
      label: "Utility Regulated Rate Base × Allowed ROE",
      summary: `Rate Base ${(rateBase / 1e9).toFixed(1)}B (50% equity layer), Allowed ROE ${(allowedRoe * 100).toFixed(2)}% vs CoE ${(ke * 100).toFixed(2)}% → ${justifiedPB.toFixed(2)}x P/Equity-RB (${model.currency} ${rateBasePerShare.toFixed(2)}/sh).`,
      metrics: {
        rateBaseB: Number((rateBase / 1e9).toFixed(2)),
        allowedRoePct: Number((allowedRoe * 100).toFixed(2)),
        costOfEquityPct: Number((ke * 100).toFixed(2)),
        justifiedPBook: Number(justifiedPB.toFixed(2)),
        rateBaseValuePerShare: Number(rateBasePerShare.toFixed(2)),
      },
      crossCheckValuePerShare: Number(model.valuation.valuePerShare.toFixed(2)),
    };

    return rescaleModelValue(model, blendedValue, scale, sectorValuation, [
      {
        key: "utilityRateBase",
        value: `${model.currency} ${blendedValue.toFixed(2)}/sh`,
        basis: sectorValuation.summary,
        source: "template",
      },
    ]);
  }

  if (model.templateId === "energy" || model.templateId === "materials") {
    // Commodity Reserve NAV: PV of 15-year through-cycle asset cash flows (EBITDA * (1 - tax) - sustaining capex)
    const reserveLifeYears = model.templateId === "energy" ? 14 : 18;
    const taxRate = model.assumptions.drivers.taxRate[0] ?? 0.24;
    const sustainingCapex = y1.depreciationAmortization * 1.05;
    const annualReserveCf = Math.max(1, y1.ebitda * (1 - taxRate) - sustainingCapex);
    const w = Math.max(0.06, model.valuation.wacc);
    const annuityFactor = (1 - Math.pow(1 + w, -reserveLifeYears)) / w;
    const reserveEv = annualReserveCf * annuityFactor;
    const reserveNavEquity = Math.max(1, reserveEv - model.valuation.netDebt - model.valuation.minorityAndOther);
    const reserveNavPerShare = reserveNavEquity / shares;

    // Price deck sensitivity: -20% / Base / +20% commodity deck impact (~1.6x operating leverage on cash flow)
    const deckDownPerShare = Math.max(0, (reserveEv * 0.68 - model.valuation.netDebt - model.valuation.minorityAndOther) / shares);
    const deckUpPerShare = Math.max(0, (reserveEv * 1.32 - model.valuation.netDebt - model.valuation.minorityAndOther) / shares);

    // Blend 50% Reserve NAV + 50% Through-cycle FCFF DCF
    const blendedValue = 0.5 * reserveNavPerShare + 0.5 * Math.max(0, model.valuation.valuePerShare);
    const scale = model.valuation.valuePerShare > 0 ? blendedValue / model.valuation.valuePerShare : 1;

    const sectorValuation: SectorValuationDetail = {
      method: "commodity-reserve-nav",
      label: `${model.templateId === "energy" ? "Oil & Gas" : "Mining & Materials"} Reserve NAV & Price Deck`,
      summary: `50/50 blend of ${reserveLifeYears}Y Reserve NAV (${model.currency} ${reserveNavPerShare.toFixed(2)}/sh) & Through-Cycle DCF (${model.valuation.valuePerShare.toFixed(2)}/sh). Commodity deck ±20%: ${deckDownPerShare.toFixed(2)}–${deckUpPerShare.toFixed(2)}.`,
      metrics: {
        reserveLifeYears,
        reserveNavPerShare: Number(reserveNavPerShare.toFixed(2)),
        deckBear20PctPerShare: Number(deckDownPerShare.toFixed(2)),
        deckBull20PctPerShare: Number(deckUpPerShare.toFixed(2)),
      },
      crossCheckValuePerShare: Number(model.valuation.valuePerShare.toFixed(2)),
    };

    return rescaleModelValue(model, blendedValue, scale, sectorValuation, [
      {
        key: "commodityReserveNav",
        value: `${model.currency} ${blendedValue.toFixed(2)}/sh`,
        basis: sectorValuation.summary,
        source: "template",
      },
    ]);
  }

  return model;
}

export function rescaleModelValue(
  model: CompanyModel,
  newValuePerShare: number,
  scale: number,
  sectorValuation: SectorValuationDetail,
  extraNotes: CompanyModel["notes"]
): CompanyModel {
  const shares = Math.max(1, model.valuation.sharesForValuation);
  const newEquityValue = newValuePerShare * shares;
  const newEv = newEquityValue + model.valuation.netDebt + model.valuation.minorityAndOther;
  const currentPrice = model.valuation.currentPrice;
  const upside = currentPrice ? newValuePerShare / currentPrice - 1 : null;

  const scenarios = model.scenarios.map((s) => ({
    ...s,
    valuePerShare: s.name === "base" ? newValuePerShare : s.valuePerShare * scale,
  }));
  const probabilityWeightedValue = scenarios.reduce((a, s) => a + s.probability * s.valuePerShare, 0);

  return {
    ...model,
    notes: [...model.notes, ...extraNotes],
    valuation: {
      ...model.valuation,
      enterpriseValue: newEv,
      equityValue: newEquityValue,
      valuePerShare: newValuePerShare,
      upside,
      sensitivity: model.valuation.sensitivity.map((c) => ({
        ...c,
        valuePerShare: c.valuePerShare * scale,
      })),
    },
    scenarios,
    probabilityWeightedValue,
    // Remove old "indicative only" warning now that the specialist model is active
    warnings: model.warnings.filter((w) => !w.includes("indicative only")),
    sectorValuation,
  };
}
