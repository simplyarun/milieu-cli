import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanContext, HttpResponse } from "../../../core/types.js";
import type { ParsedOpenApiSpec } from "../../schema/oas-types.js";

vi.mock("../../../utils/http-client.js", () => ({ httpGet: vi.fn() }));

import { httpGet } from "../../../utils/http-client.js";
import { checkRateLimitHeaders } from "../rate-limits.js";
import { checkAuthClarity } from "../auth-clarity.js";
import { checkAuthLegibility } from "../auth-legibility.js";
import { checkTosUrl, checkContactInfo, extractTosUrl, extractTosUrlFromHtml } from "../tos-contact.js";
import { checkVersioningSignal } from "../versioning.js";
import { checkAgentsJson } from "../agents-json.js";

const mockHttpGet = vi.mocked(httpGet);

function makeCtx(overrides?: Partial<ScanContext>): ScanContext {
  return { url: "https://example.com", domain: "example.com", baseUrl: "https://example.com", options: { timeout: 5000 }, shared: {}, ...overrides };
}

function makeSuccess(body: string, headers: Record<string, string> = {}, status = 200): HttpResponse {
  return { ok: true, url: "https://example.com/api", status, headers, body, redirects: [], durationMs: 50 };
}

function makeFailure(statusCode?: number): HttpResponse {
  return { ok: false, error: { kind: "http_error", message: `HTTP ${statusCode ?? 500}`, statusCode, url: "https://example.com/api" } };
}

describe("checkRateLimitHeaders", () => {
  beforeEach(() => mockHttpGet.mockReset());
  it("returns pass when x-ratelimit-limit header present", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("", { "x-ratelimit-limit": "100" }));
    const ctx = makeCtx();
    const result = await checkRateLimitHeaders(ctx);
    expect(result.id).toBe("context_rate_limit_headers");
    expect(result.status).toBe("pass");
  });
  it("returns partial when only retry-after found", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("", { "retry-after": "60" }));
    expect((await checkRateLimitHeaders(makeCtx())).status).toBe("partial");
  });
  it("returns fail when no rate-limit headers", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("", {}));
    expect((await checkRateLimitHeaders(makeCtx())).status).toBe("fail");
  });
  it("stores response headers in ctx.shared.contextProbeHeaders", async () => {
    const headers = { "x-ratelimit-limit": "100", "x-custom": "foo" };
    mockHttpGet.mockResolvedValue(makeSuccess("", headers));
    const ctx = makeCtx();
    await checkRateLimitHeaders(ctx);
    expect(ctx.shared.contextProbeHeaders).toEqual(headers);
  });
  it("returns fail when probe request fails", async () => {
    mockHttpGet.mockResolvedValue(makeFailure());
    const ctx = makeCtx();
    const result = await checkRateLimitHeaders(ctx);
    expect(result.status).toBe("fail");
    expect(ctx.shared.contextProbeHeaders).toEqual({});
  });
});

describe("checkAuthClarity", () => {
  it("returns pass when schemes defined with descriptions and security applied", () => {
    const spec: ParsedOpenApiSpec = { components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "JWT Bearer token" } } }, security: [{ bearerAuth: [] }] };
    expect(checkAuthClarity(spec).status).toBe("pass");
  });
  it("returns partial when schemes defined but no descriptions", () => {
    const spec: ParsedOpenApiSpec = { components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } }, security: [{ bearerAuth: [] }] };
    expect(checkAuthClarity(spec).status).toBe("partial");
  });
  it("returns partial when schemes defined but not applied", () => {
    const spec: ParsedOpenApiSpec = { components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "JWT" } } }, paths: { "/users": { get: {} } } };
    expect(checkAuthClarity(spec).status).toBe("partial");
  });
  it("returns fail when no schemes defined", () => {
    expect(checkAuthClarity({ paths: {} }).status).toBe("fail");
  });
  it("returns fail for undefined spec", () => {
    expect(checkAuthClarity(undefined).status).toBe("fail");
  });
});

describe("checkAuthLegibility", () => {
  beforeEach(() => mockHttpGet.mockReset());
  it("returns pass when 401 has WWW-Authenticate + JSON body + docs URL", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(
      JSON.stringify({ error: "unauthorized", docs_url: "https://docs.example.com/auth" }),
      { "www-authenticate": "Bearer", "content-type": "application/json" }, 401,
    ));
    expect((await checkAuthLegibility(makeCtx())).status).toBe("pass");
  });
  it("returns partial when 401 has JSON body but no WWW-Authenticate", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(JSON.stringify({ error: "unauthorized" }), { "content-type": "application/json" }, 401));
    expect((await checkAuthLegibility(makeCtx())).status).toBe("partial");
  });
  it("returns fail when 401 returns HTML", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("<html>Login</html>", { "content-type": "text/html" }, 401));
    expect((await checkAuthLegibility(makeCtx())).status).toBe("fail");
  });
  it("returns partial when endpoint returns 200 (no auth required)", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess('{"ok":true}', { "content-type": "application/json" }, 200));
    expect((await checkAuthLegibility(makeCtx())).status).toBe("partial");
  });
  it("returns fail when probe fails entirely", async () => {
    mockHttpGet.mockResolvedValue(makeFailure());
    expect((await checkAuthLegibility(makeCtx())).status).toBe("fail");
  });
});

describe("extractTosUrl", () => {
  it("extracts clean URL with /terms as path segment", () => {
    expect(extractTosUrl("See https://example.com/terms for details")).toBe("https://example.com/terms");
  });
  it("strips trailing parenthesis from markdown-style link", () => {
    expect(extractTosUrl("(https://example.com/terms)")).toBe("https://example.com/terms");
  });
  it("strips trailing period", () => {
    expect(extractTosUrl("Visit https://example.com/tos.")).toBe("https://example.com/tos");
  });
  it("extracts URL with /legal as path segment", () => {
    expect(extractTosUrl('{"url":"https://example.com/legal"}')).toBe("https://example.com/legal");
  });
  it("returns null for text with no ToS URL", () => {
    expect(extractTosUrl("No URLs here at all")).toBeNull();
  });
  it("returns null for invalid URL-like string", () => {
    expect(extractTosUrl("https://not a valid url/terms")).toBeNull();
  });
  it("rejects denial-of-service as a false positive", () => {
    expect(extractTosUrl("https://example.com/blog/denial-of-service-issues-html.md")).toBeNull();
  });
  it("rejects internal-tools as a false positive", () => {
    expect(extractTosUrl("https://example.com/analytics-overview")).toBeNull();
  });
  it("falls through garbled first match to valid second match", () => {
    const text = "[https://:::bad/terms] and https://example.com/tos";
    expect(extractTosUrl(text)).toBe("https://example.com/tos");
  });
  it("handles URL with path segments after keyword", () => {
    expect(extractTosUrl("https://example.com/legal/en-us")).toBe("https://example.com/legal/en-us");
  });
  it("matches /terms-of-service as a path segment", () => {
    expect(extractTosUrl("https://example.com/terms-of-service")).toBe("https://example.com/terms-of-service");
  });
});

describe("extractTosUrlFromHtml", () => {
  const base = "https://example.com";
  it("extracts ToS URL from anchor tag", () => {
    expect(extractTosUrlFromHtml('<a href="https://example.com/terms">Terms</a>', base)).toBe("https://example.com/terms");
  });
  it("extracts /legal URL from footer-style HTML", () => {
    expect(extractTosUrlFromHtml('<footer><a href="https://example.com/legal/privacy">Privacy</a></footer>', base)).toBe("https://example.com/legal/privacy");
  });
  it("resolves relative URLs using baseUrl", () => {
    expect(extractTosUrlFromHtml('<a href="/terms">Terms</a>', base)).toBe("https://example.com/terms");
  });
  it("resolves relative /legal path", () => {
    expect(extractTosUrlFromHtml('<a href="/legal/en-us">Legal</a>', base)).toBe("https://example.com/legal/en-us");
  });
  it("returns null when no ToS link in HTML", () => {
    expect(extractTosUrlFromHtml('<a href="https://example.com/about">About</a>', base)).toBeNull();
  });
  it("skips javascript: links", () => {
    expect(extractTosUrlFromHtml('<a href="javascript:void(0)">Terms</a>', base)).toBeNull();
  });
});

describe("checkTosUrl", () => {
  const base = "https://example.com";
  it("returns pass when spec has termsOfService", () => {
    expect(checkTosUrl({ info: { termsOfService: "https://example.com/tos" } }, null, null, base).status).toBe("pass");
  });
  it("returns partial when ToS URL found in llms.txt", () => {
    expect(checkTosUrl(undefined, "Check our https://example.com/terms for details", null, base).status).toBe("partial");
  });
  it("returns partial when ToS URL found in page HTML", () => {
    const result = checkTosUrl(undefined, null, '<a href="https://example.com/legal">Terms</a>', base);
    expect(result.status).toBe("partial");
    expect(result.data?.source).toBe("page");
    expect(result.data?.url).toBe("https://example.com/legal");
  });
  it("returns partial when ToS found via relative URL in page HTML", () => {
    const result = checkTosUrl(undefined, null, '<a href="/terms-of-service">Terms</a>', base);
    expect(result.status).toBe("partial");
    expect(result.data?.url).toBe("https://example.com/terms-of-service");
  });
  it("returns fail when no ToS found anywhere", () => {
    expect(checkTosUrl(undefined, null, null, base).status).toBe("fail");
  });
});

describe("checkContactInfo", () => {
  it("returns pass when spec has contact email", () => {
    expect(checkContactInfo({ info: { contact: { email: "api@example.com" } } }, null).status).toBe("pass");
  });
  it("returns partial when contact found in security.txt", () => {
    const result = checkContactInfo(undefined, "Contact: mailto:security@example.com\nExpires: 2027-01-01");
    expect(result.status).toBe("partial");
    expect(result.detail).toContain("security.txt");
  });
  it("returns fail when no contact info anywhere", () => {
    expect(checkContactInfo(undefined, null).status).toBe("fail");
  });
});

describe("checkVersioningSignal", () => {
  it("returns pass when path-based versioning found in spec", () => {
    expect(checkVersioningSignal({ paths: { "/v2/users": { get: {} } } }, {}).status).toBe("pass");
  });
  it("returns pass when version header found", () => {
    expect(checkVersioningSignal(undefined, { "x-api-version": "2.1" }).status).toBe("pass");
  });
  it("returns partial when spec info.version exists", () => {
    expect(checkVersioningSignal({ info: { version: "1.0.0" } }, {}).status).toBe("partial");
  });
  it("returns fail when no versioning signal", () => {
    expect(checkVersioningSignal(undefined, {}).status).toBe("fail");
  });
});

describe("checkAgentsJson", () => {
  beforeEach(() => mockHttpGet.mockReset());
  it("returns pass when agents.json found with valid JSON", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess('{"name":"Test Agent"}', { "content-type": "application/json" }));
    expect((await checkAgentsJson("https://example.com")).status).toBe("pass");
  });
  it("returns partial when agents.json found but invalid JSON", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("not json", { "content-type": "application/json" }));
    expect((await checkAgentsJson("https://example.com")).status).toBe("partial");
  });
  it("returns fail when agents.json not found", async () => {
    mockHttpGet.mockResolvedValue(makeFailure(404));
    expect((await checkAgentsJson("https://example.com")).status).toBe("fail");
  });
});
