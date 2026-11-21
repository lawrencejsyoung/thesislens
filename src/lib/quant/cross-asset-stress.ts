import { Holding, MacroShockScenarioResult } from "../types";

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

const UNIVERSAL_MACRO_REGIMES: {
  id: string;
  name: string;
  description: string;
  sectorShocks: Record<Holding["sector"], number>;
  recommendedHedge: string;
}[] = [
  {
    id: "rate-hike-shock",
    name: "Sticky Inflation & +100bps Rate Shock",
    description:
      "Central banks hike unexpectedly; long-duration tech, REITs, and bonds reprice lower while commodities & T-bills hold up.",
    sectorShocks: {
      Technology: -18.5,
      "Mining & Materials": 6.5,
      Energy: 9.0,
      Financials: -4.0,
      Healthcare: -5.5,
      Industrials: -8.0,
      "Fixed Income": -6.5,
      Consumer: -11.0,
      "Real Estate": -14.0,
      "Crypto & Digital": -22.0,
      "Event Contract": 4.0,
      "Venture / Private": -18.0,
    },
    recommendedHedge:
      "Rotate 8–12% into short-duration T-bills, Critical Minerals/Energy, or Kalshi/SOFR rate-hike binary contracts.",
  },
  {
    id: "ai-capex-pause",
    name: "AI Capex Digestion & Tech Correction",
    description:
      "Hyperscalers slow GPU spending for 2 quarters; high-multiple silicon, cloud, and AI venture valuations compress sharply.",
    sectorShocks: {
      Technology: -26.0,
      "Mining & Materials": -5.0,
      Energy: -3.0,
      Financials: -4.5,
      Healthcare: 3.5,
      Industrials: -7.5,
      "Fixed Income": 4.0,
      Consumer: -4.0,
      "Real Estate": 2.0,
      "Crypto & Digital": -18.0,
      "Event Contract": 6.0,
      "Venture / Private": -30.0,
    },
    recommendedHedge:
      "Pair high-beta Tech/Venture with OTM QQQ put spreads, Healthcare defensives, or uncorrelated event contracts.",
  },
  {
    id: "global-recession",
    name: "Hard Landing & Credit Spread Widening",
    description:
      "GDP contracts 1.5%, unemployment rises, cyclical industrial, mining, and private valuations fall while Sovereign Bonds rally.",
    sectorShocks: {
      Technology: -19.0,
      "Mining & Materials": -22.0,
      Energy: -24.0,
      Financials: -21.0,
      Healthcare: -4.0,
      Industrials: -20.0,
      "Fixed Income": 9.5,
      Consumer: -15.0,
      "Real Estate": -12.0,
      "Crypto & Digital": -35.0,
      "Event Contract": 12.0,
      "Venture / Private": -25.0,
    },
    recommendedHedge:
      "Hold >= 20% sovereign bond duration / TLT calls or recession-linked prediction market YES contracts.",
  },
  {
    id: "commodity-supercycle",
    name: "EV Grid & Critical Minerals Supercycle",
    description:
      "Electrification & AI data-center power demand drive nickel, copper, uranium, and grid assets sharply higher.",
    sectorShocks: {
      Technology: 7.5,
      "Mining & Materials": 28.0,
      Energy: 21.0,
      Financials: 5.0,
      Healthcare: 1.5,
      Industrials: 14.0,
      "Fixed Income": -3.0,
      Consumer: -2.5,
      "Real Estate": 4.5,
      "Crypto & Digital": 12.0,
      "Event Contract": 8.0,
      "Venture / Private": 10.0,
    },
    recommendedHedge:
      "Express upside via Canadian critical minerals (Nickel/Copper/Uranium), OTM call spreads, or commodity ETFs.",
  },
  {
    id: "stagflation-debasement",
    name: "Stagflation & Fiat Debasement Regime",
    description:
      "Slow growth combined with 4.5%+ persistent inflation punishes nominal bonds while rewarding hard real assets, gold, and digital scarcity.",
    sectorShocks: {
      Technology: -12.0,
      "Mining & Materials": 18.0,
      Energy: 16.0,
      Financials: -8.0,
      Healthcare: -2.0,
      Industrials: -5.0,
      "Fixed Income": -11.0,
      Consumer: -13.0,
      "Real Estate": 9.0,
      "Crypto & Digital": 24.0,
      "Event Contract": 5.0,
      "Venture / Private": -12.0,
    },
    recommendedHedge:
      "Tilt into cash-flowing Real Estate with fixed-rate debt, Real Return Bonds, Commodities, and Gold/BTC ballast.",
  },
  {
    id: "liquidity-vol-spike",
    name: "Liquidity Crunch & Volatility Spike (VIX > 45)",
    description:
      "Sudden cross-asset deleveraging forces correlations toward 1.0; illiquid private deals and leveraged bets suffer air-pockets.",
    sectorShocks: {
      Technology: -21.0,
      "Mining & Materials": -17.0,
      Energy: -15.0,
      Financials: -18.0,
      Healthcare: -8.0,
      Industrials: -16.0,
      "Fixed Income": 5.0,
      Consumer: -12.0,
      "Real Estate": -10.0,
      "Crypto & Digital": -38.0,
      "Event Contract": -4.0,
      "Venture / Private": -22.0,
    },
    recommendedHedge:
      "Maintain 5% tail-risk budget in OTM index puts / long volatility straddles and cap illiquid exposure.",
  },
];

export function stressTestCrossAssetShocks(
  holdings: Holding[],
  totalCapital: number
): MacroShockScenarioResult[] {
  const totalWeight =
    holdings.reduce((s, h) => s + Math.max(0, h.weightPct), 0) || 100;

  return UNIVERSAL_MACRO_REGIMES.map((regime) => {
    let weightedImpact = 0;
    let worstHolding = holdings[0]?.ticker ?? "N/A";
    let worstImpact = Infinity;
    let bestHolding = holdings[0]?.ticker ?? "N/A";
    let bestImpact = -Infinity;

    for (const h of holdings) {
      const w = Math.max(0, h.weightPct) / totalWeight;
      const baseSectorShock = regime.sectorShocks[h.sector] ?? -8;
      const betaAdjusted =
        baseSectorShock < 0
          ? baseSectorShock * (0.65 + 0.35 * Math.min(2.2, Math.max(0.1, h.beta)))
          : baseSectorShock * (0.8 + 0.2 * Math.min(1.8, Math.max(0.1, h.beta)));

      weightedImpact += w * betaAdjusted;

      if (betaAdjusted < worstImpact) {
        worstImpact = betaAdjusted;
        worstHolding = `${h.ticker} (${round(betaAdjusted, 1)}%)`;
      }
      if (betaAdjusted > bestImpact) {
        bestImpact = betaAdjusted;
        bestHolding = `${h.ticker} (${betaAdjusted >= 0 ? "+" : ""}${round(betaAdjusted, 1)}%)`;
      }
    }

    return {
      id: regime.id,
      name: regime.name,
      description: regime.description,
      portfolioImpactPct: round(weightedImpact, 1),
      dollarImpact: Math.round((totalCapital * weightedImpact) / 100),
      worstHitHolding: worstHolding,
      bestHedgeHolding: bestHolding,
      recommendedHedge: regime.recommendedHedge,
    };
  });
}
