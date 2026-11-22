export const profiles = {
  beginner: {
    label: "New investor", title: "Explore your first portfolio.",
    description: "Start with a sample, change your monthly savings, and see what a range of outcomes could look like.",
    action: "Explore a sample portfolio", preset: "first-portfolio", start: "committee",
    agent: "Explain the range of outcomes in everyday language. Define each investment term when first used and end with one question worth exploring.",
    prompt: "How might monthly savings change the range of outcomes for my portfolio?",
  },
  retail: {
    label: "Pro retail investor", title: "Put your thesis to the test.",
    description: "Review a portfolio, challenge its assumptions, and compare the bull and bear cases before changing your allocation.",
    action: "Review a portfolio", preset: "sudbury-critical-minerals", start: "committee",
    agent: "Compare the base case and the downside. Identify the assumption that most changes the valuation and a condition that would invalidate the thesis.",
    prompt: "Which assumption matters most to the downside of my portfolio?",
  },
  planner: {
    label: "CFP financial planner", title: "Prepare a client review.",
    description: "Start with a household, review its cash flow and retirement milestones, then generate a brief for the client meeting.",
    action: "Open household plan", preset: "first-portfolio", start: "planner",
    agent: "Ask for the household's goals, time horizon and tax residency. Distinguish client-provided facts from assumptions and finish with meeting questions and next actions.",
    prompt: "What should we discuss with a household weighing a property purchase against investing?",
  },
  manager: {
    label: "CFA hedge fund manager", title: "Pressure-test your book.",
    description: "Inspect a long/short mandate, challenge factor exposures, and trace the risk committee’s findings back to its calculations.",
    action: "Review a long/short book", preset: "sudbury-100m-hedge-fund", start: "committee",
    agent: "Report gross and net exposure, downside scenarios and liquidity constraints when supported by the available inputs. Surface dissent and identify the evidence that would change the decision.",
    prompt: "Which exposures and liquidity limits should the committee challenge in this long/short book?",
  },
} as const;
export type Profile = keyof typeof profiles;
export type Workspace = "overview" | "committee" | "company_model" | "global_tax" | "planner" | "agents" | "library";

export function isProfile(value: unknown): value is Profile {
  return typeof value === "string" && Object.hasOwn(profiles, value);
}

export function audienceGuidance(value: unknown): string {
  return isProfile(value) ? profiles[value].agent : "";
}

export const workspaceLabels: Record<Workspace, string> = {
  overview: "Workspace", library: "Scenario library", committee: "Portfolio research", company_model: "Company valuation",
  global_tax: "Tax planning", planner: "Household planning", agents: "Agent connections",
};
