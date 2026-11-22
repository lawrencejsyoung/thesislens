import type { TemplateId } from "../fundamentals/sector";

/**
 * Per-sector modelling defaults and guardrails.
 *
 * Unlevered betas are approximate sector medians in the spirit of Damodaran's global industry
 * tables; they are placeholders until a regression beta from a price feed is available.
 */
export interface TemplateConfig {
  id: TemplateId;
  /** Whether the operating-company FCFF engine is a valid primary method for this sector. */
  method: "fcff-dcf" | "fcff-dcf-indicative" | "unsupported";
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
    unleveredBeta: 0.85,
    matureEbitMargin: 0.25,
    targetDebtWeight: 0.15,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.05,
    note: "Pipeline value (rNPV by asset) is not modelled yet; DCF reflects the current portfolio trajectory.",
  }),
  "healthcare-services": cfg("healthcare-services", { unleveredBeta: 0.8, targetDebtWeight: 0.2 }),
  utility: cfg("utility", {
    method: "fcff-dcf-indicative",
    unleveredBeta: 0.35,
    targetDebtWeight: 0.5,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.005,
    note: "Regulated utilities are better valued on rate base x allowed ROE; treat this DCF as indicative.",
  }),
  energy: cfg("energy", {
    unleveredBeta: 0.85,
    targetDebtWeight: 0.2,
    terminalGrowth: 0.015,
    terminalRonicSpread: 0.01,
    cyclical: true,
    note: "Commodity-price deck and reserve NAV are not modelled yet; margins reflect the latest cycle.",
  }),
  materials: cfg("materials", { unleveredBeta: 0.9, targetDebtWeight: 0.2, terminalGrowth: 0.02, terminalRonicSpread: 0.01, cyclical: true }),
  telecom: cfg("telecom", { unleveredBeta: 0.55, targetDebtWeight: 0.4, terminalGrowth: 0.015, terminalRonicSpread: 0.01 }),
  auto: cfg("auto", {
    unleveredBeta: 0.9,
    targetDebtWeight: 0.3,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.0,
    cyclical: true,
    matureEbitMargin: 0.08,
    note: "Captive-finance debt (e.g. Ford Credit, GM Financial) is not separated from industrial net debt yet, which understates equity value.",
  }),
  payments: cfg("payments", { unleveredBeta: 1.0, targetDebtWeight: 0.1, terminalGrowth: 0.03, terminalRonicSpread: 0.08, matureEbitMargin: 0.25 }),
  reit: cfg("reit", {
    method: "fcff-dcf-indicative",
    unleveredBeta: 0.6,
    targetDebtWeight: 0.35,
    terminalGrowth: 0.02,
    terminalRonicSpread: 0.0,
    note: "REITs are better valued on NAV and AFFO multiples; treat this DCF as indicative.",
  }),
  bank: cfg("bank", {
    method: "unsupported",
    note: "Banks need a residual-income / P-TBV model (debt is raw material, not financing). Planned for Phase 6.",
  }),
  insurance: cfg("insurance", {
    method: "unsupported",
    note: "Insurers need an embedded-value / ROE-based model. Planned for Phase 6.",
  }),
  "capital-markets": cfg("capital-markets", {
    method: "unsupported",
    note: "Brokers and asset managers need a balance-sheet-light ROE or fee-earning-AUM model. Planned for Phase 6.",
  }),
};

export function templateConfig(id: TemplateId): TemplateConfig {
  return TEMPLATE_CONFIGS[id] ?? TEMPLATE_CONFIGS.industrial;
}
