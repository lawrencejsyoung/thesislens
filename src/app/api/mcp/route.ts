import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createThesisLensMcpServer } from "@/mcp/server";
import { resolveRequestContext } from "@/lib/auth/session";
import { consumeQuota } from "@/lib/billing/entitlements";
import { recordAuditEvent, sha256Hex } from "@/lib/compliance/provenance";
import { extractSafeGeminiApiKey, logServerError } from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorizedResponse(origin: string): Response {
  const metadataUrl = `${origin.replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Unauthorized: valid OAuth 2.1 Bearer token, scoped API key (tl_live_*), or MCP_API_KEY required.",
      },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="ThesisLens MCP", resource_metadata="${metadataUrl}"`,
      },
    }
  );
}

function quotaExceededResponse(used: number, limit: number, tier: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32002,
        message: `Monthly MCP call quota exceeded for tier "${tier}" (${used}/${limit}). Upgrade your ThesisLens plan to continue.`,
      },
      id: null,
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function handleMcpRequest(req: NextRequest): Promise<Response> {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const ctx = resolveRequestContext(req, { isMcpRoute: true });
  if (!ctx) {
    return unauthorizedResponse(origin);
  }

  const quota = consumeQuota(ctx, "mcpCalls", 1);
  if (!quota.allowed) {
    recordAuditEvent({
      orgId: ctx.orgId,
      userId: ctx.userId,
      surface: ctx.surface,
      action: "mcp:quota_denied",
      inputHash: sha256Hex({ method: req.method, path: req.nextUrl.pathname }),
      tokensUsed: 0,
      costUsd: 0,
      status: "denied",
      metadata: { used: quota.used, limit: quota.limit, tier: quota.tier },
    });
    return quotaExceededResponse(quota.used, quota.limit, quota.tier);
  }

  const geminiApiKey =
    extractSafeGeminiApiKey(req) || process.env.GEMINI_API_KEY?.trim() || undefined;

  const server = createThesisLensMcpServer({
    geminiApiKey,
    requestContext: ctx,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode for Next.js / serverless compatibility
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    const response = await transport.handleRequest(req);
    recordAuditEvent({
      orgId: ctx.orgId,
      userId: ctx.userId,
      surface: ctx.surface,
      action: `mcp:${req.method.toLowerCase()}`,
      inputHash: sha256Hex({ method: req.method, authMethod: ctx.authMethod }),
      tokensUsed: 0,
      costUsd: 0,
      status: response.ok ? "ok" : "error",
      metadata: { tier: quota.tier, mcpCallsUsed: quota.used, mcpCallsLimit: quota.limit },
    });
    return response;
  } catch (err) {
    logServerError("api/mcp", err);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal MCP server error.",
        },
        id: null,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  } finally {
    await server.close().catch(() => {});
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}
