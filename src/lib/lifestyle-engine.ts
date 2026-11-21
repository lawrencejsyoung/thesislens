import {
  DemographicId,
  LifestylePlanInputs,
  LifestylePlanResult,
  MilestoneFundingStatus,
  PlanningJurisdiction,
  ReadinessPillar,
  RiskChecklistItem,
  RiskProfile,
  StressTestScenario,
  TaxWaterfallStep,
  YearlyProjectionPoint,
} from "./lifestyle-types";

const RISK_PARAMS: Record<RiskProfile, { expectedReturn: number; volatility: number }> = {
  conservative: { expectedReturn: 0.048, volatility: 0.07 },
  balanced: { expectedReturn: 0.064, volatility: 0.11 },
  growth: { expectedReturn: 0.076, volatility: 0.145 },
  aggressive: { expectedReturn: 0.088, volatility: 0.18 },
};

/** Deterministic seeded PRNG (Mulberry32) */
function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller standard normal draw */
function nextNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Estimate effective tax rate based on income, jurisdiction, household split, and entity type */
export function estimateEffectiveTaxRate(
  grossIncome: number,
  jurisdiction: PlanningJurisdiction,
  demographic: DemographicId,
  hasPartnerIncome: boolean
): number {
  if (grossIncome <= 0) return 0;

  // Split income roughly across two taxpayers if dual-income or couple/retiree/hnw
  const effectiveTaxable = hasPartnerIncome ? grossIncome * 0.58 : grossIncome;

  let baseRate = 0.22;
  if (jurisdiction === "Canada") {
    if (effectiveTaxable < 60000) baseRate = 0.17;
    else if (effectiveTaxable < 110000) baseRate = 0.24;
    else if (effectiveTaxable < 180000) baseRate = 0.31;
    else if (effectiveTaxable < 260000) baseRate = 0.37;
    else baseRate = 0.43;
  } else {
    // United States (Federal + avg state + FICA)
    if (effectiveTaxable < 65000) baseRate = 0.16;
    else if (effectiveTaxable < 130000) baseRate = 0.22;
    else if (effectiveTaxable < 220000) baseRate = 0.28;
    else if (effectiveTaxable < 400000) baseRate = 0.33;
    else baseRate = 0.38;
  }

  // Corporate / MPC tax deferral benefit for Business Owners & Physicians
  if (demographic === "business_owner") {
    baseRate = Math.max(0.16, baseRate - 0.055);
  } else if (demographic === "doctor") {
    baseRate = Math.max(0.18, baseRate - 0.045);
  } else if (demographic === "retiree") {
    baseRate = Math.max(0.11, baseRate - 0.05);
  }

  return Number(Math.min(0.49, Math.max(0.08, baseRate)).toFixed(4));
}

interface SimOverrides {
  returnShockFirstTwoRetirementYears?: number; // e.g., -0.22
  inflationDelta?: number; // e.g., +0.015
  extraLifeYears?: number; // e.g., +5
  retirementAgeDelta?: number; // e.g., -3
  spendMultiplier?: number; // e.g., 1.15
  incomeShockPct?: number; // e.g., -0.25 for 3 years
  exitHaircutPct?: number; // e.g., 0.30 reduction on inflow milestones
  initialPortfolioShockPct?: number; // e.g., -0.20 concentrated stock shock
}

interface CoreSimOutput {
  successRatePct: number;
  terminalMedianLiquid: number;
  p10ByYear: number[];
  p50ByYear: number[];
  p90ByYear: number[];
  yearlyDeterministic: YearlyProjectionPoint[];
  fiAge: number | null;
}

function runCoreSimulation(
  inputs: LifestylePlanInputs,
  overrides: SimOverrides = {},
  numPaths = 400
): CoreSimOutput {
  const currentYear = new Date().getFullYear();
  const startAge = Math.max(18, Math.min(90, Math.round(inputs.currentAge)));
  const retirementAge = Math.max(
    startAge,
    Math.min(85, Math.round(inputs.retirementAge + (overrides.retirementAgeDelta ?? 0)))
  );
  const lifeExpectancy = Math.max(
    startAge + 8,
    Math.min(105, Math.round(inputs.lifeExpectancy + (overrides.extraLifeYears ?? 0)))
  );
  const horizonYears = lifeExpectancy - startAge + 1;

  const { expectedReturn, volatility } = RISK_PARAMS[inputs.riskProfile];
  const inflation = Math.max(
    0.005,
    inputs.inflationRatePct / 100 + (overrides.inflationDelta ?? 0)
  );
  const incomeGrowth = inputs.annualIncomeGrowthPct / 100;
  const spendMult = overrides.spendMultiplier ?? 1.0;

  const initialLiquid =
    Math.max(
      0,
      inputs.taxDeferredAssets +
        inputs.taxFreeAssets +
        inputs.taxableAndCorpAssets +
        inputs.cashEmergencyFund
    ) *
    (1 + (overrides.initialPortfolioShockPct ?? 0));

  const initialIlliquid = Math.max(0, inputs.illiquidEquityAssets);
  const hasPartner = inputs.partnerIncome > 0 || Boolean(inputs.partnerAge);

  const basePreRetireSpend =
    (inputs.essentialAnnualSpend +
      inputs.discretionaryAnnualSpend +
      inputs.healthcareAnnualSpend) *
    spendMult;

  const retireRatio = Math.max(0.45, Math.min(1.25, inputs.retirementSpendRatioPct / 100));
  const govPensionStartAge = inputs.specifics.govPensionStartAge ?? 65;
  const govPensionBase = inputs.specifics.govPensionAnnual ?? (hasPartner ? 42000 : 22000);

  // Build yearly deterministic cash flows & milestone map
  const yearlyNetFlows: number[] = [];
  const yearlyDeterministic: YearlyProjectionPoint[] = [];

  let detLiquid = initialLiquid;
  let detIlliquid = initialIlliquid;
  let fiAge: number | null = null;

  for (let i = 0; i < horizonYears; i++) {
    const age = startAge + i;
    const year = currentYear + i;
    const infFactor = Math.pow(1 + inflation, i);
    const isRetired = age >= retirementAge;

    // Phase classification
    let phase: YearlyProjectionPoint["phase"] = "Accumulation";
    if (!isRetired && retirementAge - age <= 3 && retirementAge > startAge) {
      phase = "Transition";
    } else if (isRetired) {
      const yrsInRet = age - retirementAge;
      if (yrsInRet < 10) phase = "Go-Go Retirement";
      else if (yrsInRet < 20) phase = "Slow-Go Retirement";
      else phase = "No-Go / Care";
    }

    // Gross Income
    let grossIncome = 0;
    if (!isRetired) {
      const growthFactor = Math.pow(1 + incomeGrowth, i);
      let activeIncome = (inputs.primaryIncome + inputs.partnerIncome) * growthFactor;
      // Optional physician part-time transition
      if (
        inputs.demographic === "doctor" &&
        inputs.specifics.partTimeTransitionAge &&
        age >= inputs.specifics.partTimeTransitionAge
      ) {
        activeIncome *= 0.65;
      }
      // Optional income shock stress test (first 3 working years)
      if (overrides.incomeShockPct && i < 3) {
        activeIncome *= 1 + overrides.incomeShockPct;
      }
      grossIncome = activeIncome + inputs.passiveOrBusinessIncome * infFactor;
    } else {
      // Retired: passive income (reduced if business exited) + Gov pensions
      const bizExited =
        inputs.demographic === "business_owner" &&
        inputs.specifics.businessExitAge &&
        age >= inputs.specifics.businessExitAge;
      const ongoingPassive = bizExited
        ? inputs.passiveOrBusinessIncome * 0.15 * infFactor
        : inputs.passiveOrBusinessIncome * 0.45 * infFactor;
      const pension = age >= govPensionStartAge ? govPensionBase * infFactor : 0;
      grossIncome = ongoingPassive + pension;
    }

    const effTax = estimateEffectiveTaxRate(
      grossIncome,
      inputs.jurisdiction,
      inputs.demographic,
      hasPartner
    );
    const estimatedTax = grossIncome * effTax;
    const netIncome = grossIncome - estimatedTax;

    // Spending with Retirement Spending Smile & Healthcare Escalation
    let lifestyleSpend = 0;
    if (!isRetired) {
      const debtPart = age < retirementAge - 2 ? inputs.annualDebtService : inputs.annualDebtService * 0.4;
      lifestyleSpend = basePreRetireSpend * infFactor + debtPart;
    } else {
      const yrsInRet = age - retirementAge;
      let smileMult = 1.0;
      if (yrsInRet >= 10 && yrsInRet < 20) smileMult = 0.91;
      else if (yrsInRet >= 20) smileMult = 0.87;
      // Healthcare grows ~1.5% faster than CPI in late life
      const extraHealthcare =
        inputs.healthcareAnnualSpend *
        (Math.pow(1 + inflation + 0.015, i) - infFactor);
      lifestyleSpend = basePreRetireSpend * retireRatio * smileMult * infFactor + Math.max(0, extraHealthcare);
    }

    // Milestones active at this age
    let milestoneCashFlow = 0; // positive = outflow, negative = inflow
    const milestoneLabels: string[] = [];
    for (const m of inputs.milestones) {
      if (!m.enabled) continue;
      const dur = Math.max(1, m.durationYears ?? 1);
      if (age >= m.age && age < m.age + dur) {
        let amt = m.amount * infFactor;
        if (amt < 0 && overrides.exitHaircutPct) {
          amt = amt * (1 - overrides.exitHaircutPct);
        }
        milestoneCashFlow += amt;
        milestoneLabels.push(m.title);
      }
    }

    // Net contribution (+) or portfolio withdrawal (-)
    let netFlow = 0;
    if (!isRetired) {
      // Use explicit savings contribution scaled by income growth, adjusted for milestones
      const baseSavings = inputs.annualSavingsContribution * Math.pow(1 + Math.min(incomeGrowth, 0.035), i);
      const surplus = Math.max(0, netIncome - lifestyleSpend);
      const plannedSavings = Math.min(Math.max(baseSavings, surplus * 0.75), Math.max(surplus, baseSavings * 0.85));
      netFlow = plannedSavings - milestoneCashFlow;
    } else {
      // Must withdraw shortfall from portfolio + gross up slightly for withdrawal taxes (~14% blended)
      const cashShortfall = lifestyleSpend + milestoneCashFlow - netIncome;
      if (cashShortfall > 0) {
        const blendedWithdrawalTax = inputs.demographic === "hnw_family" ? 0.18 : 0.13;
        netFlow = -(cashShortfall / (1 - blendedWithdrawalTax));
      } else {
        netFlow = -cashShortfall; // Positive surplus saved
      }
    }

    yearlyNetFlows.push(netFlow);

    // Deterministic liquid evolution
    let detReturn = expectedReturn;
    if (
      overrides.returnShockFirstTwoRetirementYears &&
      age >= retirementAge &&
      age < retirementAge + 2
    ) {
      detReturn = overrides.returnShockFirstTwoRetirementYears;
    }
    detLiquid = Math.max(0, detLiquid * (1 + detReturn) + netFlow);

    // Illiquid assets grow modestly (real estate / business appreciation), drop on business exit inflow
    const hasMajorInflow = milestoneCashFlow < -250000;
    if (hasMajorInflow) {
      detIlliquid = Math.max(0, detIlliquid - Math.abs(milestoneCashFlow) * 0.85);
    } else {
      detIlliquid = detIlliquid * (1 + Math.max(0.02, inflation + 0.012));
    }

    // Check FI Age (when liquid portfolio alone can sustain 25x retirement net spend shortfall)
    const targetRetireSpendToday = basePreRetireSpend * retireRatio * infFactor;
    const estPensionAtRetire = govPensionBase * infFactor;
    const requiredPortfolioForFI = Math.max(0, (targetRetireSpendToday - estPensionAtRetire * 0.7) * 25);
    if (fiAge === null && detLiquid >= requiredPortfolioForFI && requiredPortfolioForFI > 0) {
      fiAge = age;
    }

    yearlyDeterministic.push({
      year,
      age,
      phase,
      grossIncome: Math.round(grossIncome),
      estimatedTax: Math.round(estimatedTax),
      netIncome: Math.round(netIncome),
      lifestyleSpend: Math.round(lifestyleSpend),
      milestoneCashFlow: Math.round(milestoneCashFlow),
      netSavingsOrWithdrawal: Math.round(netFlow),
      liquidPortfolio: Math.round(detLiquid),
      illiquidAssets: Math.round(detIlliquid),
      totalNetWorth: Math.round(detLiquid + detIlliquid),
      p10Portfolio: 0,
      p50Portfolio: 0,
      p90Portfolio: 0,
      milestoneLabels,
    });
  }

  // Monte Carlo Simulation (numPaths deterministic seeded paths)
  const rng = createSeededRng(42026 + Math.round(initialLiquid % 10000) + startAge * 31);
  const pathValuesByYear: number[][] = Array.from({ length: horizonYears }, () =>
    new Array(numPaths)
  );
  let successCount = 0;

  for (let p = 0; p < numPaths; p++) {
    let wealth = initialLiquid;
    let depleted = false;

    for (let i = 0; i < horizonYears; i++) {
      const age = startAge + i;
      const z = nextNormal(rng);
      // Lognormal-style annual return with mild fat-tail clipping
      let annualRet = expectedReturn - 0.5 * volatility * volatility + volatility * z;
      annualRet = Math.max(-0.42, Math.min(0.45, annualRet));

      if (
        overrides.returnShockFirstTwoRetirementYears &&
        age >= retirementAge &&
        age < retirementAge + 2
      ) {
        annualRet = overrides.returnShockFirstTwoRetirementYears + z * 0.04;
      }

      wealth = wealth * (1 + annualRet) + yearlyNetFlows[i];
      if (wealth < 0) {
        wealth = 0;
        depleted = true;
      }
      pathValuesByYear[i][p] = wealth;
    }

    if (!depleted && wealth > 0) {
      successCount++;
    }
  }

  const p10ByYear: number[] = [];
  const p50ByYear: number[] = [];
  const p90ByYear: number[] = [];

  for (let i = 0; i < horizonYears; i++) {
    const sorted = pathValuesByYear[i].slice().sort((a, b) => a - b);
    const p10 = Math.round(sorted[Math.floor(numPaths * 0.1)]);
    const p50 = Math.round(sorted[Math.floor(numPaths * 0.5)]);
    const p90 = Math.round(sorted[Math.floor(numPaths * 0.9)]);
    p10ByYear.push(p10);
    p50ByYear.push(p50);
    p90ByYear.push(p90);
    yearlyDeterministic[i].p10Portfolio = p10;
    yearlyDeterministic[i].p50Portfolio = p50;
    yearlyDeterministic[i].p90Portfolio = p90;
  }

  const successRatePct = Number(((successCount / numPaths) * 100).toFixed(1));
  const terminalMedianLiquid = p50ByYear[horizonYears - 1] ?? 0;

  return {
    successRatePct,
    terminalMedianLiquid,
    p10ByYear,
    p50ByYear,
    p90ByYear,
    yearlyDeterministic,
    fiAge,
  };
}

/** Binary search for sustainable annual lifestyle spend at >= 85% Monte Carlo confidence */
function findSafeLifestyleSpend(inputs: LifestylePlanInputs): number {
  const currentTotalSpend =
    inputs.essentialAnnualSpend +
    inputs.discretionaryAnnualSpend +
    inputs.healthcareAnnualSpend;
  if (currentTotalSpend <= 0) return 0;

  let low = 0.45;
  let high = 1.85;
  let bestMult = low;

  for (let iter = 0; iter < 8; iter++) {
    const mid = (low + high) / 2;
    const sim = runCoreSimulation(inputs, { spendMultiplier: mid }, 140);
    if (sim.successRatePct >= 85) {
      bestMult = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  return Math.round(currentTotalSpend * bestMult);
}

/** Build jurisdiction + demographic tailored tax-smart contribution & withdrawal waterfall */
function buildTaxWaterfall(
  demographic: DemographicId,
  jurisdiction: PlanningJurisdiction
): { accumulationOrder: TaxWaterfallStep[]; decumulationOrder: TaxWaterfallStep[] } {
  const isCanada = jurisdiction === "Canada";

  if (demographic === "business_owner") {
    return {
      accumulationOrder: isCanada
        ? [
            { order: 1, vehicle: "Optimal Salary to Max RRSP / CPP Room", role: "Base Draw", rationale: "Generates earned income for RRSP/IPP room while keeping personal tax below top marginal bracket." },
            { order: 2, vehicle: "Individual Pension Plan (IPP)", role: "Corporate Deduction", rationale: "Allows higher tax-deductible corporate contributions than RRSP for owners age 40+ with creditor protection." },
            { order: 3, vehicle: "TFSA (Personal & Spousal)", role: "Tax-Free Growth", rationale: "Tax-free compounding and flexible liquidity without triggering OAS clawback in retirement." },
            { order: 4, vehicle: "OpCo / HoldCo Retained Earnings Portfolio", role: "Tax Deferral", rationale: "Invest low-taxed corporate dollars (~12.2% small business rate); monitor $50K passive income grind." },
            { order: 5, vehicle: "Corporate-Owned Permanent Insurance (CDA)", role: "Estate & Tax-Free Exit", rationale: "Shelters passive growth from the small business grind and creates tax-free Capital Dividend Account credit." },
          ]
        : [
            { order: 1, vehicle: "Solo 401(k) + Cash Balance Pension Plan", role: "Max Pre-Tax Shelter", rationale: "Enables $69K–$250K+ annual deductible contributions depending on owner age." },
            { order: 2, vehicle: "HSA (Triple Tax-Advantaged)", role: "Healthcare Reserve", rationale: "Tax-deductible in, tax-free growth, tax-free medical withdrawals in retirement." },
            { order: 3, vehicle: "Backdoor / Mega-Backdoor Roth", role: "Tax-Free Bucket", rationale: "Builds tax-free retirement flexibility to hedge future federal rate hikes." },
            { order: 4, vehicle: "QSBS-Eligible Equity & Taxable Brokerage", role: "Exit Tax Shield", rationale: "Structure C-Corp shares for Section 1202 exclusion (up to $10M+ federal capital gains exemption)." },
          ],
      decumulationOrder: isCanada
        ? [
            { order: 1, vehicle: "Capital Dividend Account (CDA) & Shareholder Loan", role: "0% Tax Draw", rationale: "Extract tax-free corporate balances first post-exit." },
            { order: 2, vehicle: "Corporate Non-Eligible / Eligible Dividends", role: "Bracket Fill", rationale: "Smooth corporate surplus extraction while recovering Refundable Dividend Tax on Hand (RDTOH)." },
            { order: 3, vehicle: "RRSP / IPP Early Meltdown (Age 60–71)", role: "Tax Smoothing", rationale: "Avoid OAS clawback and large terminal tax bill on estate." },
            { order: 4, vehicle: "TFSA Top-Up Draws", role: "Clawback Shield", rationale: "Fund lumpy lifestyle expenses without increasing taxable income." },
          ]
        : [
            { order: 1, vehicle: "Taxable Brokerage (Long-Term Cap Gains)", role: "0%–15% Bracket Fill", rationale: "Harvest low-rate capital gains while letting tax-advantaged buckets compound." },
            { order: 2, vehicle: "Strategic Roth Conversions (Gap Years)", role: "RMD Reduction", rationale: "Fill 22%–24% brackets before Social Security and RMDs begin." },
            { order: 3, vehicle: "401(k) / Cash Balance Distributions", role: "Core Income", rationale: "Coordinate with delayed Social Security at age 70." },
            { order: 4, vehicle: "Roth IRA & HSA", role: "Late-Life & Legacy", rationale: "Preserve tax-free assets for late-life healthcare and heirs." },
          ],
    };
  }

  if (demographic === "doctor") {
    return {
      accumulationOrder: isCanada
        ? [
            { order: 1, vehicle: "High-Interest Med Debt & Own-Occ Disability", role: "Foundation", rationale: "Protect clinical earning power first; attack non-deductible debt above 6%." },
            { order: 2, vehicle: "TFSA & Spousal TFSA", role: "Tax-Free Flexibility", rationale: "Liquid tax-free reserve for clinic buy-in or parental/sabbatical leave." },
            { order: 3, vehicle: "Medical Professional Corp (MPC) Retained Earnings", role: "Primary Tax Deferral", rationale: "Defer ~40% upfront tax by leaving surplus clinical billings inside the MPC." },
            { order: 4, vehicle: "RRSP / IPP (Targeted Salary Mix)", role: "Creditor-Protected Pension", rationale: "Pay enough T4 salary to unlock RRSP/IPP room for creditor-protected retirement compounding." },
          ]
        : [
            { order: 1, vehicle: "401(k) / 403(b) + 457(b) Governmental Match", role: "High-Bracket Deduction", rationale: "Immediately shelter $23K–$46K+ at 35%–37% marginal federal + state rates." },
            { order: 2, vehicle: "HSA + Backdoor Roth IRA", role: "Tax-Free Core", rationale: "Bypass Roth income limits via clean non-deductible Traditional IRA conversion (watch pro-rata rule)." },
            { order: 3, vehicle: "Cash Balance / Defined Benefit Practice Plan", role: "Partner Acceleration", rationale: "Catch up for late medical training start with $100K+ annual pre-tax contributions." },
            { order: 4, vehicle: "Taxable Brokerage (Direct Indexing / Munis)", role: "Tax-Alpha Liquidity", rationale: "Build bridge liquidity for early part-time/locum clinical step-down." },
          ],
      decumulationOrder: isCanada
        ? [
            { order: 1, vehicle: "MPC Dividends (Age 55–65 Clinical Step-Down)", role: "Bridge Income", rationale: "Draw dividends in lower personal brackets during locum/early retirement years." },
            { order: 2, vehicle: "RRSP / RRIF Meltdown + Income Splitting at 65", role: "Bracket Optimization", rationale: "Split eligible pension income with spouse to halve marginal rates." },
            { order: 3, vehicle: "CPP / OAS Deferral to Age 70", role: "Longevity Hedge", rationale: "Lock in +42% inflation-indexed government pension boost." },
            { order: 4, vehicle: "TFSA & Corporate CDA", role: "Tax-Free Buffer", rationale: "Cover travel spikes and late-life care without triggering OAS recovery tax." },
          ]
        : [
            { order: 1, vehicle: "Taxable Brokerage & Tax-Loss Harvested Lots", role: "Bridge Years", rationale: "Fund part-time transition at favorable long-term capital gains rates." },
            { order: 2, vehicle: "Roth Conversion Ladder (Pre-Age 73)", role: "Tax Bracket Control", rationale: "Defuse future RMD tax bomb and IRMAA Medicare surcharges." },
            { order: 3, vehicle: "401(k) / Defined Benefit Pension", role: "Core Retirement", rationale: "Pair with delayed Social Security for inflation-protected floor." },
            { order: 4, vehicle: "Roth IRA & HSA", role: "Healthcare & Estate", rationale: "Tax-free late-life medical spending and heir distribution." },
          ],
    };
  }

  if (demographic === "executive") {
    return {
      accumulationOrder: [
        { order: 1, vehicle: isCanada ? "Max RRSP + Employer Match" : "Max 401(k) + Mega-Backdoor Roth", role: "Base Shelter", rationale: "Capture full corporate match and lower peak executive W-2/T4 marginal tax." },
        { order: 2, vehicle: "Automated RSU Diversification (10b5-1)", role: "De-Risking", rationale: "Sell RSUs immediately upon vest (zero extra gain) to cap single-stock exposure below 15%." },
        { order: 3, vehicle: isCanada ? "TFSA + Tax-Loss Harvested Non-Reg" : "HSA + Donor-Advised Fund (Appreciated Shares)", role: "Tax Alpha", rationale: "Donate lowest-basis employer shares to DAF to eliminate capital gains tax." },
        { order: 4, vehicle: "Non-Qualified Deferred Comp / Exchange Fund", role: "Bracket Deferral", rationale: "Defer peak compensation into post-executive advisory years (evaluate employer credit risk)." },
      ],
      decumulationOrder: [
        { order: 1, vehicle: "Deferred Comp Scheduled Payouts (5–10 yr)", role: "Early FI Bridge", rationale: "Spread payouts over early retirement years in lower marginal brackets." },
        { order: 2, vehicle: "Diversified Taxable Brokerage", role: "Lifestyle Core", rationale: "Draw long-term capital gains and qualified dividends." },
        { order: 3, vehicle: isCanada ? "RRSP Meltdown" : "401(k) + Roth Conversions", role: "Tax Smoothing", rationale: "Optimize brackets prior to age 70–73 mandatory distributions." },
        { order: 4, vehicle: isCanada ? "TFSA" : "Roth IRA / HSA", role: "Tax-Free Reserve", rationale: "Preserve for late-life longevity and estate transfer." },
      ],
    };
  }

  // General Individual, Couple, Retiree, HNW, Young Professional
  return {
    accumulationOrder: isCanada
      ? [
          { order: 1, vehicle: "Employer Match (DPSP / Group RRSP)", role: "100% Instant ROI", rationale: "Never leave employer matching contributions on the table." },
          { order: 2, vehicle: demographic === "young_professional" ? "FHSA (First Home Savings Account)" : "TFSA (Tax-Free Savings Account)", role: "Tax-Free Core", rationale: demographic === "young_professional" ? "Tax-deductible in AND tax-free out for first home purchase ($8K/yr, $40K lifetime)." : "Flexible tax-free compounding with zero impact on future OAS benefits." },
          { order: 3, vehicle: demographic === "couple" ? "RESP (20% CESG Grant) + RRSP" : "RRSP (High-Bracket Deduction)", role: "Tax Deduction", rationale: demographic === "couple" ? "Capture guaranteed 20% government education grant before maximizing personal RRSP." : "Defer tax at peak working marginal rate; reinvest tax refund into TFSA." },
          { order: 4, vehicle: demographic === "hnw_family" ? "Family Trust / Non-Reg Direct Indexing" : "Non-Registered Equity ETF Portfolio", role: "Overflow Growth", rationale: "Prioritize Canadian eligible dividends and low-turnover capital gains." },
        ]
      : [
          { order: 1, vehicle: "401(k) / 403(b) up to Employer Match", role: "100% Instant ROI", rationale: "Capture full employer matching dollars immediately." },
          { order: 2, vehicle: "HSA + Roth IRA (or Backdoor Roth)", role: "Tax-Free Growth", rationale: "Triple tax advantage for healthcare plus tax-free retirement flexibility." },
          { order: 3, vehicle: demographic === "couple" ? "529 Education Plan + Max 401(k)" : "Max 401(k) Pre-Tax Limit", role: "Tax Deferral", rationale: "Reduce peak working taxable income and automate disciplined savings." },
          { order: 4, vehicle: demographic === "hnw_family" ? "Donor-Advised Fund & Revocable/Irrevocable Trusts" : "Taxable Brokerage (Tax-Efficient ETFs)", role: "Liquidity Bridge", rationale: "Provides early-retirement liquidity before age 59.5." },
        ],
    decumulationOrder: isCanada
      ? [
          { order: 1, vehicle: "Non-Registered Dividends & Capital Gains", role: "Tax-Efficient Base", rationale: "Utilize favorable capital gains inclusion and dividend tax credits." },
          { order: 2, vehicle: "Strategic RRSP / RRIF Meltdown (Age 60–71)", role: "Bracket Smoothing", rationale: "Draw down RRSPs before age 71 to prevent OAS clawback and estate tax spikes." },
          { order: 3, vehicle: "CPP & OAS (Evaluate Deferral to 68–70)", role: "Inflation-Protected Floor", rationale: "Each year of deferral past 65 increases guaranteed lifetime payments by 7.2%–8.4%." },
          { order: 4, vehicle: "TFSA Withdrawals", role: "Tax-Free Top-Up", rationale: "Zero-tax withdrawals for lumpy travel, gifts, and late-life care." },
        ]
      : [
          { order: 1, vehicle: "Taxable Brokerage (LTCG 0%–15% Zone)", role: "Bridge Income", rationale: "Fund early retirement years at preferential capital gains rates." },
          { order: 2, vehicle: "Traditional 401(k)/IRA + Roth Conversions", role: "Bracket Fill", rationale: "Fill lower tax brackets prior to RMD age 73–75." },
          { order: 3, vehicle: "Social Security (Defer Higher Earner to 70)", role: "Longevity Insurance", rationale: "8% annual delayed retirement credits maximize inflation-indexed survivor benefit." },
          { order: 4, vehicle: "Roth IRA & HSA", role: "Tax-Free Late Life", rationale: "Zero-tax cushion for healthcare spikes and multi-generational legacy." },
        ],
  };
}

/** Build demographic-tailored risk & protection checklist */
function buildRiskChecklist(
  inputs: LifestylePlanInputs,
  emergencyMonths: number,
  debtToIncomePct: number
): RiskChecklistItem[] {
  const items: RiskChecklistItem[] = [];

  // 1. Emergency Liquidity
  const targetMonths = inputs.demographic === "business_owner" || inputs.demographic === "individual" ? 6 : 4;
  items.push({
    id: "risk-liquidity",
    category: "Liquidity",
    title: `Cash Emergency Runway (${emergencyMonths.toFixed(1)} mo vs. ${targetMonths} mo target)`,
    status: emergencyMonths >= targetMonths ? "covered" : emergencyMonths >= targetMonths * 0.65 ? "review" : "gap",
    priority: emergencyMonths < 3 ? "critical" : "high",
    recommendation:
      emergencyMonths >= targetMonths
        ? "Emergency reserves meet institutional planning standards; excess cash can be deployed into high-yield T-bills or tax-free accounts."
        : `Build an additional $${Math.round(((targetMonths - emergencyMonths) * (inputs.essentialAnnualSpend + inputs.annualDebtService)) / 12).toLocaleString()} in high-interest liquid cash.`,
  });

  // 2. Disability / Human Capital Protection
  if (inputs.demographic !== "retiree") {
    const isDoctor = inputs.demographic === "doctor";
    items.push({
      id: "risk-disability",
      category: "Income Protection",
      title: isDoctor
        ? "Own-Occupation Specialty Disability Insurance"
        : "Long-Term Disability & Income Replacement",
      status: inputs.hasDisabilityInsurance ? "covered" : "gap",
      priority: isDoctor || inputs.demographic === "individual" ? "critical" : "high",
      recommendation: inputs.hasDisabilityInsurance
        ? isDoctor
          ? `Active coverage (${inputs.specifics.ownOccDisabilityCoveragePct ?? 65}%). Verify true 'own-occupation' rider, COLA inflation rider, and future insurability option.`
          : "Coverage active. Confirm benefit is paid with after-tax dollars so payouts remain tax-free."
        : isDoctor
        ? "CRITICAL GAP: Physicians must secure private non-cancellable own-occupation specialty disability immediately to protect $10M+ lifetime clinical earning power."
        : "Acquire private long-term disability coverage (60–65% net income replacement) to eliminate solo/household earning tail risk.",
    });
  }

  // 3. Life Insurance & Survivor Security
  if (
    inputs.demographic === "couple" ||
    inputs.demographic === "business_owner" ||
    inputs.demographic === "doctor" ||
    inputs.demographic === "hnw_family"
  ) {
    items.push({
      id: "risk-life",
      category: "Survivor / Estate",
      title:
        inputs.demographic === "business_owner"
          ? "Key-Person & Buy-Sell Funded Life Insurance"
          : inputs.demographic === "hnw_family"
          ? "Estate Liquidity / Permanent Life Structuring"
          : "Term Life Insurance (Survivor & Mortgage Shield)",
      status: inputs.hasLifeInsurance ? "covered" : "gap",
      priority: "critical",
      recommendation: inputs.hasLifeInsurance
        ? "Policy in force. Review death benefit every 3 years against net worth, mortgage balance, and estate tax liability."
        : "Immediate gap: model 10–12x primary income (or full estate tax liquidity) via low-cost Term-20 or corporate-owned permanent coverage.",
    });
  }

  // 4. Estate, Will, POA & Trusts
  items.push({
    id: "risk-estate",
    category: "Estate & Legal",
    title:
      inputs.demographic === "hnw_family"
        ? "Multi-Gen Trust, Estate Freeze & Healthcare Directives"
        : "Updated Will, Power of Attorney & Beneficiary Audit",
    status: inputs.hasEstateWillAndPoa ? "covered" : "gap",
    priority: inputs.demographic === "retiree" || inputs.demographic === "hnw_family" || inputs.demographic === "couple" ? "critical" : "high",
    recommendation: inputs.hasEstateWillAndPoa
      ? "Core legal documents executed. Audit registered account beneficiary designations and corporate secondary wills annually."
      : "Execute Will, Continuing Power of Attorney (Property & Personal Care), and harmonize beneficiary designations across all registered accounts.",
  });

  // 5. Demographic-Specific Structural Risk
  if (inputs.demographic === "executive") {
    const conc = inputs.specifics.concentratedStockPct ?? 35;
    items.push({
      id: "risk-concentration",
      category: "Concentration",
      title: `Employer Equity Concentration (${conc}% of Liquid Net Worth)`,
      status: conc <= 15 ? "covered" : conc <= 30 ? "review" : "gap",
      priority: "critical",
      recommendation:
        conc > 15
          ? "Both human capital and portfolio are tied to one company. Establish a 10b5-1 automated RSU sale schedule to bring single-stock risk under 15%."
          : "Single-stock concentration is well managed within institutional guardrails.",
    });
  } else if (inputs.demographic === "business_owner") {
    items.push({
      id: "risk-exit-illiquidity",
      category: "Business Continuity",
      title: "Exit Readiness, LCGE/QSBS Purification & Passive Grind",
      status: "review",
      priority: "high",
      recommendation:
        "Conduct annual active-business asset purification test (90%/50% rule) 24+ months prior to planned exit to preserve capital gains exemption.",
    });
  } else if (inputs.demographic === "doctor") {
    items.push({
      id: "risk-malpractice",
      category: "Liability",
      title: "Malpractice / CMPA Tail Coverage & Creditor Proofing",
      status: inputs.hasUmbrellaOrMalpractice ? "covered" : "gap",
      priority: "critical",
      recommendation: inputs.hasUmbrellaOrMalpractice
        ? "Professional liability active. Pair with $3M–$5M personal umbrella and creditor-protected pension/insurance structures."
        : "Verify malpractice/tail coverage and add a personal umbrella policy to shield non-corporate personal wealth.",
    });
  } else if (inputs.demographic === "retiree") {
    items.push({
      id: "risk-ltc",
      category: "Longevity & Care",
      title: "Sequence-of-Returns & Long-Term Care (LTC) Reserve",
      status: inputs.cashEmergencyFund >= inputs.essentialAnnualSpend * 1.5 ? "covered" : "review",
      priority: "high",
      recommendation:
        "Maintain 18–24 months of essential spending in short-duration cash/GICs/T-bills to avoid selling equities during drawdowns, plus a ring-fenced LTC reserve.",
    });
  } else if (debtToIncomePct > 200) {
    items.push({
      id: "risk-leverage",
      category: "Balance Sheet",
      title: `Elevated Debt-to-Income Ratio (${debtToIncomePct.toFixed(0)}%)`,
      status: "review",
      priority: "medium",
      recommendation:
        "Stress-test mortgage renewal rates (+200 bps) and prioritize paying down non-deductible debt above 6% APR.",
    });
  }

  return items;
}

/** Main entry point: run full Lifestyle & Wealth Plan */
export function runLifestylePlan(inputs: LifestylePlanInputs): LifestylePlanResult {
  const baseSim = runCoreSimulation(inputs, {}, 450);
  const safeAnnualLifestyleSpend = findSafeLifestyleSpend(inputs);

  const grossIncome =
    inputs.primaryIncome + inputs.partnerIncome + inputs.passiveOrBusinessIncome;
  const hasPartner = inputs.partnerIncome > 0 || Boolean(inputs.partnerAge);
  const effTaxRate = estimateEffectiveTaxRate(
    grossIncome,
    inputs.jurisdiction,
    inputs.demographic,
    hasPartner
  );
  const taxes = Math.round(grossIncome * effTaxRate);
  const currentAnnualLifestyleSpend =
    inputs.essentialAnnualSpend +
    inputs.discretionaryAnnualSpend +
    inputs.healthcareAnnualSpend;

  const monthlyEssentialOutflow =
    (inputs.essentialAnnualSpend + inputs.annualDebtService) / 12;
  const emergencyRunwayMonths =
    monthlyEssentialOutflow > 0
      ? Number((inputs.cashEmergencyFund / monthlyEssentialOutflow).toFixed(1))
      : 12;

  const savingsRatePct =
    grossIncome > 0
      ? Number(((inputs.annualSavingsContribution / grossIncome) * 100).toFixed(1))
      : 0;
  const debtToIncomePct =
    grossIncome > 0
      ? Number(((inputs.totalLiabilities / grossIncome) * 100).toFixed(1))
      : 0;

  const retirePoint =
    baseSim.yearlyDeterministic.find((p) => p.age === Math.round(inputs.retirementAge)) ??
    baseSim.yearlyDeterministic[0];

  // Readiness Pillars (5 institutional dimensions)
  const retirementScore = Math.min(100, Math.round(baseSim.successRatePct * 1.05));
  const liquidityScore = Math.min(100, Math.round((emergencyRunwayMonths / 6) * 85 + (savingsRatePct >= 20 ? 15 : savingsRatePct * 0.75)));
  const taxDiversificationRatio =
    inputs.taxDeferredAssets + inputs.taxFreeAssets + inputs.taxableAndCorpAssets > 0
      ? Math.min(
          1,
          (inputs.taxFreeAssets + inputs.taxableAndCorpAssets * 0.5) /
            (inputs.taxDeferredAssets + inputs.taxFreeAssets + inputs.taxableAndCorpAssets)
        )
      : 0.3;
  const taxScore = Math.min(100, Math.round(58 + taxDiversificationRatio * 42));

  const riskFlagsCount =
    (inputs.hasDisabilityInsurance || inputs.demographic === "retiree" ? 1 : 0) +
    (inputs.hasLifeInsurance || inputs.demographic === "individual" || inputs.demographic === "young_professional" ? 1 : 0) +
    (inputs.hasEstateWillAndPoa ? 1 : 0) +
    (inputs.hasUmbrellaOrMalpractice || inputs.demographic === "young_professional" || inputs.demographic === "individual" ? 1 : 0);
  const protectionScore = Math.round((riskFlagsCount / 4) * 100);

  const debtHealthScore =
    debtToIncomePct <= 100
      ? 95
      : debtToIncomePct <= 220
      ? 78
      : debtToIncomePct <= 350
      ? 60
      : 42;

  const readinessPillars: ReadinessPillar[] = [
    {
      id: "funding",
      label: "Retirement & Lifestyle Funding",
      score: retirementScore,
      status: retirementScore >= 85 ? "strong" : retirementScore >= 70 ? "watch" : "action_needed",
      detail: `${baseSim.successRatePct}% Monte Carlo probability across 450 market paths through age ${inputs.lifeExpectancy}.`,
    },
    {
      id: "liquidity",
      label: "Liquidity & Savings Velocity",
      score: liquidityScore,
      status: liquidityScore >= 80 ? "strong" : liquidityScore >= 60 ? "watch" : "action_needed",
      detail: `${emergencyRunwayMonths} months emergency runway and ${savingsRatePct}% gross savings rate.`,
    },
    {
      id: "tax",
      label: "Tax-Location Diversification",
      score: taxScore,
      status: taxScore >= 78 ? "strong" : taxScore >= 62 ? "watch" : "action_needed",
      detail: `Estimated ${(effTaxRate * 100).toFixed(1)}% effective tax rate across ${inputs.jurisdiction} buckets.`,
    },
    {
      id: "protection",
      label: "Risk Transfer & Estate Shield",
      score: protectionScore,
      status: protectionScore >= 85 ? "strong" : protectionScore >= 65 ? "watch" : "action_needed",
      detail: `${riskFlagsCount}/4 core protection pillars active (disability, life, estate/POA, liability).`,
    },
    {
      id: "balance_sheet",
      label: "Debt & Concentration Health",
      score: debtHealthScore,
      status: debtHealthScore >= 80 ? "strong" : debtHealthScore >= 60 ? "watch" : "action_needed",
      detail: `${debtToIncomePct}% total debt-to-income ratio against $${(inputs.taxDeferredAssets + inputs.taxFreeAssets + inputs.taxableAndCorpAssets + inputs.cashEmergencyFund + inputs.illiquidEquityAssets).toLocaleString()} gross assets.`,
    },
  ];

  const readinessScore = Math.round(
    retirementScore * 0.32 +
      liquidityScore * 0.18 +
      taxScore * 0.16 +
      protectionScore * 0.2 +
      debtHealthScore * 0.14
  );

  // Milestone funding statuses
  const milestoneStatuses: MilestoneFundingStatus[] = inputs.milestones
    .filter((m) => m.enabled)
    .map((m) => {
      const point = baseSim.yearlyDeterministic.find((p) => p.age === m.age);
      const projectedLiquidAtAge = point?.p50Portfolio ?? 0;
      const totalCost = m.amount * Math.max(1, m.durationYears ?? 1);
      let fundedStatus: MilestoneFundingStatus["fundedStatus"] = "fully_funded";
      if (totalCost < 0) {
        fundedStatus = "inflow_event";
      } else if (projectedLiquidAtAge < totalCost * 0.5 || baseSim.successRatePct < 65) {
        fundedStatus = "at_risk";
      } else if (projectedLiquidAtAge < totalCost * 1.35 || baseSim.successRatePct < 80) {
        fundedStatus = "tight";
      }
      return {
        id: m.id,
        title: m.title,
        age: m.age,
        totalCost,
        priority: m.priority,
        category: m.category,
        projectedLiquidAtAge,
        fundedStatus,
      };
    })
    .sort((a, b) => a.age - b.age);

  // 5 Real-Time Stress Tests (including demographic-specific shock!)
  const stressConfigs: {
    id: string;
    name: string;
    description: string;
    overrides: SimOverrides;
  }[] = [
    {
      id: "sequence_crash",
      name: "Sequence-of-Returns Crash",
      description: "-22% equity/portfolio drawdown in first 2 years of retirement",
      overrides: { returnShockFirstTwoRetirementYears: -0.22 },
    },
    {
      id: "sticky_inflation",
      name: "Persistent Inflation (+1.5%)",
      description: "CPI +150 bps higher every year across entire planning horizon",
      overrides: { inflationDelta: 0.015 },
    },
    {
      id: "longevity_plus5",
      name: "Longevity Extension (+5 Yrs)",
      description: `Living to age ${Math.min(105, inputs.lifeExpectancy + 5)} with late-life healthcare drift`,
      overrides: { extraLifeYears: 5 },
    },
    {
      id: "lifestyle_creep",
      name: "Lifestyle Upgrade (+15% Spend)",
      description: "Permanent 15% increase in annual lifestyle & travel burn",
      overrides: { spendMultiplier: 1.15 },
    },
  ];

  // Add 5th demographic-tailored stress test
  if (inputs.demographic === "business_owner") {
    stressConfigs.push({
      id: "exit_haircut",
      name: "Business Exit Haircut (-35%)",
      description: "M&A multiple compression reduces net business sale proceeds by 35%",
      overrides: { exitHaircutPct: 0.35 },
    });
  } else if (inputs.demographic === "executive") {
    stressConfigs.push({
      id: "stock_drawdown",
      name: "Employer Stock -40% Shock",
      description: "Concentrated single-stock drop hits liquid portfolio immediately",
      overrides: {
        initialPortfolioShockPct: -((inputs.specifics.concentratedStockPct ?? 40) / 100) * 0.4,
      },
    });
  } else if (inputs.demographic === "doctor") {
    stressConfigs.push({
      id: "clinical_burnout",
      name: "Clinical Burnout / -30% Income",
      description: "Temporary 3-year clinical billing reduction or early step-down",
      overrides: { incomeShockPct: -0.3, retirementAgeDelta: -2 },
    });
  } else {
    stressConfigs.push({
      id: "early_retirement",
      name: "Retire 3 Years Earlier",
      description: `Transitioning to full financial independence at age ${Math.max(inputs.currentAge, inputs.retirementAge - 3)}`,
      overrides: { retirementAgeDelta: -3 },
    });
  }

  const stressTests: StressTestScenario[] = stressConfigs.map((cfg) => {
    const res = runCoreSimulation(inputs, cfg.overrides, 220);
    const deltaSuccessPct = Number((res.successRatePct - baseSim.successRatePct).toFixed(1));
    const deltaTerminalWealth = res.terminalMedianLiquid - baseSim.terminalMedianLiquid;
    const impactSeverity: StressTestScenario["impactSeverity"] =
      res.successRatePct < 65 || deltaSuccessPct <= -18
        ? "severe"
        : res.successRatePct < 80 || deltaSuccessPct <= -8
        ? "moderate"
        : "low";

    return {
      id: cfg.id,
      name: cfg.name,
      description: cfg.description,
      successRatePct: res.successRatePct,
      deltaSuccessPct,
      terminalMedianLiquid: res.terminalMedianLiquid,
      deltaTerminalWealth,
      impactSeverity,
    };
  });

  const { expectedReturn, volatility } = RISK_PARAMS[inputs.riskProfile];

  return {
    inputs,
    kpis: {
      successProbabilityPct: baseSim.successRatePct,
      readinessScore,
      projectedLiquidAtRetirement: retirePoint?.p50Portfolio ?? 0,
      projectedNetWorthAtRetirement: retirePoint?.totalNetWorth ?? 0,
      terminalMedianLiquid: baseSim.terminalMedianLiquid,
      safeAnnualLifestyleSpend,
      currentAnnualLifestyleSpend,
      lifestyleSpendGap: safeAnnualLifestyleSpend - currentAnnualLifestyleSpend,
      financialIndependenceAge: baseSim.fiAge,
      effectiveTaxRatePct: Number((effTaxRate * 100).toFixed(1)),
      savingsRatePct,
      emergencyRunwayMonths,
      debtToIncomePct,
      expectedReturnPct: Number((expectedReturn * 100).toFixed(1)),
      portfolioVolatilityPct: Number((volatility * 100).toFixed(1)),
    },
    cashFlowBreakdown: {
      grossIncome: Math.round(grossIncome),
      taxes,
      essentialSpend: Math.round(inputs.essentialAnnualSpend),
      discretionarySpend: Math.round(inputs.discretionaryAnnualSpend),
      healthcareSpend: Math.round(inputs.healthcareAnnualSpend),
      debtService: Math.round(inputs.annualDebtService),
      savingsAndSurplus: Math.max(
        0,
        Math.round(
          grossIncome -
            taxes -
            inputs.essentialAnnualSpend -
            inputs.discretionaryAnnualSpend -
            inputs.healthcareAnnualSpend -
            inputs.annualDebtService
        )
      ),
    },
    projections: baseSim.yearlyDeterministic,
    readinessPillars,
    riskChecklist: buildRiskChecklist(inputs, emergencyRunwayMonths, debtToIncomePct),
    taxWaterfall: buildTaxWaterfall(inputs.demographic, inputs.jurisdiction),
    milestoneStatuses,
    stressTests,
  };
}
