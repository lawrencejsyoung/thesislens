import { BondInputs, BondValuationResult } from "../types";

export {
  analyzeRealEstateDeal,
  buildRealEstatePresetInputs,
  compareRealEstateClasses,
  compareRealEstateMarkets,
  getBenchmarkCapRatePct,
  getRealEstateClass,
  getRealEstateMarket,
  REAL_ESTATE_CLASSES,
  REAL_ESTATE_MARKETS,
  summarizeResidentialVsCommercial,
} from "./real-estate-engine";

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Deterministic Fixed Income / Bond Pricing, Duration, Convexity & DV01 Engine
 */
export function analyzeBondDuration(inputs: BondInputs): BondValuationResult {
  const freq = Math.max(1, Math.round(inputs.paymentsPerYear || 2));
  const periods = Math.max(1, Math.round(inputs.yearsToMaturity * freq));
  const couponPerPeriod = (inputs.faceValue * (inputs.couponRatePct / 100)) / freq;
  const y = Math.max(0.0001, inputs.ytmPct / 100 / freq);

  const priceAtYield = (yieldPerPeriod: number) => {
    let pv = 0;
    for (let t = 1; t <= periods; t++) {
      const cf = t === periods ? couponPerPeriod + inputs.faceValue : couponPerPeriod;
      pv += cf / Math.pow(1 + yieldPerPeriod, t);
    }
    return pv;
  };

  let fairPrice = 0;
  let weightedTime = 0;
  let convexitySum = 0;

  for (let t = 1; t <= periods; t++) {
    const cf = t === periods ? couponPerPeriod + inputs.faceValue : couponPerPeriod;
    const pv = cf / Math.pow(1 + y, t);
    fairPrice += pv;
    weightedTime += (t / freq) * pv;
    convexitySum += pv * t * (t + 1);
  }

  const macaulayDuration = weightedTime / Math.max(0.01, fairPrice);
  const modifiedDuration = macaulayDuration / (1 + y);
  const convexity =
    convexitySum / (Math.max(0.01, fairPrice) * Math.pow(1 + y, 2) * freq * freq);
  const dv01Per10k = (modifiedDuration * 10000) / 10000; // $ per 1bp per $10k face

  const shocks = [-200, -100, -50, 50, 100, 200].map((bps) => {
    const shockedY = Math.max(0.0001, (inputs.ytmPct + bps / 100) / 100 / freq);
    const p = priceAtYield(shockedY);
    return {
      bpsChange: bps,
      projectedPrice: round(p, 2),
      pctChange: round(((p - fairPrice) / fairPrice) * 100, 2),
    };
  });

  return {
    issuer: inputs.issuer,
    fairPrice: round(fairPrice, 2),
    currentYieldPct: round(
      ((inputs.faceValue * (inputs.couponRatePct / 100)) / Math.max(1, fairPrice)) * 100,
      2
    ),
    ytmPct: round(inputs.ytmPct, 2),
    macaulayDuration: round(macaulayDuration, 2),
    modifiedDuration: round(modifiedDuration, 2),
    convexity: round(convexity, 1),
    dv01Per10k: round(dv01Per10k, 2),
    rateShocks: shocks,
  };
}
