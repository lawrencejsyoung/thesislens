import { z } from "zod";
import { fundamentalsRequestSchema } from "../fundamentals/present";
import type { BuildModelOptions } from "./index";
import { DRIVER_KEYS, type AssumptionOverrides, type CompanyModel, type DriverKey } from "./types";

const driverInput = z.union([z.number(), z.array(z.number()).min(1).max(20)]);

const driverShape = Object.fromEntries(DRIVER_KEYS.map((k) => [k, driverInput.optional()])) as Record<
  DriverKey,
  z.ZodOptional<typeof driverInput>
>;

/** Shared request schema for POST /api/model and the build_company_model MCP tool. */
export const companyModelRequestSchema = {
  ticker: fundamentalsRequestSchema.ticker,
  asOf: fundamentalsRequestSchema.asOf,
  currentPrice: z
    .number()
    .positive()
    .optional()
    .describe("Share price in the reporting currency, per ordinary share. Enables upside and market-value WACC weights."),
  years: z.number().int().min(3).max(20).optional().describe("Forecast horizon in years (default 10)."),
  drivers: z
    .object(driverShape)
    .partial()
    .strict()
    .optional()
    .describe(
      "Driver overrides as decimals (0.05 = 5%) or days. A number applies to every year; an array is a per-year path whose last value extends. Keys: " +
        DRIVER_KEYS.join(", ")
    ),
  financing: z
    .object({
      interestRateOnDebt: z.number(),
      interestRateOnCash: z.number(),
      minCashPctRevenue: z.number(),
      debtChange: driverInput,
    })
    .partial()
    .strict()
    .optional(),
  valuation: z
    .object({
      riskFreeRate: z.number(),
      equityRiskPremium: z.number(),
      unleveredBeta: z.number(),
      targetDebtWeight: z.number(),
      preTaxCostOfDebt: z.number(),
      terminalGrowth: z.number(),
      terminalRonic: z.number(),
      waccOverride: z.number(),
      sbcTreatment: z.enum(["expense", "addback"]),
    })
    .partial()
    .strict()
    .optional(),
  rationale: z
    .record(z.string(), z.string().max(500))
    .optional()
    .describe("Why each override was made (e.g. a guidance quote with its source); recorded in the model notes."),
  scenarioProbabilities: z
    .object({ bear: z.number().min(0).max(1), base: z.number().min(0).max(1), bull: z.number().min(0).max(1) })
    .optional(),
  detail: z
    .enum(["summary", "full"])
    .optional()
    .describe("'summary' (default) returns key outputs; 'full' adds every projected statement line."),
  analyst: z
    .boolean()
    .optional()
    .describe("When true, runs the Phase 3 AI analyst loop (FRED/Damodaran rates, dossier, cited overrides, validation)."),
  apiKey: z
    .string()
    .max(200)
    .optional()
    .describe("Optional Gemini API key override when analyst=true."),
};

export const companyModelRequestObject = z.object(companyModelRequestSchema);
export type CompanyModelRequest = z.infer<typeof companyModelRequestObject>;

export function toBuildOptions(req: CompanyModelRequest): BuildModelOptions & { asOf?: string } {
  const overrides: AssumptionOverrides = {
    years: req.years,
    drivers: req.drivers,
    financing: req.financing,
    valuation: req.valuation,
    rationale: req.rationale,
  };
  return {
    asOf: req.asOf,
    currentPrice: req.currentPrice ?? null,
    overrides,
    scenarioProbabilities: req.scenarioProbabilities,
  };
}

const r = (x: number, d = 4) => (Number.isFinite(x) ? Number(x.toFixed(d)) : x);
const money = (x: number) => (Number.isFinite(x) ? Math.round(x) : x);

export function presentModel(m: CompanyModel, detail: "summary" | "full" = "summary") {
  const keyLines = m.projections.map((y) => ({
    period: y.label,
    revenue: money(y.revenue),
    revenueGrowth: r(y.revenueGrowth),
    ebit: money(y.ebit),
    ebitMargin: r(y.ebitMargin),
    netIncome: money(y.netIncome),
    epsDiluted: r(y.epsDiluted, 3),
    freeCashFlow: money(y.freeCashFlow),
    fcff: money(y.fcff),
    netDebt: money(y.debt - y.cash),
  }));
  return {
    ticker: m.ticker,
    name: m.name,
    templateId: m.templateId,
    currency: m.currency,
    asOf: m.asOf,
    basePeriod: m.base.periodId,
    valuation: {
      valuePerShare: r(m.valuation.valuePerShare, 2),
      probabilityWeightedValue: r(m.probabilityWeightedValue, 2),
      currentPrice: m.valuation.currentPrice,
      upside: m.valuation.upside === null ? null : r(m.valuation.upside),
      wacc: r(m.valuation.wacc),
      costOfEquity: r(m.valuation.costOfEquity),
      leveredBeta: r(m.valuation.leveredBeta, 3),
      terminalGrowth: m.assumptions.valuation.terminalGrowth,
      terminalRonic: r(m.assumptions.valuation.terminalRonic),
      enterpriseValue: money(m.valuation.enterpriseValue),
      equityValue: money(m.valuation.equityValue),
      netDebt: money(m.valuation.netDebt),
      terminalShareOfEv: r(m.valuation.terminalShareOfEv),
      impliedExitEvEbitda: r(m.valuation.impliedExitEvEbitda, 2),
      valuationDate: m.valuation.valuationDate,
    },
    scenarios: m.scenarios.map((s) => ({ ...s, valuePerShare: r(s.valuePerShare, 2), wacc: r(s.wacc), ebitMarginFinalYear: r(s.ebitMarginFinalYear), revenueFinalYear: money(s.revenueFinalYear) })),
    sensitivity: m.valuation.sensitivity.map((c) => ({ wacc: r(c.wacc), terminalGrowth: r(c.terminalGrowth), valuePerShare: r(c.valuePerShare, 2) })),
    history: m.history,
    forecast: keyLines,
    quarterlyOutlook: m.quarterlyOutlook.map((q) => ({ ...q, revenue: money(q.revenue), epsDiluted: r(q.epsDiluted, 3) })),
    assumptions: m.notes,
    checks: m.checks,
    warnings: m.warnings,
    ...(m.sectorValuation ? { sectorValuation: m.sectorValuation } : {}),
    ...(detail === "full" ? { statements: m.projections, drivers: m.assumptions } : {}),
  };
}

export function summarizeModel(m: CompanyModel): string {
  const v = m.valuation;
  const cur = m.currency;
  const y1 = m.projections[0];
  const upside = v.upside === null ? "" : ` vs ${cur} ${v.currentPrice?.toFixed(2)} (${v.upside >= 0 ? "+" : ""}${(v.upside * 100).toFixed(1)}%)`;
  const [bear, , bull] = m.scenarios;
  const fails = m.checks.filter((c) => c.status === "fail").length;
  return `${m.name} (${m.ticker}) DCF value ${cur} ${v.valuePerShare.toFixed(2)}/share${upside}; bear ${bear.valuePerShare.toFixed(2)} / bull ${bull.valuePerShare.toFixed(2)}, probability-weighted ${m.probabilityWeightedValue.toFixed(2)}. WACC ${(v.wacc * 100).toFixed(2)}%, terminal ${(v.terminalShareOfEv * 100).toFixed(0)}% of EV. ${y1.label}: revenue ${cur} ${(y1.revenue / 1e9).toFixed(2)}B (${(y1.revenueGrowth * 100).toFixed(1)}%), EBIT margin ${(y1.ebitMargin * 100).toFixed(1)}%, EPS ${y1.epsDiluted.toFixed(2)}. Base ${m.base.periodId}; ${fails ? `${fails} failed model checks` : "statements balance and cash ties"}.`;
}
