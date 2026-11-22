import assert from "node:assert/strict";
import { isPrivateOrReservedIp, validatePublicUrl } from "../src/lib/security/ssrf";
import {
  constantTimeEquals,
  sanitizeHttpUrl,
  validateAttachment,
} from "../src/lib/security/validation";
import { checkRateLimit, resetRateLimitStore } from "../src/lib/security/rate-limit";
import { parsePortfolioImport } from "../src/lib/portfolio-import";
import { parseRssOrPodcastXml } from "../src/lib/adapters/intel-ingestion";

async function main() {
  console.log("1. Verifying SSRF IP & URL Guard...");
  const privateIps = [
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "fe80::1",
    "fd00:ec2::254",
  ];
  for (const ip of privateIps) {
    assert.equal(isPrivateOrReservedIp(ip), true, `Expected ${ip} to be blocked`);
  }
  assert.equal(isPrivateOrReservedIp("8.8.8.8"), false, "Expected 8.8.8.8 to be public");
  assert.equal(isPrivateOrReservedIp("1.1.1.1"), false, "Expected 1.1.1.1 to be public");

  const blockedUrls = [
    "http://169.254.169.254/computeMetadata/v1/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://localhost:8080/api/health",
    "http://127.0.0.1/admin",
    "http://10.0.0.1/internal",
    "http://[::1]:8080/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:pass@example.com/feed.xml",
    "https://1.1.1.1:8443/feed.xml",
  ];
  for (const u of blockedUrls) {
    const res = await validatePublicUrl(u);
    assert.equal(res.safe, false, `Expected URL to be blocked: ${u}`);
  }
  const publicIpUrl = await validatePublicUrl("https://1.1.1.1/feed.xml");
  assert.equal(publicIpUrl.safe, true, "Expected public HTTPS IP URL to pass");
  console.log("   PASS: SSRF guard blocked all metadata, private, loopback, and non-HTTP URLs.");

  console.log("2. Verifying Constant-Time Auth & URL Sanitization...");
  assert.equal(constantTimeEquals("super-secret-token", "super-secret-token"), true);
  assert.equal(constantTimeEquals("super-secret-token", "super-secret-tokeN"), false);
  assert.equal(constantTimeEquals("short", "much-longer-token"), false);

  assert.equal(sanitizeHttpUrl("https://polymarket.com/event/copper"), "https://polymarket.com/event/copper");
  assert.equal(sanitizeHttpUrl("javascript:alert(1)"), undefined);
  assert.equal(sanitizeHttpUrl("data:text/html,<script>alert(1)</script>"), undefined);

  // Verify malicious RSS links are stripped
  const rss = `<rss><channel><item><title>Test Signal</title><link>javascript:alert(1)</link><description>Copper demand is surging with strong demand.</description></item></channel></rss>`;
  const parsedRss = parseRssOrPodcastXml(rss, "news", "TestWire", 2);
  assert.equal(parsedRss.length, 1);
  assert.equal(parsedRss[0].url, undefined, "Expected javascript: link in RSS to be stripped");
  console.log("   PASS: Constant-time comparison and XSS URL sanitization verified.");

  console.log("3. Verifying Sliding-Window Rate Limiter...");
  resetRateLimitStore();
  const cfg = { limit: 3, windowMs: 60_000 };
  const t0 = 1_700_000_000_000;
  assert.equal(checkRateLimit("test:1.2.3.4", cfg, t0).allowed, true);
  assert.equal(checkRateLimit("test:1.2.3.4", cfg, t0 + 1000).allowed, true);
  assert.equal(checkRateLimit("test:1.2.3.4", cfg, t0 + 2000).allowed, true);
  const blocked = checkRateLimit("test:1.2.3.4", cfg, t0 + 3000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec >= 57);
  // After window expires, requests are allowed again
  assert.equal(checkRateLimit("test:1.2.3.4", cfg, t0 + 61_000).allowed, true);
  console.log("   PASS: Sliding-window rate limiter enforced limits and reset cleanly.");

  console.log("4. Verifying Attachment Validation & Prototype Pollution Defense...");
  assert.equal(
    validateAttachment({ attachmentBase64: "AAAA", attachmentMimeType: "image/png" }).ok,
    true
  );
  assert.equal(
    validateAttachment({ attachmentBase64: "AAAA", attachmentMimeType: "text/html" }).ok,
    false
  );
  assert.equal(
    validateAttachment({
      attachmentBase64: "A".repeat(6_000_000),
      attachmentMimeType: "image/png",
    }).ok,
    false
  );

  const maliciousJson = JSON.stringify([
    { ticker: "VALE", weightPct: 100, __proto__: { polluted: true }, constructor: { polluted: true } },
  ]);
  const importRes = parsePortfolioImport(maliciousJson, "json");
  assert.equal(importRes.holdings.length, 1);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  console.log("   PASS: Attachment validation and prototype-pollution defenses verified.");

  console.log("\nALL SECURITY VERIFICATION CHECKS PASSED!");
}

main().catch((err) => {
  console.error("SECURITY VERIFICATION FAILED:", err);
  process.exit(1);
});
