import { NextRequest } from "next/server";

export interface RateLimitConfig {
  /** Maximum requests allowed within windowMs */
  limit: number;
  /** Sliding window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
}

interface BucketEntry {
  timestamps: number[];
  lastSeen: number;
}

const MAX_TRACKED_KEYS = 10_000;
const buckets = new Map<string, BucketEntry>();

function pruneStaleBuckets(now: number, maxWindowMs: number): void {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.lastSeen > maxWindowMs) {
      buckets.delete(key);
    }
  }
  // Hard cap eviction if still above limit (FIFO)
  while (buckets.size > MAX_TRACKED_KEYS) {
    const oldestKey = buckets.keys().next().value;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

/**
 * Extracts a normalized client identifier from reverse-proxy headers (GCP Cloud Run / Load Balancer).
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // Cloud Run appends the client IP as the first hop in X-Forwarded-For
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}

/**
 * Sliding-window in-memory rate limiter.
 * For multi-instance Cloud Run deployments, pair this with GCP Cloud Armor edge rate limiting.
 */
export function checkRateLimit(
  bucketKey: string,
  config: RateLimitConfig,
  now = Date.now()
): RateLimitResult {
  pruneStaleBuckets(now, Math.max(config.windowMs, 60_000));

  const windowStart = now - config.windowMs;
  const entry = buckets.get(bucketKey) ?? { timestamps: [], lastSeen: now };

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
  entry.lastSeen = now;

  if (entry.timestamps.length >= config.limit) {
    const oldestInWindow = entry.timestamps[0] ?? now;
    const resetAtMs = oldestInWindow + config.windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetAtMs - now) / 1000));
    buckets.set(bucketKey, entry);
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetAtMs,
      retryAfterSec,
    };
  }

  entry.timestamps.push(now);
  buckets.set(bucketKey, entry);

  const oldestInWindow = entry.timestamps[0] ?? now;
  const resetAtMs = oldestInWindow + config.windowMs;

  return {
    allowed: true,
    limit: config.limit,
    remaining: Math.max(0, config.limit - entry.timestamps.length),
    resetAtMs,
    retryAfterSec: 0,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAtMs / 1000)),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSec);
  }
  return headers;
}

export function resetRateLimitStore(): void {
  buckets.clear();
}
