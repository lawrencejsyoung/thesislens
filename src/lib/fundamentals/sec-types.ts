/**
 * Raw shapes returned by SEC EDGAR's public JSON APIs.
 * https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 */

/** One reported value of one XBRL concept, as served by /api/xbrl/companyfacts. */
export interface SecFact {
  /** Period start (duration concepts only). */
  start?: string;
  /** Period end, or the instant for balance-sheet concepts. */
  end: string;
  val: number;
  /** Accession number of the filing that reported this value. */
  accn: string;
  /** Fiscal year focus of the filing (not necessarily of this fact's period). */
  fy: number | null;
  /** Fiscal period focus of the filing: FY, Q1, Q2, Q3. */
  fp: string | null;
  form: string;
  /** Date the filing was accepted. This is what makes point-in-time reconstruction possible. */
  filed: string;
  frame?: string;
}

export interface SecConcept {
  label: string | null;
  description: string | null;
  units: Record<string, SecFact[]>;
}

export interface SecCompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, SecConcept>>;
}

/** Subset of /submissions/CIK##########.json that ThesisLens uses. */
export interface SecSubmissions {
  cik: string;
  name: string;
  sic: string;
  sicDescription: string;
  tickers: string[];
  exchanges: string[];
  /** MMDD, e.g. "0925". */
  fiscalYearEnd: string | null;
  stateOfIncorporation?: string;
  category?: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
      isXBRL: number[];
    };
  };
}

/** /files/company_tickers.json: { "0": { cik_str, ticker, title }, ... } */
export type SecTickerMap = Record<string, { cik_str: number; ticker: string; title: string }>;
