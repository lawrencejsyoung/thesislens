import {
  AccountLocationRow,
  AssetLocationRecommendation,
  BusinessStructureId,
  BusinessStructureRow,
  ForeignPropertyEntityType,
  ForeignRealEstateMarketId,
  ForeignRealEstateTaxResult,
  ForeignSourceCountryId,
  GlobalTaxProfile,
  GlobalTaxReport,
  IncomeStreamComparisonRow,
  Jurisdiction,
  TaxComplianceAlert,
  TaxResidencyId,
  TaxResidencyProfile,
} from "../types";

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const TAX_RESIDENCY_PROFILES: Record<TaxResidencyId, TaxResidencyProfile> = {
  canada_on: {
    id: "canada_on",
    label: "Canada (Ontario)",
    country: "Canada",
    currency: "CAD/USD",
    topOrdinaryRatePct: 53.53,
    ltcgRatePct: 26.76, // 50% inclusion baseline (tiered 66.7% noted in alerts above $250k)
    stcgRatePct: 53.53,
    domesticDividendRatePct: 39.34, // Ontario top eligible dividend rate
    foreignDividendRatePct: 53.53, // No Canadian DTC on foreign dividends
    interestRatePct: 53.53,
    estateTaxThresholdUsd: null, // Deemed disposition on death rather than estate tax
    estateTaxTopRatePct: 0,
    territorialSystem: false,
    keyAccounts: ["TFSA", "RRSP / RRIF", "FHSA", "Non-Registered", "CCPC HoldCo"],
    summaryNote:
      "Worldwide taxation. 50% capital gains inclusion baseline, Canadian Eligible Dividend Tax Credit, TFSA tax-free growth (no US dividend treaty shield), RRSP US treaty 0% WHT shield, and CCPC small-business tax deferral (12.2% Ontario SBD).",
  },
  us_ca: {
    id: "us_ca",
    label: "United States (California)",
    country: "United States",
    currency: "USD",
    topOrdinaryRatePct: 50.3, // 37% Fed + 13.3% CA
    ltcgRatePct: 37.1, // 20% Fed + 3.8% NIIT + 13.3% CA (CA taxes cap gains as ordinary)
    stcgRatePct: 50.3,
    domesticDividendRatePct: 37.1,
    foreignDividendRatePct: 37.1, // Qualified treaty country dividends
    interestRatePct: 54.1, // 37% + 3.8% NIIT + 13.3% CA
    estateTaxThresholdUsd: 13_610_000,
    estateTaxTopRatePct: 40,
    territorialSystem: false,
    keyAccounts: ["Roth IRA", "401(k) / Trad IRA", "HSA", "Taxable Brokerage", "S-Corp / C-Corp"],
    summaryNote:
      "Citizenship & worldwide taxation. California taxes capital gains at ordinary rates (up to 13.3%). PFIC rules severely penalize foreign-domiciled ETFs/mutual funds; QSBS Section 1202 excludes up to $10M+ on qualified C-Corp exits.",
  },
  us_tx: {
    id: "us_tx",
    label: "United States (Texas / 0% State)",
    country: "United States",
    currency: "USD",
    topOrdinaryRatePct: 37.0,
    ltcgRatePct: 23.8, // 20% Fed + 3.8% NIIT
    stcgRatePct: 40.8,
    domesticDividendRatePct: 23.8,
    foreignDividendRatePct: 23.8,
    interestRatePct: 40.8,
    estateTaxThresholdUsd: 13_610_000,
    estateTaxTopRatePct: 40,
    territorialSystem: false,
    keyAccounts: ["Roth IRA", "401(k) / Trad IRA", "HSA", "Taxable Brokerage", "LLC / S-Corp"],
    summaryNote:
      "Zero state income tax. Federal LTCG + NIIT capped at 23.8%. Strong compounding in Roth/HSA/401(k) and 1031 exchanges for domestic real estate. Worldwide reporting (FBAR/FATCA/PFIC) still applies.",
  },
  uk: {
    id: "uk",
    label: "United Kingdom",
    country: "United Kingdom",
    currency: "GBP/USD",
    topOrdinaryRatePct: 45.0,
    ltcgRatePct: 24.0,
    stcgRatePct: 24.0,
    domesticDividendRatePct: 39.35,
    foreignDividendRatePct: 39.35,
    interestRatePct: 45.0,
    estateTaxThresholdUsd: 410_000, // ~£325k IHT nil-rate band
    estateTaxTopRatePct: 40,
    territorialSystem: false,
    keyAccounts: ["Stocks & Shares ISA", "SIPP Pension", "GIA Taxable", "UK Ltd Company"],
    summaryNote:
      "Generous £20k/yr tax-free Stocks & Shares ISA and £60k/yr SIPP pension (SIPP gets 0% US dividend WHT under UK-US treaty; ISA pays 15% WHT). Watch UK Reporting Fund status for offshore ETFs and 40% Inheritance Tax (IHT).",
  },
  singapore: {
    id: "singapore",
    label: "Singapore",
    country: "Singapore",
    currency: "SGD/USD",
    topOrdinaryRatePct: 24.0,
    ltcgRatePct: 0.0,
    stcgRatePct: 0.0,
    domesticDividendRatePct: 0.0,
    foreignDividendRatePct: 0.0, // Foreign-sourced income generally exempt for individuals
    interestRatePct: 0.0, // Bank/bond interest largely exempt
    estateTaxThresholdUsd: null,
    estateTaxTopRatePct: 0,
    territorialSystem: true,
    keyAccounts: ["SG Taxable Brokerage", "Irish UCITS ETF Wrapper", "SRS / CPF", "SG Pte Ltd"],
    summaryNote:
      "Territorial system with 0% capital gains, 0% dividend tax, and 0% estate tax. Primary tax leak is 30% US dividend withholding (no US-SG tax treaty) — cut in half to 15% + US estate tax shielded by using Irish-domiciled UCITS ETFs.",
  },
  uae: {
    id: "uae",
    label: "United Arab Emirates (Dubai)",
    country: "UAE",
    currency: "AED/USD",
    topOrdinaryRatePct: 0.0,
    ltcgRatePct: 0.0,
    stcgRatePct: 0.0,
    domesticDividendRatePct: 0.0,
    foreignDividendRatePct: 0.0,
    interestRatePct: 0.0,
    estateTaxThresholdUsd: null,
    estateTaxTopRatePct: 0,
    territorialSystem: true,
    keyAccounts: ["0% Personal Brokerage", "Irish UCITS ETF Wrapper", "UAE Free Zone Co (0%/9%)"],
    summaryNote:
      "0% personal income, capital gains, and dividend tax. 9% federal corporate tax above AED 375k (0% for Qualifying Free Zone Income). Crucial to use Irish UCITS ETFs to avoid 30% US WHT and 40% US Estate Tax over $60k.",
  },
  portugal: {
    id: "portugal",
    label: "Portugal (EU)",
    country: "Portugal",
    currency: "EUR/USD",
    topOrdinaryRatePct: 48.0,
    ltcgRatePct: 28.0, // Autonomous 28% flat rate (short-term <365d at progressive if high income)
    stcgRatePct: 48.0,
    domesticDividendRatePct: 28.0,
    foreignDividendRatePct: 28.0,
    interestRatePct: 28.0,
    estateTaxThresholdUsd: null, // 0% stamp duty for direct descendants/spouses
    estateTaxTopRatePct: 10,
    territorialSystem: false,
    keyAccounts: ["EU Accumulating UCITS ETF", "PPR Retirement Plan", "Taxable Brokerage", "Portuguese Lda"],
    summaryNote:
      "28% flat autonomous rate on dividends, interest, and long-term capital gains; crypto held >365 days is 0% taxed. Accumulating UCITS ETFs defer dividend tax; IFICI (NHR 2.0) can shield qualifying foreign income.",
  },
};

export const FOREIGN_SOURCE_COUNTRIES: Record<
  ForeignSourceCountryId,
  {
    id: ForeignSourceCountryId;
    label: string;
    statutoryDivWhtPct: number;
    treatyDivWhtPct: number;
    interestWhtPct: number;
    nonResidentEstateTaxTrap: boolean;
    note: string;
  }
> = {
  us: {
    id: "us",
    label: "United States (NYSE / NASDAQ)",
    statutoryDivWhtPct: 30,
    treatyDivWhtPct: 15,
    interestWhtPct: 0, // Portfolio interest exemption
    nonResidentEstateTaxTrap: true,
    note: "30% statutory WHT cut to 15% with W-8BEN treaty (0% in Canadian RRSP / UK SIPP). Non-US residents holding >$60k of US-situs stocks/ETFs face up to 40% US Estate Tax unless treaty pro-rata credit or UCITS wrapper applies.",
  },
  canada: {
    id: "canada",
    label: "Canada (TSX)",
    statutoryDivWhtPct: 25,
    treatyDivWhtPct: 15,
    interestWhtPct: 0,
    nonResidentEstateTaxTrap: false,
    note: "25% statutory Part XIII WHT reduced to 15% under most treaties (US, UK, EU). No Canadian estate tax on non-resident portfolio equities.",
  },
  uk: {
    id: "uk",
    label: "United Kingdom (LSE)",
    statutoryDivWhtPct: 0,
    treatyDivWhtPct: 0,
    interestWhtPct: 20,
    nonResidentEstateTaxTrap: true,
    note: "0% dividend withholding tax on UK equities (except REIT PIDs at 20%), making UK blue chips very efficient inside TFSA/Roth/ISA.",
  },
  ireland_ucits: {
    id: "ireland_ucits",
    label: "Ireland (UCITS ETF Domicile)",
    statutoryDivWhtPct: 0,
    treatyDivWhtPct: 0,
    interestWhtPct: 0,
    nonResidentEstateTaxTrap: false,
    note: "0% Irish WHT on ETF distributions to non-Irish investors + 15% internal US-Ireland treaty WHT on US stocks + complete shield from US Estate Tax. Note: US citizens/residents must AVOID UCITS due to harsh PFIC rules.",
  },
  eu_germany: {
    id: "eu_germany",
    label: "Eurozone (Germany / France)",
    statutoryDivWhtPct: 26.375,
    treatyDivWhtPct: 15,
    interestWhtPct: 0,
    nonResidentEstateTaxTrap: false,
    note: "High statutory WHT (25%–26.4%) often withheld at source; reclaiming the excess above 15% treaty rate requires manual reclaim filings unless your broker offers relief-at-source.",
  },
  japan: {
    id: "japan",
    label: "Japan (TSE)",
    statutoryDivWhtPct: 15.315,
    treatyDivWhtPct: 15,
    interestWhtPct: 15,
    nonResidentEstateTaxTrap: false,
    note: "15.315% dividend WHT (10%–15% under most treaties). Low withholding friction for foreign investors.",
  },
  switzerland: {
    id: "switzerland",
    label: "Switzerland (SIX)",
    statutoryDivWhtPct: 35,
    treatyDivWhtPct: 15,
    interestWhtPct: 35,
    nonResidentEstateTaxTrap: false,
    note: "35% statutory WHT withheld upfront; reclaiming the 20% excess under tax treaties takes administrative filing.",
  },
};

interface ForeignPropertyMarketRule {
  id: ForeignRealEstateMarketId;
  label: string;
  country: string;
  stampTransferPct: number;
  foreignBuyerSurchargePct: number;
  legalAndSetupUsd: number;
  opexAndPropTaxPctOfRent: number;
  depreciationPctOfPrice: number;
  grossRentalWhtPct: number;
  netElectionTaxRatePct: number;
  foreignCapGainsTaxPct: number;
  closingWithholdingPct: number;
  closingWithholdingRule: string;
  estateTaxNote: string;
  recommendedEntityNote: string;
}

export const FOREIGN_REAL_ESTATE_MARKETS: Record<
  ForeignRealEstateMarketId,
  ForeignPropertyMarketRule
> = {
  us_florida: {
    id: "us_florida",
    label: "United States — Florida / Sunbelt",
    country: "United States",
    stampTransferPct: 1.5,
    foreignBuyerSurchargePct: 0,
    legalAndSetupUsd: 6500,
    opexAndPropTaxPctOfRent: 38,
    depreciationPctOfPrice: 2.9, // 27.5-yr straight line on ~80% building value
    grossRentalWhtPct: 30,
    netElectionTaxRatePct: 15, // Section 871(d) ECI progressive brackets after depreciation
    foreignCapGainsTaxPct: 15, // Long-term US cap gains for non-resident individuals
    closingWithholdingPct: 15,
    closingWithholdingRule:
      "FIRPTA (IRC §1445): Buyer withholds 15% of GROSS sale price unless Form 8288-B withholding certificate is filed.",
    estateTaxNote:
      "HIGH RISK: US real estate is US-situs property. Non-US residents face up to 40% US Estate Tax above $60k (Canadian residents get pro-rata treaty relief under US-Canada Treaty Article XXIX-B).",
    recommendedEntityNote:
      "For Canadians: Personal direct or Cross-Border Trust / Canadian LP (AVOID US LLC due to CRA hybrid double-tax mismatch). For non-treaty global buyers: Foreign Corp blocker or irrevocable trust.",
  },
  portugal_lisbon: {
    id: "portugal_lisbon",
    label: "Portugal — Lisbon / Algarve (EU)",
    country: "Portugal",
    stampTransferPct: 6.8, // IMT + 0.8% Stamp Duty
    foreignBuyerSurchargePct: 0,
    legalAndSetupUsd: 5500,
    opexAndPropTaxPctOfRent: 28,
    depreciationPctOfPrice: 1.6,
    grossRentalWhtPct: 25,
    netElectionTaxRatePct: 25, // Autonomous 25% on net residential rent
    foreignCapGainsTaxPct: 28, // 50% inclusion for residents/EU vs 28% non-resident assessment
    closingWithholdingPct: 0,
    closingWithholdingRule:
      "No buyer withholding at closing, but mandatory non-resident IRS capital gains return due following year.",
    estateTaxNote:
      "Favorable: 0% inheritance/stamp duty for spouses, children, and parents (10% for non-direct heirs).",
    recommendedEntityNote:
      "Personal direct ownership is usually cleanest; avoid offshore blacklisted jurisdictions (which trigger punitive 7.5% annual IMI + 10% IMT).",
  },
  mexico_riviera: {
    id: "mexico_riviera",
    label: "Mexico — Riviera Maya / CDMX",
    country: "Mexico",
    stampTransferPct: 4.5, // ISAI acquisition tax + notary
    foreignBuyerSurchargePct: 0,
    legalAndSetupUsd: 7500, // Fideicomiso bank trust setup (~$2.5k) + legal
    opexAndPropTaxPctOfRent: 34,
    depreciationPctOfPrice: 2.0,
    grossRentalWhtPct: 25,
    netElectionTaxRatePct: 22,
    foreignCapGainsTaxPct: 35, // 25% of gross OR 35% of net gain (notary calculates optimal)
    closingWithholdingPct: 25,
    closingWithholdingRule:
      "Notario Público withholds ISR at closing: lesser of 25% of gross price or 35% of inflation-adjusted net gain.",
    estateTaxNote:
      "No Mexican federal estate tax; Fideicomiso bank trust allows naming substitute beneficiaries for seamless probate-free transfer.",
    recommendedEntityNote:
      "Fideicomiso (Mexican Bank Trust) is mandatory for foreigners within 50km of coast / 100km of border (residential). Mexican S. de R.L. corp only if running active commercial/multi-unit hospitality.",
  },
  uk_london: {
    id: "uk_london",
    label: "United Kingdom — London / Manchester",
    country: "United Kingdom",
    stampTransferPct: 8.0, // SDLT additional property rates
    foreignBuyerSurchargePct: 2.0, // Non-UK Resident SDLT Surcharge
    legalAndSetupUsd: 6000,
    opexAndPropTaxPctOfRent: 30,
    depreciationPctOfPrice: 0, // UK does not allow residential building depreciation
    grossRentalWhtPct: 20, // Non-Resident Landlord Scheme (NRLS)
    netElectionTaxRatePct: 20, // Basic rate after allowable expenses (mortgage interest restricted to 20% credit)
    foreignCapGainsTaxPct: 24, // NRCGT on residential property
    closingWithholdingPct: 0,
    closingWithholdingRule:
      "NRCGT return and tax payment required within 60 days of completion (strict HMRC late penalties).",
    estateTaxNote:
      "HIGH RISK: UK-situs residential property is subject to 40% UK Inheritance Tax (IHT) above £325k even if held inside an offshore company (Schedule A1 look-through).",
    recommendedEntityNote:
      "UK SPV Ltd Company (19%–25% Corp Tax + full mortgage interest deductibility) for leveraged BTL portfolios; watch ATED charges on high-value (£500k+) non-rented homes.",
  },
  uae_dubai: {
    id: "uae_dubai",
    label: "UAE — Dubai Freehold",
    country: "UAE",
    stampTransferPct: 4.0, // Dubai Land Department (DLD) 4% fee
    foreignBuyerSurchargePct: 0,
    legalAndSetupUsd: 4000,
    opexAndPropTaxPctOfRent: 24, // Service charges, 0% annual property tax
    depreciationPctOfPrice: 0,
    grossRentalWhtPct: 0,
    netElectionTaxRatePct: 0,
    foreignCapGainsTaxPct: 0,
    closingWithholdingPct: 0,
    closingWithholdingRule:
      "0% UAE capital gains tax and 0% withholding at closing. Your HOME country still taxes worldwide rental income & gains (unless territorial/non-resident).",
    estateTaxNote:
      "0% UAE estate tax, but non-Muslims MUST register a DIFC Will to avoid default Sharia forced-heirship distribution on UAE real estate.",
    recommendedEntityNote:
      "Personal freehold + registered DIFC Will is cleanest for 0% local tax; home-country residents (CA/US/UK) still report worldwide net rent and capital gains at home.",
  },
  japan_tokyo: {
    id: "japan_tokyo",
    label: "Japan — Tokyo / Niseko",
    country: "Japan",
    stampTransferPct: 5.5, // Acquisition tax + registration license + stamp
    foreignBuyerSurchargePct: 0,
    legalAndSetupUsd: 5000,
    opexAndPropTaxPctOfRent: 32,
    depreciationPctOfPrice: 3.5, // Aggressive depreciation on older wooden/RC structures
    grossRentalWhtPct: 20.42, // Non-resident withholding if tenant is a corporation
    netElectionTaxRatePct: 18, // Progressive net filing via Japanese Tax Representative
    foreignCapGainsTaxPct: 15.315, // >5 years long-term (30.63% if <=5 years!)
    closingWithholdingPct: 10.21,
    closingWithholdingRule:
      "10.21% buyer withholding on gross sale price for non-residents (reclaimed via Tax Representative filing). Hold >5 calendar years to cut CGT from 30.63% to 15.315%.",
    estateTaxNote:
      "Japan levies progressive Inheritance Tax (10%–55%) on Japanese-situs real estate regardless of owner's residency.",
    recommendedEntityNote:
      "Personal direct ownership with a licensed Japanese Tax Representative (Nozei Kanrinin) and >5-year hold to qualify for 15.315% long-term CGT.",
  },
  canada_ontario: {
    id: "canada_ontario",
    label: "Canada — Ontario (Foreign Buyer)",
    country: "Canada",
    stampTransferPct: 2.0, // Ontario LTT
    foreignBuyerSurchargePct: 25.0, // Ontario NRST 25% Non-Resident Speculation Tax
    legalAndSetupUsd: 5000,
    opexAndPropTaxPctOfRent: 35,
    depreciationPctOfPrice: 2.5, // Class 1 4% CCA on building portion
    grossRentalWhtPct: 25, // Part XIII 25% of gross rent
    netElectionTaxRatePct: 22, // Section 216 net rental election
    foreignCapGainsTaxPct: 26.76,
    closingWithholdingPct: 25,
    closingWithholdingRule:
      "CRA Section 116: Buyer must withhold 25% of GROSS sale price (50% on depreciable property) until a Certificate of Compliance (T2062) is issued.",
    estateTaxNote:
      "Deemed disposition at fair market value on death triggers Canadian capital gains tax on Canadian real property.",
    recommendedEntityNote:
      "Watch the Federal Foreign Buyer Ban (Prohibition on Purchase of Residential Property by Non-Canadians Act) and 25% Ontario NRST; commercial / 4+ unit multi-family is exempt from the residential ban & NRST.",
  },
};

export function buildDefaultGlobalTaxProfile(
  jurisdiction: Jurisdiction = "Canada",
  portfolioCapital = 250000
): GlobalTaxProfile {
  const residency: TaxResidencyId =
    jurisdiction === "US"
      ? "us_ca"
      : jurisdiction === "Global"
      ? "singapore"
      : "canada_on";

  return {
    residency,
    annualOrdinaryIncomeUsd: 220000,
    portfolioValueUsd: Math.max(50000, Math.min(25_000_000, portfolioCapital || 250000)),
    foreignAllocationPct: residency === "us_ca" ? 30 : 55,
    foreignSourceCountry: residency === "us_ca" ? "eu_germany" : "us",
    targetGainToAccessUsd: 100000,
    horizonYears: 10,
    expectedPreTaxReturnPct: 9.5,
    expectedDividendYieldPct: 2.6,
    businessAnnualProfitUsd: 350000,
    businessSalaryDrawUsd: 140000,
    businessPassiveIncomeUsd: 65000,
    businessExitValueUsd: 2_500_000,
    foreignPropertyMarket: residency === "us_ca" ? "portugal_lisbon" : "us_florida",
    foreignPropertyPriceUsd: 650000,
    foreignPropertyGrossYieldPct: 7.2,
    foreignPropertyHoldYears: 7,
    foreignPropertyAppreciationPct: 4.5,
    foreignPropertyEntity: residency === "canada_on" ? "local_llc" : "personal_direct",
  };
}

/**
 * Estimates an investor's effective marginal ordinary tax rate given residency & annual income.
 */
export function computeMarginalOrdinaryRate(
  residencyId: TaxResidencyId,
  annualIncomeUsd: number
): number {
  const profile = TAX_RESIDENCY_PROFILES[residencyId];
  if (profile.topOrdinaryRatePct === 0) return 0;

  // Smooth realistic bracket scaling so sliders respond dynamically
  const scale =
    annualIncomeUsd >= 350000
      ? 1.0
      : annualIncomeUsd >= 200000
      ? 0.92
      : annualIncomeUsd >= 120000
      ? 0.8
      : annualIncomeUsd >= 70000
      ? 0.64
      : 0.48;

  return round(profile.topOrdinaryRatePct * scale, 2);
}

/**
 * Computes Foreign Dividend Withholding Tax rate for a given residency + source country + account wrapper.
 */
function getForeignDividendWhtPct(
  residencyId: TaxResidencyId,
  sourceId: ForeignSourceCountryId,
  accountCategory: "tax_free" | "tax_deferred" | "taxable" | "corporate" | "offshore_ucits"
): { whtPct: number; ftcRecoverable: boolean; note: string } {
  const source = FOREIGN_SOURCE_COUNTRIES[sourceId];

  // Domestic investment (no foreign WHT)
  if (
    (residencyId === "canada_on" && sourceId === "canada") ||
    ((residencyId === "us_ca" || residencyId === "us_tx") && sourceId === "us") ||
    (residencyId === "uk" && sourceId === "uk")
  ) {
    return { whtPct: 0, ftcRecoverable: false, note: "Domestic source — 0% foreign withholding." };
  }

  if (accountCategory === "offshore_ucits") {
    if (sourceId === "us") {
      return {
        whtPct: 15,
        ftcRecoverable: false,
        note: "Irish UCITS ETF cuts US dividend WHT from 30% to 15% internally & shields from US Estate Tax.",
      };
    }
    return {
      whtPct: Math.min(15, source.treatyDivWhtPct),
      ftcRecoverable: false,
      note: "Irish UCITS treaty network minimizes internal withholding with 0% Irish exit WHT.",
    };
  }

  const hasUsTreaty =
    residencyId === "canada_on" ||
    residencyId === "uk" ||
    residencyId === "portugal" ||
    residencyId === "us_ca" ||
    residencyId === "us_tx";

  // Special pension treaty exemptions (Canada RRSP & UK SIPP for US dividends)
  if (
    sourceId === "us" &&
    accountCategory === "tax_deferred" &&
    (residencyId === "canada_on" || residencyId === "uk")
  ) {
    return {
      whtPct: 0,
      ftcRecoverable: false,
      note: "0% US dividend WHT! US-Canada / US-UK treaty explicitly exempts recognized retirement pensions (RRSP / SIPP).",
    };
  }

  // Tax-free accounts (TFSA / ISA / Roth) do NOT get FTC recovery on foreign WHT
  if (accountCategory === "tax_free") {
    const wht =
      sourceId === "us"
        ? hasUsTreaty
          ? 15
          : 30
        : source.treatyDivWhtPct;
    return {
      whtPct: wht,
      ftcRecoverable: false,
      note:
        wht > 0
          ? `${wht}% unrecoverable foreign dividend WHT inside tax-free wrapper (no Foreign Tax Credit available).`
          : "0% foreign dividend WHT — ideal tax-free compounding.",
    };
  }

  // Taxable / Corporate accounts
  const wht =
    sourceId === "us"
      ? hasUsTreaty
        ? 15
        : 30
      : source.treatyDivWhtPct;

  const territorialZero = residencyId === "singapore" || residencyId === "uae";
  return {
    whtPct: wht,
    ftcRecoverable: !territorialZero && wht > 0,
    note: territorialZero
      ? `${wht}% foreign WHT is a final unrecoverable cost because domestic tax is 0% (no FTC offset).`
      : wht > 0
      ? `${wht}% foreign WHT is generally recoverable via home-country Foreign Tax Credit (FTC) up to domestic tax payable.`
      : "0% foreign withholding.",
  };
}

/**
 * 1. Account Wrappers & Asset Location Analyzer
 */
export function analyzeAccountLocations(
  profile: GlobalTaxProfile
): {
  accounts: AccountLocationRow[];
  assetMatrix: AssetLocationRecommendation[];
} {
  const res = TAX_RESIDENCY_PROFILES[profile.residency];
  const marginalPct = computeMarginalOrdinaryRate(
    profile.residency,
    profile.annualOrdinaryIncomeUsd
  );
  const marginalRatio = res.topOrdinaryRatePct > 0 ? marginalPct / res.topOrdinaryRatePct : 0;
  const ltcgRate = res.ltcgRatePct * (res.id === "portugal" ? 1 : marginalRatio || 1);
  const domDivRate = res.domesticDividendRatePct * (res.id === "portugal" ? 1 : marginalRatio || 1);
  const forDivRate = res.foreignDividendRatePct * (res.id === "portugal" ? 1 : marginalRatio || 1);

  const preTaxReturn = profile.expectedPreTaxReturnPct / 100;
  const divYield = profile.expectedDividendYieldPct / 100;
  const priceReturn = Math.max(0, preTaxReturn - divYield);
  const years = Math.max(1, profile.horizonYears);
  const principal = profile.portfolioValueUsd;

  interface AccountTemplate {
    accountId: string;
    accountName: string;
    category: "tax_free" | "tax_deferred" | "taxable" | "corporate" | "offshore_ucits";
    contributionCapNote: string;
    bestForAssets: string[];
    avoidAssets: string[];
  }

  const templatesByResidency: Record<TaxResidencyId, AccountTemplate[]> = {
    canada_on: [
      {
        accountId: "tfsa",
        accountName: "TFSA (Tax-Free Savings Account)",
        category: "tax_free",
        contributionCapNote: "$7,000/yr CAD (~$102k cumulative room)",
        bestForAssets: ["High-growth Canadian & US equities (0% div)", "Canadian REITs / Bonds", "UK / 0%-WHT foreign stocks"],
        avoidAssets: ["High-yield US dividend ETFs (15% unrecoverable WHT)", "Day-trading (CRA business income risk)"],
      },
      {
        accountId: "rrsp",
        accountName: "RRSP / RRIF (Tax-Deferred Pension)",
        category: "tax_deferred",
        contributionCapNote: "18% of earned income (up to ~$32,490/yr)",
        bestForAssets: ["US-listed dividend stocks & ETFs (0% US WHT!)", "High-yield bonds / Private credit", "US REITs"],
        avoidAssets: ["Canadian eligible dividend stocks (loses DTC)", "Low-yield speculative losses (no capital loss claim)"],
      },
      {
        accountId: "fhsa",
        accountName: "FHSA (First Home Savings Account)",
        category: "tax_free",
        contributionCapNote: "$8,000/yr ($40,000 lifetime) — Deductible IN + Tax-Free OUT",
        bestForAssets: ["Balanced growth / T-Bills / Core ETFs for 3–15yr horizon"],
        avoidAssets: ["High-yield US dividend stocks (15% WHT leakage)"],
      },
      {
        accountId: "non_reg",
        accountName: "Non-Registered Taxable Brokerage",
        category: "taxable",
        contributionCapNote: "Unlimited capital; capital loss harvesting enabled",
        bestForAssets: ["Canadian eligible dividend stocks (DTC)", "Low-turnover growth stocks (deferred 50% LTCG)", "ROC / Corporate-Class ETFs"],
        avoidAssets: ["Interest-heavy bonds / GICs (53.5% tax)", "High-turnover short-term options"],
      },
      {
        accountId: "ccpc_holdco",
        accountName: "CCPC Corporate Investment Account",
        category: "corporate",
        contributionCapNote: "Funded with 12.2% taxed corporate retained earnings (87.8¢ on $1)",
        bestForAssets: ["Capital-growth equities (50% CDA tax-free payout!)", "Canadian eligible dividends (Part IV refundable)"],
        avoidAssets: ["Passive interest >$50k/yr (triggers SBD passive grind)"],
      },
    ],
    us_ca: [
      {
        accountId: "roth_ira",
        accountName: "Roth IRA / Mega Backdoor Roth",
        category: "tax_free",
        contributionCapNote: "$7,000/yr (+$1k 50+) or up to $46k+ via Mega Backdoor",
        bestForAssets: ["Highest expected CAGR equities / AI growth", "REITs & High-yield credit", "Active options strategies"],
        avoidAssets: ["Municipal bonds (already tax-exempt)", "Foreign high-WHT stocks (unrecoverable WHT)"],
      },
      {
        accountId: "401k_trad",
        accountName: "401(k) / Traditional IRA",
        category: "tax_deferred",
        contributionCapNote: "$23,500/yr employee ($70k total w/ employer/Solo 401k)",
        bestForAssets: ["Bonds, Private Credit & REITs", "High-turnover active funds"],
        avoidAssets: ["Low-yield long-term buy-and-hold stocks (converts LTCG to ordinary)"],
      },
      {
        accountId: "hsa",
        accountName: "HSA (Triple Tax-Advantaged)",
        category: "tax_free",
        contributionCapNote: "$4,300 single / $8,550 family (Fed deductible; CA taxes)",
        bestForAssets: ["Long-term index equities (compounded for retirement medical)"],
        avoidAssets: ["Short-term cash if you can pay medical expenses out-of-pocket"],
      },
      {
        accountId: "us_taxable",
        accountName: "US Taxable Brokerage",
        category: "taxable",
        contributionCapNote: "Unlimited; step-up in cost basis at death + FTC + TLH",
        bestForAssets: ["Broad US-domiciled ETFs (VTI/VXUS for FTC)", "CA Municipal Bonds (double tax-free)", "Direct indexing TLH"],
        avoidAssets: ["Non-US domiciled ETFs/UCITS (PFIC Form 8621 nightmare!)", "Taxable bonds / REITs"],
      },
    ],
    us_tx: [
      {
        accountId: "roth_ira",
        accountName: "Roth IRA / Mega Backdoor Roth",
        category: "tax_free",
        contributionCapNote: "$7,000/yr or up to $46k+ via Mega Backdoor 401(k)",
        bestForAssets: ["Highest CAGR growth equities", "REITs / High-yield debt", "Short-term options/trading"],
        avoidAssets: ["Muni bonds", "High foreign WHT stocks"],
      },
      {
        accountId: "401k_trad",
        accountName: "Solo 401(k) / Traditional IRA",
        category: "tax_deferred",
        contributionCapNote: "Up to $70,000/yr for business owners",
        bestForAssets: ["Fixed income / Private Credit", "REITs", "Active rebalancing funds"],
        avoidAssets: ["Long-term growth stocks better suited for 23.8% LTCG + step-up"],
      },
      {
        accountId: "hsa",
        accountName: "HSA (Triple Tax-Free in TX)",
        category: "tax_free",
        contributionCapNote: "$4,300 single / $8,550 family — 0% Fed & 0% TX tax",
        bestForAssets: ["Long-term equity index compounding"],
        avoidAssets: ["Low-yield money market if long horizon"],
      },
      {
        accountId: "us_taxable",
        accountName: "US Taxable Brokerage (0% State)",
        category: "taxable",
        contributionCapNote: "Unlimited; 23.8% max LTCG + step-up basis + FTC",
        bestForAssets: ["US-domiciled global ETFs (VXUS gets FTC)", "Long-term equities", "1031 Real Estate"],
        avoidAssets: ["Foreign-domiciled ETFs (PFIC trap)", "High-yield ordinary interest"],
      },
    ],
    uk: [
      {
        accountId: "uk_isa",
        accountName: "Stocks & Shares ISA",
        category: "tax_free",
        contributionCapNote: "£20,000/yr tax-free (0% CGT, 0% UK dividend tax)",
        bestForAssets: ["UK equities (0% WHT)", "Global growth ETFs", "Corporate bonds / Gilts"],
        avoidAssets: ["High-yield US dividend stocks (15% WHT inside ISA)"],
      },
      {
        accountId: "uk_sipp",
        accountName: "SIPP (Self-Invested Personal Pension)",
        category: "tax_deferred",
        contributionCapNote: "£60,000/yr allowance + 20%–45% upfront tax relief",
        bestForAssets: ["US-listed dividend stocks & ETFs (0% US WHT via treaty!)", "Global multi-asset funds"],
        avoidAssets: ["Assets needed before age 57"],
      },
      {
        accountId: "uk_gia",
        accountName: "General Investment Account (GIA)",
        category: "taxable",
        contributionCapNote: "Unlimited; £3k CGT allowance + £500 div allowance",
        bestForAssets: ["Low-coupon UK Gilts (0% CGT on gilts!)", "UK Reporting-status accumulating ETFs"],
        avoidAssets: ["Non-reporting offshore funds (taxed at 45% income rate)"],
      },
      {
        accountId: "uk_ltd",
        accountName: "UK Limited Investment / FIC",
        category: "corporate",
        contributionCapNote: "19%–25% Corp Tax; 0% corp tax on most equity dividends received",
        bestForAssets: ["Dividend-paying global equities (usually exempt from UK Corp Tax)"],
        avoidAssets: ["High-gain assets (no CGT annual exemption; double layer on extraction)"],
      },
    ],
    singapore: [
      {
        accountId: "sg_ucits",
        accountName: "Irish-Domiciled UCITS ETF Wrapper (LSE)",
        category: "offshore_ucits",
        contributionCapNote: "Unlimited via IBKR / Saxo; 0% SG tax + 15% US WHT + No US Estate Tax",
        bestForAssets: ["US & Global Equities (CSPX, VWRA, VHYL)", "Accumulating ETFs"],
        avoidAssets: ["Direct US-listed ETFs (SPY/VOO suffer 30% WHT + 40% US Estate Tax >$60k)"],
      },
      {
        accountId: "sg_taxable",
        accountName: "Singapore Personal Brokerage",
        category: "taxable",
        contributionCapNote: "Unlimited; 0% Cap Gains, 0% Domestic Div, 0% Estate Tax",
        bestForAssets: ["SG REITs & Banks (0% tax)", "UK/HK/0%-WHT stocks", "Options & Crypto (0% CGT)"],
        avoidAssets: ["Direct US dividend stocks >$60k (30% WHT + US Estate Tax exposure)"],
      },
      {
        accountId: "sg_srs",
        accountName: "SRS (Supplementary Retirement Scheme)",
        category: "tax_deferred",
        contributionCapNote: "S$15,300/yr citizen/PR (S$35,700 foreigner) tax deduction",
        bestForAssets: ["SG dividend equities & local ETFs (50% withdrawal tax concession)"],
        avoidAssets: ["Assets needed before statutory retirement age (5% penalty)"],
      },
    ],
    uae: [
      {
        accountId: "uae_ucits",
        accountName: "Irish-Domiciled UCITS ETF Wrapper (LSE)",
        category: "offshore_ucits",
        contributionCapNote: "Unlimited; 0% UAE tax + cuts US WHT 30%→15% + No US Estate Tax",
        bestForAssets: ["US S&P 500 / Nasdaq / Global Equity ETFs (CSPX, VWRA)"],
        avoidAssets: ["Direct US-domiciled ETFs (30% WHT + 40% US Estate Tax risk >$60k)"],
      },
      {
        accountId: "uae_personal",
        accountName: "UAE 0% Personal Brokerage",
        category: "taxable",
        contributionCapNote: "Unlimited; 0% Personal Income, 0% CGT, 0% Dividend Tax",
        bestForAssets: ["Non-US equities (UK/UAE/HK)", "Crypto & Derivatives", "Global Sovereign/Corp Bonds"],
        avoidAssets: ["US-situs equities >$60k without estate blocker"],
      },
      {
        accountId: "uae_fz",
        accountName: "UAE Free Zone Holding Co (0% QFZP)",
        category: "corporate",
        contributionCapNote: "0% Corporate Tax on Qualifying Free Zone / Participation Exemption",
        bestForAssets: ["Operating subsidiaries & private equity stakes", "Cross-border IP/Advisory"],
        avoidAssets: ["Passive mainland UAE trading without QFZP substance"],
      },
    ],
    portugal: [
      {
        accountId: "pt_ucits",
        accountName: "EU Accumulating UCITS ETF Account",
        category: "offshore_ucits",
        contributionCapNote: "Unlimited; defers 28% dividend tax until sale + 15% internal US WHT",
        bestForAssets: ["Accumulating Global/US Equity ETFs (VWCE, CSPX)", "Long-term compounding"],
        avoidAssets: ["Distributing ETFs (triggers 28% tax every quarter)"],
      },
      {
        accountId: "pt_ppr",
        accountName: "PPR (Plano Poupança Reforma)",
        category: "tax_deferred",
        contributionCapNote: "8% reduced exit tax rate on gains after 8+ years (vs 28%)",
        bestForAssets: ["Balanced / Equity PPR funds held 8+ years"],
        avoidAssets: ["High-fee bank PPRs (>1.5% TER erodes tax benefit)"],
      },
      {
        accountId: "pt_taxable",
        accountName: "Portugal Taxable Brokerage",
        category: "taxable",
        contributionCapNote: "28% flat LTCG/Divs; 0% Crypto CGT if held >365 days",
        bestForAssets: ["Long-term Crypto (>365 days = 0% tax)", "Low-turnover equities (10%–30% CGT discount for >2–8yr hold)"],
        avoidAssets: ["Short-term <365d trading (up to 48% progressive rate)"],
      },
    ],
  };

  const templates = templatesByResidency[profile.residency];
  const foreignWeight = clamp(profile.foreignAllocationPct / 100, 0, 1);
  const domesticWeight = 1 - foreignWeight;

  // First compute taxable baseline wealth so we can show "Tax Saved vs Taxable"
  const calcWealth = (
    cat: "tax_free" | "tax_deferred" | "taxable" | "corporate" | "offshore_ucits"
  ) => {
    const whtInfo = getForeignDividendWhtPct(
      profile.residency,
      profile.foreignSourceCountry,
      cat
    );
    const whtDrag = (whtInfo.whtPct / 100) * divYield; // annual drag on foreign portion

    let domCagr = preTaxReturn;
    let forCagr = preTaxReturn - whtDrag;

    if (cat === "tax_free") {
      domCagr = preTaxReturn;
      forCagr = preTaxReturn - whtDrag;
    } else if (cat === "tax_deferred") {
      // Tax-deferred grows gross; assume 6% effective net benefit vs taxable from deferral & lower retirement bracket
      const deferNetFactor = 1 - Math.max(0, (marginalPct * 0.15) / 100) / years;
      domCagr = preTaxReturn * deferNetFactor;
      forCagr = (preTaxReturn - whtDrag) * deferNetFactor;
    } else if (cat === "offshore_ucits") {
      // Accumulating UCITS defers dividend tax; exit LTCG applies if residency has LTCG
      const annualizedExitCgtDrag = ((ltcgRate / 100) * priceReturn) * 0.72;
      domCagr = preTaxReturn - annualizedExitCgtDrag;
      forCagr = preTaxReturn - whtDrag - annualizedExitCgtDrag;
    } else if (cat === "corporate") {
      // Corporate investment wrapper: passive tax drag partially offset by upfront deferral
      const corpDrag = res.topOrdinaryRatePct === 0 ? 0 : (divYield * (domDivRate / 100) * 0.65) + (priceReturn * (ltcgRate / 100) * 0.75);
      domCagr = preTaxReturn - corpDrag;
      forCagr = preTaxReturn - corpDrag - (whtInfo.ftcRecoverable ? 0 : whtDrag);
    } else {
      // Taxable
      const domTaxDrag = divYield * (domDivRate / 100) + priceReturn * (ltcgRate / 100) * 0.78;
      const netForeignDivTaxRate = whtInfo.ftcRecoverable
        ? Math.max(forDivRate, whtInfo.whtPct) / 100
        : (forDivRate + whtInfo.whtPct) / 100;
      const forTaxDrag = divYield * netForeignDivTaxRate + priceReturn * (ltcgRate / 100) * 0.78;
      domCagr = preTaxReturn - domTaxDrag;
      forCagr = preTaxReturn - forTaxDrag;
    }

    const blendedCagr = domesticWeight * domCagr + foreignWeight * forCagr;
    const projectedWealth = principal * Math.pow(1 + blendedCagr, years);
    return {
      domCagrPct: round(domCagr * 100, 2),
      forCagrPct: round(forCagr * 100, 2),
      whtDragBps: round(whtDrag * 10000, 0),
      ftcRecoverable: whtInfo.ftcRecoverable,
      treatyNote: whtInfo.note,
      projectedWealth: round(projectedWealth, 0),
    };
  };

  const taxableBaseline = calcWealth("taxable").projectedWealth;

  const accounts: AccountLocationRow[] = templates.map((tpl) => {
    const resCalc = calcWealth(tpl.category);
    return {
      accountId: tpl.accountId,
      accountName: tpl.accountName,
      category: tpl.category,
      contributionCapNote: tpl.contributionCapNote,
      domesticAfterTaxCagrPct: resCalc.domCagrPct,
      foreignAfterTaxCagrPct: resCalc.forCagrPct,
      foreignWithholdingDragBps: resCalc.whtDragBps,
      ftcRecoverable: resCalc.ftcRecoverable,
      projected10YrWealthUsd: resCalc.projectedWealth,
      taxSavedVsTaxableUsd: round(resCalc.projectedWealth - taxableBaseline, 0),
      bestForAssets: tpl.bestForAssets,
      avoidAssets: tpl.avoidAssets,
      treatyNote: resCalc.treatyNote,
    };
  });

  // Asset Location Matrix (Optimal vs Worst account per asset bucket)
  const assetMatrix: AssetLocationRecommendation[] =
    profile.residency === "canada_on"
      ? [
          {
            assetBucket: "foreign_us_dividend",
            assetLabel: "US Dividend Stocks & ETFs (SCHD, VYM, JNJ)",
            optimalAccount: "RRSP / RRIF (US-listed)",
            worstAccount: "TFSA or FHSA",
            annualTaxDragSavedBps: 145,
            rationale:
              "US-Canada Tax Treaty Article XXI grants 0% US dividend WHT inside an RRSP (must hold US-listed ticker directly). Holding in a TFSA leaks 15% WHT permanently.",
          },
          {
            assetBucket: "domestic_dividend",
            assetLabel: "Canadian Eligible Dividend Stocks (RY, ENB, XEI)",
            optimalAccount: "Non-Registered Taxable / TFSA",
            worstAccount: "RRSP (converts DTC to 53.5% ordinary)",
            annualTaxDragSavedBps: 110,
            rationale:
              "Canadian Eligible Dividend Tax Credit lowers top Ontario dividend tax to 39.34% (and <10% at moderate incomes). Putting them in an RRSP destroys the DTC.",
          },
          {
            assetBucket: "foreign_growth_etf",
            assetLabel: "High-Growth US / Global Equities (NVDA, QQQ, XEQT)",
            optimalAccount: "TFSA / FHSA",
            worstAccount: "Non-Registered Taxable",
            annualTaxDragSavedBps: 215,
            rationale:
              "Low-dividend, high-appreciation equities suffer minimal WHT leakage while compounding 100% tax-free inside a TFSA.",
          },
          {
            assetBucket: "fixed_income_reit",
            assetLabel: "Bonds, Private Credit & REITs (5%–9% Yield)",
            optimalAccount: "RRSP / TFSA",
            worstAccount: "Non-Registered / CCPC (>50k AAII)",
            annualTaxDragSavedBps: 310,
            rationale:
              "Interest & non-ROC REIT distributions are taxed at full 53.53% marginal rate in Ontario (and trigger CCPC SBD passive grind). Shield inside RRSP/TFSA first.",
          },
          {
            assetBucket: "domestic_equity_growth",
            assetLabel: "Long-Term Buy & Hold Compounders",
            optimalAccount: "TFSA → CCPC HoldCo → Non-Registered",
            worstAccount: "High-Turnover Taxable",
            annualTaxDragSavedBps: 185,
            rationale:
              "In a CCPC, 50% of realized capital gains flow into the Capital Dividend Account (CDA) and can be paid out completely tax-free.",
          },
          {
            assetBucket: "active_options_crypto",
            assetLabel: "Options, Futures & Crypto",
            optimalAccount: "Non-Registered (Capital Loss Offset)",
            worstAccount: "TFSA (CRA business-income audit trap)",
            annualTaxDragSavedBps: 95,
            rationale:
              "Frequent trading in a TFSA can cause CRA to reclassify the entire account as fully taxable business income. Non-reg preserves capital loss carrybacks.",
          },
        ]
      : profile.residency === "us_ca" || profile.residency === "us_tx"
      ? [
          {
            assetBucket: "foreign_growth_etf",
            assetLabel: "High-Growth Equities (AI / Semis / Small-Cap)",
            optimalAccount: "Roth IRA / HSA",
            worstAccount: "Traditional 401(k)",
            annualTaxDragSavedBps: 240,
            rationale:
              "Maximum compounding belongs in Roth IRA/HSA where all upside is permanently tax-free rather than converting LTCG into future ordinary 401(k) RMDs.",
          },
          {
            assetBucket: "fixed_income_reit",
            assetLabel: "Taxable Bonds, Private Credit & REITs",
            optimalAccount: "401(k) / Traditional IRA",
            worstAccount: "US Taxable Brokerage",
            annualTaxDragSavedBps: 275,
            rationale:
              "Ordinary interest & non-qualified REIT distributions face up to 40.8%–54.1% tax in taxable accounts. Defer inside 401(k)/IRA (or use Muni Bonds in taxable).",
          },
          {
            assetBucket: "foreign_us_dividend",
            assetLabel: "International / Foreign Equity ETFs (VXUS / VEA)",
            optimalAccount: "US Taxable Brokerage (US-domiciled ETF)",
            worstAccount: "Roth IRA / Foreign-Domiciled UCITS",
            annualTaxDragSavedBps: 130,
            rationale:
              "US-domiciled international ETFs in taxable let you claim the Foreign Tax Credit (Form 1116). NEVER buy foreign-domiciled UCITS ETFs as a US person (punitive PFIC tax!).",
          },
          {
            assetBucket: "domestic_equity_growth",
            assetLabel: "Core US Index ETFs (VTI / VOO)",
            optimalAccount: "Taxable Brokerage (Direct Indexing / TLH)",
            worstAccount: "High-Fee Variable Annuity",
            annualTaxDragSavedBps: 145,
            rationale:
              "Qualified dividends, 23.8% federal LTCG, tax-loss harvesting, and full step-up in cost basis at death make taxable brokerage highly efficient for low-turnover US ETFs.",
          },
        ]
      : profile.residency === "singapore" || profile.residency === "uae"
      ? [
          {
            assetBucket: "foreign_us_dividend",
            assetLabel: "US S&P 500 & Dividend Equities",
            optimalAccount: "Irish-Domiciled UCITS ETF (CSPX / VWRA)",
            worstAccount: "Direct US-Listed ETF (SPY / VOO)",
            annualTaxDragSavedBps: 165,
            rationale:
              "Cuts US dividend WHT in half (30% → 15%) AND completely eliminates the 40% US Estate Tax exposure on US-situs assets above $60,000.",
          },
          {
            assetBucket: "domestic_dividend",
            assetLabel: "Local REITs, Banks & UK/HK Equities",
            optimalAccount: "0% Personal Brokerage",
            worstAccount: "High-Fee Offshore Insurance Bond",
            annualTaxDragSavedBps: 120,
            rationale:
              "0% local dividend tax, 0% CGT, and 0% UK/HK dividend WHT provide frictionless compounding without insurance wrapper fees.",
          },
          {
            assetBucket: "fixed_income_reit",
            assetLabel: "US Treasuries & Global Corporate Bonds",
            optimalAccount: "0% Personal Brokerage / UCITS Bond ETF",
            worstAccount: "US Mutual Fund (30% WHT)",
            annualTaxDragSavedBps: 150,
            rationale:
              "Direct US Treasuries qualify for the Portfolio Interest Exemption (0% WHT) while UCITS bond ETFs avoid US estate situs.",
          },
        ]
      : [
          {
            assetBucket: "foreign_us_dividend",
            assetLabel: "US Dividend Equities",
            optimalAccount: profile.residency === "uk" ? "SIPP Pension (0% US WHT)" : "Accumulating UCITS ETF",
            worstAccount: "Taxable Distributing Account",
            annualTaxDragSavedBps: 170,
            rationale:
              profile.residency === "uk"
                ? "UK-US tax treaty waives the 15% US dividend WHT inside a SIPP pension (unlike an ISA)."
                : "Accumulating EU UCITS ETFs avoid annual 28% dividend tax drag and compound gross until disposition.",
          },
          {
            assetBucket: "domestic_equity_growth",
            assetLabel: "Core Global Growth Equities",
            optimalAccount: profile.residency === "uk" ? "Stocks & Shares ISA" : "PPR / Accumulating UCITS",
            worstAccount: "Non-Reporting Offshore Fund",
            annualTaxDragSavedBps: 210,
            rationale:
              profile.residency === "uk"
                ? "£20k/yr ISA shields all capital gains and UK dividends permanently."
                : "Holding >8 years in a PPR drops Portuguese exit tax from 28% down to 8%.",
          },
        ];

  return { accounts, assetMatrix };
}

/**
 * 2. Accessing Different Streams of Receiving Investment Gains
 */
export function compareIncomeStreams(
  profile: GlobalTaxProfile
): IncomeStreamComparisonRow[] {
  const res = TAX_RESIDENCY_PROFILES[profile.residency];
  const marginalPct = computeMarginalOrdinaryRate(
    profile.residency,
    profile.annualOrdinaryIncomeUsd
  );
  const marginalScale =
    res.topOrdinaryRatePct > 0 ? marginalPct / res.topOrdinaryRatePct : 0;

  const gross = Math.max(1000, profile.targetGainToAccessUsd);
  const years = Math.max(1, profile.horizonYears);
  const preTaxR = profile.expectedPreTaxReturnPct / 100;
  const srcWht = getForeignDividendWhtPct(
    profile.residency,
    profile.foreignSourceCountry,
    "taxable"
  );

  const ltcgPct = round(
    res.id === "portugal" ? res.ltcgRatePct : res.ltcgRatePct * marginalScale,
    2
  );
  const stcgPct = round(
    res.id === "uk" ? res.stcgRatePct : res.stcgRatePct * marginalScale,
    2
  );
  const domDivPct = round(
    res.id === "portugal"
      ? res.domesticDividendRatePct
      : res.domesticDividendRatePct * marginalScale,
    2
  );
  const forDivPct = round(
    res.id === "portugal"
      ? res.foreignDividendRatePct
      : res.foreignDividendRatePct * marginalScale,
    2
  );
  const interestPct = round(
    res.id === "portugal" ? res.interestRatePct : res.interestRatePct * marginalScale,
    2
  );

  const buildRow = (
    streamId: IncomeStreamComparisonRow["streamId"],
    label: string,
    category: string,
    domesticTaxRatePct: number,
    foreignWhtPct: number,
    ftcOffset: boolean,
    borrowFrictionPct: number,
    accessMechanism: string,
    keyCaveat: string
  ): IncomeStreamComparisonRow => {
    const foreignWithholdingUsd = round(gross * (foreignWhtPct / 100), 0);
    const grossDomTax = gross * (domesticTaxRatePct / 100);
    const domesticTaxUsd = round(
      ftcOffset ? Math.max(0, grossDomTax - foreignWithholdingUsd) : grossDomTax,
      0
    );
    const borrowingOrFrictionUsd = round(gross * (borrowFrictionPct / 100), 0);
    const totalDrag = domesticTaxUsd + foreignWithholdingUsd + borrowingOrFrictionUsd;
    const netSpendableUsd = Math.max(0, round(gross - totalDrag, 0));
    const effectiveTaxRatePct = round((totalDrag / gross) * 100, 1);
    const afterTaxRetentionPct = round((netSpendableUsd / gross) * 100, 1);
    const netAnnualRate = preTaxR * (1 - effectiveTaxRatePct / 100);
    const tenYrCompoundedNetUsd = round(
      gross * Math.pow(1 + Math.max(0, netAnnualRate), years),
      0
    );

    return {
      streamId,
      label,
      category,
      grossAmountUsd: gross,
      domesticTaxUsd,
      foreignWithholdingUsd,
      borrowingOrFrictionUsd,
      netSpendableUsd,
      effectiveTaxRatePct,
      afterTaxRetentionPct,
      tenYrCompoundedNetUsd,
      accessMechanism,
      keyCaveat,
    };
  };

  // Corporate CDA / Tax-Free Extraction (e.g., Canada CDA 50% tax-free + eligible div, or QSBS/HoldCo)
  const corpCdaRatePct =
    profile.residency === "canada_on"
      ? round(domDivPct * 0.5, 1) // 50% tax-free CDA + 50% taxable eligible div blend
      : profile.residency === "us_ca" || profile.residency === "us_tx"
      ? round(ltcgPct * 0.35, 1) // QSBS partial / Section 1202 exclusion blend
      : round(ltcgPct * 0.5, 1);

  // Return of Capital (ROC): immediate tax 0%, defers to future LTCG (PV of deferred tax ~35% of LTCG)
  const rocEffectivePct = round(ltcgPct * 0.25, 1);

  // SBLOC / Lombard Borrow ("Buy-Borrow-Die"): 0% tax, ~6.2% annual interest friction (SOFR + 150bps)
  const sblocRatePct = 6.2;

  return [
    buildRow(
      "return_of_capital",
      "Return of Capital (ROC) / REITs",
      "Tax-Deferred Cashflow",
      rocEffectivePct,
      0,
      false,
      0,
      "Reduces Adjusted Cost Base (ACB) instead of triggering current income tax; taxed as LTCG only upon eventual sale (or when ACB hits $0).",
      "Once ACB reaches $0, future ROC becomes immediate capital gains; watch phantom distribution adjustments."
    ),
    buildRow(
      "sbloc_borrow",
      "Buy-Borrow-Die (SBLOC / Lombard Loan)",
      "Debt Liquidity",
      0,
      0,
      false,
      sblocRatePct,
      "Pledge diversified equities at 35%–50% LTV (SOFR + 150bps ≈ 6.2%) to access tax-free cash without triggering realized capital gains.",
      "Margin-call risk in a >35% equity drawdown; floating interest cost exceeds low LTCG rates in 0% jurisdictions."
    ),
    buildRow(
      "corp_cda_extraction",
      profile.residency === "canada_on"
        ? "Corp CDA + Eligible Dividend Mix"
        : profile.residency === "us_ca" || profile.residency === "us_tx"
        ? "QSBS (§1202) / HoldCo Blend"
        : "Corporate / HoldCo Distribution",
      "Corporate Extraction",
      corpCdaRatePct,
      0,
      false,
      0,
      profile.residency === "canada_on"
        ? "Harvest realized corporate capital gains to credit the 50% tax-free Capital Dividend Account (CDA), blended with RDTOH-refunded dividends."
        : "Use qualified small business stock exclusions or corporate participation exemptions to dramatically compress exit tax.",
      "Requires maintaining clean corporate books, CDA election (Form T2054 in Canada), or 5-year QSBS holding period."
    ),
    buildRow(
      "ltcg",
      "Long-Term Capital Gains (Sale)",
      "Equity Harvest",
      ltcgPct,
      0,
      false,
      0,
      "Sell appreciated shares held >1 year (or any duration in Canada/SG/UAE) to receive preferential capital gains inclusion/rates.",
      profile.residency === "canada_on"
        ? "50% inclusion baseline; watch superficial loss rules (30-day window) when tax-loss harvesting."
        : profile.residency === "us_ca"
        ? "California taxes LTCG as ordinary income (up to 13.3% on top of 23.8% Federal)."
        : "Control timing of realization across tax years to stay inside lower brackets."
    ),
    buildRow(
      "domestic_qualified_div",
      profile.residency === "canada_on"
        ? "Canadian Eligible Dividends (DTC)"
        : "Domestic Qualified Dividends",
      "Passive Income",
      domDivPct,
      0,
      false,
      0,
      "Receive quarterly dividends from domestic corporations eligible for Dividend Tax Credit (Canada) or Qualified 15%–20% rates (US).",
      "Cannot defer timing of tax; triggers annual tax drag even when dividends are DRIP-reinvested."
    ),
    buildRow(
      "foreign_div",
      `Foreign Dividends (${FOREIGN_SOURCE_COUNTRIES[profile.foreignSourceCountry].label.split(" ")[0]})`,
      "Cross-Border Income",
      forDivPct,
      srcWht.whtPct,
      srcWht.ftcRecoverable,
      0,
      "Receive foreign dividends net of source withholding tax; claim Foreign Tax Credit (FTC) on home return if held in taxable account.",
      profile.residency === "canada_on"
        ? "Foreign dividends get NO Canadian Dividend Tax Credit — taxed at full 53.53% marginal rate!"
        : "Unrecoverable WHT inside tax-free accounts (TFSA/ISA/Roth) or 0%-tax residencies (SG/UAE)."
    ),
    buildRow(
      "stcg",
      "Short-Term Capital Gains / Active Trading",
      "Active Alpha",
      stcgPct,
      0,
      false,
      0,
      "Realize <12-month equity, options, or futures gains (Section 1256 60/40 blend available for US index futures).",
      "Highest friction: taxed at top ordinary rates in US/Portugal/active Canadian business income."
    ),
    buildRow(
      "interest_credit",
      "Interest, Bonds & Private Credit",
      "Fixed Income",
      interestPct,
      0,
      false,
      0,
      "Coupon interest from corporate bonds, GICs, money markets, or private credit funds.",
      "Least tax-efficient stream in taxable accounts — prioritize inside RRSP/401(k)/TFSA/Roth/ISA."
    ),
  ].sort((a, b) => a.effectiveTaxRatePct - b.effectiveTaxRatePct);
}

/**
 * 3. Owning Businesses (Corporate Structures, Deferral, Passive Grind & Exit)
 */
export function analyzeBusinessOwnershipTax(
  profile: GlobalTaxProfile
): BusinessStructureRow[] {
  const res = TAX_RESIDENCY_PROFILES[profile.residency];
  const marginalPct = computeMarginalOrdinaryRate(
    profile.residency,
    Math.max(profile.annualOrdinaryIncomeUsd, profile.businessSalaryDrawUsd)
  );
  const profit = Math.max(25000, profile.businessAnnualProfitUsd);
  const draw = clamp(profile.businessSalaryDrawUsd, 0, profit);
  const retainedPreTax = Math.max(0, profit - draw);
  const passiveIncome = Math.max(0, profile.businessPassiveIncomeUsd);
  const exitVal = Math.max(100000, profile.businessExitValueUsd);

  // Baseline: Sole Proprietorship / Personal
  const solePropTax = round(profit * (marginalPct / 100), 0);
  const solePropExitRate = res.ltcgRatePct;
  const solePropExitTax = round(exitVal * (solePropExitRate / 100), 0);

  // Domestic Small Business Corp (CCPC in Canada, S-Corp in US, UK Ltd, SG Pte Ltd, UAE FZ)
  let smbCorpRate = 12.2;
  let smbLabel = "CCPC Small Business Corp (Ontario SBD)";
  let passiveGrindWarning: string | undefined;
  let smbExitTax = 0;
  let smbTakeaway = "";

  if (profile.residency === "canada_on") {
    // Ontario SBD: 12.2% on first $500k, ground down $5 per $1 of passive income over $50k
    const sbdLimit = Math.max(0, 500_000 - Math.max(0, passiveIncome - 50_000) * 5);
    const activeAtSbd = Math.min(retainedPreTax, sbdLimit);
    const activeAtGen = Math.max(0, retainedPreTax - activeAtSbd);
    smbCorpRate =
      retainedPreTax > 0
        ? round(((activeAtSbd * 12.2 + activeAtGen * 26.5) / retainedPreTax), 1)
        : 12.2;
    if (passiveIncome > 50_000) {
      passiveGrindWarning = `AAII Passive Grind Triggered: $${passiveIncome.toLocaleString()} passive income shrinks your $500k Small Business Deduction limit to $${Math.round(sbdLimit).toLocaleString()} (tax jumps 12.2% → 26.5%).`;
    }
    // LCGE ($1.25M CAD ≈ $920k USD tax-free on QSBC share sale)
    const lcgeShield = Math.min(exitVal, 920_000);
    smbExitTax = round((exitVal - lcgeShield) * (res.ltcgRatePct / 100), 0);
    smbTakeaway =
      "12.2% Ontario corporate tax leaves 87.8¢ on the dollar to compound vs 46.5¢ personally, plus ~$920k USD (C$1.25M) LCGE tax-free exit exemption on QSBC shares.";
  } else if (profile.residency === "us_ca" || profile.residency === "us_tx") {
    smbLabel = "US S-Corp / Pass-Through LLC (QBI §199A)";
    smbCorpRate = 0; // Pass-through, saves ~3.8%–7% SE tax & up to 20% QBI deduction
    const qbiEffective = Math.max(0, marginalPct * 0.84);
    smbExitTax = round(exitVal * (res.ltcgRatePct / 100), 0);
    smbTakeaway = `Pass-through S-Corp saves self-employment payroll tax on distributions above reasonable salary ($${draw.toLocaleString()}) and captures up to 20% QBI (§199A) deduction (~${round(qbiEffective, 1)}% effective).`;
  } else if (profile.residency === "uk") {
    smbLabel = "UK Limited Company (Ltd)";
    smbCorpRate = profit <= 65000 ? 19.0 : 25.0;
    // BADR (Business Asset Disposal Relief: 14% on first £1M)
    const badrShield = Math.min(exitVal, 1_250_000);
    smbExitTax = round(badrShield * 0.14 + Math.max(0, exitVal - badrShield) * 0.24, 0);
    smbTakeaway =
      "Retain profits at 19%–25% Corp Tax instead of 45% personal income tax; extract via low salary + pension contributions + Business Asset Disposal Relief (BADR) on exit.";
  } else if (profile.residency === "singapore") {
    smbLabel = "Singapore Pte Ltd (SUTE / PTE)";
    smbCorpRate = profit <= 150000 ? 8.5 : 14.5; // Effective after partial tax exemption
    smbExitTax = 0;
    smbTakeaway =
      "Effective 8.5%–14.5% corporate tax with 0% tax on dividends distributed to shareholders and 0% capital gains tax on exit.";
  } else if (profile.residency === "uae") {
    smbLabel = "UAE Free Zone Co (QFZP)";
    smbCorpRate = profit <= 102000 ? 0 : 4.5; // 0% qualifying or 9% above AED 375k
    smbExitTax = 0;
    smbTakeaway =
      "0% corporate tax on Qualifying Free Zone Income (or 9% above AED 375k) with 0% personal dividend extraction and 0% exit CGT.";
  } else {
    smbLabel = "Portuguese Lda (SME 17%/21%)";
    smbCorpRate = profit <= 55000 ? 17.0 : 20.0;
    smbExitTax = round(exitVal * 0.28, 0);
    smbTakeaway =
      "17% SME rate on first €50k profit; retain earnings inside the company to defer the 28% personal dividend withholding tax.";
  }

  const smbPersonalTax =
    profile.residency === "us_ca" || profile.residency === "us_tx"
      ? round(profit * ((marginalPct * 0.84) / 100), 0)
      : round(draw * ((marginalPct * 0.82) / 100), 0);
  const smbCorpTax =
    profile.residency === "us_ca" || profile.residency === "us_tx"
      ? 0
      : round(retainedPreTax * (smbCorpRate / 100), 0);
  const smbTotalTax = smbPersonalTax + smbCorpTax;
  const smbRetained = Math.max(0, round(profit - draw - smbCorpTax, 0));

  // Holding Company (HoldCo) for Passive Investments / Inter-Corporate Dividends
  const holdCoCorpRate =
    profile.residency === "canada_on"
      ? 50.17 // Refundable passive investment rate (30.67% RDTOH refundable on dividend payout)
      : profile.residency === "uk"
      ? 25.0
      : profile.residency === "singapore" || profile.residency === "uae"
      ? 0
      : 21.0;
  const holdCoNetEffectiveCorpRate =
    profile.residency === "canada_on" ? 19.5 : holdCoCorpRate; // Net after RDTOH refund
  const holdCoCorpTax = round(retainedPreTax * (holdCoNetEffectiveCorpRate / 100), 0);
  const holdCoPersonalTax = round(draw * ((res.domesticDividendRatePct * 0.85) / 100), 0);
  const holdCoTotalTax = holdCoCorpTax + holdCoPersonalTax;
  const holdCoExitTax = round(exitVal * (res.ltcgRatePct / 100), 0);

  // US C-Corp (QSBS §1202) — relevant for venture-backed startups / high-multiple exits
  const cCorpRate = 21.0;
  const cCorpTax = round(retainedPreTax * (cCorpRate / 100), 0);
  const cCorpPersonalTax = round(draw * (marginalPct / 100), 0);
  const cCorpTotalTax = cCorpTax + cCorpPersonalTax;
  const qsbsApplicable = profile.residency === "us_ca" || profile.residency === "us_tx";
  const cCorpExitTax = qsbsApplicable
    ? profile.residency === "us_ca"
      ? round(exitVal * 0.133, 0) // Federal 0% up to $10M under §1202, CA doesn't conform (13.3%)
      : 0 // 0% Fed + 0% TX up to $10M!
    : round(exitVal * (res.ltcgRatePct / 100), 0);

  // Foreign Operating Corp (e.g. UAE / Singapore / Cayman) owned from home residency
  const hasStrictCfc =
    profile.residency === "canada_on" ||
    profile.residency === "us_ca" ||
    profile.residency === "us_tx" ||
    profile.residency === "uk" ||
    profile.residency === "portugal";
  const foreignCorpLocalRate = 5.0;
  const cfcLookThroughPenaltyTax = hasStrictCfc
    ? round(retainedPreTax * ((marginalPct * 0.65) / 100), 0)
    : 0;
  const foreignCorpTax = round(retainedPreTax * (foreignCorpLocalRate / 100), 0) + cfcLookThroughPenaltyTax;
  const foreignPersonalTax = round(draw * (marginalPct / 100), 0);
  const foreignTotalTax = foreignCorpTax + foreignPersonalTax;
  const foreignExitTax = round(exitVal * (res.ltcgRatePct / 100), 0);

  const rows: BusinessStructureRow[] = [
    {
      structureId: "domestic_smb_corp",
      label: smbLabel,
      corporateTaxRatePct: smbCorpRate,
      annualCorporateTaxUsd: smbCorpTax,
      annualPersonalTaxUsd: smbPersonalTax,
      totalAnnualTaxUsd: smbTotalTax,
      effectiveCombinedRatePct: round((smbTotalTax / profit) * 100, 1),
      retainedForReinvestmentUsd: smbRetained,
      annualDeferralAdvantageUsd: round(solePropTax - smbTotalTax, 0),
      exitTaxOnSaleUsd: smbExitTax,
      exitEffectiveRatePct: round((smbExitTax / exitVal) * 100, 1),
      passiveGrindWarning,
      verdict: "OPTIMAL",
      keyTakeaway: smbTakeaway,
    },
    {
      structureId: "us_c_corp_qsbs",
      label: qsbsApplicable
        ? "US C-Corp (QSBS §1202 Venture Exit)"
        : "Growth C-Corp / Global Venture Corp",
      corporateTaxRatePct: cCorpRate,
      annualCorporateTaxUsd: cCorpTax,
      annualPersonalTaxUsd: cCorpPersonalTax,
      totalAnnualTaxUsd: cCorpTotalTax,
      effectiveCombinedRatePct: round((cCorpTotalTax / profit) * 100, 1),
      retainedForReinvestmentUsd: Math.max(0, round(profit - draw - cCorpTax, 0)),
      annualDeferralAdvantageUsd: round(solePropTax - cCorpTotalTax, 0),
      exitTaxOnSaleUsd: cCorpExitTax,
      exitEffectiveRatePct: round((cCorpExitTax / exitVal) * 100, 1),
      verdict: qsbsApplicable && exitVal >= 1_000_000 ? "OPTIMAL" : "VIABLE",
      keyTakeaway: qsbsApplicable
        ? profile.residency === "us_tx"
          ? "Section 1202 QSBS excludes up to $10M+ (100% Federal + 0% TX) on a 5-year qualified stock exit!"
          : "Federal §1202 excludes up to $10M (0% Fed), though California does not conform (13.3% state tax)."
        : "21% flat corporate rate; best suited for VC-backed companies raising institutional capital rather than lifestyle cashflow.",
    },
    {
      structureId: "holdco_passive",
      label:
        profile.residency === "canada_on"
          ? "OpCo → HoldCo (Inter-Corp Dividend & CDA)"
          : "Holding Company (Asset Protection & Reinvestment)",
      corporateTaxRatePct: holdCoNetEffectiveCorpRate,
      annualCorporateTaxUsd: holdCoCorpTax,
      annualPersonalTaxUsd: holdCoPersonalTax,
      totalAnnualTaxUsd: holdCoTotalTax,
      effectiveCombinedRatePct: round((holdCoTotalTax / profit) * 100, 1),
      retainedForReinvestmentUsd: Math.max(0, round(profit - draw - holdCoCorpTax, 0)),
      annualDeferralAdvantageUsd: round(solePropTax - holdCoTotalTax, 0),
      exitTaxOnSaleUsd: holdCoExitTax,
      exitEffectiveRatePct: round((holdCoExitTax / exitVal) * 100, 1),
      passiveGrindWarning:
        profile.residency === "canada_on"
          ? "Purifies OpCo for LCGE ($1.25M CAD) by sweeping excess cash tax-free into HoldCo, but associated corps share the $50k AAII passive limit."
          : undefined,
      verdict: "VIABLE",
      keyTakeaway:
        profile.residency === "canada_on"
          ? "Creditor-proofs surplus cash and keeps OpCo >90% active for LCGE qualification; invest HoldCo cash in capital-growth stocks to build tax-free CDA."
          : "Separates operating liability from long-term investment capital and enables flexible multi-generational ownership.",
    },
    {
      structureId: "sole_prop",
      label: "Sole Proprietorship / Personal Unincorporated",
      corporateTaxRatePct: 0,
      annualCorporateTaxUsd: 0,
      annualPersonalTaxUsd: solePropTax,
      totalAnnualTaxUsd: solePropTax,
      effectiveCombinedRatePct: round((solePropTax / profit) * 100, 1),
      retainedForReinvestmentUsd: Math.max(0, round(profit - draw - solePropTax, 0)),
      annualDeferralAdvantageUsd: 0,
      exitTaxOnSaleUsd: solePropExitTax,
      exitEffectiveRatePct: round((solePropExitTax / exitVal) * 100, 1),
      verdict: profit > 120000 ? "CAUTION" : "VIABLE",
      keyTakeaway:
        "Zero corporate compliance cost, but 100% of profit is taxed immediately at personal marginal rates with zero tax deferral or liability shield.",
    },
    {
      structureId: "foreign_operating_corp",
      label: "Foreign Low-Tax Corp (Owned While Tax Resident)",
      corporateTaxRatePct: foreignCorpLocalRate,
      annualCorporateTaxUsd: foreignCorpTax,
      annualPersonalTaxUsd: foreignPersonalTax,
      totalAnnualTaxUsd: foreignTotalTax,
      effectiveCombinedRatePct: round((foreignTotalTax / profit) * 100, 1),
      retainedForReinvestmentUsd: Math.max(0, round(profit - draw - foreignCorpTax, 0)),
      annualDeferralAdvantageUsd: round(solePropTax - foreignTotalTax, 0),
      exitTaxOnSaleUsd: foreignExitTax,
      exitEffectiveRatePct: round((foreignExitTax / exitVal) * 100, 1),
      cfcOrFapiWarning: hasStrictCfc
        ? profile.residency === "canada_on"
          ? "FAPI & Central Management Trap: CRA deems a foreign corp managed from Canada to be a Canadian tax resident, and taxes passive FAPI income annually."
          : profile.residency === "us_ca" || profile.residency === "us_tx"
          ? "GILTI / Subpart F / Form 5471 Trap: US shareholders owning >50% of a Controlled Foreign Corporation face immediate US look-through tax + $10k/yr Form 5471 penalties."
          : "CFC & Substance Rules: Without real local directors, offices, and employees, home tax authorities look through offshore companies."
        : undefined,
      verdict: hasStrictCfc ? "CAUTION" : "OPTIMAL",
      keyTakeaway: hasStrictCfc
        ? "Paper offshore companies DO NOT defer tax for CA/US/UK/EU tax residents due to CFC, FAPI, GILTI, and Mind & Management rules."
        : "Highly effective from a territorial residency (Singapore/UAE) with proper economic substance.",
    },
  ];

  return rows;
}

/**
 * 4. Foreign Real Estate Cross-Border Tax Analyzer
 */
export function analyzeForeignRealEstateTax(
  profile: GlobalTaxProfile
): ForeignRealEstateTaxResult {
  const res = TAX_RESIDENCY_PROFILES[profile.residency];
  const mkt = FOREIGN_REAL_ESTATE_MARKETS[profile.foreignPropertyMarket];
  const marginalPct = computeMarginalOrdinaryRate(
    profile.residency,
    profile.annualOrdinaryIncomeUsd
  );

  const price = Math.max(100_000, profile.foreignPropertyPriceUsd);
  const holdYears = Math.max(1, profile.foreignPropertyHoldYears);
  const grossYield = profile.foreignPropertyGrossYieldPct / 100;
  const appRate = profile.foreignPropertyAppreciationPct / 100;

  const isSameCountry =
    (profile.residency === "canada_on" && mkt.id === "canada_ontario") ||
    ((profile.residency === "us_ca" || profile.residency === "us_tx") &&
      mkt.id === "us_florida") ||
    (profile.residency === "uk" && mkt.id === "uk_london") ||
    (profile.residency === "uae" && mkt.id === "uae_dubai") ||
    (profile.residency === "portugal" && mkt.id === "portugal_lisbon");

  const entityLabels: Record<ForeignPropertyEntityType, string> = {
    personal_direct: "Personal Direct Ownership",
    home_corp: "Home-Country Corporation",
    local_llc: "Local Foreign LLC / SPV",
    trust_fideicomiso: "Cross-Border Trust / Fideicomiso",
  };

  // Acquisition friction
  const acquisitionStampAndTransferUsd = round(price * (mkt.stampTransferPct / 100), 0);
  const foreignBuyerSurchargeUsd = isSameCountry
    ? 0
    : round(price * (mkt.foreignBuyerSurchargePct / 100), 0);
  const entityExtraSetup =
    profile.foreignPropertyEntity === "personal_direct"
      ? 0
      : profile.foreignPropertyEntity === "trust_fideicomiso"
      ? 4500
      : 3500;
  const setupAndLegalUsd = mkt.legalAndSetupUsd + entityExtraSetup;
  const totalAcquisitionFrictionUsd =
    acquisitionStampAndTransferUsd + foreignBuyerSurchargeUsd + setupAndLegalUsd;

  // Annual Rental
  const grossAnnualRentUsd = round(price * grossYield, 0);
  const operatingAndPropertyTaxUsd = round(
    grossAnnualRentUsd * (mkt.opexAndPropTaxPctOfRent / 100),
    0
  );
  const preTaxNoi = Math.max(0, grossAnnualRentUsd - operatingAndPropertyTaxUsd);
  const depreciationShieldUsd = round(price * (mkt.depreciationPctOfPrice / 100), 0);
  const taxableForeignNetRent = Math.max(0, preTaxNoi - depreciationShieldUsd);

  const foreignRentalTaxGrossMethodUsd = isSameCountry
    ? round(taxableForeignNetRent * (mkt.netElectionTaxRatePct / 100), 0)
    : round(grossAnnualRentUsd * (mkt.grossRentalWhtPct / 100), 0);

  const foreignRentalTaxNetElectionUsd = round(
    taxableForeignNetRent * (mkt.netElectionTaxRatePct / 100),
    0
  );

  // Hybrid entity mismatch penalty (Classic Canada -> US LLC double tax trap!)
  const isCanadaUsLlcTrap =
    profile.residency === "canada_on" &&
    mkt.id === "us_florida" &&
    profile.foreignPropertyEntity === "local_llc";

  const homeTaxOnRentBeforeFtc = res.territorialSystem
    ? 0
    : round(taxableForeignNetRent * (marginalPct / 100), 0);
  const homeCountryNetTaxAfterFtcUsd = isCanadaUsLlcTrap
    ? round(homeTaxOnRentBeforeFtc * 0.95, 0) // CRA denies FTC on US LLC corporate vs personal mismatch!
    : Math.max(0, round(homeTaxOnRentBeforeFtc - foreignRentalTaxNetElectionUsd, 0));

  const totalAnnualRentalTax =
    foreignRentalTaxNetElectionUsd + homeCountryNetTaxAfterFtcUsd;
  const netAnnualAfterTaxCashflowUsd = round(preTaxNoi - totalAnnualRentalTax, 0);

  // Exit / Disposition
  const projectedExitPriceUsd = round(price * Math.pow(1 + appRate, holdYears), 0);
  const grossCapitalGainUsd = Math.max(0, projectedExitPriceUsd - price);

  const foreignCapGainsRate =
    mkt.id === "japan_tokyo" && holdYears <= 5
      ? 30.63
      : mkt.foreignCapGainsTaxPct;

  const foreignExitCapitalGainsTaxUsd = round(
    grossCapitalGainUsd * (foreignCapGainsRate / 100),
    0
  );
  const mandatoryClosingWithholdingUsd = isSameCountry
    ? 0
    : round(projectedExitPriceUsd * (mkt.closingWithholdingPct / 100), 0);

  const homeExitTaxBeforeFtc = res.territorialSystem
    ? 0
    : round(grossCapitalGainUsd * (res.ltcgRatePct / 100), 0);
  const homeExitTopUpTaxUsd = isCanadaUsLlcTrap
    ? round(homeExitTaxBeforeFtc * 0.9, 0)
    : Math.max(0, round(homeExitTaxBeforeFtc - foreignExitCapitalGainsTaxUsd, 0));

  const totalExitTax = foreignExitCapitalGainsTaxUsd + homeExitTopUpTaxUsd;
  const netAfterTaxExitProceedsUsd = round(projectedExitPriceUsd - totalExitTax, 0);

  // Approximate Pre-Tax vs After-Tax Unlevered IRR
  const totalOutflowPreTax = price;
  const totalInflowPreTax = preTaxNoi * holdYears + projectedExitPriceUsd;
  const preTaxIrrPct = round(
    (Math.pow(totalInflowPreTax / totalOutflowPreTax, 1 / holdYears) - 1) * 100,
    2
  );

  const totalOutflowAfterTax = price + totalAcquisitionFrictionUsd;
  const totalInflowAfterTax =
    netAnnualAfterTaxCashflowUsd * holdYears + netAfterTaxExitProceedsUsd;
  const afterTaxIrrPct = round(
    (Math.pow(Math.max(0.1, totalInflowAfterTax) / totalOutflowAfterTax, 1 / holdYears) - 1) *
      100,
    2
  );

  const totalLifecycleTaxDragPct = round(
    Math.max(0, preTaxIrrPct - afterTaxIrrPct),
    2
  );

  // Entity structure alerts
  const entityStructureAlerts: string[] = [];
  if (isCanadaUsLlcTrap) {
    entityStructureAlerts.push(
      "CRITICAL TRAP — Canada-US LLC Hybrid Mismatch: The IRS treats a single-member US LLC as disregarded, while CRA treats it as a corporation. Result: Foreign Tax Credits are denied and effective tax can exceed 65%–70%. Switch to Personal Direct, Cross-Border Trust, or Canadian LP."
    );
  }
  if (
    mkt.id === "mexico_riviera" &&
    !isSameCountry &&
    profile.foreignPropertyEntity === "personal_direct"
  ) {
    entityStructureAlerts.push(
      "Mexico Restricted Zone Rule: Foreigners cannot hold direct fee-simple title within 50km of the coast or 100km of borders — a Fideicomiso (Mexican Bank Trust) is legally required."
    );
  }
  if (
    profile.foreignPropertyEntity === "home_corp" &&
    profile.residency === "canada_on"
  ) {
    entityStructureAlerts.push(
      "Personal Use Benefit Warning: If you personally vacation in a property owned by your Canadian Corp, CRA assesses a taxable Shareholder Benefit (ITA §15(1))."
    );
  }
  if (mkt.id === "japan_tokyo" && holdYears <= 5) {
    entityStructureAlerts.push(
      "Japan Short-Term CGT Cliff: Selling within 5 calendar years doubles Japanese capital gains tax from 15.315% to 30.63%. Extending hold to Year 6 cuts exit tax in half."
    );
  }
  if (mkt.id === "canada_ontario" && !isSameCountry) {
    entityStructureAlerts.push(
      "Ontario 25% NRST + Federal Foreign Buyer Ban: Non-Canadians face a 25% Non-Resident Speculation Tax on 1–6 unit residential properties plus the federal residential purchase ban (commercial/mixed-use exempt)."
    );
  }
  if (entityStructureAlerts.length === 0) {
    entityStructureAlerts.push(
      `Structure Check Passed: ${entityLabels[profile.foreignPropertyEntity]} is aligned for ${mkt.label}. Always file the Net Rental Election (e.g., US §871(d) / Canada §216) to avoid punitive gross-rent withholding.`
    );
  }

  return {
    marketId: mkt.id,
    marketLabel: mkt.label,
    country: mkt.country,
    entityType: profile.foreignPropertyEntity,
    entityLabel: entityLabels[profile.foreignPropertyEntity],
    purchasePriceUsd: price,
    acquisitionStampAndTransferUsd,
    foreignBuyerSurchargeUsd,
    setupAndLegalUsd,
    totalAcquisitionFrictionUsd,
    grossAnnualRentUsd,
    operatingAndPropertyTaxUsd,
    depreciationShieldUsd,
    foreignRentalTaxGrossMethodUsd,
    foreignRentalTaxNetElectionUsd,
    homeCountryNetTaxAfterFtcUsd,
    netAnnualAfterTaxCashflowUsd,
    projectedExitPriceUsd,
    grossCapitalGainUsd,
    foreignExitCapitalGainsTaxUsd,
    mandatoryClosingWithholdingUsd,
    closingWithholdingRule: mkt.closingWithholdingRule,
    homeExitTopUpTaxUsd,
    netAfterTaxExitProceedsUsd,
    preTaxIrrPct,
    afterTaxIrrPct,
    totalLifecycleTaxDragPct,
    estateTaxExposureNote: mkt.estateTaxNote,
    entityStructureAlerts,
    recommendedStructure: mkt.recommendedEntityNote,
  };
}

/**
 * 5. Master Global Tax Audit & Compliance Scanner
 */
export function runGlobalTaxAudit(profile: GlobalTaxProfile): GlobalTaxReport {
  const res = TAX_RESIDENCY_PROFILES[profile.residency];
  const effectiveMarginalRatePct = computeMarginalOrdinaryRate(
    profile.residency,
    profile.annualOrdinaryIncomeUsd
  );
  const { accounts, assetMatrix } = analyzeAccountLocations(profile);
  const incomeStreams = compareIncomeStreams(profile);
  const businessStructures = analyzeBusinessOwnershipTax(profile);
  const foreignRealEstate = analyzeForeignRealEstateTax(profile);

  const complianceAlerts: TaxComplianceAlert[] = [];
  const foreignPortfolioUsd =
    profile.portfolioValueUsd * (profile.foreignAllocationPct / 100);

  // Canada T1135
  if (profile.residency === "canada_on" && foreignPortfolioUsd >= 75_000) {
    complianceAlerts.push({
      id: "ca-t1135",
      severity: "HIGH",
      code: "CRA T1135",
      title: "Foreign Income Verification Statement (>C$100k Cost)",
      summary: `Your foreign portfolio (~$${Math.round(foreignPortfolioUsd).toLocaleString()}) likely exceeds the C$100,000 cost-base threshold in non-registered accounts (RRSP/TFSA are exempt).`,
      action:
        "File Form T1135 annually (up to $2,500/yr late penalty) or hold US equities via Canadian-domiciled ETFs (e.g., XEQT/VFV) to bypass T1135 reporting.",
    });
  }

  // US Estate Tax Situs Trap for non-US residents
  if (
    profile.residency !== "us_ca" &&
    profile.residency !== "us_tx" &&
    (profile.foreignSourceCountry === "us" && foreignPortfolioUsd > 60_000)
  ) {
    complianceAlerts.push({
      id: "us-estate-situs",
      severity: "HIGH",
      code: "US ESTATE §2101",
      title: "Non-Resident US Estate Tax Exposure (>$60k US-Situs)",
      summary: `Holding ~$${Math.round(foreignPortfolioUsd).toLocaleString()} in direct US-situs stocks/ETFs triggers US Estate Tax reporting (Form 706-NA) and up to 40% tax above $60k for non-treaty residents.`,
      action:
        profile.residency === "canada_on"
          ? "Canada-US Treaty provides a pro-rata unified credit (exempt if global net worth < ~$13.6M USD), or use Canadian-domiciled ETFs for non-registered accounts."
          : "Switch direct US ETFs (SPY/VOO) to Irish-domiciled UCITS ETFs (CSPX/VWRA) to eliminate US Estate Tax AND cut dividend WHT from 30% to 15%.",
    });
  }

  // US PFIC & FBAR Trap
  if (profile.residency === "us_ca" || profile.residency === "us_tx") {
    complianceAlerts.push({
      id: "us-pfic-fbar",
      severity: "HIGH",
      code: "IRS PFIC / FBAR",
      title: "PFIC (Form 8621) & FBAR (FinCEN 114) Compliance",
      summary:
        "US persons holding non-US domiciled ETFs/mutual funds (including Canadian or Irish UCITS ETFs) trigger punitive PFIC excess distribution taxation (up to 50%+).",
      action:
        "Always buy US-domiciled ETFs (VXUS, VEA, VWO) for international exposure and file FBAR if aggregate foreign financial accounts exceed $10,000.",
    });
  }

  // Canada-US LLC Trap
  if (
    profile.residency === "canada_on" &&
    profile.foreignPropertyMarket === "us_florida" &&
    profile.foreignPropertyEntity === "local_llc"
  ) {
    complianceAlerts.push({
      id: "ca-us-llc",
      severity: "HIGH",
      code: "HYBRID TRAP",
      title: "Canada–US LLC Double Taxation Mismatch",
      summary:
        "Owning US real estate inside a US LLC as a Canadian tax resident causes IRS/CRA entity classification mismatch and loss of Foreign Tax Credits.",
      action:
        "Restructure into Personal Direct Ownership, a Cross-Border Revocable/Irrevocable Trust, or a Canadian LP before closing.",
    });
  }

  // Passive Income Grind in CCPC
  if (
    profile.residency === "canada_on" &&
    profile.businessPassiveIncomeUsd > 50_000
  ) {
    complianceAlerts.push({
      id: "ca-aaii-grind",
      severity: "MEDIUM",
      code: "CCPC AAII",
      title: "Small Business Deduction Passive Income Grind",
      summary: `Corporate passive income of $${profile.businessPassiveIncomeUsd.toLocaleString()} exceeds $50k, grinding down your 12.2% Ontario small-business limit by $5 per $1.`,
      action:
        "Shift HoldCo investments from high-interest/dividend assets toward low-turnover capital growth equities, IPP contributions, or corporate-owned exempt life insurance.",
    });
  }

  // FIRPTA / Closing Withholding
  if (foreignRealEstate.mandatoryClosingWithholdingUsd > 0) {
    complianceAlerts.push({
      id: "re-closing-wht",
      severity: "MEDIUM",
      code: "EXIT WHT",
      title: `Mandatory Foreign Property Closing Withholding ($${foreignRealEstate.mandatoryClosingWithholdingUsd.toLocaleString()})`,
      summary: foreignRealEstate.closingWithholdingRule,
      action:
        "File for a pre-closing withholding certificate (e.g., IRS Form 8288-B or CRA T2062) 90 days before disposition to avoid tying up gross sale proceeds.",
    });
  }

  // Compute Tax Alpha & Efficiency Score
  const bestAccount = [...accounts].sort(
    (a, b) => b.projected10YrWealthUsd - a.projected10YrWealthUsd
  )[0];
  const bestStream = incomeStreams[0];
  const worstStream = incomeStreams[incomeStreams.length - 1];
  const bestBiz = [...businessStructures].sort(
    (a, b) => a.totalAnnualTaxUsd - b.totalAnnualTaxUsd
  )[0];

  const accountAnnualAlpha = Math.max(
    0,
    round((bestAccount?.taxSavedVsTaxableUsd ?? 0) / Math.max(1, profile.horizonYears), 0)
  );
  const streamAlpha = Math.max(
    0,
    round((bestStream?.netSpendableUsd ?? 0) - (worstStream?.netSpendableUsd ?? 0), 0)
  );
  const bizAlpha = Math.max(0, bestBiz?.annualDeferralAdvantageUsd ?? 0);
  const reNetElectionAlpha = Math.max(
    0,
    foreignRealEstate.foreignRentalTaxGrossMethodUsd -
      foreignRealEstate.foreignRentalTaxNetElectionUsd
  );

  const estimatedAnnualTaxAlphaUsd = round(
    accountAnnualAlpha + bizAlpha + reNetElectionAlpha + streamAlpha * 0.25,
    0
  );

  const highSeverityCount = complianceAlerts.filter((a) => a.severity === "HIGH").length;
  const baseScore =
    res.topOrdinaryRatePct === 0
      ? 92
      : clamp(Math.round(84 - highSeverityCount * 9 - (effectiveMarginalRatePct - 25) * 0.35), 42, 95);

  const executivePlaybook: string[] = [
    `Asset Location: Route ${profile.foreignAllocationPct}% foreign allocation through ${bestAccount?.accountName ?? "tax-advantaged accounts"} to capture +$${(bestAccount?.taxSavedVsTaxableUsd ?? 0).toLocaleString()} over ${profile.horizonYears} years vs. taxable.`,
    `Gain Access Waterfall: Accessing $${profile.targetGainToAccessUsd.toLocaleString()} via ${bestStream?.label} keeps $${bestStream?.netSpendableUsd.toLocaleString()} (${bestStream?.effectiveTaxRatePct}% drag) vs. $${worstStream?.netSpendableUsd.toLocaleString()} (${worstStream?.effectiveTaxRatePct}% drag) via ${worstStream?.label}.`,
    `Business Structuring: Operating via ${bestBiz?.label} saves ~$${Math.max(0, bestBiz?.annualDeferralAdvantageUsd ?? 0).toLocaleString()}/yr in tax deferral vs. sole proprietorship (Exit tax: ${bestBiz?.exitEffectiveRatePct}%).`,
    `Foreign Real Estate (${foreignRealEstate.marketLabel}): Net rental election saves $${reNetElectionAlpha.toLocaleString()}/yr vs. gross withholding; lifecycle tax drag is ${foreignRealEstate.totalLifecycleTaxDragPct}% IRR (${foreignRealEstate.preTaxIrrPct}% pre-tax → ${foreignRealEstate.afterTaxIrrPct}% after-tax).`,
  ];

  return {
    residency: res,
    effectiveMarginalRatePct,
    taxEfficiencyScore: baseScore,
    estimatedAnnualTaxAlphaUsd,
    bestAccountWrapper: bestAccount?.accountName ?? "Tax-Advantaged Account",
    bestGainStream: bestStream?.label ?? "Long-Term Capital Gains",
    bestBusinessStructure: bestBiz?.label ?? "Domestic Small Business Corp",
    accountLocations: accounts,
    assetLocationMatrix: assetMatrix,
    incomeStreams,
    businessStructures,
    foreignRealEstate,
    complianceAlerts,
    executivePlaybook,
  };
}

/**
 * Deterministic fallback Pocket Tax Consultant when no Gemini API key is configured.
 */
export function generateDeterministicTaxAdvice(
  question: string,
  report: GlobalTaxReport,
  profile: GlobalTaxProfile
): {
  answer: string;
  keyMetricsCited: string[];
  actionSteps: string[];
  riskFlags: string[];
} {
  const q = question.toLowerCase();
  const res = report.residency;
  const bestAcc = report.accountLocations[0];
  const bestStream = report.incomeStreams[0];
  const worstStream = report.incomeStreams[report.incomeStreams.length - 1];
  const bestBiz = report.businessStructures[0];
  const re = report.foreignRealEstate;

  if (q.includes("real estate") || q.includes("property") || q.includes("florida") || q.includes("portugal") || q.includes("mexico") || q.includes("firpta") || q.includes("llc")) {
    return {
      answer: `For a **${res.label}** tax resident acquiring a **$${re.purchasePriceUsd.toLocaleString()}** property in **${re.marketLabel}** via **${re.entityLabel}**, total upfront acquisition friction is **$${re.totalAcquisitionFrictionUsd.toLocaleString()}** (including $${re.foreignBuyerSurchargeUsd.toLocaleString()} foreign buyer surcharge). Filing the Net Rental Election slashes annual foreign rental tax from **$${re.foreignRentalTaxGrossMethodUsd.toLocaleString()}** (gross WHT) to **$${re.foreignRentalTaxNetElectionUsd.toLocaleString()}**, yielding **$${re.netAnnualAfterTaxCashflowUsd.toLocaleString()}/yr** after-tax cashflow (using $${re.depreciationShieldUsd.toLocaleString()}/yr depreciation shield). On exit in Year ${profile.foreignPropertyHoldYears}, expect **$${re.foreignExitCapitalGainsTaxUsd.toLocaleString()}** foreign CGT and **$${re.mandatoryClosingWithholdingUsd.toLocaleString()}** mandatory closing withholding, bringing unlevered IRR from **${re.preTaxIrrPct}%** pre-tax to **${re.afterTaxIrrPct}%** after-tax.`,
      keyMetricsCited: [
        `Pre-Tax → After-Tax IRR: ${re.preTaxIrrPct}% → ${re.afterTaxIrrPct}%`,
        `Acquisition Friction: $${re.totalAcquisitionFrictionUsd.toLocaleString()}`,
        `Closing Withholding: $${re.mandatoryClosingWithholdingUsd.toLocaleString()}`,
      ],
      actionSteps: [
        `Recommended Entity: ${re.recommendedStructure}`,
        "Elect Net Rental Basis (e.g., US §871(d) / Canada §216) in Year 1 to deduct opex, property tax, and depreciation.",
        "Apply for a pre-closing withholding certificate 90 days before sale to prevent tying up gross proceeds.",
      ],
      riskFlags: [re.estateTaxExposureNote, ...re.entityStructureAlerts],
    };
  }

  if (q.includes("business") || q.includes("corp") || q.includes("salary") || q.includes("dividend") || q.includes("ccpc") || q.includes("qsbs") || q.includes("holdco")) {
    return {
      answer: `On **$${profile.businessAnnualProfitUsd.toLocaleString()}** of annual business profit (drawing **$${profile.businessSalaryDrawUsd.toLocaleString()}** personally) as a **${res.label}** resident, **${bestBiz.label}** is your highest-efficiency vehicle: combined annual tax is **$${bestBiz.totalAnnualTaxUsd.toLocaleString()}** (**${bestBiz.effectiveCombinedRatePct}%** effective), generating **$${Math.max(0, bestBiz.annualDeferralAdvantageUsd).toLocaleString()}/yr** in tax deferral vs. a sole proprietorship and leaving **$${bestBiz.retainedForReinvestmentUsd.toLocaleString()}/yr** inside the corporation to compound. On a **$${profile.businessExitValueUsd.toLocaleString()}** business exit, projected exit tax is **$${bestBiz.exitTaxOnSaleUsd.toLocaleString()}** (**${bestBiz.exitEffectiveRatePct}%** effective).`,
      keyMetricsCited: [
        `Best Structure: ${bestBiz.label}`,
        `Annual Deferral Advantage: +$${Math.max(0, bestBiz.annualDeferralAdvantageUsd).toLocaleString()}/yr`,
        `Exit Effective Tax: ${bestBiz.exitEffectiveRatePct}% ($${bestBiz.exitTaxOnSaleUsd.toLocaleString()})`,
      ],
      actionSteps: [
        bestBiz.keyTakeaway,
        "Draw only the salary needed for personal living expenses + pension/RRSP/401(k) contribution room; retain surplus profits at the lower corporate rate.",
        "Invest corporate retained earnings in capital-growth equities rather than high-interest debt to minimize passive tax drag.",
      ],
      riskFlags: [
        ...(bestBiz.passiveGrindWarning ? [bestBiz.passiveGrindWarning] : []),
        "Avoid paper offshore companies while tax-resident in CA/US/UK/EU due to CFC, FAPI, and GILTI anti-deferral rules.",
      ],
    };
  }

  if (q.includes("stream") || q.includes("gain") || q.includes("withdraw") || q.includes("borrow") || q.includes("roc") || q.includes("cash") || q.includes("access")) {
    return {
      answer: `To access **$${profile.targetGainToAccessUsd.toLocaleString()}** of investment gains as a **${res.label}** resident (marginal rate **${report.effectiveMarginalRatePct}%**), your most tax-efficient stream is **${bestStream.label}** — delivering **$${bestStream.netSpendableUsd.toLocaleString()}** net spendable cash (**${bestStream.effectiveTaxRatePct}%** total drag). By contrast, receiving the same amount as **${worstStream.label}** leaves only **$${worstStream.netSpendableUsd.toLocaleString()}** (**${worstStream.effectiveTaxRatePct}%** drag) — a **$${(bestStream.netSpendableUsd - worstStream.netSpendableUsd).toLocaleString()}** immediate cash difference.`,
      keyMetricsCited: [
        `Best Stream: ${bestStream.label} (${bestStream.effectiveTaxRatePct}% drag)`,
        `Worst Stream: ${worstStream.label} (${worstStream.effectiveTaxRatePct}% drag)`,
        `Cash Saved on $${profile.targetGainToAccessUsd.toLocaleString()}: $${(bestStream.netSpendableUsd - worstStream.netSpendableUsd).toLocaleString()}`,
      ],
      actionSteps: [
        `Primary Harvest: ${bestStream.accessMechanism}`,
        "Blend Return of Capital (ROC) distributions, Long-Term Capital Gains, and low-LTV SBLOC borrowing (keep LTV <30%) to stay out of top brackets.",
        "Harvest capital losses annually before year-end (respecting 30-day wash/superficial loss rules) to offset realized gains.",
      ],
      riskFlags: [bestStream.keyCaveat, worstStream.keyCaveat],
    };
  }

  // Default: Comprehensive Pocket Tax Consultant Briefing (Accounts, Foreign WHT, Overall Alpha)
  return {
    answer: `**Global Tax Audit (${res.label} · Marginal Rate ${report.effectiveMarginalRatePct}%)**: Your current cross-border profile scores **${report.taxEfficiencyScore}/100** with an estimated **$${report.estimatedAnnualTaxAlphaUsd.toLocaleString()}/yr** in recoverable tax alpha. For your **$${profile.portfolioValueUsd.toLocaleString()}** portfolio (${profile.foreignAllocationPct}% foreign), **${bestAcc.accountName}** compounds to **$${bestAcc.projected10YrWealthUsd.toLocaleString()}** over ${profile.horizonYears} years (**+$${bestAcc.taxSavedVsTaxableUsd.toLocaleString()}** ahead of a taxable account). Watch your **${report.complianceAlerts.length} active cross-border compliance alert(s)** — especially withholding tax leakage (${bestAcc.foreignWithholdingDragBps} bps in ${bestAcc.accountName}) and entity/situs traps.`,
    keyMetricsCited: [
      `Tax Efficiency Score: ${report.taxEfficiencyScore}/100`,
      `Est. Annual Tax Alpha: $${report.estimatedAnnualTaxAlphaUsd.toLocaleString()}/yr`,
      `Top Wrapper: ${bestAcc.accountName} (+$${bestAcc.taxSavedVsTaxableUsd.toLocaleString()} vs taxable)`,
    ],
    actionSteps: report.executivePlaybook,
    riskFlags: report.complianceAlerts.map((a) => `[${a.code}] ${a.title}: ${a.action}`),
  };
}
