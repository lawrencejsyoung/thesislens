import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createThesisLensMcpServer } from "@/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.MCP_API_KEY?.trim();
  if (!expected) return true;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return token === expected;
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
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function handleMcpRequest(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  const geminiApiKey =
    req.headers.get("x-gemini-api-key") || process.env.GEMINI_API_KEY || undefined;

  const server = createThesisLensMcpServer({ geminiApiKey });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode for Next.js / serverless compatibility
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
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
