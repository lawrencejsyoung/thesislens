import { NextRequest, NextResponse } from "next/server";
import { registerOAuthClient } from "@/lib/auth/oauth21";
import { readJsonBodyWithLimit } from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = await readJsonBodyWithLimit<{
    client_name?: string;
    redirect_uris?: string[];
    scope?: string;
  }>(req, 32_768);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const client = registerOAuthClient(parsed.data);
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        token_endpoint_auth_method: "none",
        scope: client.scope,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: err instanceof Error ? err.message : "Client registration failed.",
      },
      { status: 400 }
    );
  }
}
