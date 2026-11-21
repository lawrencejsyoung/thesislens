import {
  RealEstateCategory,
  RealEstateClassComparisonItem,
  RealEstateClassProfile,
  RealEstateCovenantCheck,
  RealEstateInputs,
  RealEstateLeaseStructure,
  RealEstateMarketBenchmark,
  RealEstateMarketComparisonItem,
  RealEstatePropertyClass,
  RealEstateSensitivityCell,
  RealEstateValuationResult,
  RealEstateYearProjection,
  ResidentialVsCommercialSummary,
} from "../types";

const RISK_FREE_10Y_PCT = 4.2;

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Curated institutional benchmark database across 10 North American & Global markets
 */
export const REAL_ESTATE_MARKETS: RealEstateMarketBenchmark[] = [
  {
    id: "sudbury-on",
    name: "Greater Sudbury, ON",
    region: "Canada",
    tier: "Resource / Regional",
    populationGrowthPct: 1.8,
    jobGrowthPct: 2.1,
    medianHouseholdIncomeUsd: 78500,
    supplyPipelinePct: 1.4,
    propertyTaxRatePct: 1.48,
    landlordFriendlyScore: 54,
    rentControlRisk: "Moderate",
    baseResidentialCapPct: 6.4,
    baseCommercialCapPct: 7.35,
    baseRentGrowthPct: 3.3,
    baseVacancyPct: 3.4,
    macroScore: 76,
    highlights:
      "Critical minerals & mining tech hub; tight vacancy (<3.5%) with superior going-in cap rates vs. GTA.",
  },
  {
    id: "toronto-gta",
    name: "Toronto GTA, ON",
    region: "Canada",
    tier: "Gateway",
    populationGrowthPct: 2.6,
    jobGrowthPct: 2.2,
    medianHouseholdIncomeUsd: 92000,
    supplyPipelinePct: 3.8,
    propertyTaxRatePct: 0.72,
    landlordFriendlyScore: 44,
    rentControlRisk: "High",
    baseResidentialCapPct: 4.55,
    baseCommercialCapPct: 5.65,
    baseRentGrowthPct: 3.1,
    baseVacancyPct: 2.8,
    macroScore: 72,
    highlights:
      "Canada's premier gateway market; compressed cap rates and LTB delays offset by deep institutional liquidity.",
  },
  {
    id: "calgary-ab",
    name: "Calgary, AB",
    region: "Canada",
    tier: "Growth Sunbelt",
    populationGrowthPct: 3.9,
    jobGrowthPct: 3.2,
    medianHouseholdIncomeUsd: 96500,
    supplyPipelinePct: 3.6,
    propertyTaxRatePct: 0.68,
    landlordFriendlyScore: 84,
    rentControlRisk: "Low",
    baseResidentialCapPct: 5.65,
    baseCommercialCapPct: 6.6,
    baseRentGrowthPct: 4.1,
    baseVacancyPct: 3.2,
    macroScore: 86,
    highlights:
      "No provincial rent control, strong interprovincial migration, and resilient energy/industrial logistics demand.",
  },
  {
    id: "vancouver-bc",
    name: "Vancouver, BC",
    region: "Canada",
    tier: "Gateway",
    populationGrowthPct: 2.2,
    jobGrowthPct: 1.9,
    medianHouseholdIncomeUsd: 91000,
    supplyPipelinePct: 2.9,
    propertyTaxRatePct: 0.32,
    landlordFriendlyScore: 42,
    rentControlRisk: "High",
    baseResidentialCapPct: 4.15,
    baseCommercialCapPct: 5.25,
    baseRentGrowthPct: 2.8,
    baseVacancyPct: 1.9,
    macroScore: 70,
    highlights:
      "Ultra-low vacancy and land scarcity drive long-term appreciation, but negative leverage constrains cash-on-cash.",
  },
  {
    id: "austin-tx",
    name: "Austin, TX",
    region: "US",
    tier: "Growth Sunbelt",
    populationGrowthPct: 2.9,
    jobGrowthPct: 3.1,
    medianHouseholdIncomeUsd: 98000,
    supplyPipelinePct: 6.4,
    propertyTaxRatePct: 1.95,
    landlordFriendlyScore: 88,
    rentControlRisk: "Low",
    baseResidentialCapPct: 5.45,
    baseCommercialCapPct: 6.35,
    baseRentGrowthPct: 3.5,
    baseVacancyPct: 6.8,
    macroScore: 81,
    highlights:
      "Tech & semiconductor job engine with landlord-friendly laws; near-term multifamily supply wave requires basis discipline.",
  },
  {
    id: "miami-fl",
    name: "Miami / South FL",
    region: "US",
    tier: "Growth Sunbelt",
    populationGrowthPct: 2.1,
    jobGrowthPct: 2.7,
    medianHouseholdIncomeUsd: 79000,
    supplyPipelinePct: 4.5,
    propertyTaxRatePct: 1.05,
    landlordFriendlyScore: 85,
    rentControlRisk: "Low",
    baseResidentialCapPct: 5.25,
    baseCommercialCapPct: 6.1,
    baseRentGrowthPct: 3.9,
    baseVacancyPct: 5.1,
    macroScore: 79,
    highlights:
      "Global wealth & finance inflow supports strong rent growth; elevated property insurance increases OpEx ratio.",
  },
  {
    id: "phoenix-az",
    name: "Phoenix, AZ",
    region: "US",
    tier: "Growth Sunbelt",
    populationGrowthPct: 2.4,
    jobGrowthPct: 2.8,
    medianHouseholdIncomeUsd: 84000,
    supplyPipelinePct: 5.2,
    propertyTaxRatePct: 0.65,
    landlordFriendlyScore: 86,
    rentControlRisk: "Low",
    baseResidentialCapPct: 5.6,
    baseCommercialCapPct: 6.25,
    baseRentGrowthPct: 3.6,
    baseVacancyPct: 5.9,
    macroScore: 83,
    highlights:
      "Semiconductor reshoring (TSMC/Intel) and data-center corridor drive top-tier industrial & workforce housing demand.",
  },
  {
    id: "new-york-ny",
    name: "New York Metro, NY",
    region: "US",
    tier: "Gateway",
    populationGrowthPct: 0.6,
    jobGrowthPct: 1.5,
    medianHouseholdIncomeUsd: 102000,
    supplyPipelinePct: 2.1,
    propertyTaxRatePct: 1.68,
    landlordFriendlyScore: 34,
    rentControlRisk: "High",
    baseResidentialCapPct: 4.85,
    baseCommercialCapPct: 5.95,
    baseRentGrowthPct: 3.0,
    baseVacancyPct: 3.3,
    macroScore: 68,
    highlights:
      "Unmatched institutional depth and supply barriers; heavy regulatory & rent-stabilization risk in residential.",
  },
  {
    id: "chicago-il",
    name: "Chicago Metro, IL",
    region: "US",
    tier: "Secondary Value",
    populationGrowthPct: 0.4,
    jobGrowthPct: 1.2,
    medianHouseholdIncomeUsd: 87000,
    supplyPipelinePct: 1.8,
    propertyTaxRatePct: 2.18,
    landlordFriendlyScore: 52,
    rentControlRisk: "Moderate",
    baseResidentialCapPct: 6.55,
    baseCommercialCapPct: 7.4,
    baseRentGrowthPct: 3.2,
    baseVacancyPct: 4.9,
    macroScore: 77,
    highlights:
      "Muted new supply and O'Hare/intermodal logistics scale deliver compelling positive-leverage cash yields.",
  },
  {
    id: "london-uk",
    name: "London, UK",
    region: "Global",
    tier: "Gateway",
    populationGrowthPct: 1.2,
    jobGrowthPct: 1.7,
    medianHouseholdIncomeUsd: 89000,
    supplyPipelinePct: 2.2,
    propertyTaxRatePct: 0.95,
    landlordFriendlyScore: 60,
    rentControlRisk: "Moderate",
    baseResidentialCapPct: 4.7,
    baseCommercialCapPct: 5.55,
    baseRentGrowthPct: 3.4,
    baseVacancyPct: 3.1,
    macroScore: 74,
    highlights:
      "Global financial capital with long FRI commercial leases and resilient institutional Build-to-Rent (BTR) demand.",
  },
];

/**
 * Curated institutional property class profiles across Residential & Commercial real estate
 */
export const REAL_ESTATE_CLASSES: RealEstateClassProfile[] = [
  // ── Residential Classes ──
  {
    id: "single_family",
    label: "Single-Family Rental (SFR)",
    shortLabel: "SFR",
    category: "residential",
    defaultLeaseStructure: "gross",
    capRateSpreadBps: -35,
    typicalVacancyPct: 4.5,
    typicalOpexRatioPct: 34,
    typicalCapexReservePct: 5,
    reimbursementRecoveryPct: 0,
    typicalLtvPct: 75,
    debtSpreadOverTreasuryPct: 1.35,
    typicalAmortYears: 30,
    typicalHoldYears: 7,
    rentGrowthModifierPct: 0.2,
    minLenderDscr: 1.15,
    minDebtYieldPct: 7.0,
    volatilityPct: 11.5,
    liquidityScore: 86,
    managementIntensity: "Moderate",
    unitLabel: "units",
    defaultUnitsOrSqft: 1,
    defaultPurchasePrice: 440000,
    description:
      "High retail resale liquidity and sticky family tenants; lower going-in yield but strong exit optionality.",
  },
  {
    id: "small_multifamily",
    label: "Small Multifamily (2–4 Units)",
    shortLabel: "2–4 Unit",
    category: "residential",
    defaultLeaseStructure: "gross",
    capRateSpreadBps: 25,
    typicalVacancyPct: 4.5,
    typicalOpexRatioPct: 32,
    typicalCapexReservePct: 5,
    reimbursementRecoveryPct: 0,
    typicalLtvPct: 80,
    debtSpreadOverTreasuryPct: 1.05,
    typicalAmortYears: 25,
    typicalHoldYears: 7,
    rentGrowthModifierPct: 0.1,
    minLenderDscr: 1.2,
    minDebtYieldPct: 7.5,
    volatilityPct: 12.5,
    liquidityScore: 78,
    managementIntensity: "Moderate",
    unitLabel: "units",
    defaultUnitsOrSqft: 4,
    defaultPurchasePrice: 680000,
    description:
      "Duplexes to fourplexes combining residential mortgage terms with diversified multi-tenant cash flow.",
  },
  {
    id: "apartments_multifamily",
    label: "Institutional Multifamily (5+ Units)",
    shortLabel: "Multifamily 5+",
    category: "residential",
    defaultLeaseStructure: "gross",
    capRateSpreadBps: -15,
    typicalVacancyPct: 5.5,
    typicalOpexRatioPct: 38,
    typicalCapexReservePct: 5,
    reimbursementRecoveryPct: 12,
    typicalLtvPct: 70,
    debtSpreadOverTreasuryPct: 1.45,
    typicalAmortYears: 30,
    typicalHoldYears: 7,
    rentGrowthModifierPct: 0.0,
    minLenderDscr: 1.25,
    minDebtYieldPct: 8.0,
    volatilityPct: 13.0,
    liquidityScore: 84,
    managementIntensity: "Moderate",
    unitLabel: "units",
    defaultUnitsOrSqft: 24,
    defaultPurchasePrice: 4200000,
    description:
      "Core institutional apartment assets valued purely on NOI; scalable operations and agency/CMHC debt access.",
  },
  {
    id: "student_housing",
    label: "Student / Workforce Housing",
    shortLabel: "Student / WF",
    category: "residential",
    defaultLeaseStructure: "gross",
    capRateSpreadBps: 60,
    typicalVacancyPct: 6.0,
    typicalOpexRatioPct: 40,
    typicalCapexReservePct: 6,
    reimbursementRecoveryPct: 5,
    typicalLtvPct: 70,
    debtSpreadOverTreasuryPct: 1.65,
    typicalAmortYears: 25,
    typicalHoldYears: 7,
    rentGrowthModifierPct: 0.35,
    minLenderDscr: 1.25,
    minDebtYieldPct: 8.5,
    volatilityPct: 15.0,
    liquidityScore: 68,
    managementIntensity: "High",
    unitLabel: "units",
    defaultUnitsOrSqft: 16,
    defaultPurchasePrice: 2600000,
    description:
      "By-the-bed or workforce leasing near universities & hospital/mining hubs; higher yield with annual turnover.",
  },
  {
    id: "short_term_rental",
    label: "Short-Term Rental / Hospitality Flex",
    shortLabel: "STR / Flex",
    category: "residential",
    defaultLeaseStructure: "short_term",
    capRateSpreadBps: 145,
    typicalVacancyPct: 18.0,
    typicalOpexRatioPct: 44,
    typicalCapexReservePct: 7,
    reimbursementRecoveryPct: 0,
    typicalLtvPct: 70,
    debtSpreadOverTreasuryPct: 2.1,
    typicalAmortYears: 25,
    typicalHoldYears: 5,
    rentGrowthModifierPct: 0.4,
    minLenderDscr: 1.3,
    minDebtYieldPct: 9.5,
    volatilityPct: 22.0,
    liquidityScore: 72,
    managementIntensity: "High",
    unitLabel: "units",
    defaultUnitsOrSqft: 3,
    defaultPurchasePrice: 850000,
    description:
      "Dynamic nightly/executive pricing yields high upside, offset by seasonality, municipal licensing, and OpEx load.",
  },

  // ── Commercial Classes ──
  {
    id: "industrial_logistics",
    label: "Industrial & Last-Mile Logistics",
    shortLabel: "Industrial",
    category: "commercial",
    defaultLeaseStructure: "nnn",
    capRateSpreadBps: -25,
    typicalVacancyPct: 4.5,
    typicalOpexRatioPct: 24,
    typicalCapexReservePct: 3.5,
    reimbursementRecoveryPct: 88,
    typicalLtvPct: 65,
    debtSpreadOverTreasuryPct: 1.65,
    typicalAmortYears: 25,
    typicalHoldYears: 7,
    rentGrowthModifierPct: 0.55,
    minLenderDscr: 1.25,
    minDebtYieldPct: 8.5,
    volatilityPct: 13.5,
    liquidityScore: 88,
    managementIntensity: "Low",
    unitLabel: "sq ft",
    defaultUnitsOrSqft: 28000,
    defaultPurchasePrice: 4800000,
    description:
      "E-commerce, reshoring, and light-industrial bays on NNN leases; low CapEx and strong rent-bump escalations.",
  },
  {
    id: "retail_nnn",
    label: "Neighborhood / NNN Retail",
    shortLabel: "NNN Retail",
    category: "commercial",
    defaultLeaseStructure: "nnn",
    capRateSpreadBps: 35,
    typicalVacancyPct: 5.5,
    typicalOpexRatioPct: 26,
    typicalCapexReservePct: 4.5,
    reimbursementRecoveryPct: 85,
    typicalLtvPct: 65,
    debtSpreadOverTreasuryPct: 1.85,
    typicalAmortYears: 25,
    typicalHoldYears: 7,
    rentGrowthModifierPct: -0.25,
    minLenderDscr: 1.3,
    minDebtYieldPct: 9.0,
    volatilityPct: 15.0,
    liquidityScore: 76,
    managementIntensity: "Low",
    unitLabel: "sq ft",
    defaultUnitsOrSqft: 15000,
    defaultPurchasePrice: 3600000,
    description:
      "Grocery-anchored or service-oriented NNN strip retail passing taxes, insurance, and CAM directly to tenants.",
  },
  {
    id: "office_class_a",
    label: "Class A / Medical & Flex Office",
    shortLabel: "Class A Office",
    category: "commercial",
    defaultLeaseStructure: "modified_gross",
    capRateSpreadBps: 135,
    typicalVacancyPct: 12.5,
    typicalOpexRatioPct: 40,
    typicalCapexReservePct: 8.5,
    reimbursementRecoveryPct: 52,
    typicalLtvPct: 55,
    debtSpreadOverTreasuryPct: 2.55,
    typicalAmortYears: 25,
    typicalHoldYears: 7,
    rentGrowthModifierPct: -0.9,
    minLenderDscr: 1.35,
    minDebtYieldPct: 10.5,
    volatilityPct: 21.5,
    liquidityScore: 52,
    managementIntensity: "High",
    unitLabel: "sq ft",
    defaultUnitsOrSqft: 25000,
    defaultPurchasePrice: 5200000,
    description:
      "Deeply discounted basis with elevated headline cap rates, but heavy TI/LC re-leasing costs and tighter debt.",
  },
  {
    id: "mixed_use",
    label: "Urban Mixed-Use (Retail + Resi)",
    shortLabel: "Mixed-Use",
    category: "commercial",
    defaultLeaseStructure: "modified_gross",
    capRateSpreadBps: 20,
    typicalVacancyPct: 6.0,
    typicalOpexRatioPct: 35,
    typicalCapexReservePct: 5.5,
    reimbursementRecoveryPct: 38,
    typicalLtvPct: 65,
    debtSpreadOverTreasuryPct: 1.9,
    typicalAmortYears: 25,
    typicalHoldYears: 7,
    rentGrowthModifierPct: 0.15,
    minLenderDscr: 1.25,
    minDebtYieldPct: 8.75,
    volatilityPct: 14.5,
    liquidityScore: 70,
    managementIntensity: "Moderate",
    unitLabel: "sq ft",
    defaultUnitsOrSqft: 18000,
    defaultPurchasePrice: 3400000,
    description:
      "Ground-floor commercial retail below residential apartments; diversifies tenant income across economic cycles.",
  },
  {
    id: "data_center_specialty",
    label: "Data Center / Self-Storage Specialty",
    shortLabel: "Data / Storage",
    category: "commercial",
    defaultLeaseStructure: "nnn",
    capRateSpreadBps: 10,
    typicalVacancyPct: 6.5,
    typicalOpexRatioPct: 28,
    typicalCapexReservePct: 4.0,
    reimbursementRecoveryPct: 78,
    typicalLtvPct: 62,
    debtSpreadOverTreasuryPct: 1.85,
    typicalAmortYears: 25,
    typicalHoldYears: 7,
    rentGrowthModifierPct: 0.75,
    minLenderDscr: 1.3,
    minDebtYieldPct: 9.0,
    volatilityPct: 16.0,
    liquidityScore: 80,
    managementIntensity: "Moderate",
    unitLabel: "sq ft",
    defaultUnitsOrSqft: 22000,
    defaultPurchasePrice: 6500000,
    description:
      "AI power-backed edge data centers & automated storage; secular rent growth with durable cash flow.",
  },
];

export function getRealEstateMarket(marketId?: string): RealEstateMarketBenchmark {
  return (
    REAL_ESTATE_MARKETS.find((m) => m.id === marketId) ?? REAL_ESTATE_MARKETS[0]
  );
}

export function getRealEstateClass(
  propertyClass?: RealEstatePropertyClass
): RealEstateClassProfile {
  return (
    REAL_ESTATE_CLASSES.find((c) => c.id === propertyClass) ??
    REAL_ESTATE_CLASSES[1] // small_multifamily default
  );
}

export function getBenchmarkCapRatePct(
  market: RealEstateMarketBenchmark,
  profile: RealEstateClassProfile
): number {
  const base =
    profile.category === "residential"
      ? market.baseResidentialCapPct
      : market.baseCommercialCapPct;
  return round(clamp(base + profile.capRateSpreadBps / 100, 3.5, 11.5), 2);
}

/**
 * Generates realistic underwriting defaults for any Property Class in any Market
 */
export function buildRealEstatePresetInputs(
  propertyClass: RealEstatePropertyClass,
  marketId: string,
  purchasePriceOverride?: number
): RealEstateInputs {
  const profile = getRealEstateClass(propertyClass);
  const market = getRealEstateMarket(marketId);
  const targetCapPct = getBenchmarkCapRatePct(market, profile);
  const purchasePrice = purchasePriceOverride ?? profile.defaultPurchasePrice;

  // Back-solve Gross Annual Rent so Year-1 NOI hits the market/class benchmark Cap Rate
  const vacancy = clamp(
    round((market.baseVacancyPct + profile.typicalVacancyPct) / 2, 1),
    1.5,
    25
  );
  const opexRatio = profile.typicalOpexRatioPct;
  const capexReserve = profile.typicalCapexReservePct;
  const recovery = profile.reimbursementRecoveryPct;

  // EGI = GPR * (1 - vac) + Reimbursements
  // Reimbursements = OpEx * recovery; OpEx = BaseEgi * opexRatio
  // Net NOI margin on GPR*(1-vac) = 1 - opexRatio*(1 - recovery) - capexReserve
  const effectiveNoiMargin = Math.max(
    0.25,
    1 - (opexRatio / 100) * (1 - recovery / 100) - capexReserve / 100
  );
  const targetNoi = purchasePrice * (targetCapPct / 100);
  const grossAnnualRent = Math.round(
    targetNoi / (effectiveNoiMargin * (1 - vacancy / 100))
  );

  const mortgageRatePct = round(
    RISK_FREE_10Y_PCT + profile.debtSpreadOverTreasuryPct,
    2
  );
  const rentGrowthPct = round(
    clamp(market.baseRentGrowthPct + profile.rentGrowthModifierPct, 0.5, 6.5),
    2
  );

  return {
    propertyName: `${market.name} — ${profile.label}`,
    category: profile.category,
    propertyClass: profile.id,
    marketId: market.id,
    leaseStructure: profile.defaultLeaseStructure,
    unitsOrSqft: profile.defaultUnitsOrSqft,
    purchasePrice,
    downPaymentPct: 100 - profile.typicalLtvPct,
    closingCostsPct: profile.category === "commercial" ? 2.25 : 3.0,
    renovationCapex: 0,
    grossAnnualRent,
    vacancyRatePct: vacancy,
    operatingExpenseRatioPct: opexRatio,
    capexReservePct: capexReserve,
    reimbursementRecoveryPct: recovery,
    expenseGrowthPct: 2.6,
    mortgageRatePct,
    amortizationYears: profile.typicalAmortYears,
    interestOnlyYears: profile.category === "commercial" ? 1 : 0,
    annualRentGrowthPct: rentGrowthPct,
    holdYears: profile.typicalHoldYears,
    exitCapRatePct: round(targetCapPct + 0.25, 2),
    depreciationBasisPct: 75,
    marginalTaxRatePct: 35,
  };
}

/**
 * Exact annual debt service & remaining balance supporting optional Interest-Only (IO) years
 */
function computeDebtSchedule(
  principal: number,
  annualRatePct: number,
  amortYears: number,
  ioYears: number,
  holdYears: number
): { annualDebtServices: number[]; loanBalances: number[] } {
  const annualDebtServices: number[] = [];
  const loanBalances: number[] = [];

  if (principal <= 0) {
    for (let y = 1; y <= holdYears; y++) {
      annualDebtServices.push(0);
      loanBalances.push(0);
    }
    return { annualDebtServices, loanBalances };
  }

  const rMonthly = Math.max(0.0001, annualRatePct / 100 / 12);
  const nTotalMonths = Math.max(12, Math.round(amortYears * 12));
  const factor = Math.pow(1 + rMonthly, nTotalMonths);
  const amortMonthlyPayment = (principal * (rMonthly * factor)) / (factor - 1);
  const ioAnnualPayment = principal * (annualRatePct / 100);

  let balance = principal;
  for (let y = 1; y <= holdYears; y++) {
    if (y <= ioYears) {
      annualDebtServices.push(ioAnnualPayment);
      loanBalances.push(balance);
    } else {
      let yearlyPayment = 0;
      for (let m = 0; m < 12; m++) {
        const interest = balance * rMonthly;
        const principalPaid = Math.min(balance, amortMonthlyPayment - interest);
        balance = Math.max(0, balance - principalPaid);
        yearlyPayment += interest + principalPaid;
      }
      annualDebtServices.push(yearlyPayment);
      loanBalances.push(balance);
    }
  }

  return { annualDebtServices, loanBalances };
}

/**
 * Bisection solver for Internal Rate of Return (IRR) on annual cash flows
 */
function solveIrr(cashFlows: number[]): number {
  let low = -0.65;
  let high = 1.8;
  const npv = (rate: number) =>
    cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);

  if (npv(low) < 0) return -55;
  if (npv(high) > 0) return 150;

  for (let i = 0; i < 65; i++) {
    const mid = (low + high) / 2;
    if (npv(mid) > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return ((low + high) / 2) * 100;
}

interface CoreEvalResult {
  totalCashInvested: number;
  unleveredBasis: number;
  loanAmount: number;
  ltvPct: number;
  year1Noi: number;
  annualDebtService: number;
  year1CashFlow: number;
  goingInCapRatePct: number;
  cashOnCashPct: number;
  dscr: number;
  debtYieldPct: number;
  breakEvenOccupancyPct: number;
  grossRentMultiplier: number;
  projectedExitValue: number;
  remainingBalance: number;
  leveredIrrPct: number;
  unleveredIrrPct: number;
  afterTaxIrrPct: number;
  annualDepreciationShield: number;
  equityMultiple: number;
  unleveredEquityMultiple: number;
  yearlyCashFlows: RealEstateYearProjection[];
}

function evaluateRealEstateCore(
  inputs: RealEstateInputs,
  profile: RealEstateClassProfile,
  mortgageRateOverride?: number,
  exitCapOverride?: number
): CoreEvalResult {
  const rate = mortgageRateOverride ?? inputs.mortgageRatePct;
  const exitCap = Math.max(2.5, exitCapOverride ?? inputs.exitCapRatePct);
  const downPayment = (inputs.purchasePrice * inputs.downPaymentPct) / 100;
  const closingCosts = (inputs.purchasePrice * inputs.closingCostsPct) / 100;
  const renovationCapex = Math.max(0, inputs.renovationCapex ?? 0);

  const totalCashInvested = Math.max(1000, downPayment + closingCosts + renovationCapex);
  const unleveredBasis = Math.max(1000, inputs.purchasePrice + closingCosts + renovationCapex);
  const loanAmount = Math.max(0, inputs.purchasePrice - downPayment);
  const ltvPct = (loanAmount / Math.max(1, inputs.purchasePrice)) * 100;
  const holdYears = Math.max(1, Math.min(30, Math.round(inputs.holdYears)));
  const ioYears = clamp(Math.round(inputs.interestOnlyYears ?? 0), 0, Math.max(0, holdYears - 1));

  const { annualDebtServices, loanBalances } = computeDebtSchedule(
    loanAmount,
    rate,
    inputs.amortizationYears,
    ioYears,
    holdYears
  );

  const recoveryPct = clamp(
    inputs.reimbursementRecoveryPct ?? profile.reimbursementRecoveryPct,
    0,
    100
  );
  const capexReservePct = clamp(
    inputs.capexReservePct ?? profile.typicalCapexReservePct,
    0,
    20
  );
  const expenseGrowthPct = inputs.expenseGrowthPct ?? 2.5;
  const depBasisPct = inputs.depreciationBasisPct ?? 75;
  const marginalTaxPct = inputs.marginalTaxRatePct ?? 35;
  const depScheduleYears = profile.category === "commercial" ? 39 : 27.5;
  const annualDepreciation =
    (inputs.purchasePrice * (depBasisPct / 100)) / depScheduleYears;
  const annualDepreciationShield = annualDepreciation * (marginalTaxPct / 100);

  const leveredCfs: number[] = [-totalCashInvested];
  const unleveredCfs: number[] = [-unleveredBasis];
  const afterTaxCfs: number[] = [-totalCashInvested];
  const yearlyCashFlows: RealEstateYearProjection[] = [];

  const baseGpr = Math.max(1, inputs.grossAnnualRent);
  const baseEffectiveRent = baseGpr * (1 - inputs.vacancyRatePct / 100);
  const baseOpex = baseEffectiveRent * (inputs.operatingExpenseRatioPct / 100);

  let currentGpr = baseGpr;
  let currentOpex = baseOpex;
  let prevLoanBal = loanAmount;

  for (let y = 1; y <= holdYears; y++) {
    if (y > 1) {
      currentGpr = currentGpr * (1 + inputs.annualRentGrowthPct / 100);
      currentOpex = currentOpex * (1 + expenseGrowthPct / 100);
    }

    const vacancyLoss = currentGpr * (inputs.vacancyRatePct / 100);
    const netRentalIncome = currentGpr - vacancyLoss;
    const reimbursements = currentOpex * (recoveryPct / 100);
    const effectiveGrossIncome = netRentalIncome + reimbursements;
    const capexReserve = netRentalIncome * (capexReservePct / 100);
    const noi = effectiveGrossIncome - currentOpex - capexReserve;

    const debtService = annualDebtServices[y - 1];
    const loanBalance = loanBalances[y - 1];
    const principalPaid = Math.max(0, prevLoanBal - loanBalance);
    const interestPaid = Math.max(0, debtService - principalPaid);
    prevLoanBal = loanBalance;

    const cashFlowBeforeTax = noi - debtService;
    const taxableIncome = noi - interestPaid - annualDepreciation;
    const taxImpact = taxableIncome * (marginalTaxPct / 100);
    const cashFlowAfterTax = cashFlowBeforeTax - taxImpact;

    // Interpolate cap rate linearly from going-in to exit cap for implied valuation path
    const impliedCap = Math.max(3.0, exitCap);
    const impliedPropertyValue = Math.max(0, (noi * (1 + inputs.annualRentGrowthPct / 100)) / (impliedCap / 100));
    const netEquity = impliedPropertyValue - loanBalance;

    leveredCfs.push(cashFlowBeforeTax);
    unleveredCfs.push(noi);
    afterTaxCfs.push(cashFlowAfterTax);

    yearlyCashFlows.push({
      year: y,
      grossPotentialRent: Math.round(currentGpr),
      vacancyLoss: Math.round(vacancyLoss),
      reimbursements: Math.round(reimbursements),
      effectiveGrossIncome: Math.round(effectiveGrossIncome),
      operatingExpenses: Math.round(currentOpex),
      capexReserve: Math.round(capexReserve),
      noi: Math.round(noi),
      debtService: Math.round(debtService),
      cashFlowBeforeTax: Math.round(cashFlowBeforeTax),
      loanBalance: Math.round(loanBalance),
      impliedPropertyValue: Math.round(impliedPropertyValue),
      netEquity: Math.round(netEquity),
    });
  }

  const lastYear = yearlyCashFlows[yearlyCashFlows.length - 1];
  const forwardExitNoi = lastYear.noi * (1 + inputs.annualRentGrowthPct / 100);
  const projectedExitValue = Math.max(0, forwardExitNoi / (exitCap / 100));
  const sellingCostPct = profile.category === "commercial" ? 0.03 : 0.04;
  const remainingBalance = loanBalances[loanBalances.length - 1] ?? 0;
  const netSaleProceedsUnlevered = projectedExitValue * (1 - sellingCostPct);
  const netSaleProceedsLevered = netSaleProceedsUnlevered - remainingBalance;

  // Approximate capital gains + depreciation recapture tax on exit (~20% blended on gain)
  const totalGain = Math.max(0, netSaleProceedsUnlevered - inputs.purchasePrice);
  const exitTax = totalGain * 0.2;

  leveredCfs[leveredCfs.length - 1] += netSaleProceedsLevered;
  unleveredCfs[unleveredCfs.length - 1] += netSaleProceedsUnlevered;
  afterTaxCfs[afterTaxCfs.length - 1] += netSaleProceedsLevered - exitTax;

  const year1 = yearlyCashFlows[0];
  const year1Noi = year1.noi;
  const annualDebtService = year1.debtService;
  const year1CashFlow = year1.cashFlowBeforeTax;

  const totalLeveredDist = leveredCfs.slice(1).reduce((s, c) => s + c, 0);
  const totalUnleveredDist = unleveredCfs.slice(1).reduce((s, c) => s + c, 0);

  const netOpexAfterReimb = Math.max(
    0,
    year1.operatingExpenses - year1.reimbursements + year1.capexReserve
  );
  const breakEvenOccupancyPct = clamp(
    ((netOpexAfterReimb + annualDebtService) / Math.max(1, year1.grossPotentialRent)) * 100,
    0,
    120
  );

  return {
    totalCashInvested,
    unleveredBasis,
    loanAmount,
    ltvPct,
    year1Noi,
    annualDebtService,
    year1CashFlow,
    goingInCapRatePct: (year1Noi / Math.max(1, inputs.purchasePrice)) * 100,
    cashOnCashPct: (year1CashFlow / totalCashInvested) * 100,
    dscr: annualDebtService > 0 ? year1Noi / annualDebtService : 9.9,
    debtYieldPct: loanAmount > 0 ? (year1Noi / loanAmount) * 100 : 99,
    breakEvenOccupancyPct,
    grossRentMultiplier: inputs.purchasePrice / Math.max(1, inputs.grossAnnualRent),
    projectedExitValue,
    remainingBalance,
    leveredIrrPct: solveIrr(leveredCfs),
    unleveredIrrPct: solveIrr(unleveredCfs),
    afterTaxIrrPct: solveIrr(afterTaxCfs),
    annualDepreciationShield,
    equityMultiple: totalLeveredDist / totalCashInvested,
    unleveredEquityMultiple: totalUnleveredDist / unleveredBasis,
    yearlyCashFlows,
  };
}

function buildCovenantChecks(
  core: CoreEvalResult,
  profile: RealEstateClassProfile
): RealEstateCovenantCheck[] {
  const checks: RealEstateCovenantCheck[] = [];

  // 1. DSCR Check
  const minDscr = profile.minLenderDscr;
  checks.push({
    name: "Debt Service Coverage (DSCR)",
    limit: `≥ ${minDscr.toFixed(2)}x`,
    actual: `${round(core.dscr, 2)}x`,
    status:
      core.dscr >= minDscr
        ? "PASS"
        : core.dscr >= minDscr - 0.15
        ? "WARN"
        : "BREACH",
    detail:
      core.dscr >= minDscr
        ? "Comfortable debt service cushion for institutional refinancing."
        : "Tight debt coverage; a +75bps rate shock could trigger cash-trap or equity paydown.",
  });

  // 2. Debt Yield Check
  const minDy = profile.minDebtYieldPct;
  checks.push({
    name: "Lender Debt Yield (NOI / Loan)",
    limit: `≥ ${minDy.toFixed(1)}%`,
    actual: `${round(core.debtYieldPct, 2)}%`,
    status:
      core.debtYieldPct >= minDy
        ? "PASS"
        : core.debtYieldPct >= minDy - 1.0
        ? "WARN"
        : "BREACH",
    detail:
      core.debtYieldPct >= minDy
        ? "Meets senior CMBS / bank underwriting debt yield hurdle."
        : "Below typical senior lender debt yield; proceeds may be sized down.",
  });

  // 3. LTV Limit
  const maxLtv = profile.category === "commercial" ? 70 : 80;
  checks.push({
    name: "Loan-to-Value (LTV)",
    limit: `≤ ${maxLtv}%`,
    actual: `${round(core.ltvPct, 1)}%`,
    status:
      core.ltvPct <= maxLtv
        ? "PASS"
        : core.ltvPct <= maxLtv + 5
        ? "WARN"
        : "BREACH",
    detail:
      core.ltvPct <= maxLtv
        ? `Within ${profile.category} leverage ceiling.`
        : "Elevated leverage requires mezzanine debt or higher equity check.",
  });

  // 4. Break-Even Occupancy
  checks.push({
    name: "Break-Even Occupancy",
    limit: "≤ 85.0%",
    actual: `${round(core.breakEvenOccupancyPct, 1)}%`,
    status:
      core.breakEvenOccupancyPct <= 82
        ? "PASS"
        : core.breakEvenOccupancyPct <= 88
        ? "WARN"
        : "BREACH",
    detail:
      core.breakEvenOccupancyPct <= 82
        ? "Strong downside occupancy buffer before negative cash flow."
        : "Limited vacancy cushion; monitor local supply pipeline closely.",
  });

  return checks;
}

/**
 * Compares all 10 Residential & Commercial property classes inside a selected market
 */
export function compareRealEstateClasses(
  marketId: string,
  rateOffsetPct = 0
): RealEstateClassComparisonItem[] {
  const market = getRealEstateMarket(marketId);

  return REAL_ESTATE_CLASSES.map((profile) => {
    const preset = buildRealEstatePresetInputs(profile.id, market.id);
    const adjusted: RealEstateInputs = {
      ...preset,
      mortgageRatePct: clamp(preset.mortgageRatePct + rateOffsetPct, 2.5, 11.0),
    };
    const core = evaluateRealEstateCore(adjusted, profile);

    // Risk-adjusted score (0-100): balances Levered IRR, DSCR safety, Cash-on-Cash, Liquidity & Volatility
    const irrScore = clamp((core.leveredIrrPct / 18) * 40, 0, 42);
    const dscrScore = clamp(((core.dscr - 0.9) / 0.7) * 24, 0, 24);
    const cocScore = clamp(((core.cashOnCashPct + 2) / 10) * 18, 0, 18);
    const volPenalty = clamp((profile.volatilityPct - 11) * 0.9, 0, 12);
    const liqBonus = (profile.liquidityScore / 100) * 16;
    const riskAdjustedScore = Math.round(
      clamp(irrScore + dscrScore + cocScore + liqBonus - volPenalty, 15, 98)
    );

    const verdict: RealEstateClassComparisonItem["verdict"] =
      riskAdjustedScore >= 72
        ? "Attractive"
        : riskAdjustedScore >= 56
        ? "Core Hold"
        : "Watch / Tight";

    return {
      propertyClass: profile.id,
      label: profile.label,
      shortLabel: profile.shortLabel,
      category: profile.category,
      leaseStructure: profile.defaultLeaseStructure,
      goingInCapRatePct: round(core.goingInCapRatePct, 2),
      cashOnCashPct: round(core.cashOnCashPct, 2),
      dscr: round(core.dscr, 2),
      debtYieldPct: round(core.debtYieldPct, 2),
      leveredIrrPct: round(core.leveredIrrPct, 1),
      unleveredIrrPct: round(core.unleveredIrrPct, 1),
      equityMultiple: round(core.equityMultiple, 2),
      volatilityPct: profile.volatilityPct,
      riskAdjustedScore,
      managementIntensity: profile.managementIntensity,
      verdict,
    };
  }).sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore);
}

/**
 * Compares all 10 North American & Global markets for a selected property class
 */
export function compareRealEstateMarkets(
  propertyClass: RealEstatePropertyClass,
  rateOffsetPct = 0
): RealEstateMarketComparisonItem[] {
  const profile = getRealEstateClass(propertyClass);

  return REAL_ESTATE_MARKETS.map((market) => {
    const preset = buildRealEstatePresetInputs(profile.id, market.id);
    const adjusted: RealEstateInputs = {
      ...preset,
      mortgageRatePct: clamp(preset.mortgageRatePct + rateOffsetPct, 2.5, 11.0),
    };
    const core = evaluateRealEstateCore(adjusted, profile);

    const irrComponent = clamp((core.leveredIrrPct / 17) * 35, 0, 36);
    const dscrComponent = clamp(((core.dscr - 0.95) / 0.65) * 20, 0, 20);
    const macroComponent = (market.macroScore / 100) * 30;
    const supplyPenalty = clamp((market.supplyPipelinePct - 3.5) * 2.5, 0, 10);
    const landlordBonus = (market.landlordFriendlyScore / 100) * 14;
    const compositeScore = Math.round(
      clamp(
        irrComponent + dscrComponent + macroComponent + landlordBonus - supplyPenalty,
        20,
        98
      )
    );

    const verdict: RealEstateMarketComparisonItem["verdict"] =
      compositeScore >= 76
        ? "Top Pick"
        : compositeScore >= 63
        ? "Balanced"
        : "Yield-Constrained";

    return {
      marketId: market.id,
      marketName: market.name,
      region: market.region,
      tier: market.tier,
      populationGrowthPct: market.populationGrowthPct,
      jobGrowthPct: market.jobGrowthPct,
      supplyPipelinePct: market.supplyPipelinePct,
      rentControlRisk: market.rentControlRisk,
      benchmarkCapRatePct: getBenchmarkCapRatePct(market, profile),
      projectedRentGrowthPct: preset.annualRentGrowthPct,
      cashOnCashPct: round(core.cashOnCashPct, 2),
      dscr: round(core.dscr, 2),
      leveredIrrPct: round(core.leveredIrrPct, 1),
      compositeScore,
      verdict,
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Synthesizes Residential vs. Commercial averages and allocation tilt
 */
export function summarizeResidentialVsCommercial(
  classComparison: RealEstateClassComparisonItem[],
  market: RealEstateMarketBenchmark
): ResidentialVsCommercialSummary {
  const resi = classComparison.filter((c) => c.category === "residential");
  const comm = classComparison.filter((c) => c.category === "commercial");

  const avg = (items: RealEstateClassComparisonItem[], fn: (x: RealEstateClassComparisonItem) => number) =>
    items.length > 0 ? items.reduce((s, x) => s + fn(x), 0) / items.length : 0;

  const residentialAvgCapPct = round(avg(resi, (x) => x.goingInCapRatePct), 2);
  const commercialAvgCapPct = round(avg(comm, (x) => x.goingInCapRatePct), 2);
  const residentialAvgIrrPct = round(avg(resi, (x) => x.leveredIrrPct), 1);
  const commercialAvgIrrPct = round(avg(comm, (x) => x.leveredIrrPct), 1);
  const residentialAvgDscr = round(avg(resi, (x) => x.dscr), 2);
  const commercialAvgDscr = round(avg(comm, (x) => x.dscr), 2);
  const residentialAvgCoCPct = round(avg(resi, (x) => x.cashOnCashPct), 2);
  const commercialAvgCoCPct = round(avg(comm, (x) => x.cashOnCashPct), 2);

  let recommendedTilt: ResidentialVsCommercialSummary["recommendedTilt"] = "Barbell 50/50";
  let rationale = `In ${market.name}, a 50/50 Barbell pairs Residential financing liquidity (${residentialAvgIrrPct}% avg IRR) with Commercial NNN yield (${commercialAvgCapPct}% avg Cap Rate).`;

  if (commercialAvgIrrPct > residentialAvgIrrPct + 1.4 && commercialAvgDscr >= 1.2) {
    recommendedTilt = "Commercial Yield";
    rationale = `Commercial classes in ${market.name} offer a +${round(
      commercialAvgCapPct - residentialAvgCapPct,
      2
    )}% Cap Rate premium and NNN inflation pass-through (${commercialAvgIrrPct}% avg IRR vs. ${residentialAvgIrrPct}% Residential).`;
  } else if (residentialAvgIrrPct > commercialAvgIrrPct + 1.4) {
    recommendedTilt = "Residential Core";
    rationale = `Residential classes in ${market.name} outperform on levered IRR (${residentialAvgIrrPct}% vs. ${commercialAvgIrrPct}%) aided by higher LTV residential debt and lower vacancy.`;
  }

  return {
    residentialAvgCapPct,
    commercialAvgCapPct,
    residentialAvgIrrPct,
    commercialAvgIrrPct,
    residentialAvgDscr,
    commercialAvgDscr,
    residentialAvgCoCPct,
    commercialAvgCoCPct,
    recommendedTilt,
    rationale,
  };
}

/**
 * Master Deterministic Real Estate Analysis Engine:
 * Pro Forma + Lender Covenants + Sensitivity Grid + Cross-Class & Cross-Market Evaluation
 */
export function analyzeRealEstateDeal(
  inputs: RealEstateInputs,
  options?: { includeComparisons?: boolean }
): RealEstateValuationResult {
  const profile = getRealEstateClass(inputs.propertyClass);
  const market = getRealEstateMarket(inputs.marketId);
  const category: RealEstateCategory = inputs.category ?? profile.category;
  const leaseStructure: RealEstateLeaseStructure =
    inputs.leaseStructure ?? profile.defaultLeaseStructure;
  const unitsOrSqft = Math.max(1, inputs.unitsOrSqft ?? profile.defaultUnitsOrSqft);

  const base = evaluateRealEstateCore(inputs, profile);
  const benchmarkCapRatePct = getBenchmarkCapRatePct(market, profile);
  const capRateSpreadToBenchmarkBps = Math.round(
    (base.goingInCapRatePct - benchmarkCapRatePct) * 100
  );
  const capRateSpreadToRiskFreeBps = Math.round(
    (base.goingInCapRatePct - RISK_FREE_10Y_PCT) * 100
  );

  const rateSteps = [-1.0, 0, 1.0].map((d) =>
    round(Math.max(2.0, inputs.mortgageRatePct + d), 2)
  );
  const exitCapSteps = [-0.75, 0, 0.75].map((d) =>
    round(Math.max(3.0, inputs.exitCapRatePct + d), 2)
  );

  const sensitivityGrid: RealEstateSensitivityCell[] = [];
  for (const r of rateSteps) {
    for (const c of exitCapSteps) {
      const res = evaluateRealEstateCore(inputs, profile, r, c);
      sensitivityGrid.push({
        mortgageRatePct: r,
        exitCapRatePct: c,
        leveredIrrPct: round(res.leveredIrrPct, 1),
        cashOnCashPct: round(res.cashOnCashPct, 1),
      });
    }
  }

  const lenderCovenantChecks = buildCovenantChecks(base, profile);

  const includeComparisons = options?.includeComparisons ?? true;
  const classComparison = includeComparisons
    ? compareRealEstateClasses(market.id)
    : undefined;
  const marketComparison = includeComparisons
    ? compareRealEstateMarkets(profile.id)
    : undefined;
  const residentialVsCommercial =
    classComparison ? summarizeResidentialVsCommercial(classComparison, market) : undefined;

  return {
    propertyName: inputs.propertyName,
    category,
    propertyClass: profile.id,
    propertyClassLabel: profile.label,
    marketId: market.id,
    marketName: market.name,
    leaseStructure,
    unitsOrSqft,
    unitLabel: profile.unitLabel,
    totalCashInvested: Math.round(base.totalCashInvested),
    loanAmount: Math.round(base.loanAmount),
    ltvPct: round(base.ltvPct, 1),
    year1Noi: Math.round(base.year1Noi),
    annualDebtService: Math.round(base.annualDebtService),
    year1CashFlow: Math.round(base.year1CashFlow),
    goingInCapRatePct: round(base.goingInCapRatePct, 2),
    benchmarkCapRatePct,
    capRateSpreadToBenchmarkBps,
    capRateSpreadToRiskFreeBps,
    cashOnCashPct: round(base.cashOnCashPct, 2),
    dscr: round(base.dscr, 2),
    debtYieldPct: round(base.debtYieldPct, 2),
    breakEvenOccupancyPct: round(base.breakEvenOccupancyPct, 1),
    grossRentMultiplier: round(base.grossRentMultiplier, 1),
    pricePerUnitOrSqft: Math.round(inputs.purchasePrice / unitsOrSqft),
    noiPerUnitOrSqft: round(base.year1Noi / unitsOrSqft, 2),
    projectedExitValue: Math.round(base.projectedExitValue),
    remainingLoanAtExit: Math.round(base.remainingBalance),
    leveredIrrPct: round(base.leveredIrrPct, 1),
    unleveredIrrPct: round(base.unleveredIrrPct, 1),
    afterTaxIrrPct: round(base.afterTaxIrrPct, 1),
    annualDepreciationShield: Math.round(base.annualDepreciationShield),
    equityMultiple: round(base.equityMultiple, 2),
    unleveredEquityMultiple: round(base.unleveredEquityMultiple, 2),
    yearlyCashFlows: base.yearlyCashFlows,
    lenderCovenantChecks,
    sensitivityGrid,
    classComparison,
    marketComparison,
    residentialVsCommercial,
  };
}
