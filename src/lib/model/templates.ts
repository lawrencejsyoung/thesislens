import type { TemplateId } from "../fundamentals/sector";

/**
 * Per-sector modelling defaults and guardrails.
 *
 * Unlevered betas are approximate sector medians in the spirit of Damodaran's global industry
 * tables; they are placeholders until a regression beta from a price feed is available.
 */
export type TemplateValuationMethod =
  | "fcff-dcf"
  | "bank-residual-income"
  | "insurance-embedded-value"
  | "capital-markets-aum-roe"
  | "reit-nav-affo"
  | "utility-rate-base"
  | "commodity-reserve-nav"
  | "pharma-rnpv-blend"
  | "auto-captive-split";

export interface TemplateConfig {
  id: TemplateId;
  /** Primary valuation method used for this sector (Phase 6 covers all 19 templates). */
  method: TemplateValuationMethod;
  unleveredBeta: number;
  targetDebtWeight: number;
  terminalGrowth: number;
  /** Terminal RONIC = WACC + spread (franchise value persists for strong moats). */
  terminalRonicSpread: number;
  sbcTreatment: "expense" | "addback";
  /** Bounds applied to baseline EBIT margins (not to explicit overrides). */
  ebitMarginBounds: [number, number];
  /** Cyclical sectors fade margins and growth toward long-run (through-cycle) levels. */
  cyclical: boolean;
  /**
   * Steady-state EBIT margin a growing, sub-scale company converges to by the final forecast
   * year. Only used when the current margin is below it and revenue is growing ≥ 10%.
   */
  matureEbitMargin: number | null;
  note?: string;
}

const base: Omit<TemplateConfig, "id"> = {
  method: "fcff-dcf",
  unleveredBeta: 0.9,
  targetDebtWeight: 0.2,
  terminalGrowth: 0.025,
  terminalRonicSpread: 0.03,
  sbcTreatment: "expense",
  ebitMarginBounds: [-0.2, 0.6],
  cyclical: false,
  matureEbitMargin: 0.12,
};

const cfg = (id: TemplateId, o: Partial<Omit<TemplateConfig, "id">> = {}): TemplateConfig => ({ ...base, ...o, id });

export const TEMPLATE_CONFIGS: Record<TemplateId, TemplateConfig> = {
  industrial: cfg("industrial"),
  software: cfg("software", {
    unleveredBeta: 1.2,
    targetDebtWeight: 0.05,
    terminalGrowth: 0.03,
    terminalRonicSpread: 0.08,
    ebitMarginBounds: [-0.3, 0.65],
    matureEbitMargin: 0.25,
  }),
  semiconductors: cfg("semiconductors", { unleveredBeta: 1.35, targetDebtWeight: 0.05, terminalGrowth: 0.03, terminalRonicSpread: 0.06, cyclical: true, matureEbitMargin: 0.25 }),
  internet: cfg("internet", { unleveredBeta: 1.15, targetDebtWeight: 0.05, terminalGrowth: 0.03, terminalRonicSpread: 0.07, matureEbitMargin: 0.2 }),
  hardware: cfg("hardware", { unleveredBeta: 1.05, targetDebtWeight: 0.1, terminalGrowth: 0.025, terminalRonicSpread: 0.06 }),
  consumer: cfg("consumer", { unleveredBeta: 0.6, targetDebtWeight: 0.2, terminalGrowth: 0.025, terminalRonicSpread: 0.05 }),
  retail: cfg("retail", { unleveredBeta: 0.85, targetDebtWeight: 0.15, terminalRonicSpread: 0.04 }),
  pharma: cfg("pharma", {
    method: "pharma-rnpv-blend",
    unleveredBeta: 0.85,
    matureEbitMargin: 0.25,
    targetDebtWeight: 0.15,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.05,
    note: "Commercial portfolio FCFF DCF plus risk-adjusted pipeline NPV (rNPV).",
  }),
  "healthcare-services": cfg("healthcare-services", { unleveredBeta: 0.8, targetDebtWeight: 0.2 }),
  utility: cfg("utility", {
    method: "utility-rate-base",
    unleveredBeta: 0.35,
    targetDebtWeight: 0.5,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.005,
    note: "Regulated rate base x allowed ROE residual-income valuation.",
  }),
  energy: cfg("energy", {
    method: "commodity-reserve-nav",
    unleveredBeta: 0.85,
    targetDebtWeight: 0.2,
    terminalGrowth: 0.015,
    terminalRonicSpread: 0.01,
    cyclical: true,
    note: "Commodity price-deck sensitivity & reserve NAV blended with through-cycle DCF.",
  }),
  materials: cfg("materials", {
    method: "commodity-reserve-nav",
    unleveredBeta: 0.9,
    targetDebtWeight: 0.2,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.01,
    cyclical: true,
    note: "Commodity price-deck sensitivity & reserve NAV blended with through-cycle DCF.",
  }),
  telecom: cfg("telecom", { unleveredBeta: 0.55, targetDebtWeight: 0.4, terminalGrowth: 0.015, terminalRonicSpread: 0.01 }),
  auto: cfg("auto", {
    method: "auto-captive-split",
    unleveredBeta: 0.9,
    targetDebtWeight: 0.3,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.0,
    cyclical: true,
    matureEbitMargin: 0.08,
    note: "Separates captive-finance debt from industrial net debt in the EV-to-equity bridge.",
  }),
  payments: cfg("payments", { unleveredBeta: 1.0, targetDebtWeight: 0.1, terminalGrowth: 0.03, terminalRonicSpread: 0.08, matureEbitMargin: 0.25 }),
  reit: cfg("reit", {
    method: "reit-nav-affo",
    unleveredBeta: 0.6,
    targetDebtWeight: 0.35,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.0,
    note: "NAV (NOI / cap rate - net debt) blended with AFFO multiple valuation.",
  }),
  bank: cfg("bank", {
    method: "bank-residual-income",
    unleveredBeta: 1.1,
    targetDebtWeight: 0,
    terminalGrowth: 0.025,
    terminalRonicSpread: 0.02,
    note: "Residual-income / excess-return model + P/TBV vs ROTE valuation.",
  }),
  insurance: cfg("insurance", {
    method: "insurance-embedded-value",
    unleveredBeta: 0.95,
    targetDebtWeight: 0,
    terminalGrowth: 0.025,
    terminalRonicSpread: 0.015,
    note: "Embedded-value / ROE excess-return valuation.",
  }),
  "capital-markets": cfg("capital-markets", {
    method: "capital-markets-aum-roe",
    unleveredBeta: 1.15,
    targetDebtWeight: 0.1,
    terminalGrowth: 0.03,
    terminalRonicSpread: 0.03,
    note: "Balance-sheet-light ROE & fee-earning earnings multiple blend.",
  }),
};

export function templateConfig(id: TemplateId): TemplateConfig {
  return TEMPLATE_CONFIGS[id] ?? TEMPLATE_CONFIGS.industrial;
}
