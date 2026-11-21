import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasServerGeminiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    defaultModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    event: "Hack @ DevFest Sudbury 2026",
  });
}
