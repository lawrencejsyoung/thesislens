import type { BaseYear, ModelAssumptions, ProjectedYear } from "./types";

/**
 * Deterministic, fully linked three-statement projection.
 *
 * Income statement → cash flow → balance sheet, every year. The balance sheet balances by
 * construction (the only plug is cash, with a revolver when cash would fall below its floor),
 * and the interest ↔ cash circularity is solved by fixed-point iteration.
 *
 * Simplifications, by design:
 * - All D&A runs through PP&E (intangibles held flat apart from that).
 * - "Other" assets and liabilities are held flat at the base-year residual.
 * - NCI is folded into equity; share count follows its own driver.
 */

const DAY_MS = 86_400_000;
const MAX_ITERATIONS = 50;
const CONVERGENCE = 1e-6;

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

export function projectStatements(base: BaseYear, a: ModelAssumptions): ProjectedYear[] {
  const out: ProjectedYear[] = [];
  const d = a.drivers;
  const f = a.financing;

  let prev = {
    revenue: base.revenue,
    cash: base.cash,
    receivables: base.receivables,
    inventory: base.inventory,
    payables: base.payables,
    ppe: base.ppe,
    termDebt: base.debt,
    revolver: 0,
    equity: base.equity,
    dilutedShares: base.dilutedShares,
    end: base.end,
  };

  for (let i = 0; i < a.years; i++) {
    const revenue = prev.revenue * (1 + d.revenueGrowth[i]);
    const gm = d.grossMargin[i];
    const hasCogs = base.cogs !== null && Number.isFinite(gm);
    const cogs = hasCogs ? revenue * (1 - gm) : null;
    const costBase = cogs ?? revenue;
    const ebit = revenue * d.ebitMargin[i];
    const da = revenue * d.daPctRevenue[i];
    const sbc = revenue * d.sbcPctRevenue[i];
    const capex = revenue * d.capexPctRevenue[i];
    const taxRate = d.taxRate[i];

    const receivables = (revenue * d.dso[i]) / 365;
    const inventory = (costBase * d.dio[i]) / 365;
    const payables = (costBase * d.dpo[i]) / 365;
    const changeInNwc = receivables + inventory - payables - (prev.receivables + prev.inventory - prev.payables);
    const ppe = prev.ppe + capex - da;

    const prevDebt = prev.termDebt + prev.revolver;
    const termDebt = Math.max(0, prev.termDebt + (f.debtChange[i] ?? 0));
    const minCash = revenue * f.minCashPctRevenue;

    // Solve interest ↔ cash ↔ revolver circularity. The revolver funds shortfalls below the
    // cash floor and is swept down with any excess cash.
    let debt = termDebt + prev.revolver;
    let cash = prev.cash;
    let interestExpense = 0;
    let interestIncome = 0;
    let pretaxIncome = 0;
    let incomeTax = 0;
    let netIncome = 0;
    let operatingCashFlow = 0;
    let dividends = 0;
    let shareRepurchases = 0;
    let revolver = prev.revolver;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const newInterestExpense = (f.interestRateOnDebt * (prevDebt + debt)) / 2;
      const newInterestIncome = (f.interestRateOnCash * (prev.cash + cash)) / 2;
      const converged =
        iter > 0 &&
        Math.abs(newInterestExpense - interestExpense) <= CONVERGENCE * Math.max(1, Math.abs(revenue)) &&
        Math.abs(newInterestIncome - interestIncome) <= CONVERGENCE * Math.max(1, Math.abs(revenue));
      interestExpense = newInterestExpense;
      interestIncome = newInterestIncome;

      pretaxIncome = ebit - interestExpense + interestIncome;
      incomeTax = pretaxIncome * taxRate;
      netIncome = pretaxIncome - incomeTax;
      operatingCashFlow = netIncome + da + sbc - changeInNwc;
      const fcf = operatingCashFlow - capex;
      dividends = Math.max(0, netIncome) * d.dividendPayout[i];
      shareRepurchases = Math.max(0, fcf - dividends) * d.buybackPctOfFcf[i];

      const cashBeforeRevolver =
        prev.cash + operatingCashFlow - capex + (termDebt - prev.termDebt) - dividends - shareRepurchases;
      revolver = Math.max(0, prev.revolver + minCash - cashBeforeRevolver);
      debt = termDebt + revolver;
      cash = cashBeforeRevolver + (revolver - prev.revolver);
      if (converged) break;
    }

    const equity = prev.equity + netIncome - dividends - shareRepurchases + sbc;
    const totalAssets = cash + receivables + inventory + ppe + base.otherAssets;
    const totalLiabilitiesAndEquity = payables + debt + base.otherLiabilities + equity;
    const dilutedShares = prev.dilutedShares * (1 + d.shareCountChange[i]);
    const fcff =
      ebit * (1 - taxRate) + da - capex - changeInNwc + (a.valuation.sbcTreatment === "addback" ? sbc : 0);

    const start = nextDay(prev.end);
    const end = addYears(base.end, i + 1);
    out.push({
      fiscalYear: base.fiscalYear + i + 1,
      label: `FY${base.fiscalYear + i + 1}E`,
      start,
      end,
      revenue,
      revenueGrowth: d.revenueGrowth[i],
      cogs,
      grossProfit: cogs === null ? null : revenue - cogs,
      ebit,
      ebitMargin: d.ebitMargin[i],
      depreciationAmortization: da,
      ebitda: ebit + da,
      stockBasedCompensation: sbc,
      interestExpense,
      interestIncome,
      pretaxIncome,
      incomeTax,
      netIncome,
      dilutedShares,
      epsDiluted: dilutedShares > 0 ? netIncome / dilutedShares : 0,
      dividends,
      shareRepurchases,
      cash,
      receivables,
      inventory,
      ppe,
      otherAssets: base.otherAssets,
      totalAssets,
      payables,
      debt,
      revolverBalance: revolver,
      otherLiabilities: base.otherLiabilities,
      equity,
      totalLiabilitiesAndEquity,
      changeInNwc,
      operatingCashFlow,
      capex,
      investingCashFlow: -capex,
      financingCashFlow: debt - prevDebt - dividends - shareRepurchases,
      netChangeInCash: cash - prev.cash,
      freeCashFlow: operatingCashFlow - capex,
      fcff,
      balanceDifference: totalAssets - totalLiabilitiesAndEquity,
    });

    prev = { revenue, cash, receivables, inventory, payables, ppe, termDebt, revolver, equity, dilutedShares, end };
  }
  return out;
}
