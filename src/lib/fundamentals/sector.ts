/**
 * Maps a company to a valuation template from its SEC SIC code.
 *
 * SIC is coarse (Amazon is "catalog retail", Alphabet is "computer programming"), so a curated
 * override table wins over the SIC range for the largest names. Templates are what the model
 * engine uses to pick a driver tree and valuation method.
 */

export const TEMPLATE_IDS = [
  "software",
  "semiconductors",
  "internet",
  "hardware",
  "industrial",
  "consumer",
  "retail",
  "pharma",
  "healthcare-services",
  "bank",
  "insurance",
  "capital-markets",
  "payments",
  "reit",
  "utility",
  "energy",
  "materials",
  "telecom",
  "auto",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  software: "Software & IT services",
  semiconductors: "Semiconductors & equipment",
  internet: "Internet & digital platforms",
  hardware: "Tech hardware",
  industrial: "Industrials (default)",
  consumer: "Consumer staples & brands",
  retail: "Retail",
  pharma: "Pharma & biotech",
  "healthcare-services": "Healthcare services & devices",
  bank: "Banks",
  insurance: "Insurance",
  "capital-markets": "Capital markets & brokers",
  payments: "Payments & card networks",
  reit: "REITs",
  utility: "Utilities",
  energy: "Energy",
  materials: "Materials & mining",
  telecom: "Telecom & media",
  auto: "Autos",
};

/** Ticker overrides where SIC is misleading. */
const OVERRIDES: Record<string, TemplateId> = {
  AMZN: "internet",
  GOOGL: "internet",
  GOOG: "internet",
  META: "internet",
  NFLX: "internet",
  BKNG: "internet",
  UBER: "internet",
  ABNB: "internet",
  V: "payments",
  MA: "payments",
  PYPL: "payments",
  FISV: "payments",
  FIS: "payments",
  AXP: "capital-markets",
  "BRK-B": "insurance",
  "BRK-A": "insurance",
  TSLA: "auto",
  ASML: "semiconductors",
  AMAT: "semiconductors",
  LRCX: "semiconductors",
  KLAC: "semiconductors",
  LIN: "materials",
  AAPL: "hardware",
  DIS: "telecom",
  CMCSA: "telecom",
};

const RANGES: { from: number; to: number; template: TemplateId }[] = [
  { from: 100, to: 999, template: "consumer" },
  { from: 1000, to: 1499, template: "materials" },
  { from: 1311, to: 1389, template: "energy" },
  { from: 1500, to: 1799, template: "industrial" },
  { from: 2000, to: 2199, template: "consumer" },
  { from: 2800, to: 2829, template: "materials" },
  { from: 2830, to: 2836, template: "pharma" },
  { from: 2840, to: 2899, template: "consumer" },
  { from: 2900, to: 2999, template: "energy" },
  { from: 3300, to: 3399, template: "materials" },
  { from: 3570, to: 3579, template: "hardware" },
  { from: 3600, to: 3669, template: "hardware" },
  { from: 3670, to: 3679, template: "semiconductors" },
  { from: 3711, to: 3716, template: "auto" },
  { from: 3714, to: 3714, template: "auto" },
  { from: 3841, to: 3851, template: "healthcare-services" },
  { from: 4800, to: 4899, template: "telecom" },
  { from: 4900, to: 4949, template: "utility" },
  { from: 5200, to: 5999, template: "retail" },
  { from: 6020, to: 6036, template: "bank" },
  { from: 6100, to: 6199, template: "capital-markets" },
  { from: 6200, to: 6299, template: "capital-markets" },
  { from: 6300, to: 6411, template: "insurance" },
  { from: 6324, to: 6324, template: "healthcare-services" },
  { from: 6798, to: 6798, template: "reit" },
  { from: 7370, to: 7379, template: "software" },
  { from: 7380, to: 7389, template: "industrial" },
  { from: 8000, to: 8099, template: "healthcare-services" },
];

export function templateForCompany(ticker: string, sic: string | number | null | undefined): TemplateId {
  const override = OVERRIDES[ticker.toUpperCase().replace(/\./g, "-")];
  if (override) return override;
  const code = Number(sic);
  if (!Number.isFinite(code) || code <= 0) return "industrial";
  // Narrowest matching range wins, so 1311 (oil & gas) beats 1000-1499 (mining).
  let best: { span: number; template: TemplateId } | null = null;
  for (const r of RANGES) {
    if (code < r.from || code > r.to) continue;
    const span = r.to - r.from;
    if (!best || span < best.span) best = { span, template: r.template };
  }
  return best?.template ?? "industrial";
}
