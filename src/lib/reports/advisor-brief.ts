import { buildCalculationProvenance, type CalculationProvenance } from "../compliance/provenance";

export interface AdvisorClientBriefInput {
  firmName: string;
  advisorName: string;
  clientName: string;
  residency: string;
  horizonYears?: number;
  capitalUsd?: number;
  goals: string[];
  clientFacts: string[];
  assumptions: string[];
  recommendations: string[];
  meetingQuestions: string[];
  customDisclosure?: string;
}

export interface AdvisorClientBriefResult {
  markdown: string;
  html: string;
  provenance: CalculationProvenance;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generates a white-labeled CFP / RIA Client Review Brief separating client-provided
 * facts from modeling assumptions, stamped with a deterministic provenance hash and
 * regulatory disclosure footer.
 */
export function generateAdvisorClientBrief(
  input: AdvisorClientBriefInput
): AdvisorClientBriefResult {
  const generatedDate = new Date().toISOString().slice(0, 10);
  const coreOutput = {
    firmName: input.firmName,
    advisorName: input.advisorName,
    clientName: input.clientName,
    residency: input.residency,
    horizonYears: input.horizonYears ?? null,
    capitalUsd: input.capitalUsd ?? null,
    goals: input.goals,
    clientFacts: input.clientFacts,
    assumptions: input.assumptions,
    recommendations: input.recommendations,
    meetingQuestions: input.meetingQuestions,
  };

  const provenance = buildCalculationProvenance({
    toolName: "generate_advisor_client_brief",
    input,
    output: coreOutput,
    deterministic: true,
    profile: "planner",
  });

  const disclosure = input.customDisclosure?.trim() || provenance.disclaimer;

  const bulletList = (items: string[]) =>
    items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "- None recorded";

  const markdown = [
    `# ${input.firmName} — Client Review Brief`,
    `**Prepared for:** ${input.clientName} | **Advisor:** ${input.advisorName} | **Date:** ${generatedDate}`,
    `**Tax Residency:** ${input.residency}${input.horizonYears ? ` | **Horizon:** ${input.horizonYears} years` : ""}${input.capitalUsd ? ` | **Capital Reviewed:** $${input.capitalUsd.toLocaleString("en-US")}` : ""}`,
    "",
    "## 1. Household Goals",
    bulletList(input.goals),
    "",
    "## 2. Client-Provided Facts",
    bulletList(input.clientFacts),
    "",
    "## 3. Modeling Assumptions (Separate from Facts)",
    bulletList(input.assumptions),
    "",
    "## 4. Recommended Next Actions",
    bulletList(input.recommendations),
    "",
    "## 5. Meeting Discussion Questions",
    bulletList(input.meetingQuestions),
    "",
    "---",
    `> **Compliance & Provenance:** ${disclosure}`,
    `> Engine: \`${provenance.engineVersion}\` | Provenance SHA-256: \`${provenance.provenanceHash.slice(0, 16)}\``,
  ].join("\n");

  const htmlList = (items: string[]) =>
    items.length > 0
      ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      : "<p>None recorded</p>";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.firmName)} — Client Review Brief (${escapeHtml(input.clientName)})</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; max-width: 780px; margin: 32px auto; padding: 0 20px; line-height: 1.55; }
    header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    .meta { color: #475569; font-size: 13px; }
    h2 { font-size: 16px; margin-top: 22px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 12px; color: #475569; }
    code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(input.firmName)} — Client Review Brief</h1>
    <div class="meta">Prepared for <strong>${escapeHtml(input.clientName)}</strong> &middot; Advisor: ${escapeHtml(input.advisorName)} &middot; Residency: ${escapeHtml(input.residency)} &middot; ${generatedDate}</div>
  </header>
  <section><h2>1. Household Goals</h2>${htmlList(input.goals)}</section>
  <section><h2>2. Client-Provided Facts</h2>${htmlList(input.clientFacts)}</section>
  <section><h2>3. Modeling Assumptions</h2>${htmlList(input.assumptions)}</section>
  <section><h2>4. Recommended Next Actions</h2>${htmlList(input.recommendations)}</section>
  <section><h2>5. Meeting Discussion Questions</h2>${htmlList(input.meetingQuestions)}</section>
  <footer>
    <p><strong>Disclosure:</strong> ${escapeHtml(disclosure)}</p>
    <p>Engine: <code>${escapeHtml(provenance.engineVersion)}</code> &middot; Provenance SHA-256: <code>${escapeHtml(provenance.provenanceHash.slice(0, 16))}</code></p>
  </footer>
</body>
</html>`;

  return { markdown, html, provenance };
}
