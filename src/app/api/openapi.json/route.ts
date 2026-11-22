import { NextRequest, NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/sdk/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  return NextResponse.json(buildOpenApiSpec(origin), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
