import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/lib/auth/oauth21";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseTokenRequest(req: NextRequest): Promise<Record<string, string>> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const out: Record<string, string> = {};
    params.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  try {
    return (await req.json()) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const body = await parseTokenRequest(req);
  if (body.grant_type !== "authorization_code") {
    return NextResponse.json(
      { error: "unsupported_grant_type", error_description: "Use grant_type=authorization_code." },
      { status: 400 }
    );
  }

  const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin).replace(/\/$/, "");
  try {
    const tokenResponse = exchangeAuthorizationCode({
      code: body.code || "",
      clientId: body.client_id || "",
      redirectUri: body.redirect_uri || "",
      codeVerifier: body.code_verifier || "",
      issuer: origin,
      audience: `${origin}/api/mcp`,
    });
    return NextResponse.json(tokenResponse, {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: err instanceof Error ? err.message : "Token exchange failed.",
      },
      { status: 400 }
    );
  }
}
