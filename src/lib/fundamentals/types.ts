import type { LineItemId } from "./line-items";

export type DerivationMethod =
  /** Taken directly from a reported fact for exactly this period. */
  | "reported"
  /** Discrete quarter derived from year-to-date facts (e.g. Q2 = H1 − Q1, Q4 = FY − 9M). */
  | "derived"
  /** Computed from other normalized line items (e.g. FCF = CFO − capex). */
  | "computed";

export interface ValueSource {
  /** XBRL tags the value came from (several for sum candidates and derivations). */
  tags: string[];
  method: DerivationMethod;
  /** Accession number of the latest filing used. */
  accn?: string;
  form?: string;
  /** Latest filing date among inputs. Drives point-in-time correctness. */
  filed?: string;
}

export interface FinancialPeriod {
  /** "FY2026" or "FY2026Q3". Labels follow the company's own fiscal-year naming. */
  id: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4 | null;
  start: string;
  end: string;
  values: Partial<Record<LineItemId, number>>;
  sources: Partial<Record<LineItemId, ValueSource>>;
}

export interface SharesOutstandingPoint {
  value: number;
  /** Cover-page date the count is as of (usually a few weeks after period end). */
  date: string;
  filed: string;
  accn: string;
}

export interface FinancialHistory {
  cik: number;
  entityName: string;
  /** ISO currency of monetary values, e.g. USD, TWD, DKK. */
  currency: string;
  /** Taxonomy used for most values. */
  taxonomy: "us-gaap" | "ifrs-full";
  /** Point-in-time cutoff applied (only facts filed on or before this date), or null for latest. */
  asOf: string | null;
  annual: FinancialPeriod[];
  quarterly: FinancialPeriod[];
  latestSharesOutstanding: SharesOutstandingPoint | null;
  /** Most recent filing date among all facts used. */
  lastFiled: string | null;
}

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface QualityCheck {
  id: string;
  status: CheckStatus;
  message: string;
  periodId?: string;
}

export interface CompanyProfile {
  ticker: string;
  cik: number;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  exchanges: string[];
  fiscalYearEnd: string | null;
  templateId: string;
}

export interface CompanyFundamentals {
  profile: CompanyProfile;
  history: FinancialHistory;
  checks: QualityCheck[];
  /** 0–100: share of core line items present for the latest fiscal year. */
  coverageScore: number;
}
