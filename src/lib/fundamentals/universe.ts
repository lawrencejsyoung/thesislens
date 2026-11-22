import type { TemplateId } from "./sector";

/**
 * Coverage universe: the largest SEC-reporting companies (US domestic filers plus foreign
 * issuers that file 10-K or 20-F with XBRL).
 *
 * This is a seed list, ordered roughly by market cap. A strict "top 500 by market cap" ranking
 * needs a market-data feed. Until then this list is maintained by hand and audited with
 * `npm run audit:fundamentals`.
 *
 * `predecessorCiks` merges history from an old registrant after a holding-company
 * reorganization (the new CIK starts with no history).
 */
export interface UniverseEntry {
  ticker: string;
  template?: TemplateId;
  predecessorCiks?: number[];
}

const T = (tickers: string): UniverseEntry[] =>
  tickers
    .trim()
    .split(/\s+/)
    .map((ticker) => ({ ticker }));

export const UNIVERSE: UniverseEntry[] = [
  // Mega caps
  ...T(`NVDA AAPL MSFT AMZN GOOGL META AVGO TSLA BRK-B TSM LLY JPM WMT V ORCL MA NFLX XOM COST JNJ`),
  ...T(`HD PG ABBV PLTR BAC UNH KO SAP ASML NVO TM CVX AMD CSCO GE CRM WFC IBM MS PM ABT`),
  ...T(`LIN MCD AXP GS INTU NOW MRK DIS T TMO RTX ISRG PEP UBER CAT VZ BKNG QCOM TXN AMGN`),
  ...T(`ADBE SCHW BLK C SPGI AMAT BSX PGR NEE LOW GILD SYK TJX DHR UNP HON PFE CMCSA ETN ANET`),
  ...T(`MU LRCX KLAC ADP DE COP PANW APH CB MDT VRTX ADI MRSH LMT SBUX KKR BX PLD ICE CME AMT`),
  ...T(`MO SO NKE CEG WELL BMY DUK MCO SHW TT WM HCA CRWD ELV CI EQIX GD MCK INTC UPS PH`),
  ...T(`AJG CTAS MSI ABNB PYPL SNPS CDNS APO ORLY ITW MMM ZTS NOC TDG FISV USB PNC ECL EMR REGN`),
  ...T(`CL BDX MAR APD AON RCL CSX COF WMB HLT GM FDX CVS CARR TFC ADSK FTNT MNST NSC OKE KMI`),
  ...T(`SLB EOG PSX MPC AZO TRV AFL SPG DLR SRE AEP PCAR ROP O NXPI JCI BNY MET AIG PSA ALL`),
  ...T(`F GWW CPRT PAYX FAST KMB CMI LHX DHI MSCI ROST TEL HWM AME OXY KDP KR VLO PRU CCI`),
  ...T(`CTVA D EXC XEL PEG ED IDXX GEHC YUM SYY HSY GIS ODFL VRSK DAL EW MCHP IQV LULU ON`),
  // Large foreign SEC filers (20-F / 40-F / 10-K)
  ...T(`SHEL BHP RIO TTE BP UL AZN NVS HSBC RY TD SONY HMC SNY DEO BUD BABA PDD MUFG SMFG`),
  ...T(`INFY HDB ARM SHOP SPOT SE MELI NU CNQ ENB CP CNI TRI BN BAM SU ABEV ITUB VALE`),
  ...T(`ING SAN BBVA BCS LYG NWG E EQNR GSK BTI RELX STLA FERG CRH`),
  // Holding-company reorganizations that need predecessor history
].map((e) => (e.ticker === "XOM" ? { ...e, predecessorCiks: [34088] } : e));

const BY_TICKER = new Map(UNIVERSE.map((e) => [e.ticker, e]));

export function findUniverseEntry(ticker: string): UniverseEntry | undefined {
  return BY_TICKER.get(ticker.trim().toUpperCase().replace(/\./g, "-"));
}
