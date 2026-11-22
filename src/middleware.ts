import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  getClientIp,
  RateLimitConfig,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

function getRateLimitForPath(pathname: string): { tier: string; config: RateLimitConfig } | null {
  if (!pathname.startsWith("/api/")) return null;
  if (pathname === "/api/health") {
    return { tier: "health", config: { limit: 180, windowMs: 60_000 } };
  }
  if (pathname.startsWith("/api/analyze")) {
    return { tier: "analyze", config: { limit: 12, windowMs: 60_000 } };
  }
  if (
    pathname.startsWith("/api/war-room") ||
    pathname.startsWith("/api/tax-consultant") ||
    pathname.startsWith("/api/lifestyle") ||
    pathname.startsWith("/api/intel")
  ) {
    return { tier: "ai", config: { limit: 25, windowMs: 60_000 } };
  }
  if (pathname.startsWith("/api/fundamentals")) {
    // Each uncached request can fan out to several SEC EDGAR calls (SEC allows 10 req/s total).
    return { tier: "fundamentals", config: { limit: 20, windowMs: 60_000 } };
  }
  if (pathname.startsWith("/api/mcp")) {
    return { tier: "mcp", config: { limit: 40, windowMs: 60_000 } };
  }
  return { tier: "standard", config: { limit: 60, windowMs: 60_000 } };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rateRule = getRateLimitForPath(pathname);

  if (rateRule) {
    const ip = getClientIp(req);
    const result = checkRateLimit(`${rateRule.tier}:${ip}`, rateRule.config);
    const rlHeaders = rateLimitHeaders(result);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please slow down and try again shortly.",
          retryAfterSeconds: result.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            ...rlHeaders,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        }
      );
    }

    const res = NextResponse.next();
    for (const [k, v] of Object.entries(rlHeaders)) {
      res.headers.set(k, v);
    }
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Content-Type-Options", "nosniff");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
