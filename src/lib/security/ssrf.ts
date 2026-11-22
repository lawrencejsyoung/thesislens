import { lookup } from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "metadata.goog",
  "instance-data",
  "169.254.169.254",
]);

const ALLOWED_PORTS = new Set(["", "80", "443"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;

  // 0.0.0.0/8 (current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (RFC 1918)
  if (a === 10) return true;
  // 100.64.0.0/10 (CGNAT / Shared Address Space)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local & cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24, 192.0.2.0/24 (IETF / TEST-NET-1)
  if (a === 192 && b === 0) return true;
  // 192.168.0.0/16 (RFC 1918)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved/broadcast)
  if (a >= 224) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Loopback (::1) or unspecified (::)
  if (normalized === "::1" || normalized === "::") return true;

  // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (net.isIPv4(mapped)) {
      return isPrivateIPv4(mapped);
    }
    // Hex-encoded IPv4-mapped form like ::ffff:a9fe:a9fe
    const hexParts = mapped.split(":");
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return isPrivateIPv4(ipv4);
      }
    }
    return true;
  }

  // Unique local addresses fc00::/7 (fc00..fdff) — includes AWS/GCP internal metadata fd00::
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  // Link-local fe80::/10 (fe80..febf)
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  // Multicast ff00::/8
  if (normalized.startsWith("ff")) return true;
  // 64:ff9b::/96 (NAT64)
  if (normalized.startsWith("64:ff9b:")) return true;

  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

export interface SsrfValidationResult {
  safe: boolean;
  url?: URL;
  reason?: string;
}

/**
 * Validates that a user-supplied URL is a safe public HTTP(S) target and does not
 * point to loopback, RFC-1918 private networks, link-local, or cloud metadata endpoints.
 */
export async function validatePublicUrl(rawUrl: string): Promise<SsrfValidationResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    return { safe: false, reason: "Invalid or overly long URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { safe: false, reason: "Malformed URL." };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { safe: false, reason: "Only http:// and https:// URLs are permitted." };
  }

  if (parsed.username || parsed.password) {
    return { safe: false, reason: "URLs with embedded credentials are not permitted." };
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    return { safe: false, reason: "Only standard HTTP/HTTPS ports (80, 443) are permitted." };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost")
  ) {
    return { safe: false, reason: "Target hostname is blocked." };
  }

  // Strip brackets from IPv6 literals for net.isIP
  const bareHost =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  if (net.isIP(bareHost)) {
    if (isPrivateOrReservedIp(bareHost)) {
      return { safe: false, reason: "Private or reserved IP addresses are not permitted." };
    }
    return { safe: true, url: parsed };
  }

  // Resolve DNS and verify EVERY returned A/AAAA record is a public unicast IP
  try {
    const records = await lookup(bareHost, { all: true, verbatim: true });
    if (!records || records.length === 0) {
      return { safe: false, reason: "Hostname could not be resolved." };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return {
          safe: false,
          reason: "Target hostname resolves to a private or reserved IP address.",
        };
      }
    }
  } catch {
    return { safe: false, reason: "Hostname DNS resolution failed." };
  }

  return { safe: true, url: parsed };
}

/**
 * Fetches text from a public URL with SSRF validation on initial request and every
 * redirect hop, a hard timeout, and a hard response byte cap to prevent OOM DoS.
 */
export async function safeFetchPublicText(
  rawUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    headers?: Record<string, string>;
  } = {}
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const maxBytes = options.maxBytes ?? 1_500_000; // 1.5 MB cap
  const maxRedirects = options.maxRedirects ?? 2;

  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validation = await validatePublicUrl(currentUrl);
    if (!validation.safe || !validation.url) {
      throw new Error(validation.reason || "Blocked unsafe URL.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(validation.url.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "ThesisLens-Institutional-Research/1.0 (security@thesislens.app)",
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json",
          ...(options.headers ?? {}),
        },
        cache: "no-store",
      });

      // Handle redirects safely by re-validating the Location target
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location || hop === maxRedirects) {
          return null;
        }
        currentUrl = new URL(location, validation.url).toString();
        continue;
      }

      if (!res.ok) return null;

      const contentLength = Number(res.headers.get("content-length") || "0");
      if (contentLength > maxBytes) {
        throw new Error("Remote feed exceeds maximum allowed size.");
      }

      if (!res.body) {
        const text = await res.text();
        return text.length > maxBytes ? text.slice(0, maxBytes) : text;
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error("Remote feed exceeds maximum allowed size.");
          }
          chunks.push(value);
        }
      }

      const combined = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder("utf-8", { fatal: false }).decode(combined);
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}
