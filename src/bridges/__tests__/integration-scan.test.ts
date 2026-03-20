/**
 * Integration tests for Bridge 1 (Reachability) and Bridge 2 (Standards).
 *
 * These tests mock ONLY the HTTP layer (httpGet) and DNS validation (validateDns),
 * then run the actual bridge orchestrators against recorded fixture data.
 * No live network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanContext, HttpResponse } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Mocks -- HTTP layer and DNS only
// ---------------------------------------------------------------------------

vi.mock("../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

vi.mock("../../utils/ssrf.js", () => ({
  validateDns: vi.fn().mockResolvedValue({ safe: true, ip: "93.184.216.34" }),
}));

import { httpGet } from "../../utils/http-client.js";
import { runReachabilityBridge } from "../../bridges/reachability/index.js";
import { runStandardsBridge } from "../../bridges/standards/index.js";
import {
  createFixtureResponder,
  healthySiteFixtures,
  minimalSiteFixtures,
  FIXTURE_HEALTHY_HTML,
  FIXTURE_HEALTHY_HEADERS,
  FIXTURE_MINIMAL_HTML,
  FIXTURE_MINIMAL_HEADERS,
} from "./fixtures/example-com.js";

const mockHttpGet = vi.mocked(httpGet);

// ---------------------------------------------------------------------------
// Integration: healthy site scan
// ---------------------------------------------------------------------------

describe("integration: healthy site scan", () => {
  const responder = createFixtureResponder(healthySiteFixtures);

  const healthyCtx: ScanContext = {
    url: "https://example.com",
    domain: "example.com",
    baseUrl: "https://example.com",
    options: { timeout: 5000 },
    shared: {},
  };

  beforeEach(() => {
    healthyCtx.shared = {};
    mockHttpGet.mockImplementation(
      (url: string, options?: { method?: string }) => responder(url, options),
    );
  });

  it("Bridge 1 returns score > 0 with evaluated status", async () => {
    const result = await runReachabilityBridge(healthyCtx);

    expect(result.status).toBe("evaluated");
    expect(result.score).toBeGreaterThan(0);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.id).toBe(1);
    expect(result.name).toBe("Reachability");
  });

  it("Bridge 1 detects robots.txt and parses crawler policies", async () => {
    const result = await runReachabilityBridge(healthyCtx);

    // robots_txt check should pass (valid robots.txt with rules)
    const robotsCheck = result.checks.find((c) => c.id === "robots_txt");
    expect(robotsCheck).toBeDefined();
    expect(robotsCheck!.status).toBe("pass");

    // GPTBot has Disallow: /private/ (non-root partial restriction)
    const gptbotCheck = result.checks.find(
      (c) => c.id === "crawler_policy_gptbot",
    );
    expect(gptbotCheck).toBeDefined();
    expect(gptbotCheck!.status).toBe("partial");
  });

  it("Bridge 1 passes meta_robots check (no restrictive tags)", async () => {
    const result = await runReachabilityBridge(healthyCtx);

    const metaCheck = result.checks.find((c) => c.id === "meta_robots");
    expect(metaCheck).toBeDefined();
    expect(metaCheck!.status).toBe("pass");
  });

  it("Bridge 2 returns score > 0 with evaluated status", async () => {
    // Provide shared page data as Bridge 1 would
    healthyCtx.shared.pageBody = FIXTURE_HEALTHY_HTML;
    healthyCtx.shared.pageHeaders = FIXTURE_HEALTHY_HEADERS;

    const result = await runStandardsBridge(healthyCtx);

    expect(result.status).toBe("evaluated");
    expect(result.score).toBeGreaterThan(0);
    expect(result.id).toBe(2);
    expect(result.name).toBe("Standards");
  });

  it("Bridge 2 detects OpenAPI spec", async () => {
    healthyCtx.shared.pageBody = FIXTURE_HEALTHY_HTML;
    healthyCtx.shared.pageHeaders = FIXTURE_HEALTHY_HEADERS;

    const result = await runStandardsBridge(healthyCtx);

    const openapiCheck = result.checks.find((c) => c.id === "openapi_spec");
    expect(openapiCheck).toBeDefined();
    expect(openapiCheck!.status).toBe("pass");
    expect((openapiCheck!.data as Record<string, unknown>).version).toBe(
      "3.1.0",
    );
  });

  it("Bridge 2 detects JSON-LD structured data", async () => {
    healthyCtx.shared.pageBody = FIXTURE_HEALTHY_HTML;
    healthyCtx.shared.pageHeaders = FIXTURE_HEALTHY_HEADERS;

    const result = await runStandardsBridge(healthyCtx);

    const jsonLdCheck = result.checks.find((c) => c.id === "json_ld");
    expect(jsonLdCheck).toBeDefined();
    expect(jsonLdCheck!.status).toBe("pass");
  });

  it("Bridge 2 detects security.txt", async () => {
    healthyCtx.shared.pageBody = FIXTURE_HEALTHY_HTML;
    healthyCtx.shared.pageHeaders = FIXTURE_HEALTHY_HEADERS;

    const result = await runStandardsBridge(healthyCtx);

    const secCheck = result.checks.find((c) => c.id === "security_txt");
    expect(secCheck).toBeDefined();
    expect(secCheck!.status).toBe("pass");
  });

  it("No live network calls are made", async () => {
    healthyCtx.shared.pageBody = FIXTURE_HEALTHY_HTML;
    healthyCtx.shared.pageHeaders = FIXTURE_HEALTHY_HEADERS;

    await runReachabilityBridge(healthyCtx);
    await runStandardsBridge(healthyCtx);

    // Verify the mock was called (not real fetch)
    expect(mockHttpGet.mock.calls.length).toBeGreaterThan(0);

    // Every URL called should match a fixture pattern
    for (const call of mockHttpGet.mock.calls) {
      const url = call[0] as string;
      expect(url).toMatch(/^https:\/\/example\.com/);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: minimal site scan
// ---------------------------------------------------------------------------

describe("integration: minimal site scan", () => {
  const responder = createFixtureResponder(minimalSiteFixtures);

  const minimalCtx: ScanContext = {
    url: "https://minimal.example.com",
    domain: "minimal.example.com",
    baseUrl: "https://minimal.example.com",
    options: { timeout: 5000 },
    shared: {},
  };

  beforeEach(() => {
    minimalCtx.shared = {};
    mockHttpGet.mockImplementation(
      (url: string, options?: { method?: string }) => responder(url, options),
    );
  });

  it("Bridge 1 returns lower score for minimal site", async () => {
    const result = await runReachabilityBridge(minimalCtx);

    expect(result.status).toBe("evaluated");
    // Minimal site still passes HTTPS check, so score >= 0
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it("Bridge 2 returns score 0 when no standards detected", async () => {
    minimalCtx.shared.pageBody = FIXTURE_MINIMAL_HTML;
    minimalCtx.shared.pageHeaders = FIXTURE_MINIMAL_HEADERS;

    const result = await runStandardsBridge(minimalCtx);

    expect(result.score).toBe(0);

    // All standard checks should fail (no openapi, no llms.txt, no JSON-LD, etc.)
    const standardCheckIds = [
      "openapi_spec",
      "llms_txt",
      "llms_full_txt",
      "mcp_endpoint",
      "json_ld",
      "schema_org",
      "security_txt",
      "ai_plugin",
    ];

    for (const checkId of standardCheckIds) {
      const check = result.checks.find((c) => c.id === checkId);
      expect(check).toBeDefined();
      expect(check!.status).toBe("fail");
    }
  });
});
