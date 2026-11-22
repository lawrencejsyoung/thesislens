/**
 * Phase 6: ADR ratio & FX conversion helpers.
 *
 * Foreign SEC filers (20-F) report financials per ordinary share in their home currency
 * (e.g. TWD for TSM, DKK for NVO, JPY for TM, EUR for ASML/SAP), while US-listed ADRs
 * trade in USD at a fixed ordinary-shares-per-ADR ratio.
 */

export interface AdrSpec {
  ticker: string;
  reportingCurrency: string;
  /** Number of ordinary shares represented by 1 US-listed ADR (e.g. 5 for TSM, 0.5 for AZN). */
  ordinarySharesPerAdr: number;
}

export const ADR_REGISTRY: Record<string, AdrSpec> = {
  TSM: { ticker: "TSM", reportingCurrency: "TWD", ordinarySharesPerAdr: 5 },
  NVO: { ticker: "NVO", reportingCurrency: "DKK", ordinarySharesPerAdr: 1 },
  ASML: { ticker: "ASML", reportingCurrency: "EUR", ordinarySharesPerAdr: 1 },
  TM: { ticker: "TM", reportingCurrency: "JPY", ordinarySharesPerAdr: 2 },
  SAP: { ticker: "SAP", reportingCurrency: "EUR", ordinarySharesPerAdr: 1 },
  BABA: { ticker: "BABA", reportingCurrency: "CNY", ordinarySharesPerAdr: 8 },
  PDD: { ticker: "PDD", reportingCurrency: "CNY", ordinarySharesPerAdr: 4 },
  JD: { ticker: "JD", reportingCurrency: "CNY", ordinarySharesPerAdr: 2 },
  SONY: { ticker: "SONY", reportingCurrency: "JPY", ordinarySharesPerAdr: 1 },
  SHEL: { ticker: "SHEL", reportingCurrency: "USD", ordinarySharesPerAdr: 2 },
  AZN: { ticker: "AZN", reportingCurrency: "USD", ordinarySharesPerAdr: 0.5 },
  SNY: { ticker: "SNY", reportingCurrency: "EUR", ordinarySharesPerAdr: 0.5 },
  UL: { ticker: "UL", reportingCurrency: "EUR", ordinarySharesPerAdr: 1 },
  BHP: { ticker: "BHP", reportingCurrency: "USD", ordinarySharesPerAdr: 2 },
  RIO: { ticker: "RIO", reportingCurrency: "USD", ordinarySharesPerAdr: 1 },
  HSBC: { ticker: "HSBC", reportingCurrency: "USD", ordinarySharesPerAdr: 5 },
  MUFG: { ticker: "MUFG", reportingCurrency: "JPY", ordinarySharesPerAdr: 1 },
  SMFG: { ticker: "SMFG", reportingCurrency: "JPY", ordinarySharesPerAdr: 0.2 },
};

/** Approximate fallback FX rates (1 unit of reporting currency in USD) when live FX is not supplied. */
export const DEFAULT_FX_TO_USD: Record<string, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  DKK: 0.145,
  CHF: 1.13,
  JPY: 0.0066,
  TWD: 0.031,
  CNY: 0.138,
  CAD: 0.72,
  AUD: 0.65,
  SEK: 0.094,
  NOK: 0.092,
  KRW: 0.00072,
  HKD: 0.128,
};

export function getAdrSpec(ticker: string): AdrSpec | null {
  return ADR_REGISTRY[ticker.toUpperCase()] ?? null;
}

/**
 * Convert a US-listed ADR share price (in USD) into the equivalent price per ordinary share
 * in the company's reporting currency (so it can be passed directly into `buildCompanyModel`).
 */
export function convertAdrPriceToOrdinary(
  ticker: string,
  adrPriceUsd: number,
  opts: { reportingCurrency?: string; fxToUsd?: number; ordinarySharesPerAdr?: number } = {}
): { ordinaryPrice: number; reportingCurrency: string; ordinarySharesPerAdr: number; fxToUsd: number } {
  const spec = getAdrSpec(ticker);
  const reportingCurrency = (opts.reportingCurrency ?? spec?.reportingCurrency ?? "USD").toUpperCase();
  const ordinarySharesPerAdr = opts.ordinarySharesPerAdr ?? spec?.ordinarySharesPerAdr ?? 1;
  const fxToUsd = opts.fxToUsd ?? DEFAULT_FX_TO_USD[reportingCurrency] ?? 1.0;

  // 1 ADR = ordinarySharesPerAdr ordinary shares; price per ordinary share in USD = adrPriceUsd / ratio
  const ordinaryPriceUsd = adrPriceUsd / ordinarySharesPerAdr;
  const ordinaryPrice = ordinaryPriceUsd / fxToUsd;
  return { ordinaryPrice, reportingCurrency, ordinarySharesPerAdr, fxToUsd };
}

/**
 * Convert an intrinsic value per ordinary share (in reporting currency) into USD per US-listed ADR.
 */
export function convertOrdinaryValueToAdrUsd(
  ticker: string,
  ordinaryValue: number,
  opts: { reportingCurrency?: string; fxToUsd?: number; ordinarySharesPerAdr?: number } = {}
): { adrValueUsd: number; reportingCurrency: string; ordinarySharesPerAdr: number; fxToUsd: number } {
  const spec = getAdrSpec(ticker);
  const reportingCurrency = (opts.reportingCurrency ?? spec?.reportingCurrency ?? "USD").toUpperCase();
  const ordinarySharesPerAdr = opts.ordinarySharesPerAdr ?? spec?.ordinarySharesPerAdr ?? 1;
  const fxToUsd = opts.fxToUsd ?? DEFAULT_FX_TO_USD[reportingCurrency] ?? 1.0;

  const adrValueUsd = ordinaryValue * ordinarySharesPerAdr * fxToUsd;
  return { adrValueUsd, reportingCurrency, ordinarySharesPerAdr, fxToUsd };
}
