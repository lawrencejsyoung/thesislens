/**
 * Canonical line items and how to find each one in SEC XBRL data.
 *
 * Companies tag the same economic line differently (and change tags over time), so every
 * item has an ordered list of candidates. Candidates are tried per period, so a company that
 * switched from `SalesRevenueNet` to `RevenueFromContractWithCustomer...` in 2018 still gets
 * a continuous revenue series. Tags are namespaced: `us-gaap:`, `ifrs-full:` (20-F filers), `dei:`.
 *
 * Sign convention: values are stored as reported. Cash outflows that XBRL reports as positive
 * payments (capex, dividends, buybacks, acquisitions) stay positive.
 */

export type Statement = "income" | "balance" | "cashflow";
export type PeriodType = "duration" | "instant";
export type UnitKind = "currency" | "shares" | "perShare";

export type Candidate =
  /** A single tag, optionally net of other tags (e.g. total long-term debt minus its current portion). */
  | { tag: string; minus?: string[] }
  /** Sum of whichever listed tags are reported for the period (at least one required). */
  | { sum: string[] };

export interface LineItemDef {
  id: LineItemId;
  label: string;
  statement: Statement;
  periodType: PeriodType;
  unit: UnitKind;
  /** Additive flows can be derived (Q4 = FY − 9M, Q2 = H1 − Q1). EPS and share counts cannot. */
  additive: boolean;
  /** "first": first candidate with a value wins. "max": largest candidate wins (totals vs components). */
  strategy: "first" | "max";
  candidates: Candidate[];
}

export const LINE_ITEM_IDS = [
  // Income statement
  "revenue",
  "costOfRevenue",
  "grossProfit",
  "researchAndDevelopment",
  "sellingGeneralAdmin",
  "operatingIncome",
  "interestExpense",
  "pretaxIncome",
  "incomeTax",
  "netIncome",
  "epsDiluted",
  "dilutedShares",
  // Banks
  "netInterestIncome",
  "nonInterestIncome",
  "nonInterestExpense",
  "provisionForCreditLosses",
  // Balance sheet
  "cash",
  "shortTermInvestments",
  "longTermInvestments",
  "receivables",
  "inventory",
  "currentAssets",
  "ppe",
  "goodwill",
  "intangibles",
  "totalAssets",
  "accountsPayable",
  "currentLiabilities",
  "currentDebt",
  "longTermDebt",
  "totalLiabilities",
  "equity",
  "minorityInterest",
  "equityInclNci",
  "liabilitiesAndEquity",
  "mezzanineEquity",
  "sharesOutstanding",
  "loans",
  "deposits",
  // Cash flow
  "depreciationAmortization",
  "stockBasedCompensation",
  "operatingCashFlow",
  "capex",
  "acquisitions",
  "investingCashFlow",
  "financingCashFlow",
  "dividendsPaid",
  "shareRepurchases",
  // Computed (never reported directly)
  "totalDebt",
  "netDebt",
  "freeCashFlow",
  "ebitda",
] as const;

export type LineItemId = (typeof LINE_ITEM_IDS)[number];

const t = (...tags: string[]): Candidate[] => tags.map((tag) => ({ tag }));

function def(
  id: LineItemId,
  label: string,
  statement: Statement,
  periodType: PeriodType,
  candidates: Candidate[],
  opts: Partial<Pick<LineItemDef, "unit" | "additive" | "strategy">> = {}
): LineItemDef {
  return {
    id,
    label,
    statement,
    periodType,
    candidates,
    unit: opts.unit ?? "currency",
    additive: opts.additive ?? periodType === "duration",
    strategy: opts.strategy ?? "first",
  };
}

export const REPORTED_LINE_ITEMS: LineItemDef[] = [
  // ── Income statement ──────────────────────────────────────────────────────
  def(
    "revenue",
    "Revenue",
    "income",
    "duration",
    t(
      "us-gaap:Revenues",
      "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
      "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
      "us-gaap:SalesRevenueNet",
      "us-gaap:SalesRevenueGoodsNet",
      "us-gaap:RevenuesNetOfInterestExpense",
      "ifrs-full:Revenue",
      "ifrs-full:RevenueFromContractsWithCustomers"
    ).concat([
      // IFRS filers that only tag the components (e.g. Novartis: goods + royalties).
      {
        sum: [
          "ifrs-full:RevenueFromSaleOfGoods",
          "ifrs-full:RevenueFromRenderingOfServices",
          "ifrs-full:RevenueFromRoyalties",
        ],
      },
    ]),
    { strategy: "max" }
  ),
  def(
    "costOfRevenue",
    "Cost of revenue",
    "income",
    "duration",
    t(
      "us-gaap:CostOfRevenue",
      "us-gaap:CostOfGoodsAndServicesSold",
      "us-gaap:CostOfGoodsSold",
      "us-gaap:CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
      "ifrs-full:CostOfSales"
    )
  ),
  def("grossProfit", "Gross profit", "income", "duration", t("us-gaap:GrossProfit", "ifrs-full:GrossProfit")),
  def(
    "researchAndDevelopment",
    "Research & development",
    "income",
    "duration",
    t(
      "us-gaap:ResearchAndDevelopmentExpense",
      "us-gaap:ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
      "ifrs-full:ResearchAndDevelopmentExpense"
    )
  ),
  def(
    "sellingGeneralAdmin",
    "Selling, general & administrative",
    "income",
    "duration",
    [
      { tag: "us-gaap:SellingGeneralAndAdministrativeExpense" },
      { sum: ["us-gaap:SellingAndMarketingExpense", "us-gaap:GeneralAndAdministrativeExpense"] },
      { sum: ["ifrs-full:SellingGeneralAndAdministrativeExpense"] },
      { sum: ["ifrs-full:DistributionCosts", "ifrs-full:AdministrativeExpense"] },
    ]
  ),
  def(
    "operatingIncome",
    "Operating income",
    "income",
    "duration",
    t("us-gaap:OperatingIncomeLoss", "ifrs-full:ProfitLossFromOperatingActivities")
  ),
  def(
    "interestExpense",
    "Interest expense",
    "income",
    "duration",
    t(
      "us-gaap:InterestExpense",
      "us-gaap:InterestExpenseNonoperating",
      "us-gaap:InterestExpenseDebt",
      "us-gaap:InterestAndDebtExpense",
      "ifrs-full:InterestExpense",
      "ifrs-full:FinanceCosts"
    )
  ),
  def(
    "pretaxIncome",
    "Pre-tax income",
    "income",
    "duration",
    t(
      "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
      "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
      "ifrs-full:ProfitLossBeforeTax"
    )
  ),
  def(
    "incomeTax",
    "Income tax",
    "income",
    "duration",
    t("us-gaap:IncomeTaxExpenseBenefit", "ifrs-full:IncomeTaxExpenseContinuingOperations")
  ),
  def(
    "netIncome",
    "Net income to common",
    "income",
    "duration",
    t(
      "us-gaap:NetIncomeLoss",
      "us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic",
      "ifrs-full:ProfitLossAttributableToOwnersOfParent",
      "us-gaap:ProfitLoss",
      "ifrs-full:ProfitLoss"
    )
  ),
  def(
    "epsDiluted",
    "Diluted EPS",
    "income",
    "duration",
    t(
      "us-gaap:EarningsPerShareDiluted",
      "us-gaap:EarningsPerShareBasicAndDiluted",
      "ifrs-full:DilutedEarningsLossPerShare",
      "us-gaap:EarningsPerShareBasic"
    ),
    { unit: "perShare", additive: false }
  ),
  def(
    "dilutedShares",
    "Diluted weighted shares",
    "income",
    "duration",
    t(
      "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding",
      "us-gaap:WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
      "ifrs-full:AdjustedWeightedAverageShares",
      "ifrs-full:WeightedAverageNumberOfSharesOutstandingBasicAndDiluted",
      "us-gaap:WeightedAverageNumberOfSharesOutstandingBasic",
      "ifrs-full:WeightedAverageShares"
    ),
    { unit: "shares", additive: false }
  ),

  // ── Bank-specific ─────────────────────────────────────────────────────────
  def(
    "netInterestIncome",
    "Net interest income",
    "income",
    "duration",
    t("us-gaap:InterestIncomeExpenseNet", "us-gaap:InterestIncomeExpenseOperatingNet")
  ),
  def("nonInterestIncome", "Non-interest income", "income", "duration", t("us-gaap:NoninterestIncome")),
  def("nonInterestExpense", "Non-interest expense", "income", "duration", t("us-gaap:NoninterestExpense")),
  def(
    "provisionForCreditLosses",
    "Provision for credit losses",
    "income",
    "duration",
    t(
      "us-gaap:ProvisionForLoanLeaseAndOtherLosses",
      "us-gaap:ProvisionForLoanAndLeaseLosses",
      "us-gaap:CreditLossExpenseReversal",
      "us-gaap:FinancingReceivableCreditLossExpenseReversal"
    )
  ),

  // ── Balance sheet ─────────────────────────────────────────────────────────
  def(
    "cash",
    "Cash & equivalents",
    "balance",
    "instant",
    t(
      "us-gaap:CashAndCashEquivalentsAtCarryingValue",
      "us-gaap:CashAndDueFromBanks",
      "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
      "us-gaap:Cash",
      "ifrs-full:CashAndCashEquivalents"
    )
  ),
  def(
    "shortTermInvestments",
    "Short-term investments",
    "balance",
    "instant",
    t(
      "us-gaap:ShortTermInvestments",
      "us-gaap:MarketableSecuritiesCurrent",
      "us-gaap:AvailableForSaleSecuritiesDebtSecuritiesCurrent",
      "ifrs-full:CurrentInvestments",
      "ifrs-full:OtherCurrentFinancialAssets"
    )
  ),
  def(
    "longTermInvestments",
    "Long-term marketable securities",
    "balance",
    "instant",
    t(
      "us-gaap:MarketableSecuritiesNoncurrent",
      "us-gaap:AvailableForSaleSecuritiesDebtSecuritiesNoncurrent",
      "us-gaap:LongTermInvestments"
    )
  ),
  def(
    "receivables",
    "Receivables",
    "balance",
    "instant",
    t(
      "us-gaap:AccountsReceivableNetCurrent",
      "us-gaap:ReceivablesNetCurrent",
      "ifrs-full:TradeAndOtherCurrentReceivables",
      "ifrs-full:CurrentTradeReceivables"
    )
  ),
  def("inventory", "Inventory", "balance", "instant", t("us-gaap:InventoryNet", "ifrs-full:Inventories")),
  def("currentAssets", "Current assets", "balance", "instant", t("us-gaap:AssetsCurrent", "ifrs-full:CurrentAssets")),
  def(
    "ppe",
    "PP&E, net",
    "balance",
    "instant",
    t(
      "us-gaap:PropertyPlantAndEquipmentNet",
      "us-gaap:PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization",
      "ifrs-full:PropertyPlantAndEquipment"
    )
  ),
  def("goodwill", "Goodwill", "balance", "instant", t("us-gaap:Goodwill", "ifrs-full:Goodwill")),
  def(
    "intangibles",
    "Intangibles ex-goodwill",
    "balance",
    "instant",
    t(
      "us-gaap:IntangibleAssetsNetExcludingGoodwill",
      "us-gaap:FiniteLivedIntangibleAssetsNet",
      "ifrs-full:IntangibleAssetsOtherThanGoodwill"
    )
  ),
  def("totalAssets", "Total assets", "balance", "instant", t("us-gaap:Assets", "ifrs-full:Assets")),
  def(
    "accountsPayable",
    "Accounts payable",
    "balance",
    "instant",
    t(
      "us-gaap:AccountsPayableCurrent",
      "us-gaap:AccountsPayableAndAccruedLiabilitiesCurrent",
      "ifrs-full:TradeAndOtherCurrentPayables",
      "ifrs-full:TradeAndOtherCurrentPayablesToTradeSuppliers"
    )
  ),
  def(
    "currentLiabilities",
    "Current liabilities",
    "balance",
    "instant",
    t("us-gaap:LiabilitiesCurrent", "ifrs-full:CurrentLiabilities")
  ),
  def("currentDebt", "Short-term debt", "balance", "instant", [
    { tag: "us-gaap:DebtCurrent" },
    { tag: "us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent" },
    {
      sum: [
        "us-gaap:LongTermDebtCurrent",
        "us-gaap:ShortTermBorrowings",
        "us-gaap:CommercialPaper",
      ],
    },
    { tag: "ifrs-full:CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings" },
    { sum: ["ifrs-full:ShorttermBorrowings", "ifrs-full:CurrentPortionOfLongtermBorrowings"] },
  ]),
  def(
    "longTermDebt",
    "Long-term debt",
    "balance",
    "instant",
    t(
      "us-gaap:LongTermDebtNoncurrent",
      "us-gaap:LongTermDebtAndCapitalLeaseObligations",
      "us-gaap:LongTermBorrowings",
      "us-gaap:SeniorLongTermNotes",
      "us-gaap:UnsecuredLongTermDebt",
      "ifrs-full:NoncurrentPortionOfNoncurrentBorrowings",
      "ifrs-full:LongtermBorrowings"
    ).concat([
      // Some filers only report total long-term debt including current maturities.
      { tag: "us-gaap:LongTermDebt", minus: ["us-gaap:LongTermDebtCurrent"] },
    ])
  ),
  def("totalLiabilities", "Total liabilities", "balance", "instant", t("us-gaap:Liabilities", "ifrs-full:Liabilities")),
  def(
    "equity",
    "Shareholders' equity (parent)",
    "balance",
    "instant",
    t("us-gaap:StockholdersEquity", "ifrs-full:EquityAttributableToOwnersOfParent")
  ),
  def(
    "minorityInterest",
    "Non-controlling interest",
    "balance",
    "instant",
    t("us-gaap:MinorityInterest", "ifrs-full:NoncontrollingInterests")
  ),
  def(
    "equityInclNci",
    "Total equity incl. NCI",
    "balance",
    "instant",
    t("us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "ifrs-full:Equity")
  ),
  def(
    "liabilitiesAndEquity",
    "Total liabilities & equity",
    "balance",
    "instant",
    t("us-gaap:LiabilitiesAndStockholdersEquity", "ifrs-full:EquityAndLiabilities")
  ),
  def(
    "mezzanineEquity",
    "Redeemable / temporary equity",
    "balance",
    "instant",
    t(
      "us-gaap:TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests",
      "us-gaap:RedeemableNoncontrollingInterestEquityCarryingAmount",
      "us-gaap:TemporaryEquityCarryingAmountAttributableToParent"
    )
  ),
  def(
    "sharesOutstanding",
    "Shares outstanding",
    "balance",
    "instant",
    t("us-gaap:CommonStockSharesOutstanding"),
    { unit: "shares" }
  ),
  def(
    "loans",
    "Loans, net",
    "balance",
    "instant",
    t(
      "us-gaap:LoansAndLeasesReceivableNetReportedAmount",
      "us-gaap:FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss",
      "us-gaap:LoansAndLeasesReceivableNetOfDeferredIncome"
    )
  ),
  def("deposits", "Deposits", "balance", "instant", t("us-gaap:Deposits")),

  // ── Cash flow ─────────────────────────────────────────────────────────────
  def(
    "depreciationAmortization",
    "Depreciation & amortization",
    "cashflow",
    "duration",
    t(
      "us-gaap:DepreciationDepletionAndAmortization",
      "us-gaap:DepreciationAmortizationAndAccretionNet",
      "us-gaap:DepreciationAndAmortization",
      "us-gaap:CostDepreciationAmortizationAndDepletion",
      "us-gaap:Depreciation",
      "ifrs-full:DepreciationAndAmortisationExpense",
      "ifrs-full:DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"
    )
  ),
  def(
    "stockBasedCompensation",
    "Stock-based compensation",
    "cashflow",
    "duration",
    t("us-gaap:ShareBasedCompensation", "us-gaap:AllocatedShareBasedCompensationExpense")
  ),
  def(
    "operatingCashFlow",
    "Cash from operations",
    "cashflow",
    "duration",
    t(
      "us-gaap:NetCashProvidedByUsedInOperatingActivities",
      "us-gaap:NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
      "ifrs-full:CashFlowsFromUsedInOperatingActivities"
    )
  ),
  def(
    "capex",
    "Capital expenditures",
    "cashflow",
    "duration",
    t(
      "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment",
      "us-gaap:PaymentsToAcquireProductiveAssets",
      "us-gaap:PaymentsToAcquireOtherPropertyPlantAndEquipment",
      "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
      "ifrs-full:PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets"
    ).concat([
      // REITs: development and capital improvements are the maintenance + growth capex analogue.
      { sum: ["us-gaap:PaymentsToDevelopRealEstateAssets", "us-gaap:PaymentsForCapitalImprovements"] },
    ])
  ),
  def(
    "acquisitions",
    "Acquisitions, net of cash",
    "cashflow",
    "duration",
    t(
      "us-gaap:PaymentsToAcquireBusinessesNetOfCashAcquired",
      "ifrs-full:CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities"
    )
  ),
  def(
    "investingCashFlow",
    "Cash from investing",
    "cashflow",
    "duration",
    t(
      "us-gaap:NetCashProvidedByUsedInInvestingActivities",
      "us-gaap:NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
      "ifrs-full:CashFlowsFromUsedInInvestingActivities"
    )
  ),
  def(
    "financingCashFlow",
    "Cash from financing",
    "cashflow",
    "duration",
    t(
      "us-gaap:NetCashProvidedByUsedInFinancingActivities",
      "us-gaap:NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
      "ifrs-full:CashFlowsFromUsedInFinancingActivities"
    )
  ),
  def(
    "dividendsPaid",
    "Dividends paid",
    "cashflow",
    "duration",
    t(
      "us-gaap:PaymentsOfDividends",
      "us-gaap:PaymentsOfDividendsCommonStock",
      "ifrs-full:DividendsPaidClassifiedAsFinancingActivities",
      "ifrs-full:DividendsPaidToEquityHoldersOfParentClassifiedAsFinancingActivities"
    )
  ),
  def(
    "shareRepurchases",
    "Share repurchases",
    "cashflow",
    "duration",
    t("us-gaap:PaymentsForRepurchaseOfCommonStock", "ifrs-full:PaymentsToAcquireOrRedeemEntitysShares")
  ),
];

export const COMPUTED_LINE_ITEMS: { id: LineItemId; label: string; statement: Statement; periodType: PeriodType }[] = [
  { id: "totalDebt", label: "Total debt", statement: "balance", periodType: "instant" },
  { id: "netDebt", label: "Net debt", statement: "balance", periodType: "instant" },
  { id: "freeCashFlow", label: "Free cash flow (CFO − capex)", statement: "cashflow", periodType: "duration" },
  { id: "ebitda", label: "EBITDA (operating income + D&A)", statement: "income", periodType: "duration" },
];

export const LINE_ITEM_LABELS: Record<LineItemId, string> = Object.fromEntries([
  ...REPORTED_LINE_ITEMS.map((d) => [d.id, d.label]),
  ...COMPUTED_LINE_ITEMS.map((d) => [d.id, d.label]),
]) as Record<LineItemId, string>;

/** Every tag referenced by any candidate (used to trim fixtures and pre-index facts). */
export function allReferencedTags(): string[] {
  const tags = new Set<string>(["dei:EntityCommonStockSharesOutstanding"]);
  for (const d of REPORTED_LINE_ITEMS) {
    for (const c of d.candidates) {
      if ("tag" in c) {
        tags.add(c.tag);
        c.minus?.forEach((m) => tags.add(m));
      } else c.sum.forEach((s) => tags.add(s));
    }
  }
  return [...tags];
}
