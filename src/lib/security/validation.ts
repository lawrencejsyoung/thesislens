import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

/** Max decoded attachment size (~4 MB base64 is ~5.4 MB text) */
export const MAX_ATTACHMENT_BASE64_CHARS = 5_500_000;

/**
 * Constant-time string comparison using SHA-256 digests so neither length nor
 * prefix timing is leaked.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Reads and parses a JSON request body with a strict byte-size limit.
 */
export async function readJsonBodyWithLimit<T>(
  req: NextRequest,
  maxBytes = 256_000
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return {
        ok: false,
        status: 413,
        error: `Request payload exceeds maximum allowed size of ${Math.round(
          maxBytes / 1024
        )} KB.`,
      };
    }
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return { ok: false, status: 400, error: "Unable to read request body." };
  }

  const byteLength = Buffer.byteLength(rawText, "utf8");
  if (byteLength > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request payload exceeds maximum allowed size of ${Math.round(
        maxBytes / 1024
      )} KB.`,
    };
  }

  if (!rawText.trim()) {
    return { ok: false, status: 400, error: "Empty JSON payload." };
  }

  try {
    const data = JSON.parse(rawText) as T;
    if (data === null || typeof data !== "object") {
      return { ok: false, status: 400, error: "JSON payload must be an object." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON payload." };
  }
}

/**
 * Validates an optional client-provided Gemini API key header.
 * Rejects control characters, oversized strings, or non-ASCII payloads.
 * Can be disabled in production via ALLOW_CLIENT_API_KEY_OVERRIDE=false.
 */
export function extractSafeGeminiApiKey(req: NextRequest): string | undefined {
  if (process.env.ALLOW_CLIENT_API_KEY_OVERRIDE === "false") {
    return undefined;
  }
  const raw = req.headers.get("x-gemini-api-key")?.trim();
  if (!raw) return undefined;
  // Standard printable ASCII token, reasonable length
  if (raw.length < 10 || raw.length > 256 || !/^[\x21-\x7E]+$/.test(raw)) {
    return undefined;
  }
  return raw;
}

/**
 * Sanitizes an external URL before rendering in <a href> or storing from RSS feeds.
 * Only permits http: and https: schemes (blocks javascript:, data:, vbscript:, etc.).
 */
export function sanitizeHttpUrl(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Validates optional multimodal attachment fields on analysis payloads.
 */
export function validateAttachment(params: {
  attachmentBase64?: unknown;
  attachmentMimeType?: unknown;
}): { ok: true } | { ok: false; error: string } {
  const { attachmentBase64, attachmentMimeType } = params;
  if (!attachmentBase64) return { ok: true };

  if (typeof attachmentBase64 !== "string") {
    return { ok: false, error: "Invalid attachment encoding." };
  }
  if (attachmentBase64.length > MAX_ATTACHMENT_BASE64_CHARS) {
    return { ok: false, error: "Attachment exceeds 4 MB maximum size." };
  }
  if (
    typeof attachmentMimeType !== "string" ||
    !ALLOWED_ATTACHMENT_MIME_TYPES.has(attachmentMimeType.toLowerCase())
  ) {
    return {
      ok: false,
      error: "Unsupported attachment MIME type. Allowed: PNG, JPEG, WebP, PDF.",
    };
  }
  return { ok: true };
}

/**
 * Logs errors in structured JSON format (Cloud Logging compatible) without leaking
 * raw internal details or API keys to clients.
 */
export function logServerError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  // Redact anything resembling a Google API key (AIza...) or Bearer token
  const redacted = message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  console.error(
    JSON.stringify({
      severity: "ERROR",
      context,
      message: redacted,
      timestamp: new Date().toISOString(),
    })
  );
}
