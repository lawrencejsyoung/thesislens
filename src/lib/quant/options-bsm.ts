import {
  OptionGreeks,
  OptionPayoffPoint,
  OptionStrategyInputs,
  OptionValuationResult,
} from "../types";

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Standard Normal PDF
 */
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Abramowitz & Stegun 7.1.26 approximation for Standard Normal CDF (error < 7.5e-8)
 */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf =
    1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erf);
}

export interface BsmSingleOption {
  price: number;
  delta: number;
  gamma: number;
  thetaPerDay: number;
  vegaPer1PctIv: number;
  rho: number;
}

/**
 * Exact Black-Scholes-Merton European Call/Put pricer & Greeks
 */
export function priceBlackScholesOption(params: {
  type: "call" | "put";
  spot: number;
  strike: number;
  timeYears: number;
  volatility: number; // decimal, e.g. 0.35
  riskFreeRate: number; // decimal, e.g. 0.042
}): BsmSingleOption {
  const S = Math.max(0.01, params.spot);
  const K = Math.max(0.01, params.strike);
  const T = Math.max(1 / 365, params.timeYears);
  const sigma = Math.max(0.02, params.volatility);
  const r = params.riskFreeRate;

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const pdfD1 = normPdf(d1);
  const discK = K * Math.exp(-r * T);

  let price: number;
  let delta: number;
  let thetaAnnual: number;
  let rhoAnnual: number;

  if (params.type === "call") {
    price = S * normCdf(d1) - discK * normCdf(d2);
    delta = normCdf(d1);
    thetaAnnual =
      -(S * pdfD1 * sigma) / (2 * sqrtT) - r * discK * normCdf(d2);
    rhoAnnual = K * T * Math.exp(-r * T) * normCdf(d2);
  } else {
    price = discK * normCdf(-d2) - S * normCdf(-d1);
    delta = normCdf(d1) - 1;
    thetaAnnual =
      -(S * pdfD1 * sigma) / (2 * sqrtT) + r * discK * normCdf(-d2);
    rhoAnnual = -K * T * Math.exp(-r * T) * normCdf(-d2);
  }

  const gamma = pdfD1 / (S * sigma * sqrtT);
  const vegaPer1PctIv = (S * pdfD1 * sqrtT) / 100;

  return {
    price: Math.max(0.01, price),
    delta,
    gamma,
    thetaPerDay: thetaAnnual / 365,
    vegaPer1PctIv,
    rho: rhoAnnual / 100,
  };
}

interface LegSpec {
  type: "call" | "put";
  strike: number;
  qty: number; // +1 long, -1 short
}

function buildStrategyLegs(inputs: OptionStrategyInputs): LegSpec[] {
  const K1 = Math.max(1, inputs.strikePrice);
  const K2 = Math.max(
    K1 + 1,
    inputs.upperStrikePrice ?? round(K1 * 1.15, 2)
  );

  switch (inputs.strategy) {
    case "long_call":
      return [{ type: "call", strike: K1, qty: 1 }];
    case "long_put":
      return [{ type: "put", strike: K1, qty: 1 }];
    case "bull_call_spread":
      return [
        { type: "call", strike: K1, qty: 1 },
        { type: "call", strike: K2, qty: -1 },
      ];
    case "bear_put_spread":
      return [
        { type: "put", strike: K2, qty: 1 },
        { type: "put", strike: K1, qty: -1 },
      ];
    case "long_straddle":
      return [
        { type: "call", strike: K1, qty: 1 },
        { type: "put", strike: K1, qty: 1 },
      ];
  }
}

function intrinsicPayoff(legs: LegSpec[], spot: number): number {
  return legs.reduce((sum, leg) => {
    const val =
      leg.type === "call"
        ? Math.max(0, spot - leg.strike)
        : Math.max(0, leg.strike - spot);
    return sum + leg.qty * val;
  }, 0);
}

/**
 * Deterministic Multi-Leg Options Valuation, Greeks & Payoff Curve Engine
 */
export function priceOptionStrategy(
  inputs: OptionStrategyInputs
): OptionValuationResult {
  const legs = buildStrategyLegs(inputs);
  const T = Math.max(1, inputs.daysToExpiry) / 365;
  const sigma = Math.max(5, inputs.impliedVolatilityPct) / 100;
  const r = inputs.riskFreeRatePct / 100;
  const multiplier = Math.max(1, Math.round(inputs.contracts)) * 100;

  let netDebit = 0;
  const greeks: OptionGreeks = {
    delta: 0,
    gamma: 0,
    thetaPerDay: 0,
    vegaPer1PctIv: 0,
    rho: 0,
  };

  for (const leg of legs) {
    const priced = priceBlackScholesOption({
      type: leg.type,
      spot: inputs.spotPrice,
      strike: leg.strike,
      timeYears: T,
      volatility: sigma,
      riskFreeRate: r,
    });
    netDebit += leg.qty * priced.price;
    greeks.delta += leg.qty * priced.delta;
    greeks.gamma += leg.qty * priced.gamma;
    greeks.thetaPerDay += leg.qty * priced.thetaPerDay;
    greeks.vegaPer1PctIv += leg.qty * priced.vegaPer1PctIv;
    greeks.rho += leg.qty * priced.rho;
  }

  netDebit = Math.max(0.05, netDebit);
  const totalCapitalAtRisk = Math.round(netDebit * multiplier);

  // Payoff curve from -40% to +55% around spot (20 steps)
  const payoffCurve: OptionPayoffPoint[] = [];
  const minSpot = Math.max(1, inputs.spotPrice * 0.6);
  const maxSpot = inputs.spotPrice * 1.55;
  const steps = 20;
  const halfT = Math.max(1 / 365, T * 0.5);

  for (let i = 0; i <= steps; i++) {
    const s = minSpot + ((maxSpot - minSpot) * i) / steps;
    const expiryVal = intrinsicPayoff(legs, s);
    const expiryPnl = Math.round((expiryVal - netDebit) * multiplier);

    const midVal = legs.reduce((sum, leg) => {
      const p = priceBlackScholesOption({
        type: leg.type,
        spot: s,
        strike: leg.strike,
        timeYears: halfT,
        volatility: sigma,
        riskFreeRate: r,
      });
      return sum + leg.qty * p.price;
    }, 0);
    const midLifePnl = Math.round((midVal - netDebit) * multiplier);

    payoffCurve.push({
      spotPrice: round(s, 2),
      expiryPnl,
      midLifePnl,
    });
  }

  // Max profit, max loss, breakevens & lognormal Probability of Profit
  const K1 = Math.max(1, inputs.strikePrice);
  const K2 = Math.max(
    K1 + 1,
    inputs.upperStrikePrice ?? round(K1 * 1.15, 2)
  );
  const maxLoss = totalCapitalAtRisk;
  let maxProfit: number | null = null;
  const breakevens: number[] = [];

  const probAbove = (target: number) => {
    const z =
      (Math.log(target / inputs.spotPrice) - (r - 0.5 * sigma * sigma) * T) /
      (sigma * Math.sqrt(T));
    return 1 - normCdf(z);
  };

  let pop = 0;
  if (inputs.strategy === "long_call") {
    const be = K1 + netDebit;
    breakevens.push(round(be, 2));
    maxProfit = null;
    pop = probAbove(be);
  } else if (inputs.strategy === "long_put") {
    const be = Math.max(0.01, K1 - netDebit);
    breakevens.push(round(be, 2));
    maxProfit = Math.round((K1 - netDebit) * multiplier);
    pop = 1 - probAbove(be);
  } else if (inputs.strategy === "bull_call_spread") {
    const be = K1 + netDebit;
    breakevens.push(round(be, 2));
    maxProfit = Math.max(0, Math.round((K2 - K1 - netDebit) * multiplier));
    pop = probAbove(be);
  } else if (inputs.strategy === "bear_put_spread") {
    const be = Math.max(0.01, K2 - netDebit);
    breakevens.push(round(be, 2));
    maxProfit = Math.max(0, Math.round((K2 - K1 - netDebit) * multiplier));
    pop = 1 - probAbove(be);
  } else if (inputs.strategy === "long_straddle") {
    const beLow = Math.max(0.01, K1 - netDebit);
    const beHigh = K1 + netDebit;
    breakevens.push(round(beLow, 2), round(beHigh, 2));
    maxProfit = null;
    pop = (1 - probAbove(beLow)) + probAbove(beHigh);
  }

  return {
    underlying: inputs.underlying,
    strategy: inputs.strategy,
    spotPrice: round(inputs.spotPrice, 2),
    strikePrice: round(K1, 2),
    upperStrikePrice:
      inputs.strategy === "bull_call_spread" || inputs.strategy === "bear_put_spread"
        ? round(K2, 2)
        : undefined,
    daysToExpiry: Math.round(inputs.daysToExpiry),
    impliedVolatilityPct: round(inputs.impliedVolatilityPct, 1),
    netDebitPerShare: round(netDebit, 2),
    totalCapitalAtRisk,
    maxProfit,
    maxLoss,
    breakevens,
    probabilityOfProfitPct: round(Math.min(99, Math.max(1, pop * 100)), 1),
    greeks: {
      delta: round(greeks.delta, 3),
      gamma: round(greeks.gamma, 4),
      thetaPerDay: round(greeks.thetaPerDay, 3),
      vegaPer1PctIv: round(greeks.vegaPer1PctIv, 3),
      rho: round(greeks.rho, 3),
    },
    payoffCurve,
  };
}
