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

function withApiOperation(): ScanContext {
  return makeCtx({ shared: { openApiSpec: { paths: { "/api": { get: { security: [{ key: [] }] } } } } } });
}

function makeSuccess(body: string, headers: Record<string, string> = {}, status = 200, url = "https://example.com/api"): HttpResponse {
  return { ok: true, url, status, headers, body, redirects: [], durationMs: 50 };
}

function makeFailure(statusCode?: number): HttpResponse {
  return { ok: false, error: { kind: "http_error", message: `HTTP ${statusCode ?? 500}`, statusCode, url: "https://example.com/api" } };
}

/** A reachable non-2xx that carries a response (what a real 401/429 looks like). */
function makeErrorResponse(status: number, headers: Record<string, string> = {}, body = "", url = "https://example.com/api"): HttpResponse {
  const kind = status === 429 ? "bot_protected" : "http_error";
  return {
    ok: false,
    error: { kind, message: `HTTP ${status}`, statusCode: status, url },
    response: { status, headers, body },
  };
}

describe("checkRateLimitHeaders", () => {
  beforeEach(() => mockHttpGet.mockReset());
  it("returns pass when x-ratelimit-limit header present", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("", { "x-ratelimit-limit": "100" }));
    const ctx = withApiOperation();
    const result = await checkRateLimitHeaders(ctx);
    expect(result.id).toBe("context_rate_limit_headers");
    expect(result.status).toBe("pass");
  });
  it("returns partial when only retry-after found", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("", { "retry-after": "60" }));
    expect((await checkRateLimitHeaders(withApiOperation())).status).toBe("partial");
  });
  it("returns fail when no rate-limit headers", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("", {}));
    expect((await checkRateLimitHeaders(withApiOperation())).status).toBe("fail");
  });
  it("stores response headers in ctx.shared.contextProbeHeaders", async () => {
    const headers = { "x-ratelimit-limit": "100", "x-custom": "foo" };
    mockHttpGet.mockResolvedValue(makeSuccess("", headers));
    const ctx = withApiOperation();
    await checkRateLimitHeaders(ctx);
    expect(ctx.shared.contextProbeHeaders).toEqual(headers);
  });
  it("reports missing observations when the probe receives no response", async () => {
    mockHttpGet.mockResolvedValue(makeFailure());
    const ctx = withApiOperation();
    const result = await checkRateLimitHeaders(ctx);
    expect(result.status).toBe("error");
    expect(ctx.shared.contextProbeHeaders).toEqual({});
  });
  it("detects rate-limit headers on a non-2xx response (e.g. 429)", async () => {
    // Many APIs send rate-limit headers on error responses too; httpGet must
    // not discard them just because the status was 429.
    mockHttpGet.mockResolvedValue(makeErrorResponse(429, { "x-ratelimit-limit": "100" }));
    const ctx = withApiOperation();
    const result = await checkRateLimitHeaders(ctx);
    expect(result.status).toBe("pass");
    expect(ctx.shared.contextProbeHeaders).toMatchObject({ "x-ratelimit-limit": "100" });
  });
  it("records a network error as unmeasured", async () => {
    mockHttpGet.mockResolvedValue({ ok: false, error: { kind: "dns", message: "dns fail", url: "https://example.com/api" } });
    const result = await checkRateLimitHeaders(withApiOperation());
    expect(result.status).toBe("error");
  });
});

describe("OpenAPI-derived requests", () => {
  it.each([
    ["document", undefined, undefined, "/v1/me"],
    ["path", [{ url: "./path-api" }], undefined, "/contracts/path-api/me"],
    ["operation", [{ url: "/ignored" }], [{ url: "../{version}", variables: { version: { default: "v3" } } }], "/v3/me"],
  ] as const)("honors %s server precedence for both probes", async (_level, pathServers, operationServers, expectedPath) => {
    const ctx = makeCtx({ shared: {
      openApiCheck: { data: { documentUrl: "https://example.com/contracts/acme.json" } },
      openApiSpec: { openapi: "3.0.3", servers: [{ url: "/v1" }], security: [{ bearer: [] }],
        paths: { "/me": { servers: pathServers, get: { servers: operationServers } } } },
    } });
    mockHttpGet.mockReset().mockImplementation(async url => makeErrorResponse(401, { "www-authenticate": "Bearer" }, "", url));
    const rate = await checkRateLimitHeaders(ctx);
    const auth = await checkAuthLegibility(ctx);
    const expected = ctx.baseUrl + expectedPath;
    expect(mockHttpGet.mock.calls.map(([url]) => url)).toEqual([expected, expected]);
    expect(rate.data).toMatchObject({ probeSource: "operation", probeUrl: expected, responseUrl: expected, httpStatus: 401, measurement: "measured" });
    expect(auth.data).toMatchObject({ probeSource: "protected_operation", probeUrl: expected, responseUrl: expected, measurement: "challenged" });
  });

  it("uses effective local parameters and skips unresolved or required GET inputs", async () => {
    const spec = { openapi: "3.0.3", components: {
      parameters: { Tenant: { in: "query", name: "tenant", required: true } },
      requestBodies: { Required: { required: true } },
    }, security: [{ key: [] }], paths: {
      "/not-a-get": { post: {} },
      "/unknown-path-item": { $ref: "external.json#/path", get: {} },
      "/unknown-param": { get: { parameters: [{ $ref: "external.json#/params/Uno" }] } },
      "/unknown-body": { get: { requestBody: { $ref: "#/components/requestBodies/Missing" } } },
      "/needs-body": { get: { requestBody: { $ref: "#/components/requestBodies/Required" } } },
      "/needs-tenant": { parameters: [{ $ref: "#/components/parameters/Tenant" }], get: {} },
      "/ok": { parameters: [{ $ref: "#/components/parameters/Tenant" }], get: { parameters: [{ in: "query", name: "tenant", required: false }] } },
    } };
    const ctx = makeCtx({ shared: { openApiSpec: spec } });
    mockHttpGet.mockReset().mockImplementation(async url => makeSuccess("{}", {}, 200, url));
    await checkRateLimitHeaders(ctx);
    await checkAuthLegibility(ctx);
    expect(mockHttpGet.mock.calls.map(([url]) => url)).toEqual([ctx.baseUrl + "/ok", ctx.baseUrl + "/ok"]);
  });

  it("preserves path-level servers, inherited inputs and auth when Path Items are factored into local references", async () => {
    const secured = { get: { security: [{ key: [] }] }, servers: [{ url: "../v1" }] };
    const items = { Me: secured, Tenant: { ...secured, parameters: [{ in: "header", name: "X-Tenant", required: true }] } };
    const contract = { openapi: "3.1.0", components: { pathItems: items,
      securitySchemes: { key: { type: "apiKey", description: "Account key" } } } };
    for (const paths of [
      { "/tenant": items.Tenant, "/me": items.Me },
      { "/tenant": { $ref: "#/components/pathItems/Tenant" }, "/me": { $ref: "#/components/pathItems/Me" } },
    ]) {
      const ctx = makeCtx({ shared: { openApiCheck: { data: { documentUrl: "https://example.com/contracts/spec.json" } }, openApiSpec: { ...contract, paths } } });
      mockHttpGet.mockReset().mockImplementation(async url => makeErrorResponse(401, { "www-authenticate": "Bearer" }, "", url));
      const rate = await checkRateLimitHeaders(ctx);
      const auth = await checkAuthLegibility(ctx);
      expect(mockHttpGet.mock.calls.map(([url]) => url)).toEqual([ctx.baseUrl + "/v1/me", ctx.baseUrl + "/v1/me"]);
      expect(rate.data?.probeSource).toBe("operation");
      expect(auth.data?.probeSource).toBe("protected_operation");
      expect(checkAuthClarity(ctx.shared.openApiSpec as ParsedOpenApiSpec).status).toBe("pass");
    }
  });

  it("keeps auth application unknown when a referenced Path Item cannot be read", () => {
    const spec = { openapi: "3.1.0", components: { securitySchemes: { key: { type: "http", description: "Service token" } } },
      paths: { "/public": { get: { security: [{}] } }, "/private": { $ref: "elsewhere.json#/paths/~1private" } } };
    expect(checkAuthClarity(spec as ParsedOpenApiSpec)).toMatchObject({ status: "error", data: { schemesCount: 1, securityApplied: null } });
  });

  it.each(["/v2", "../api", "https://elsewhere.example/v2"])("keeps off-origin server %s on the labelled fallback", async (server) => {
    const ctx = makeCtx({ shared: {
      openApiCheck: { data: { documentUrl: "https://other.example/contracts/v1.json" } },
      openApiSpec: { servers: [{ url: server }], paths: { "/me": { get: { security: [{ key: [] }] } } } },
    } });
    mockHttpGet.mockReset().mockResolvedValue(makeSuccess("{}", { "content-type": "application/json" }));
    const result = await checkRateLimitHeaders(ctx);
    expect(result.status).toBe("error");
    expect(result.data).toMatchObject({ probeSource: "fallback", probeUrl: "https://example.com/api", measurement: "unmeasured" });
    expect(mockHttpGet.mock.calls.map(([url]) => url)).toEqual(["https://example.com/api"]);
  });

  it.each([
    ["redirect", "https://other.example/sign-in", 200, "application/json"],
    ["query", "https://example.com/api?ticket=private", 200, "application/json"],
    ["credentials", "https://user:secret@example.com/api", 200, "application/json"],
    ["login", "https://example.com/api", 200, "text/html"],
    ["not found", "https://example.com/api", 404, "application/json"],
    ["upstream unavailable", "https://example.com/api", 503, "application/json"],
  ] as const)("withholds rate and version headers for a %s response on a declared GET", async (_case, url, status, contentType) => {
    const headers = { "content-type": contentType, "x-ratelimit-limit": "100", "x-api-version": "4" };
    const response = status === 200 ? makeSuccess("{}", headers, status, url) : makeErrorResponse(status, headers, "{}", url);
    mockHttpGet.mockReset().mockResolvedValue(response);
    const ctx = withApiOperation();
    const check = await checkRateLimitHeaders(ctx);
    expect(check.status).toBe("error");
    expect(check.data).toMatchObject({ probeSource: "operation", httpStatus: status, measurement: "unmeasured", headerFound: null });
    expect(ctx.shared.contextProbeHeaders).toEqual({});
    expect(JSON.stringify(check)).not.toMatch(/ticket|secret|private/);
    expect((await checkAuthLegibility(ctx)).data?.measurement).toBe("unmeasured");
  });

  it("does not grade partial responses or propagate their headers as version evidence", async () => {
    const url = "https://example.com/api";
    const headers = { "content-type": "application/json", "x-ratelimit-limit": "50", "x-api-version": "2" };
    const success = { ok: true as const, url, status: 200, body: "{}", headers, redirects: [], durationMs: 5 };
    for (const result of [
      { ...success, status: 206 }, { ...success, headers: { ...headers, "content-range": "bytes 0-1/400" } },
      { ...success, bodyIncomplete: true as const }, { ...success, status: 302 },
      { ok: false as const, error: { kind: "http_error" as const, message: "HTTP 401", statusCode: 401, url },
        response: { status: 401, headers, body: "{}", bodyIncomplete: true as const } },
    ]) {
      mockHttpGet.mockReset().mockResolvedValue(result);
      const ctx = withApiOperation();
      expect((await checkRateLimitHeaders(ctx)).data?.measurement).toBe("unmeasured");
      expect((await checkAuthLegibility(ctx)).data?.measurement).toBe("unmeasured");
      expect(ctx.shared.contextProbeHeaders).toEqual({});
    }
  });

  it("uses Swagger securityDefinitions and the documented versioned API base for runtime checks", async () => {
    const spec = {
      swagger: "2.0", host: "example.com", schemes: ["https"], basePath: "/api/v2",
      securityDefinitions: { key: { type: "apiKey", name: "api_key", in: "header", description: "Account key" } },
      security: [{ key: [] }], parameters: { Account: { name: "account", in: "query", required: true } },
      paths: { "/accounts": { get: { parameters: [{ $ref: "#/parameters/Account" }] } }, "/me": { get: {} } },
    };
    expect(checkAuthClarity(spec).status).toBe("pass");
    expect(checkVersioningSignal(spec, {}).data).toMatchObject({ signal: "path", value: "/api/v2" });
    mockHttpGet.mockReset().mockResolvedValue(makeErrorResponse(401));
    const ctx = makeCtx({ shared: { openApiSpec: spec } });
    await checkRateLimitHeaders(ctx);
    await checkAuthLegibility(ctx);
    expect(mockHttpGet.mock.calls.map(([url]) => url)).toEqual([ctx.baseUrl + "/api/v2/me", ctx.baseUrl + "/api/v2/me"]);
  });
  it("ignores non-path keys and falls back to the scanned origin", async () => {
    mockHttpGet.mockReset().mockResolvedValue(makeSuccess(""));
    const ctx = makeCtx({ shared: { openApiSpec: {
      paths: { "x-vendor-extension": { get: { security: [{ apiKey: [] }] } } },
    } } });
    await checkRateLimitHeaders(ctx);
    await checkAuthLegibility(ctx);
    expect(mockHttpGet.mock.calls.map(([url]) => url)).toEqual([ctx.baseUrl + "/api", ctx.baseUrl + "/api"]);
  });

  it("skips invalid parameter lists and path templates when choosing a rate-limit probe", async () => {
    mockHttpGet.mockReset().mockResolvedValue(makeSuccess(""));
    const ctx = makeCtx({ shared: { openApiSpec: {
      paths: { "/legacy": { get: { parameters: {} } }, "/users/{id}": { get: {} }, "/list": { get: {} } },
    } } });
    await checkRateLimitHeaders(ctx);
    expect(mockHttpGet.mock.calls[0][0]).toBe(ctx.baseUrl + "/list");
  });
});

describe("checkAuthLegibility (reachable rejections)", () => {
  beforeEach(() => mockHttpGet.mockReset());

  it("passes when a 401 guides the agent (WWW-Authenticate + JSON + docs_url)", async () => {
    mockHttpGet.mockResolvedValue(
      makeErrorResponse(
        401,
        { "www-authenticate": "Bearer", "content-type": "application/json" },
        JSON.stringify({ error: "unauthorized", docs_url: "https://docs.example.com/auth" }),
      ),
    );
    const result = await checkAuthLegibility(makeCtx());
    expect(result.status).toBe("pass");
  });

  it("is partial when a 403 gives some guidance but not all", async () => {
    mockHttpGet.mockResolvedValue(
      makeErrorResponse(403, { "www-authenticate": "Bearer" }, "Forbidden"),
    );
    const result = await checkAuthLegibility(makeCtx());
    expect(result.status).toBe("partial");
  });

  it("fails (opaque rejection) — NOT 'could not reach' — on a bare 401", async () => {
    mockHttpGet.mockResolvedValue(makeErrorResponse(401, { "content-type": "text/html" }, "<html>login</html>"));
    const result = await checkAuthLegibility(withApiOperation());
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("opaque");
  });

  it("records an unmeasured timeout without attributing missing signals to the API", async () => {
    mockHttpGet.mockResolvedValue({ ok: false, error: { kind: "timeout", message: "timed out", url: "https://example.com/api" } });
    const result = await checkAuthLegibility(makeCtx());
    expect(result.status).toBe("error");
    expect(result.data).toEqual({
      probeUrl: "https://example.com/api", probeSource: "fallback", method: "GET",
      httpStatus: null, measurement: "unmeasured", errorKind: "timeout", signals: [],
    });
  });

  it("tracks the same protected GET from an opaque 401 through partial and full guidance", async () => {
    const ctx = makeCtx({ shared: { openApiSpec: {
      security: [{ bearer: [] }],
      paths: {
        "/public": { get: { security: [] } },
        "/optional": { get: { security: [{ bearer: [] }, {}] } },
        "/users/{id}": { get: {} },
        "/users": { get: {} },
        "/me": { get: { security: [{ bearer: [] }] } },
      },
    } } });
    const structured = { "content-type": "application/problem+json" };
    const url = "https://example.com/me";
    mockHttpGet
      .mockResolvedValueOnce(makeErrorResponse(401, {}, "", url))
      .mockResolvedValueOnce(makeErrorResponse(401, structured, '{"error":"unauthorized"}', url))
      .mockResolvedValueOnce(makeErrorResponse(401, { ...structured, "www-authenticate": "Bearer" }, '{"docs_url":"https://example.com/docs/auth"}', url));
    for (const [status, signals] of [
      ["fail", []],
      ["partial", ["json_error_body"]],
      ["pass", ["www-authenticate", "json_error_body", "docs_url"]],
    ]) {
      const result = await checkAuthLegibility(ctx);
      expect(result.status).toBe(status);
      expect(result.data).toEqual({
        method: "GET", probeUrl: url, responseUrl: url, probeSource: "protected_operation",
        httpStatus: 401, measurement: "challenged", signals,
      });
    }
  });

  it("records the final auth responder separately from the requested URL without exposing credentials", async () => {
    const finalUrl = "https://user:secret@login.example.org/signin?ticket=private#state";
    mockHttpGet.mockResolvedValueOnce(makeErrorResponse(401, {}, "", finalUrl));
    mockHttpGet.mockResolvedValueOnce({ ok: true, url: finalUrl, status: 200, headers: {}, body: "", redirects: [finalUrl], durationMs: 5 });
    for (const httpStatus of [401, 200]) {
      const result = await checkAuthLegibility(makeCtx());
      expect(result.data).toMatchObject({
        probeUrl: "https://example.com/api", responseUrl: "https://login.example.org/signin", responseHasQuery: true, httpStatus,
      });
      expect(JSON.stringify(result.data)).not.toMatch(/secret|ticket|private|#state/);
    }
  });

  it("excludes an anonymous security alternative and respects operation-specific overrides of global auth", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("", {}, 200, "https://example.com/inherited"));
    const ctx = makeCtx({ shared: { openApiSpec: {
      security: [{ bearer: [] }], paths: {
        "/public": { get: { security: [] } }, "/optional": { get: { security: [{}, { token: [] }] } },
        "/inherited": { get: {} },
      },
    } } });
    const result = await checkAuthLegibility(ctx);
    expect(result.data).toMatchObject({
      probeUrl: "https://example.com/inherited", probeSource: "protected_operation",
      httpStatus: 200, measurement: "no_challenge",
    });
  });

  it("selects a literal same-origin server and a protected GET that needs no invented input", async () => {
    mockHttpGet.mockResolvedValue(makeErrorResponse(401));
    const ctx = makeCtx({ shared: { openApiSpec: {
      servers: [{ url: "/v1" }], security: [{ bearer: [] }],
      paths: {
        "/external": { get: { servers: [{ url: "https://api.example.org" }] } },
        "/search": { get: { parameters: [{ in: "query", name: "q", required: true }] } },
        "/tenant": { parameters: [{ in: "header", name: "X-Tenant", required: true }], get: {} },
        "/me": { get: {} },
      },
    } } });
    expect((await checkAuthLegibility(ctx)).data).toMatchObject({ probeUrl: "https://example.com/v1/me", probeSource: "protected_operation" });
    expect(mockHttpGet).toHaveBeenCalledTimes(1);
  });

  it("uses the speculative fallback if the protected API lives elsewhere", async () => {
    mockHttpGet.mockResolvedValue(makeErrorResponse(404));
    const ctx = makeCtx({ shared: { openApiSpec: {
      swagger: "2.0", host: "elsewhere.example.com", basePath: "/v1",
      paths: { "/me": { get: { security: [{ bearer: [] }] } } },
    } } });
    expect((await checkAuthLegibility(ctx)).data).toMatchObject({
      probeUrl: "https://example.com/api", probeSource: "fallback", httpStatus: 404, measurement: "unmeasured",
    });
  });

  it("only credits a structured body and a valid HTTP(S) documentation URL", async () => {
    mockHttpGet.mockResolvedValueOnce(makeErrorResponse(401, { "content-type": "application/json" }, "null"));
    expect((await checkAuthLegibility(makeCtx())).data?.signals).toEqual([]);
    mockHttpGet.mockResolvedValueOnce(makeErrorResponse(401, { "content-type": "application/json" }, '{"docs_url":"http-invalid"}'));
    expect((await checkAuthLegibility(makeCtx())).data?.signals).toEqual(["json_error_body"]);
  });

  it("distinguishes an edge challenge from a measured API rejection", async () => {
    mockHttpGet.mockResolvedValue({
      ok: false, error: { kind: "bot_protected", statusCode: 403, message: "Bot protection detected", url: "https://example.com/api" },
      response: { status: 403, headers: { "server": "cloudflare" }, body: "Browser verification" },
    });
    const result = await checkAuthLegibility(makeCtx());
    expect(result.status).toBe("error");
    expect(result.data).toMatchObject({ measurement: "unmeasured", httpStatus: 403 });
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
    mockHttpGet.mockResolvedValue(makeErrorResponse(
      401,
      { "www-authenticate": "Bearer", "content-type": "application/json" },
      JSON.stringify({ error: "unauthorized", docs_url: "https://docs.example.com/auth" }),
    ));
    expect((await checkAuthLegibility(makeCtx())).status).toBe("pass");
  });
  it("returns partial when 401 has JSON body but no WWW-Authenticate", async () => {
    mockHttpGet.mockResolvedValue(makeErrorResponse(401, { "content-type": "application/json" }, JSON.stringify({ error: "unauthorized" })));
    expect((await checkAuthLegibility(makeCtx())).status).toBe("partial");
  });
  it("returns fail when 401 returns HTML", async () => {
    mockHttpGet.mockResolvedValue(makeErrorResponse(401, { "content-type": "text/html" }, "<html>Login</html>"));
    expect((await checkAuthLegibility(withApiOperation())).status).toBe("fail");
  });
  it("returns partial when endpoint returns 200 (no auth required)", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess('{"ok":true}', { "content-type": "application/json" }, 200));
    expect((await checkAuthLegibility(makeCtx())).status).toBe("partial");
  });
  it("reports an unmeasured probe when no HTTP status is available", async () => {
    mockHttpGet.mockResolvedValue(makeFailure());
    expect((await checkAuthLegibility(makeCtx())).status).toBe("error");
  });
});

describe("extractTosUrl", () => {
  it("accepts path segments and ignores unrelated words or query parameters", () => {
    expect(extractTosUrl("https://example.com/termstore https://example.com/?next=/terms")).toBeNull();
    expect(extractTosUrl("https://example.com/tos?lang=en")).toBe("https://example.com/tos?lang=en");
  });
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
  it("prefers /terms over /legal when both present", () => {
    const text = "See https://example.com/legal/restricted and https://example.com/terms for details";
    expect(extractTosUrl(text)).toBe("https://example.com/terms");
  });
  it("falls back to /legal when no /terms or /tos present", () => {
    const text = "See https://example.com/legal/privacy for details";
    expect(extractTosUrl(text)).toBe("https://example.com/legal/privacy");
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
  it("prefers /terms over /legal when both present", () => {
    const html = '<a href="/legal/privacy">Legal</a><a href="/terms">Terms</a>';
    expect(extractTosUrlFromHtml(html, base)).toBe("https://example.com/terms");
  });
  it("falls back to /legal when no /terms or /tos present", () => {
    const html = '<a href="/legal/privacy">Legal</a>';
    expect(extractTosUrlFromHtml(html, base)).toBe("https://example.com/legal/privacy");
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

describe("context checks under request-budget exhaustion", () => {
  const budgetDenied = {
    ok: false as const,
    error: { kind: "request_budget_exhausted" as const, message: "Scan request budget exhausted", url: "https://example.com/api" },
  };

  it("rate-limit check reports error and clears probe headers", async () => {
    mockHttpGet.mockResolvedValue(budgetDenied);
    const ctx = makeCtx();
    const check = await checkRateLimitHeaders(ctx);
    expect(check.status).toBe("error");
    expect(ctx.shared.contextProbeHeaders).toEqual({});
  });

  it("auth legibility reports error when the probe was denied", async () => {
    mockHttpGet.mockResolvedValue(budgetDenied);
    const check = await checkAuthLegibility(makeCtx());
    expect(check.status).toBe("error");
  });

  it("agents.json reports error when the probe was denied", async () => {
    mockHttpGet.mockResolvedValue(budgetDenied);
    const check = await checkAgentsJson("https://example.com");
    expect(check.status).toBe("error");
  });
});
