import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createThesisLensMcpServer } from "@/mcp/server";
import {
  constantTimeEquals,
  extractSafeGeminiApiKey,
  logServerError,
} from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.MCP_API_KEY?.trim();
  if (!expected) {
    // Fail-closed in production unless explicitly opted into unauthenticated MCP access
    if (process.env.NODE_ENV === "production") {
      return process.env.MCP_ALLOW_UNAUTHENTICATED === "true";
    }
    return true;
  }
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return false;
  return constantTimeEquals(token, expected);
}

function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized: valid Bearer token required (MCP_API_KEY).",
      },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="ThesisLens MCP"',
      },
    }
  );
}

async function handleMcpRequest(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  const geminiApiKey =
    extractSafeGeminiApiKey(req) || process.env.GEMINI_API_KEY?.trim() || undefined;

  const server = createThesisLensMcpServer({ geminiApiKey });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode for Next.js / serverless compatibility
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
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
