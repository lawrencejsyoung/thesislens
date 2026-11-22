import type { DcfValuation, ProjectedYear, SensitivityCell, ValuationAssumptions } from "./types";

/**
 * FCFF DCF on the projected statements.
 *
 * - Mid-year convention with an exact stub: only the part of each forecast year after the
 *   valuation date is counted, discounted to the middle of that remaining window.
 * - Terminal value uses the value-driver formula NOPAT·(1 − g/RONIC)/(WACC − g), which
 *   ties terminal reinvestment to growth instead of extrapolating the final year's capex.
 */

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.25;

export interface ValuationInputs {
  projections: ProjectedYear[];
  assumptions: ValuationAssumptions;
  /** Effective tax rate for the terminal NOPAT and the debt tax shield. */
  terminalTaxRate: number;
  valuationDate: string;
  /** Gross debt − cash − short-term investments, from the latest reported balance sheet. */
  netDebt: number;
  grossDebt: number;
  /** Minority interest + mezzanine equity, deducted from EV. */
  minorityAndOther: number;
  shares: number;
  currentPrice: number | null;
}

const toDays = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

export function computeWacc(
  v: ValuationAssumptions,
  taxRate: number,
  marketCap: number | null,
  grossDebt: number
): { wacc: number; costOfEquity: number; leveredBeta: number; afterTaxCostOfDebt: number; debtWeight: number } {
  const debtWeight =
    marketCap !== null && marketCap > 0
      ? Math.min(0.8, grossDebt / (grossDebt + marketCap))
      : v.targetDebtWeight;
  const de = debtWeight / Math.max(1e-6, 1 - debtWeight);
  const leveredBeta = v.unleveredBeta * (1 + (1 - taxRate) * de);
  const costOfEquity = v.riskFreeRate + leveredBeta * v.equityRiskPremium;
  const afterTaxCostOfDebt = v.preTaxCostOfDebt * (1 - taxRate);
  const capm = (1 - debtWeight) * costOfEquity + debtWeight * afterTaxCostOfDebt;
  return {
    wacc: v.waccOverride ?? capm,
    costOfEquity,
    leveredBeta,
    afterTaxCostOfDebt,
    debtWeight,
  };
}

function discount(
  projections: ProjectedYear[],
  valuationDate: string,
  wacc: number,
  terminalGrowth: number,
  terminalRonic: number,
  terminalTaxRate: number
): { pvExplicit: number; pvTerminal: number; terminalValue: number } {
  const t0 = toDays(valuationDate);
  let pvExplicit = 0;
  for (const y of projections) {
    const start = Math.max(t0, toDays(y.start) - 1);
    const end = toDays(y.end);
    if (end <= t0) continue;
    const yearLen = Math.max(1, end - (toDays(y.start) - 1));
    const fraction = Math.min(1, (end - start) / yearLen);
    const midpointYears = ((start + end) / 2 - t0) / YEAR_DAYS;
    pvExplicit += (y.fcff * fraction) / Math.pow(1 + wacc, midpointYears);
  }
  const last = projections[projections.length - 1];
  const nopatNext = last.ebit * (1 + terminalGrowth) * (1 - terminalTaxRate);
  const reinvestmentRate = terminalRonic > 0 ? Math.min(1, Math.max(0, terminalGrowth / terminalRonic)) : 0;
  const terminalValue = (nopatNext * (1 - reinvestmentRate)) / (wacc - terminalGrowth);
  const yearsToEnd = (toDays(last.end) - t0) / YEAR_DAYS;
  const pvTerminal = terminalValue / Math.pow(1 + wacc, Math.max(0, yearsToEnd));
  return { pvExplicit, pvTerminal, terminalValue };
}

export function valueCompany(inp: ValuationInputs): DcfValuation {
  const v = inp.assumptions;
  const marketCap = inp.currentPrice !== null ? inp.currentPrice * inp.shares : null;
  const w = computeWacc(v, inp.terminalTaxRate, marketCap, inp.grossDebt);
  if (w.wacc <= v.terminalGrowth + 0.005) {
    throw new Error(
      `WACC (${(w.wacc * 100).toFixed(2)}%) must exceed terminal growth (${(v.terminalGrowth * 100).toFixed(2)}%) by at least 0.5pp.`
    );
  }
  const ronic = v.terminalRonic;

  const perShare = (wacc: number, g: number) => {
    const d = discount(inp.projections, inp.valuationDate, wacc, g, ronic, inp.terminalTaxRate);
    const ev = d.pvExplicit + d.pvTerminal;
    return { ...d, ev, value: (ev - inp.netDebt - inp.minorityAndOther) / inp.shares };
  };

  const core = perShare(w.wacc, v.terminalGrowth);
  const last = inp.projections[inp.projections.length - 1];

  const sensitivity: SensitivityCell[] = [];
  for (const dw of [-0.01, -0.005, 0, 0.005, 0.01]) {
    for (const dg of [-0.005, 0, 0.005]) {
      const wacc = w.wacc + dw;
      const g = v.terminalGrowth + dg;
      if (wacc <= g + 0.005) continue;
      sensitivity.push({ wacc, terminalGrowth: g, valuePerShare: perShare(wacc, g).value });
    }
  }

  const equityValue = core.ev - inp.netDebt - inp.minorityAndOther;
  return {
    wacc: w.wacc,
    costOfEquity: w.costOfEquity,
    leveredBeta: w.leveredBeta,
    afterTaxCostOfDebt: w.afterTaxCostOfDebt,
    debtWeight: w.debtWeight,
    pvExplicit: core.pvExplicit,
    pvTerminal: core.pvTerminal,
    terminalValue: core.terminalValue,
    terminalShareOfEv: core.ev !== 0 ? core.pvTerminal / core.ev : 0,
    impliedExitEvEbitda: last.ebitda !== 0 ? core.terminalValue / (last.ebitda * (1 + v.terminalGrowth)) : 0,
    enterpriseValue: core.ev,
    netDebt: inp.netDebt,
    minorityAndOther: inp.minorityAndOther,
    equityValue,
    sharesForValuation: inp.shares,
    valuePerShare: core.value,
    currentPrice: inp.currentPrice,
    upside: inp.currentPrice ? core.value / inp.currentPrice - 1 : null,
    valuationDate: inp.valuationDate,
    sensitivity,
  };
}
