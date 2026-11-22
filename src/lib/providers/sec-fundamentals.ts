import { getCompanyFundamentals, type FundamentalsOptions } from "../fundamentals";
import type { CompanyFundamentals } from "../fundamentals/types";
import type { FundamentalsProvider } from "./types";

export class SecFundamentalsProvider implements FundamentalsProvider {
  readonly id = "sec-edgar";

  supports(ticker: string): boolean {
    const clean = ticker.trim().toUpperCase();
    // Standard US / ADR SEC ticker format (no international exchange suffix like .T, .DE, .PA)
    return /^[A-Z][A-Z0-9.-]{0,6}$/.test(clean) && !/\.(T|DE|PA|AS|L|SW|MI|MC|ST|CO|HE|OL)$/.test(clean);
  }

  async getFundamentals(ticker: string, opts?: FundamentalsOptions): Promise<CompanyFundamentals> {
    return getCompanyFundamentals(ticker, opts);
  }
}
