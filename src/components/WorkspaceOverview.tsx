"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { ArrowRight, ArrowUpRight, Boxes, Building2, Calculator, ChartNoAxesCombined, ChevronRight, House, Layers3, Network, Search } from "lucide-react";
import { PRESET_SCENARIOS, PresetScenario } from "@/lib/demo-scenarios";
import { analyzePortfolioMetrics, runMonteCarloSimulation } from "@/lib/quant-engine";
import { getDemographicMeta } from "@/lib/lifestyle-presets";
import { runLifestylePlan } from "@/lib/lifestyle-engine";
import { Profile, profiles, Workspace } from "@/lib/workspaces";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const tools = [
  { key: "committee", title: "Portfolio research", description: "Analyze holdings, debate a thesis, and simulate a rebalance.", icon: ChartNoAxesCombined, category: "Portfolio" },
  { key: "company_model", title: "Company valuation", description: "Build a financial model from filings and test a fair-value range.", icon: Building2, category: "Companies" },
  { key: "planner", title: "Household planning", description: "Map cash flow, retirement goals, and a client action plan.", icon: House, category: "Planning" },
  { key: "global_tax", title: "Tax planning", description: "Compare account structures, tax residency, and after-tax outcomes.", icon: Calculator, category: "Planning" },
  { key: "scenarios", title: "Scenario library", description: "Explore options, prediction markets, real estate, venture, and long/short risk.", icon: Layers3, category: "Scenarios" },
  { key: "agents", title: "Agent connections", description: "Connect an MCP client to models, prompts, and benchmark data.", icon: Network, category: "Integrations" },
] as const;

function PortfolioPreview({ preset }: { preset: PresetScenario }) {
  const forecast = useMemo(() => {
    const { holdings, capital, monthlyContribution, horizonYears } = preset.payload;
    const metrics = analyzePortfolioMetrics(holdings, capital);
    return runMonteCarloSimulation({ initialCapital: capital, monthlyContribution, horizonYears,
      expectedReturnPct: metrics.expectedAnnualReturnPct, volatilityPct: metrics.annualVolatilityPct });
  }, [preset]);
  const data = forecast.trajectory.map(row => ({ ...row, range: [row.p10, row.p90] }));
  return <figure className="preview">
    <figcaption><ChartNoAxesCombined size={16}/>Portfolio projection <span>{forecast.horizonYears} years</span></figcaption>
    <strong>{money.format(forecast.medianEndingValue)}</strong><small>Modeled median · {money.format(forecast.initialCapital)} plus {money.format(forecast.monthlyContribution)}/month</small>
    <div className="chart-box"><ResponsiveContainer width="100%" height="100%" minWidth={1}>
      <ComposedChart data={data} margin={{ left: 3, right: 5, top: 6, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#3a514e" strokeDasharray="2 5"/>
        <XAxis dataKey="year" tickFormatter={v => v === 0 ? "Today" : `Yr ${v}`} ticks={[0,Math.round(forecast.horizonYears/2),forecast.horizonYears]} axisLine={false} tickLine={false} tick={{ fill:"#b0c0b9",fontSize:10 }} height={20}/>
        <YAxis hide domain={["dataMin","auto"]}/>
        <Tooltip contentStyle={{ background:"#172923", border:"1px solid #52695e", borderRadius:8, color:"#eef5ed", fontSize:12 }} labelFormatter={v => `Year ${v}`} formatter={(v) => Array.isArray(v) ? v.map(Number).map(n => money.format(n)).join(" – ") : money.format(Number(v))}/>
        <Area type="monotone" dataKey="range" name="10th–90th percentile" stroke="none" fill="#9acfb5" fillOpacity={0.22} isAnimationActive={false}/>
        <Line type="monotone" dataKey="p50" name="Median" stroke="#c1efa1" strokeWidth={2.8} dot={false} isAnimationActive={false}/>
      </ComposedChart>
    </ResponsiveContainer></div>
    <div className="chart-key"><i/>Middle 80% at year {forecast.horizonYears} · {money.format(forecast.downsideP10Value)}–{money.format(forecast.upsideP90Value)}</div>
  </figure>;
}

function ProfilePreview({ profile, preset }: { profile: Profile; preset: PresetScenario }) {
  const plan = useMemo(() => profile === "planner" ? runLifestylePlan(getDemographicMeta("couple").defaultProfile) : null, [profile]);
  if (plan) return <figure className="preview">
    <figcaption><House size={16}/>Sample household <span>Couple</span></figcaption>
    <strong>${compact(plan.kpis.projectedLiquidAtRetirement)}</strong><small>Projected liquid assets at retirement</small>
    <div className="chart-box"><ResponsiveContainer width="100%" height="100%" minWidth={1}>
      <AreaChart data={plan.projections} margin={{left:4,right:8,top:6,bottom:0}}>
        <CartesianGrid vertical={false} stroke="#3a514e" strokeDasharray="2 5"/>
        <XAxis dataKey="age" tickLine={false} axisLine={false} tick={{fill:"#b0c0b9",fontSize:10}} height={20}/>
        <Tooltip labelFormatter={v => `Age ${v}`} formatter={v => money.format(Number(v))} contentStyle={{background:"#172923",border:"1px solid #52695e",color:"#eef5ed"}}/>
        <Area dataKey="liquidPortfolio" name="Liquid assets" type="monotone" stroke="#c1efa1" fill="#9acfb5" fillOpacity={0.2} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer></div><div className="chart-key">Projected balance by age · sample plan</div>
  </figure>;
  if (profile === "manager") {
    const holdings = preset.payload.holdings;
    const short = holdings.filter(h => h.side === "SHORT" || h.weightPct < 0).reduce((s,h) => s + Math.abs(h.weightPct), 0);
    const long = holdings.filter(h => h.side !== "SHORT" && h.weightPct >= 0).reduce((s,h) => s + h.weightPct, 0);
    return <figure className="preview"><figcaption><Layers3 size={16}/>Sample book <span>Long / short</span></figcaption>
      <strong>{long + short}%</strong><small>Gross exposure · ${compact(preset.payload.capital)} mandate</small>
      <div className="exposures">{[["Long",long],["Short",short],["Net",long-short]].map(([name,value]) => <div key={name}><span>{name}</span><meter min={0} max={long+short} value={Number(value)}/><b>{value}%</b></div>)}</div></figure>;
  }
  return <PortfolioPreview preset={preset}/>;
}

export function WorkspaceOverview({ profile, onNavigate, onExample, onLibrary, showLibrary }: {
  profile: Profile; onNavigate: (key: Workspace) => void; onExample: (id: string) => void;
  onLibrary: (open: boolean) => void; showLibrary: boolean;
}) {
  const [search, setSearch] = useState("");
  const config = profiles[profile];
  const preset = PRESET_SCENARIOS.find(s => s.id === config.preset)!;
  if (showLibrary) {
    const filtered = PRESET_SCENARIOS.filter(s => [s.label,s.description,s.badge].join(" ").toLowerCase().includes(search.toLowerCase().trim()));
    return <section className="library-view">
      <button className="back-link" onClick={() => onLibrary(false)}>Workspace <ChevronRight size={14}/> Scenario library</button>
      <h1 className="page-title">Scenario library</h1><p className="page-description">Choose a worked example. You can edit every input before running the analysis.</p>
      <label className="library-search"><Search size={17}/><input aria-label="Search scenarios" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by asset, market, or strategy"/></label>
      <div className="tools-grid">{filtered.map(item => <button key={item.id} className="tool-card" onClick={() => onExample(item.id)}>
        <span className="tool-icon"><Boxes/></span><span className="tool-copy"><small>{item.badge}</small><strong>{item.label}</strong><span>{item.description}</span></span><ArrowUpRight className="card-arrow"/>
      </button>)}</div>{filtered.length === 0 && <p role="status">No matching scenarios. Try a broader term.</p>}
    </section>;
  }
  return <>
    <div className="section-heading"><div><h1 className="page-title">Your workspace</h1></div></div>
    <section className="starter-card">
      <div className="starter-copy"><span className="sample-label"><span/>{config.label}</span>
        <h2>{config.title}</h2><p>{config.description}</p>
        <button className="primary-action" onClick={() => config.start === "planner" ? onNavigate("planner") : onExample(config.preset)}>{config.action}<ArrowRight size={17}/></button>
      </div><ProfilePreview profile={profile} preset={preset}/>
    </section>
    <div className="tools-heading"><h2>Research tools</h2></div>
    <div className="tools-grid">{tools.map(tool => <button className="tool-card" key={tool.key} onClick={() => tool.key === "scenarios" ? onLibrary(true) : onNavigate(tool.key)}>
      <span className="tool-icon"><tool.icon/></span><span className="tool-copy"><strong>{tool.title}</strong><span>{tool.description}</span></span><ArrowUpRight className="card-arrow"/>
    </button>)}</div>
  </>;
}
