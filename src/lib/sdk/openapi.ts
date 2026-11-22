export function buildOpenApiSpec(origin: string) {
  const baseUrl = origin.replace(/\/$/, "");
  return {
    openapi: "3.1.0",
    info: {
      title: "ThesisLens Financial Intelligence & Quant API",
      version: "1.0.0",
      description:
        "Zero-hallucination deterministic valuation, SEC EDGAR fundamentals, portfolio risk/stress-testing, tax-aware rebalancing, and adversarial investment committee API for retail investors, financial advisors, and hedge fund managers.",
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        oauth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${baseUrl}/api/oauth/authorize`,
              tokenUrl: `${baseUrl}/api/oauth/token`,
              scopes: {
                "mcp:tools": "Invoke deterministic ThesisLens quant & valuation tools",
                "quant:execute": "Run DCF, Monte Carlo, portfolio risk, and tax engines",
                "model:override": "Create and save custom company valuation model versions",
                "household:manage": "Manage CFP advisor client households and branded briefs",
              },
            },
          },
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT or tl_live_* API Key",
        },
      },
    },
    security: [{ bearerAuth: [] }, { oauth2: ["quant:execute"] }],
    paths: {
      "/api/fundamentals": {
        get: {
          operationId: "getCompanyFundamentals",
          summary: "Get normalized SEC EDGAR financial history",
          parameters: [
            { name: "ticker", in: "query", required: true, schema: { type: "string" } },
            { name: "asOf", in: "query", required: false, schema: { type: "string", format: "date" } },
            { name: "annualPeriods", in: "query", required: false, schema: { type: "integer", default: 5 } },
            { name: "quarterlyPeriods", in: "query", required: false, schema: { type: "integer", default: 8 } },
          ],
          responses: {
            "200": { description: "Normalized annual & quarterly financials with provenance and quality checks." },
          },
        },
      },
      "/api/model": {
        post: {
          operationId: "buildCompanyModel",
          summary: "Build a linked 3-statement company model and DCF / specialist sector valuation",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ticker"],
                  properties: {
                    ticker: { type: "string" },
                    currentPrice: { type: "number" },
                    asOf: { type: "string", format: "date" },
                    drivers: { type: "object", additionalProperties: true },
                    rationale: { type: "object", additionalProperties: { type: "string" } },
                    detail: { type: "string", enum: ["summary", "full"], default: "summary" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Three-statement forecast, DCF valuation, bear/base/bull scenarios, and sensitivity grid." },
          },
        },
      },
      "/api/quant": {
        post: {
          operationId: "runQuantEngine",
          summary: "Run deterministic DCF, Monte Carlo, portfolio stress test, rebalance, options, or tax calculations",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["action"],
                  properties: {
                    action: { type: "string" },
                    payload: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Deterministic quantitative calculation output." },
          },
        },
      },
      "/api/reports/advisor-brief": {
        post: {
          operationId: "generateAdvisorClientBrief",
          summary: "Generate a branded CFP/RIA Client Review Brief with provenance and regulatory disclosures",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["firmName", "advisorName", "clientName", "residency", "goals"],
                  properties: {
                    firmName: { type: "string" },
                    advisorName: { type: "string" },
                    clientName: { type: "string" },
                    residency: { type: "string" },
                    goals: { type: "array", items: { type: "string" } },
                    clientFacts: { type: "array", items: { type: "string" } },
                    assumptions: { type: "array", items: { type: "string" } },
                    recommendations: { type: "array", items: { type: "string" } },
                    meetingQuestions: { type: "array", items: { type: "string" } },
                    format: { type: "string", enum: ["markdown", "html", "json"], default: "json" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Branded client meeting brief with deterministic provenance hash." },
          },
        },
      },
      "/api/mcp": {
        post: {
          operationId: "invokeMcpEndpoint",
          summary: "Streamable HTTP Model Context Protocol (MCP) JSON-RPC 2.0 endpoint",
          responses: {
            "200": { description: "MCP JSON-RPC response." },
            "401": { description: "OAuth 2.1 Bearer token or API key required." },
          },
        },
      },
    },
  };
}
