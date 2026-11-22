import type { SecCompanyFacts } from "./sec-types";
import {
  REPORTED_LINE_ITEMS,
  type Candidate,
  type LineItemDef,
  type LineItemId,
  type UnitKind,
} from "./line-items";
import type {
  FinancialHistory,
  FinancialPeriod,
  SharesOutstandingPoint,
  ValueSource,
} from "./types";

/**
 * Turns raw SEC companyfacts into a clean annual + quarterly history of canonical line items.
 *
 * Key behaviours:
 * - Periods are identified by their dates, never by the filing's fy/fp (a 10-K's comparative
 *   columns carry the *filing's* fiscal year).
 * - When a figure is restated, the latest filing wins, unless `asOf` is set, in which case only
 *   filings on or before that date are visible. That gives point-in-time histories for backtests.
 * - 10-Qs usually report cash flows year-to-date only, and nobody files a Q4 10-Q. Discrete
 *   quarters are derived (Q2 = H1 − Q1, Q4 = FY − 9M) for additive line items.
 */

export interface NormalizeOptions {
  /** YYYY-MM-DD. Only facts filed on or before this date are used. */
  asOf?: string | null;
  maxAnnualPeriods?: number;
  maxQuarterlyPeriods?: number;
}

const ACCEPTED_FORMS = new Set([
  "10-K",
  "10-K/A",
  "10-KT",
  "10-KT/A",
  "10-Q",
  "10-Q/A",
  "20-F",
  "20-F/A",
  "40-F",
  "40-F/A",
  "6-K",
  "6-K/A",
]);
const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A", "10-KT"]);

const DAY_MS = 86_400_000;
const QUARTER_DAYS = 91.3;
const START_TOLERANCE = 7;
const END_TOLERANCE = 3;

interface Fact {
  s: number | null;
  e: number;
  val: number;
  accn: string;
  form: string;
  filed: string;
  fy: number | null;
  fp: string | null;
}

interface Resolved {
  val: number;
  facts: Fact[];
  tags: string[];
  derived: boolean;
}

interface PeriodSlot {
  id: string;
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4 | null;
  s: number;
  e: number;
  /** Fiscal-year context for YTD derivations. */
  fyStart: number;
  /** End day of each quarter (index 1..4) in this fiscal year, when known. */
  quarterEnds: (number | undefined)[];
  fyComplete: boolean;
  fyEnd: number;
}

export function toDay(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

export function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function mode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/** Indexed facts for one tag, keyed by end day. */
type TagIndex = Map<number, Fact[]>;

class FactStore {
  private readonly byTag = new Map<string, TagIndex>();
  readonly currency: string;
  readonly taxonomy: "us-gaap" | "ifrs-full";

  constructor(
    private readonly raw: SecCompanyFacts,
    private readonly asOf: string | null
  ) {
    this.currency = detectCurrency(raw);
    this.taxonomy = detectTaxonomy(raw);
  }

  unitFor(kind: UnitKind): string {
    if (kind === "shares") return "shares";
    if (kind === "perShare") return `${this.currency}/shares`;
    return this.currency;
  }

  /** Facts for a tag in a unit, deduplicated so each period keeps its latest visible filing. */
  index(tag: string, unit: string): TagIndex {
    const key = `${tag}@${unit}`;
    const cached = this.byTag.get(key);
    if (cached) return cached;

    const [ns, name] = tag.split(":");
    const rawFacts = this.raw.facts?.[ns]?.[name]?.units?.[unit] ?? [];
    const latestByPeriod = new Map<string, Fact>();
    for (const f of rawFacts) {
      if (!Number.isFinite(f.val) || !ACCEPTED_FORMS.has(f.form)) continue;
      if (this.asOf && f.filed > this.asOf) continue;
      const periodKey = `${f.start ?? ""}|${f.end}`;
      const prev = latestByPeriod.get(periodKey);
      if (!prev || f.filed > prev.filed || (f.filed === prev.filed && f.accn > prev.accn)) {
        latestByPeriod.set(periodKey, {
          s: f.start ? toDay(f.start) : null,
          e: toDay(f.end),
          val: f.val,
          accn: f.accn,
          form: f.form,
          filed: f.filed,
          fy: f.fy ?? null,
          fp: f.fp ?? null,
        });
      }
    }
    const idx: TagIndex = new Map();
    for (const f of latestByPeriod.values()) {
      const list = idx.get(f.e) ?? [];
      list.push(f);
      idx.set(f.e, list);
    }
    this.byTag.set(key, idx);
    return idx;
  }

  findDuration(tag: string, unit: string, s: number, e: number): Fact | null {
    const idx = this.index(tag, unit);
    let best: Fact | null = null;
    let bestScore = Infinity;
    for (let d = -END_TOLERANCE; d <= END_TOLERANCE; d++) {
      for (const f of idx.get(e + d) ?? []) {
        if (f.s === null || Math.abs(f.s - s) > START_TOLERANCE) continue;
        const score = Math.abs(f.s - s) + Math.abs(d);
        if (score < bestScore || (score === bestScore && best && f.filed > best.filed)) {
          best = f;
          bestScore = score;
        }
      }
    }
    return best;
  }

  findInstant(tag: string, unit: string, e: number): Fact | null {
    const idx = this.index(tag, unit);
    for (const d of [0, -1, 1, -2, 2, -3, 3]) {
      const hit = (idx.get(e + d) ?? []).find((f) => f.s === null);
      if (hit) return hit;
    }
    return null;
  }

  /** All duration facts across the given tags (used to discover the fiscal calendar). */
  durationFacts(tags: string[]): Fact[] {
    const out: Fact[] = [];
    for (const tag of tags) {
      for (const list of this.index(tag, this.currency).values()) {
        for (const f of list) if (f.s !== null) out.push(f);
      }
    }
    return out;
  }

  /**
   * For each annual filing, the fiscal-year focus and end date of its primary (latest) period.
   * Uses raw, non-deduplicated facts: after dedup an old filing can be left holding only stale
   * comparatives, which would mislabel the year.
   */
  annualFilingFocus(tags: string[]): { e: number; fy: number }[] {
    const byAccn = new Map<string, { e: number; fy: number }>();
    for (const tag of tags) {
      const [ns, name] = tag.split(":");
      for (const f of this.raw.facts?.[ns]?.[name]?.units?.[this.currency] ?? []) {
        if (f.fp !== "FY" || f.fy == null || !f.start || !ANNUAL_FORMS.has(f.form)) continue;
        if (this.asOf && f.filed > this.asOf) continue;
        const s = toDay(f.start);
        const e = toDay(f.end);
        if (e - s < 350 || e - s > 380) continue;
        const prev = byAccn.get(f.accn);
        if (!prev || e > prev.e) byAccn.set(f.accn, { e, fy: f.fy });
      }
    }
    return [...byAccn.values()];
  }

  sharesOutstandingPoints(): SharesOutstandingPoint[] {
    const raw = this.raw.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
    const groups = new Map<string, { vals: Set<number>; end: string; filed: string; accn: string }>();
    for (const f of raw) {
      if (!Number.isFinite(f.val) || f.val <= 0) continue;
      if (this.asOf && f.filed > this.asOf) continue;
      const key = `${f.accn}|${f.end}`;
      const g = groups.get(key) ?? { vals: new Set<number>(), end: f.end, filed: f.filed, accn: f.accn };
      g.vals.add(f.val);
      groups.set(key, g);
    }
    // Multi-class issuers report one cover-page count per class in the same filing.
    return [...groups.values()]
      .map((g) => ({
        value: [...g.vals].reduce((a, b) => a + b, 0),
        date: g.end,
        filed: g.filed,
        accn: g.accn,
      }))
      .sort((a, b) => (a.date === b.date ? a.filed.localeCompare(b.filed) : a.date.localeCompare(b.date)));
  }
}

function detectCurrency(raw: SecCompanyFacts): string {
  const probe = [
    "us-gaap:Assets",
    "us-gaap:Revenues",
    "us-gaap:NetIncomeLoss",
    "us-gaap:StockholdersEquity",
    "ifrs-full:Assets",
    "ifrs-full:Revenue",
    "ifrs-full:ProfitLoss",
    "ifrs-full:Equity",
  ];
  const counts = new Map<string, number>();
  for (const tag of probe) {
    const [ns, name] = tag.split(":");
    const units = raw.facts?.[ns]?.[name]?.units ?? {};
    for (const [unit, facts] of Object.entries(units)) {
      if (!/^[A-Z]{3}$/.test(unit)) continue;
      const recent = facts.filter((f) => ANNUAL_FORMS.has(f.form)).length;
      counts.set(unit, (counts.get(unit) ?? 0) + recent);
    }
  }
  let best = "USD";
  let bestCount = -1;
  for (const [unit, c] of counts) {
    if (c > bestCount) {
      best = unit;
      bestCount = c;
    }
  }
  return best;
}

function detectTaxonomy(raw: SecCompanyFacts): "us-gaap" | "ifrs-full" {
  const ifrs = Object.keys(raw.facts?.["ifrs-full"] ?? {}).length;
  const gaap = Object.keys(raw.facts?.["us-gaap"] ?? {}).length;
  return ifrs > gaap ? "ifrs-full" : "us-gaap";
}

// ── Fiscal calendar ─────────────────────────────────────────────────────────

const CALENDAR_PROBE_TAGS = REPORTED_LINE_ITEMS.filter(
  (d) => d.periodType === "duration" && d.unit === "currency"
).flatMap((d) => d.candidates.flatMap((c) => ("tag" in c ? [c.tag] : c.sum)));


interface FiscalYear {
  label: number;
  s: number;
  e: number;
  complete: boolean;
  quarterEnds: (number | undefined)[];
}

function buildFiscalCalendar(store: FactStore): FiscalYear[] {
  const facts = store.durationFacts(CALENDAR_PROBE_TAGS);

  // 1. Candidate fiscal years: annual-length durations, grouped by end date.
  const byEnd = new Map<number, { count: number; starts: number[] }>();
  for (const f of facts) {
    const len = f.e - (f.s as number);
    if (len < 350 || len > 380) continue;
    const g = byEnd.get(f.e) ?? { count: 0, starts: [] };
    g.count++;
    g.starts.push(f.s as number);
    byEnd.set(f.e, g);
  }
  const accepted: { s: number; e: number; count: number }[] = [];
  for (const [e, g] of [...byEnd.entries()].sort((a, b) => b[1].count - a[1].count)) {
    if (accepted.some((a) => Math.abs(a.e - e) < 330)) continue;
    accepted.push({ e, s: mode(g.starts) as number, count: g.count });
  }
  accepted.sort((a, b) => a.e - b.e);

  // 2. Labels. Use the filer's own fiscal-year naming via the 10-K's fy focus, applied as a
  //    consistent offset so one mislabeled filing can't break the series.
  const adjustedYear = (e: number) => new Date((e - 15) * DAY_MS).getUTCFullYear();
  const offsets: number[] = [];
  for (const { e, fy } of store.annualFilingFocus(CALENDAR_PROBE_TAGS)) {
    if (accepted.some((a) => Math.abs(a.e - e) <= 7)) offsets.push(fy - adjustedYear(e));
  }
  const offset = mode(offsets) ?? 0;

  const years: FiscalYear[] = accepted.map((a) => ({
    label: adjustedYear(a.e) + offset,
    s: a.s,
    e: a.e,
    complete: true,
    quarterEnds: [],
  }));

  // 3. An in-progress fiscal year, if 10-Qs exist past the last annual period.
  const last = years[years.length - 1];
  if (last) {
    const hasLaterQuarter = facts.some((f) => f.e > last.e + 60 && f.e - (f.s as number) < 300);
    if (hasLaterQuarter) {
      years.push({ label: last.label + 1, s: last.e + 1, e: last.e + 365, complete: false, quarterEnds: [] });
    }
  }

  // 4. Quarter ends inside each fiscal year, from YTD and discrete-quarter facts.
  for (const fy of years) {
    const votes: Map<number, number>[] = [new Map(), new Map(), new Map(), new Map(), new Map()];
    for (const f of facts) {
      const s = f.s as number;
      if (f.e < fy.s || f.e > fy.e + END_TOLERANCE) continue;
      const len = f.e - s;
      let k: number | null = null;
      if (Math.abs(s - fy.s) <= START_TOLERANCE) {
        const q = Math.round((f.e - fy.s + 1) / QUARTER_DAYS);
        if (q >= 1 && q <= 4 && Math.abs(f.e - fy.s + 1 - q * QUARTER_DAYS) <= 14) k = q;
      } else if (len >= 75 && len <= 105) {
        const q = Math.round((f.e - fy.s + 1) / QUARTER_DAYS);
        if (q >= 1 && q <= 4) k = q;
      }
      if (k) votes[k].set(f.e, (votes[k].get(f.e) ?? 0) + 1);
    }
    for (let k = 1; k <= 4; k++) {
      let best: number | undefined;
      let bestCount = 0;
      for (const [e, c] of votes[k]) {
        if (c > bestCount) {
          best = e;
          bestCount = c;
        }
      }
      fy.quarterEnds[k] = best;
    }
    if (fy.complete) fy.quarterEnds[4] = fy.e;
  }
  return years;
}

// ── Value resolution ────────────────────────────────────────────────────────

function resolveTag(
  store: FactStore,
  def: LineItemDef,
  tag: string,
  slot: PeriodSlot
): Resolved | null {
  const unit = store.unitFor(def.unit);

  if (def.periodType === "instant") {
    const f = store.findInstant(tag, unit, slot.e);
    return f ? { val: f.val, facts: [f], tags: [tag], derived: false } : null;
  }

  const direct = store.findDuration(tag, unit, slot.s, slot.e);
  if (direct) return { val: direct.val, facts: [direct], tags: [tag], derived: false };
  if (slot.fiscalQuarter === null || !def.additive) return null;

  // Year-to-date value through quarter k, reported or rebuilt from discrete quarters.
  const ytd = (k: number, depth = 0): { val: number; facts: Fact[] } | null => {
    if (k === 0) return { val: 0, facts: [] };
    const end = slot.quarterEnds[k];
    if (end === undefined) return null;
    const cum = store.findDuration(tag, unit, slot.fyStart, end);
    if (cum) return { val: cum.val, facts: [cum] };
    if (depth > 0) return null;
    // Sum of reported discrete quarters 1..k.
    let total = 0;
    const used: Fact[] = [];
    for (let j = 1; j <= k; j++) {
      const qEnd = slot.quarterEnds[j];
      const qStart = j === 1 ? slot.fyStart : (slot.quarterEnds[j - 1] ?? NaN) + 1;
      if (qEnd === undefined || Number.isNaN(qStart)) return null;
      const q = store.findDuration(tag, unit, qStart, qEnd);
      if (!q) return null;
      total += q.val;
      used.push(q);
    }
    return { val: total, facts: used };
  };

  const k = slot.fiscalQuarter;
  const upTo = ytd(k);
  const before = ytd(k - 1);
  if (!upTo || !before) return null;
  // Guard: both pieces must actually exist (avoid "FY − nothing").
  if (upTo.facts.length === 0) return null;
  return {
    val: upTo.val - before.val,
    facts: [...upTo.facts, ...before.facts],
    tags: [tag],
    derived: true,
  };
}

function resolveCandidate(
  store: FactStore,
  def: LineItemDef,
  cand: Candidate,
  slot: PeriodSlot
): Resolved | null {
  if ("tag" in cand) {
    const base = resolveTag(store, def, cand.tag, slot);
    if (!base || !cand.minus?.length) return base;
    const less = cand.minus.map((tag) => resolveTag(store, def, tag, slot)).filter((r): r is Resolved => r !== null);
    return {
      val: base.val - less.reduce((a, r) => a + r.val, 0),
      facts: [...base.facts, ...less.flatMap((r) => r.facts)],
      tags: [...base.tags, ...less.flatMap((r) => r.tags.map((t) => `-${t}`))],
      derived: base.derived || less.length > 0,
    };
  }
  const parts = cand.sum.map((tag) => resolveTag(store, def, tag, slot)).filter((r): r is Resolved => r !== null);
  if (parts.length === 0) return null;
  return {
    val: parts.reduce((a, p) => a + p.val, 0),
    facts: parts.flatMap((p) => p.facts),
    tags: parts.flatMap((p) => p.tags),
    derived: parts.some((p) => p.derived),
  };
}

/**
 * For "max" items, the candidate chosen for a fiscal year's annual period is pinned for that
 * year's quarters, so a quarter can't silently switch to a different revenue definition than
 * the annual total it rolls up to.
 */
type PinnedCandidates = Map<string, number>;

function resolveItem(
  store: FactStore,
  def: LineItemDef,
  slot: PeriodSlot,
  pinned: PinnedCandidates
): Resolved | null {
  if (def.strategy === "first") {
    for (const cand of def.candidates) {
      const r = resolveCandidate(store, def, cand, slot);
      if (r) return r;
    }
    return null;
  }
  const pinKey = `${def.id}|${slot.fiscalYear}`;
  const pin = pinned.get(pinKey);
  if (slot.fiscalQuarter !== null && pin !== undefined) {
    const r = resolveCandidate(store, def, def.candidates[pin], slot);
    if (r) return r;
  }
  let best: Resolved | null = null;
  let bestIdx = -1;
  def.candidates.forEach((cand, idx) => {
    const r = resolveCandidate(store, def, cand, slot);
    // Prefer reported over derived when both exist; otherwise take the larger total.
    if (!r) return;
    if (!best || (best.derived && !r.derived) || (best.derived === r.derived && r.val > best.val)) {
      best = r;
      bestIdx = idx;
    }
  });
  if (slot.fiscalQuarter === null && bestIdx >= 0) pinned.set(pinKey, bestIdx);
  return best;
}

function toSource(r: Resolved): ValueSource {
  const latest = r.facts.reduce<Fact | null>((a, f) => (!a || f.filed > a.filed ? f : a), null);
  return {
    tags: [...new Set(r.tags)],
    method: r.derived ? "derived" : "reported",
    accn: latest?.accn,
    form: latest?.form,
    filed: latest?.filed,
  };
}

/** Fill computed items and fallbacks from identities. Mutates the period. */
function applyComputedItems(p: FinancialPeriod): void {
  const v = p.values;
  const set = (id: LineItemId, val: number, inputs: LineItemId[]) => {
    if (!Number.isFinite(val)) return;
    v[id] = val;
    const filed = inputs
      .map((i) => p.sources[i]?.filed)
      .filter((f): f is string => Boolean(f))
      .sort()
      .pop();
    p.sources[id] = { tags: inputs.map((i) => `=${i}`), method: "computed", filed };
  };
  const has = (id: LineItemId) => typeof v[id] === "number";

  if (!has("grossProfit") && has("revenue") && has("costOfRevenue")) {
    set("grossProfit", v.revenue! - v.costOfRevenue!, ["revenue", "costOfRevenue"]);
  }
  if (!has("equityInclNci") && has("equity")) {
    set("equityInclNci", v.equity! + (v.minorityInterest ?? 0), ["equity", "minorityInterest"]);
  }
  if (!has("equity") && has("equityInclNci")) {
    set("equity", v.equityInclNci! - (v.minorityInterest ?? 0), ["equityInclNci", "minorityInterest"]);
  }
  if (!has("totalLiabilities") && has("equityInclNci")) {
    const mezz = v.mezzanineEquity ?? 0;
    if (has("liabilitiesAndEquity")) {
      set("totalLiabilities", v.liabilitiesAndEquity! - v.equityInclNci! - mezz, ["liabilitiesAndEquity", "equityInclNci", "mezzanineEquity"]);
    } else if (has("totalAssets")) {
      set("totalLiabilities", v.totalAssets! - v.equityInclNci! - mezz, ["totalAssets", "equityInclNci", "mezzanineEquity"]);
    }
  }
  if (!has("pretaxIncome") && has("netIncome") && has("incomeTax")) {
    set("pretaxIncome", v.netIncome! + v.incomeTax!, ["netIncome", "incomeTax"]);
  }
  // Companies without an operating-income line (integrated oil, several pharmas): EBIT proxy.
  if (!has("operatingIncome") && !has("netInterestIncome") && has("pretaxIncome") && has("interestExpense")) {
    set("operatingIncome", v.pretaxIncome! + v.interestExpense!, ["pretaxIncome", "interestExpense"]);
  }
  if (has("currentDebt") || has("longTermDebt")) {
    set("totalDebt", (v.currentDebt ?? 0) + (v.longTermDebt ?? 0), ["currentDebt", "longTermDebt"]);
  }
  if (has("totalDebt") && has("cash")) {
    set("netDebt", v.totalDebt! - v.cash! - (v.shortTermInvestments ?? 0), ["totalDebt", "cash", "shortTermInvestments"]);
  }
  if (has("operatingCashFlow") && has("capex")) {
    set("freeCashFlow", v.operatingCashFlow! - v.capex!, ["operatingCashFlow", "capex"]);
  }
  if (has("operatingIncome") && has("depreciationAmortization")) {
    set("ebitda", v.operatingIncome! + v.depreciationAmortization!, ["operatingIncome", "depreciationAmortization"]);
  }
}

/**
 * No filing reports Q4 diluted shares or EPS. A full-year weighted average is (almost exactly)
 * the mean of the four quarterly weighted averages, so Q4 shares ≈ 4·FY − (Q1+Q2+Q3), and
 * Q4 EPS = Q4 net income / Q4 shares.
 */
function fillQ4PerShare(periods: FinancialPeriod[]): void {
  const byId = new Map(periods.map((p) => [p.id, p]));
  for (const q4 of periods) {
    if (q4.fiscalQuarter !== 4) continue;
    const fy = byId.get(`FY${q4.fiscalYear}`);
    const q = [1, 2, 3].map((k) => byId.get(`FY${q4.fiscalYear}Q${k}`));
    const fyShares = fy?.values.dilutedShares;
    const qShares = q.map((p) => p?.values.dilutedShares);
    if (q4.values.dilutedShares === undefined && fyShares !== undefined && qShares.every((s) => s !== undefined)) {
      const est = 4 * fyShares - (qShares as number[]).reduce((a, b) => a + b, 0);
      // Reject estimates that are implausible (e.g. after a large buyback or share-class change).
      if (est > 0.8 * fyShares && est < 1.2 * fyShares) {
        q4.values.dilutedShares = est;
        q4.sources.dilutedShares = {
          tags: ["=4·FY−(Q1+Q2+Q3)"],
          method: "derived",
          filed: fy?.sources.dilutedShares?.filed,
        };
      }
    }
    if (
      q4.values.epsDiluted === undefined &&
      q4.values.netIncome !== undefined &&
      q4.values.dilutedShares !== undefined &&
      q4.values.dilutedShares > 0
    ) {
      q4.values.epsDiluted = q4.values.netIncome / q4.values.dilutedShares;
      q4.sources.epsDiluted = {
        tags: ["=netIncome/dilutedShares"],
        method: "computed",
        filed: q4.sources.netIncome?.filed,
      };
    }
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function normalizeCompanyFacts(raw: SecCompanyFacts, opts: NormalizeOptions = {}): FinancialHistory {
  const asOf = opts.asOf ?? null;
  const store = new FactStore(raw, asOf);
  const calendar = buildFiscalCalendar(store);

  const slots: PeriodSlot[] = [];
  for (const fy of calendar) {
    const base = {
      fiscalYear: fy.label,
      fyStart: fy.s,
      fyEnd: fy.e,
      quarterEnds: fy.quarterEnds,
      fyComplete: fy.complete,
    };
    if (fy.complete) {
      slots.push({ ...base, id: `FY${fy.label}`, fiscalQuarter: null, s: fy.s, e: fy.e });
    }
    for (const k of [1, 2, 3, 4] as const) {
      const e = fy.quarterEnds[k];
      if (e === undefined) continue;
      const prevEnd = k === 1 ? fy.s - 1 : fy.quarterEnds[k - 1];
      const s = prevEnd !== undefined ? prevEnd + 1 : e - 90;
      slots.push({ ...base, id: `FY${fy.label}Q${k}`, fiscalQuarter: k, s, e });
    }
  }

  const periods: FinancialPeriod[] = [];
  const pinned: PinnedCandidates = new Map();
  let lastFiled: string | null = null;
  for (const slot of slots) {
    const p: FinancialPeriod = {
      id: slot.id,
      fiscalYear: slot.fiscalYear,
      fiscalQuarter: slot.fiscalQuarter,
      start: fromDay(slot.s),
      end: fromDay(slot.e),
      values: {},
      sources: {},
    };
    for (const def of REPORTED_LINE_ITEMS) {
      const r = resolveItem(store, def, slot, pinned);
      if (!r) continue;
      p.values[def.id] = r.val;
      const src = toSource(r);
      p.sources[def.id] = src;
      if (src.filed && (!lastFiled || src.filed > lastFiled)) lastFiled = src.filed;
    }
    applyComputedItems(p);
    if (Object.keys(p.values).length > 0) periods.push(p);
  }

  fillQ4PerShare(periods);

  const maxA = opts.maxAnnualPeriods ?? 10;
  const maxQ = opts.maxQuarterlyPeriods ?? 20;
  const annual = periods.filter((p) => p.fiscalQuarter === null).slice(-maxA);
  const quarterly = periods.filter((p) => p.fiscalQuarter !== null).slice(-maxQ);

  const sharePoints = store.sharesOutstandingPoints();
  let latestSharesOutstanding: SharesOutstandingPoint | null = sharePoints[sharePoints.length - 1] ?? null;
  if (!latestSharesOutstanding) {
    const latestBs = [...quarterly, ...annual]
      .filter((p) => typeof p.values.sharesOutstanding === "number")
      .sort((a, b) => a.end.localeCompare(b.end))
      .pop();
    if (latestBs) {
      const src = latestBs.sources.sharesOutstanding!;
      latestSharesOutstanding = {
        value: latestBs.values.sharesOutstanding!,
        date: latestBs.end,
        filed: src.filed ?? latestBs.end,
        accn: src.accn ?? "",
      };
    }
  }

  return {
    cik: raw.cik,
    entityName: raw.entityName,
    currency: store.currency,
    taxonomy: store.taxonomy,
    asOf,
    annual,
    quarterly,
    latestSharesOutstanding,
    lastFiled,
  };
}
