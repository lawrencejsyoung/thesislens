import {
  BondInputs,
  BondValuationResult,
  RealEstateInputs,
  RealEstateSensitivityCell,
  RealEstateValuationResult,
} from "../types";

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Standard monthly mortgage payment & remaining balance after N years
 */
function mortgageMath(
  principal: number,
  annualRatePct: number,
  amortYears: number,
  holdYears: number
): { annualDebtService: number; remainingBalance: number } {
  if (principal <= 0) {
    return { annualDebtService: 0, remainingBalance: 0 };
  }
  const r = Math.max(0.0001, annualRatePct / 100 / 12);
  const n = Math.max(12, Math.round(amortYears * 12));
  const k = Math.min(n, Math.round(holdYears * 12));

  const factor = Math.pow(1 + r, n);
  const monthlyPayment = (principal * (r * factor)) / (factor - 1);
  const remFactor = Math.pow(1 + r, k);
  const remainingBalance =
    principal * ((factor - remFactor) / (factor - 1));

  return {
    annualDebtService: monthlyPayment * 12,
    remainingBalance: Math.max(0, remainingBalance),
  };
}

/**
 * Bisection solver for Internal Rate of Return (IRR) on annual cash flows
 */
function solveIrr(cashFlows: number[]): number {
  let low = -0.6;
  let high = 1.5;
  const npv = (rate: number) =>
    cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);

  if (npv(low) < 0) return -50;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (npv(mid) > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return ((low + high) / 2) * 100;
}

function evaluateRealEstateCore(
  inputs: RealEstateInputs,
  mortgageRateOverride?: number,
  exitCapOverride?: number
) {
  const rate = mortgageRateOverride ?? inputs.mortgageRatePct;
  const exitCap = Math.max(2.5, exitCapOverride ?? inputs.exitCapRatePct);
  const downPayment = (inputs.purchasePrice * inputs.downPaymentPct) / 100;
  const closingCosts = (inputs.purchasePrice * inputs.closingCostsPct) / 100;
  const totalCashInvested = Math.max(1000, downPayment + closingCosts);
  const loanAmount = Math.max(0, inputs.purchasePrice - downPayment);
  const holdYears = Math.max(1, Math.min(30, Math.round(inputs.holdYears)));

  const { annualDebtService, remainingBalance } = mortgageMath(
    loanAmount,
    rate,
    inputs.amortizationYears,
    holdYears
  );

  const effectiveGrossY1 =
    inputs.grossAnnualRent * (1 - inputs.vacancyRatePct / 100);
  const year1Noi =
    effectiveGrossY1 * (1 - inputs.operatingExpenseRatioPct / 100);
  const year1CashFlow = year1Noi - annualDebtService;

  const cashFlows: number[] = [-totalCashInvested];
  let currentNoi = year1Noi;
  for (let y = 1; y <= holdYears; y++) {
    if (y > 1) {
      currentNoi = currentNoi * (1 + inputs.annualRentGrowthPct / 100);
    }
    cashFlows.push(currentNoi - annualDebtService);
  }

  // Exit valuation based on forward Year N+1 NOI / Exit Cap Rate (less 4% selling costs)
  const forwardExitNoi = currentNoi * (1 + inputs.annualRentGrowthPct / 100);
  const projectedExitValue = forwardExitNoi / (exitCap / 100);
  const netSaleProceeds = projectedExitValue * 0.96 - remainingBalance;
  cashFlows[cashFlows.length - 1] += netSaleProceeds;

  const totalDistributions = cashFlows
    .slice(1)
    .reduce((sum, cf) => sum + cf, 0);
  const leveredIrrPct = solveIrr(cashFlows);
  const cashOnCashPct = (year1CashFlow / totalCashInvested) * 100;

  return {
    totalCashInvested,
    loanAmount,
    year1Noi,
    annualDebtService,
    year1CashFlow,
    goingInCapRatePct: (year1Noi / Math.max(1, inputs.purchasePrice)) * 100,
    cashOnCashPct,
    dscr: annualDebtService > 0 ? year1Noi / annualDebtService : 9.9,
    grossRentMultiplier: inputs.purchasePrice / Math.max(1, inputs.grossAnnualRent),
    projectedExitValue,
    remainingBalance,
    leveredIrrPct,
    equityMultiple: totalDistributions / totalCashInvested,
  };
}

/**
 * Deterministic Real Estate Pro Forma, DSCR & Levered IRR Engine
 */
export function analyzeRealEstateDeal(
  inputs: RealEstateInputs
): RealEstateValuationResult {
  const base = evaluateRealEstateCore(inputs);

  const rateSteps = [-1.0, 0, 1.0].map((d) =>
    round(Math.max(2.0, inputs.mortgageRatePct + d), 2)
  );
  const exitCapSteps = [-0.75, 0, 0.75].map((d) =>
    round(Math.max(3.0, inputs.exitCapRatePct + d), 2)
  );

  const sensitivityGrid: RealEstateSensitivityCell[] = [];
  for (const r of rateSteps) {
    for (const c of exitCapSteps) {
      const res = evaluateRealEstateCore(inputs, r, c);
      sensitivityGrid.push({
        mortgageRatePct: r,
        exitCapRatePct: c,
        leveredIrrPct: round(res.leveredIrrPct, 1),
        cashOnCashPct: round(res.cashOnCashPct, 1),
      });
    }
  }

  return {
    propertyName: inputs.propertyName,
    totalCashInvested: Math.round(base.totalCashInvested),
    loanAmount: Math.round(base.loanAmount),
    year1Noi: Math.round(base.year1Noi),
    annualDebtService: Math.round(base.annualDebtService),
    year1CashFlow: Math.round(base.year1CashFlow),
    goingInCapRatePct: round(base.goingInCapRatePct, 2),
    cashOnCashPct: round(base.cashOnCashPct, 2),
    dscr: round(base.dscr, 2),
    grossRentMultiplier: round(base.grossRentMultiplier, 1),
    projectedExitValue: Math.round(base.projectedExitValue),
    remainingLoanAtExit: Math.round(base.remainingBalance),
    leveredIrrPct: round(base.leveredIrrPct, 1),
    equityMultiple: round(base.equityMultiple, 2),
    sensitivityGrid,
  };
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
