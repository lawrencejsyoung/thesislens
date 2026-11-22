import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  assertPermission,
  assertTenantAccess,
  hasPermission,
  PermissionDeniedError,
} from "../src/lib/auth/rbac";
import {
  registerScopedApiKey,
  resetScopedApiKeyStore,
  resolveRequestContext,
  revokeScopedApiKey,
} from "../src/lib/auth/session";
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  computePkceS256Challenge,
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  registerOAuthClient,
  resetOAuthStores,
  revokeOAuthToken,
  verifyOAuthAccessToken,
} from "../src/lib/auth/oauth21";
import {
  consumeQuota,
  getEntitlements,
  resetBillingStores,
} from "../src/lib/billing/entitlements";
import {
  processStripeEvent,
  resetStripeEventStore,
  verifyStripeWebhookSignature,
} from "../src/lib/billing/stripe";
import {
  buildCalculationProvenance,
  getAuditSink,
  recordAuditEvent,
} from "../src/lib/compliance/provenance";
import { createAnalystModel } from "../src/lib/providers/analyst-model";
import {
  FmpConsensusProvider,
  FmpMarketDataProvider,
} from "../src/lib/providers/live-market-data";
import { generateAdvisorClientBrief } from "../src/lib/reports/advisor-brief";
import { buildOpenApiSpec } from "../src/lib/sdk/openapi";
import { executeOpenAIToolCall, getOpenAIFunctionTools } from "../src/lib/sdk/openai-tools";

async function main() {
  resetScopedApiKeyStore();
  resetOAuthStores();
  resetBillingStores();
  resetStripeEventStore();
  getAuditSink().clear();

  console.log("1. Verifying Scoped API Keys, Multi-Tenant Isolation & RBAC...");
  const advisorKey = registerScopedApiKey({
    orgId: "org_ria_north",
    userId: "usr_cfp_1",
    name: "Advisor Claude Connector",
    role: "advisor",
    tier: "advisor",
    profile: "planner",
  });
  const ctxAdvisor = resolveRequestContext(
    {
      headers: new Headers({
        authorization: `Bearer ${advisorKey.rawKey}`,
        "user-agent": "Claude-Desktop/1.0",
      }),
    },
    { isMcpRoute: true }
  );
  assert.ok(ctxAdvisor, "Scoped API key should resolve context");
  assert.equal(ctxAdvisor.orgId, "org_ria_north");
  assert.equal(ctxAdvisor.surface, "mcp_claude");
  assert.equal(hasPermission(ctxAdvisor, "household:manage"), true);
  assert.equal(hasPermission(ctxAdvisor, "report:export_branded"), true);
  assert.equal(hasPermission(ctxAdvisor, "llm:zdr_routing"), false);
  assert.throws(() => assertPermission(ctxAdvisor, "memo:approve_ic"), PermissionDeniedError);
  assert.throws(() => assertTenantAccess(ctxAdvisor, "org_other_firm"), PermissionDeniedError);

  assert.equal(revokeScopedApiKey(advisorKey.record.id), true);
  const revokedCtx = resolveRequestContext(
    { headers: new Headers({ authorization: `Bearer ${advisorKey.rawKey}` }) },
    { isMcpRoute: true }
  );
  assert.equal(revokedCtx, null, "Revoked API key must be rejected");
  console.log("   PASS: Scoped API keys, revocation, RBAC, and cross-tenant isolation verified.");

  console.log("2. Verifying OAuth 2.1 + PKCE + Dynamic Client Registration (MCP Auth)...");
  const prm = buildProtectedResourceMetadata("https://api.thesislens.ai");
  const asm = buildAuthorizationServerMetadata("https://api.thesislens.ai");
  assert.equal(prm.resource, "https://api.thesislens.ai/api/mcp");
  assert.deepEqual(asm.code_challenge_methods_supported, ["S256"]);

  assert.throws(() =>
    registerOAuthClient({
      client_name: "Evil HTTP Client",
      redirect_uris: ["http://evil.example.com/callback"],
    })
  );

  const client = registerOAuthClient({
    client_name: "ChatGPT MCP Connector",
    redirect_uris: ["https://chatgpt.com/connector/oauth/callback"],
  });
  const verifier = "verifier_" + crypto.randomBytes(32).toString("hex");
  const challenge = computePkceS256Challenge(verifier);
  const code = issueAuthorizationCode({
    clientId: client.clientId,
    redirectUri: client.redirectUris[0],
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    userId: "usr_hf_pm",
    orgId: "org_alpha_fund",
    role: "owner",
    tier: "hedge_fund",
    profile: "manager",
    scopes: ["mcp:tools", "quant:execute"],
  });

  // Wrong PKCE verifier must fail
  assert.throws(() =>
    exchangeAuthorizationCode({
      code,
      clientId: client.clientId,
      redirectUri: client.redirectUris[0],
      codeVerifier: "wrong_verifier_value",
      issuer: "https://api.thesislens.ai",
      audience: "https://api.thesislens.ai/api/mcp",
    })
  );

  const tokenResp = exchangeAuthorizationCode({
    code,
    clientId: client.clientId,
    redirectUri: client.redirectUris[0],
    codeVerifier: verifier,
    issuer: "https://api.thesislens.ai",
    audience: "https://api.thesislens.ai/api/mcp",
  });
  assert.equal(tokenResp.token_type, "Bearer");

  // Replaying the same code must fail
  assert.throws(() =>
    exchangeAuthorizationCode({
      code,
      clientId: client.clientId,
      redirectUri: client.redirectUris[0],
      codeVerifier: verifier,
      issuer: "https://api.thesislens.ai",
      audience: "https://api.thesislens.ai/api/mcp",
    })
  );

  const claims = verifyOAuthAccessToken(tokenResp.access_token, "https://api.thesislens.ai/api/mcp");
  assert.ok(claims, "OAuth 2.1 JWT must verify");
  assert.equal(claims.org_id, "org_alpha_fund");
  assert.equal(claims.tier, "hedge_fund");
  assert.equal(claims.zdr, true);

  const ctxOAuth = resolveRequestContext(
    {
      headers: new Headers({
        authorization: `Bearer ${tokenResp.access_token}`,
        "user-agent": "OpenAI-ChatGPT/2.0",
      }),
    },
    { isMcpRoute: true }
  );
  assert.ok(ctxOAuth);
  assert.equal(ctxOAuth.authMethod, "oauth21");
  assert.equal(ctxOAuth.surface, "mcp_openai");
  assert.equal(hasPermission(ctxOAuth, "llm:zdr_routing"), true);

  revokeOAuthToken(claims.jti);
  assert.equal(verifyOAuthAccessToken(tokenResp.access_token), null, "Revoked JWT must fail");
  console.log("   PASS: OAuth 2.1 discovery, DCR, PKCE S256, replay defense, and JWT verification passed.");

  console.log("3. Verifying Multi-LLM Adapters (Claude + OpenAI) & Live Market Data Provider...");
  const claudeModel = createAnalystModel({
    provider: "claude",
    apiKey: "test-claude-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          model: "claude-sonnet-4-5",
          content: [
            { type: "text", text: "Checking SEC revenue trend." },
            { type: "tool_use", id: "toolu_1", name: "get_company_fundamentals", input: { ticker: "AAPL" } },
          ],
          usage: { input_tokens: 1200, output_tokens: 250, cache_read_input_tokens: 800 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  });
  const claudeOut = await claudeModel.generate({
    systemPrefix: "You are a CFA equity analyst.",
    messages: [{ role: "user", content: "Model AAPL" }],
    tools: [
      {
        name: "get_company_fundamentals",
        description: "Load SEC fundamentals",
        parameters: { type: "object", properties: { ticker: { type: "string" } } },
      },
    ],
  });
  assert.equal(claudeOut.toolCalls.length, 1);
  assert.equal(claudeOut.toolCalls[0].name, "get_company_fundamentals");
  assert.ok(claudeOut.usage.estimatedCostUsd > 0);

  const openaiModel = createAnalystModel({
    provider: "openai",
    apiKey: "test-openai-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          model: "gpt-4.1",
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_abc",
                    function: { name: "run_dcf_valuation", arguments: '{"ticker":"MSFT"}' },
                  },
                ],
              },
            },
          ],
          usage: {
            prompt_tokens: 900,
            completion_tokens: 180,
            prompt_tokens_details: { cached_tokens: 400 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  });
  const openaiOut = await openaiModel.generate({
    systemPrefix: "You are a portfolio risk officer.",
    messages: [{ role: "user", content: "Value MSFT" }],
    tools: [
      {
        name: "run_dcf_valuation",
        description: "Run DCF",
        parameters: { type: "object", properties: { ticker: { type: "string" } } },
      },
    ],
  });
  assert.equal(openaiOut.toolCalls.length, 1);
  assert.equal(openaiOut.toolCalls[0].args.ticker, "MSFT");

  let fmpCalls = 0;
  const fmpQuotes = new FmpMarketDataProvider({
    apiKey: "test-fmp-key",
    fetchImpl: async () => {
      fmpCalls++;
      return new Response(
        JSON.stringify([{ symbol: "AAPL", price: 235.4, marketCap: 3_550_000_000_000, beta: 1.18, currency: "USD" }]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },
  });
  const q1 = await fmpQuotes.getQuote("AAPL");
  const q2 = await fmpQuotes.getQuote("AAPL"); // cached
  assert.equal(q1?.price, 235.4);
  assert.equal(q2?.price, 235.4);
  assert.equal(fmpCalls, 1, "Second quote should hit TTL cache");
  const pitQuote = await fmpQuotes.getQuote("AAPL", { asOf: "2024-06-30", fallbackPrice: 210 });
  assert.equal(pitQuote?.price, 210, "Point-in-time asOf must not leak live spot price");

  const fmpConsensus = new FmpConsensusProvider({
    apiKey: "test-fmp-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          { date: "2027-09-30", estimatedRevenueAvg: 445_000_000_000, estimatedEpsAvg: 8.42, numberAnalystEstimatedRevenue: 34 },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  });
  const est = await fmpConsensus.getEstimates("AAPL");
  assert.equal(est.length, 1);
  assert.equal(est[0].periodId, "FY2027");
  assert.equal(est[0].epsMean, 8.42);
  console.log("   PASS: Claude, OpenAI, and FMP live market/consensus adapters verified.");

  console.log("4. Verifying Stripe Webhook Verification, Entitlements & Quota Enforcement...");
  const secret = "whsec_test_secret_123";
  const nowSec = Math.floor(Date.now() / 1000);
  const rawPayload = JSON.stringify({
    id: "evt_upgrade_1",
    type: "customer.subscription.updated",
    data: {
      object: {
        status: "active",
        metadata: { org_id: "org_retail_user_1", plan_tier: "advisor" },
      },
    },
  });
  const validSig = crypto
    .createHmac("sha256", secret)
    .update(`${nowSec}.${rawPayload}`, "utf8")
    .digest("hex");
  assert.equal(
    verifyStripeWebhookSignature(rawPayload, `t=${nowSec},v1=${validSig}`, secret, 300, nowSec),
    true
  );
  assert.equal(
    verifyStripeWebhookSignature(rawPayload, `t=${nowSec},v1=tampered`, secret, 300, nowSec),
    false
  );
  assert.equal(
    verifyStripeWebhookSignature(rawPayload, `t=${nowSec - 1000},v1=${validSig}`, secret, 300, nowSec),
    false
  );

  const first = processStripeEvent(JSON.parse(rawPayload));
  assert.equal(first.handled, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.tier, "advisor");
  const dup = processStripeEvent(JSON.parse(rawPayload));
  assert.equal(dup.duplicate, true, "Duplicate Stripe event must be idempotent");

  const ent = getEntitlements({ orgId: "org_retail_user_1", tier: "free" });
  assert.equal(ent.tier, "advisor");
  assert.equal(ent.whiteLabelReports, true);

  const qFree = consumeQuota({ orgId: "org_free_quota_test", tier: "free" }, "mcpCalls", 100);
  assert.equal(qFree.allowed, true);
  const qFreeDenied = consumeQuota({ orgId: "org_free_quota_test", tier: "free" }, "mcpCalls", 1);
  assert.equal(qFreeDenied.allowed, false);
  console.log("   PASS: Stripe signature verification, idempotency, tier upgrades, and quota caps verified.");

  console.log("5. Verifying Provenance, Audit Logs, OpenAPI 3.1, OpenAI SDK & Advisor Brief...");
  const p1 = buildCalculationProvenance({
    toolName: "run_dcf_valuation",
    input: { b: 2, a: 1 },
    output: { value: 20.07 },
    deterministic: true,
    profile: "planner",
  });
  const p2 = buildCalculationProvenance({
    toolName: "run_dcf_valuation",
    input: { a: 1, b: 2 },
    output: { value: 20.07 },
    deterministic: true,
    profile: "planner",
  });
  assert.equal(p1.provenanceHash, p2.provenanceHash, "Canonical provenance hash must be order-independent");

  recordAuditEvent({
    orgId: "org_ria_north",
    userId: "usr_cfp_1",
    surface: "mcp_claude",
    action: "mcp:tool_call",
    toolName: "run_dcf_valuation",
    inputHash: p1.inputHash,
    outputHash: p1.outputHash,
    provenanceHash: p1.provenanceHash,
    tokensUsed: 0,
    costUsd: 0,
    status: "ok",
  });
  assert.equal(getAuditSink().listByOrg("org_ria_north").length, 1);

  const spec = buildOpenApiSpec("https://api.thesislens.ai");
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/api/model"]);
  assert.ok(spec.paths["/api/reports/advisor-brief"]);

  const openAiTools = getOpenAIFunctionTools();
  assert.ok(openAiTools.length >= 5);
  const dcfViaSdk = await executeOpenAIToolCall("run_dcf_valuation", {
    ticker: "VALE",
    currentPrice: 12.5,
    fcfPerShare: 1.5,
    growthRate: 8,
    wacc: 10,
    terminalGrowth: 2.5,
  });
  assert.ok(dcfViaSdk.summary.includes("VALE"));

  const brief = generateAdvisorClientBrief({
    firmName: "Northern Shield Wealth Partners",
    advisorName: "Alex Mercer, CFP",
    clientName: "Taylor Household",
    residency: "canada_on",
    horizonYears: 15,
    capitalUsd: 650_000,
    goals: ["Retire at 60 with $85k/yr after-tax", "Compare Sudbury duplex vs TFSA/RRSP index core"],
    clientFacts: ["Combined marginal rate 42.82%", "TFSA contribution room $42,000"],
    assumptions: ["6.5% nominal balanced equity return", "2.2% long-run inflation"],
    recommendations: ["Max TFSA before non-registered equities"],
    meetingQuestions: ["How comfortable are you with landlord operational time?"],
  });
  assert.ok(brief.markdown.includes("Northern Shield Wealth Partners"));
  assert.ok(brief.html.includes("Provenance SHA-256"));
  console.log("   PASS: Provenance, audit log, OpenAPI 3.1, OpenAI SDK, and Advisor Brief verified.");

  console.log("\nALL PRODUCTIONIZATION & MULTI-PLATFORM PLUGIN CHECKS PASSED!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
