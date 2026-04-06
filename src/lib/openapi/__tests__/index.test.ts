import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkOpenAPI } from "../index.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FULL_SPEC = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        description: "List users",
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createUser",
        summary: "Create user",
        responses: { "201": { description: "Created" } },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
      OAuth: { type: "oauth2", flows: {} },
    },
  },
  security: [{ ApiKey: [] }],
});

const SWAGGER_SPEC = JSON.stringify({
  swagger: "2.0",
  info: { title: "Legacy API", version: "1.0" },
  paths: {
    "/items": {
      get: { operationId: "getItems", description: "Get items" },
    },
  },
  securityDefinitions: {
    basic: { type: "basic" },
  },
});

function makeHeadSuccess(contentType: string): HttpResponse {
  return {
    ok: true,
    url: "https://example.com/openapi.json",
    status: 200,
    headers: { "content-type": contentType },
    body: "",
    redirects: [],
    durationMs: 10,
  };
}

function makeGetSuccess(body: string, url = "https://example.com/openapi.json"): HttpResponse {
  return {
    ok: true,
    url,
    status: 200,
    headers: { "content-type": "application/json" },
    body,
    redirects: [],
    durationMs: 50,
  };
}

function make404(): HttpResponse {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404", statusCode: 404, url: "https://example.com" },
  };
}

function make405(): HttpResponse {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 405", statusCode: 405, url: "https://example.com" },
  };
}

function makeDnsError(): HttpResponse {
  return {
    ok: false,
    error: { kind: "dns", message: "DNS resolution failed", url: "https://example.com" },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkOpenAPI", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
    // Default: all probes return 404
    mockHttpGet.mockResolvedValue(make404());
  });

  it("returns valid result with full auth and descriptions for JSON spec at /openapi.json", async () => {
    // HEAD returns 200 with JSON content type
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    // GET returns full spec
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(FULL_SPEC));

    const result = await checkOpenAPI("example.com");
    expect(result.exists).toBe(true);
    expect(result.version).toBe("3.0");
    expect(result.endpointCount).toBe(1);
    expect(result.operationCount).toBe(2);
    expect(result.hasDescriptions).toBe(true);
    expect(result.hasAuthSchemes).toBe(true);
    expect(result.authSchemeTypes).toContain("apiKey");
    expect(result.authSchemeTypes).toContain("oauth2");
    expect(result.authSchemeNames).toContain("ApiKey");
    expect(result.authSchemeNames).toContain("OAuth");
    expect(result.hasGlobalSecurity).toBe(true);
    expect(result.governanceReady).toBe(true);
    expect(result.spec).not.toBeNull();
    expect(result.error).toBeNull();
  });

  it("detects Swagger 2.0 with securityDefinitions", async () => {
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(SWAGGER_SPEC));

    const result = await checkOpenAPI("example.com");
    expect(result.exists).toBe(true);
    expect(result.version).toBe("2.0");
    expect(result.hasAuthSchemes).toBe(true);
    expect(result.authSchemeTypes).toContain("basic");
  });

  it("detects spec with no auth schemes", async () => {
    const noAuthSpec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0" },
      paths: { "/test": { get: { description: "test" } } },
    });
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(noAuthSpec));

    const result = await checkOpenAPI("example.com");
    expect(result.exists).toBe(true);
    expect(result.hasAuthSchemes).toBe(false);
    expect(result.governanceReady).toBe(false);
  });

  it("detects spec with <50% descriptions", async () => {
    const lowDescSpec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0" },
      paths: {
        "/a": { get: { description: "described" } },
        "/b": { get: {} },
        "/c": { get: {} },
      },
    });
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(lowDescSpec));

    const result = await checkOpenAPI("example.com");
    expect(result.exists).toBe(true);
    expect(result.hasDescriptions).toBe(false);
    expect(result.descriptionCoverage).toBeCloseTo(1 / 3, 1);
  });

  it("returns exists=false when no spec found at any path", async () => {
    // All 404s (default mock)
    const result = await checkOpenAPI("example.com");
    expect(result.exists).toBe(false);
    expect(result.url).toBeNull();
    expect(result.spec).toBeNull();
    expect(result.error).toBeNull();
  });

  it("skips invalid JSON at /openapi.json and moves to next path", async () => {
    // HEAD returns 200
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    // GET returns HTML (not valid spec)
    mockHttpGet.mockResolvedValueOnce(
      makeGetSuccess("<html><body>Not Found</body></html>"),
    );
    // Rest return 404

    const result = await checkOpenAPI("example.com");
    expect(result.exists).toBe(false);
  });

  it("falls back to GET when HEAD returns 405", async () => {
    // HEAD 405
    mockHttpGet.mockResolvedValueOnce(make405());
    // GET returns valid spec
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(FULL_SPEC));

    const result = await checkOpenAPI("example.com");
    expect(result.exists).toBe(true);
  });

  it("returns exists=false with error for invalid domain", async () => {
    const result = await checkOpenAPI("");
    expect(result.exists).toBe(false);
    expect(result.error).toContain("Invalid domain");
  });

  it("returns exists=false with null error for DNS failure", async () => {
    mockHttpGet.mockResolvedValue(makeDnsError());
    const result = await checkOpenAPI("nonexistent.example.com");
    expect(result.exists).toBe(false);
  });

  it("detects mixed auth types", async () => {
    const mixedAuthSpec = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: { "/test": { get: { description: "test" } } },
      components: {
        securitySchemes: {
          oauth: { type: "oauth2" },
          apikey: { type: "apiKey", name: "key", in: "header" },
        },
      },
    });
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(mixedAuthSpec));

    const result = await checkOpenAPI("example.com");
    expect(result.authSchemeTypes).toEqual(
      expect.arrayContaining(["oauth2", "apiKey"]),
    );
  });

  it("detects OpenAPI 3.1", async () => {
    const spec31 = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
    });
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(spec31));

    const result = await checkOpenAPI("example.com");
    expect(result.version).toBe("3.1");
  });

  it("handles YAML spec", async () => {
    const yamlSpec = `openapi: "3.0.0"
info:
  title: YAML API
  version: "1.0"
paths:
  /test:
    get:
      description: Test endpoint
`;
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/yaml"));
    mockHttpGet.mockResolvedValueOnce(
      makeGetSuccess(yamlSpec, "https://example.com/openapi.yaml"),
    );

    const result = await checkOpenAPI("example.com");
    expect(result.exists).toBe(true);
    expect(result.version).toBe("3.0");
  });

  it("hasGlobalSecurity reflects correctly", async () => {
    const noGlobalSpec = JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0" },
      paths: { "/test": { get: { description: "test" } } },
      components: {
        securitySchemes: { key: { type: "apiKey" } },
      },
      // No global security
    });
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(noGlobalSpec));

    const result = await checkOpenAPI("example.com");
    expect(result.hasGlobalSecurity).toBe(false);

    // With global security
    mockHttpGet.mockReset();
    mockHttpGet.mockResolvedValueOnce(makeHeadSuccess("application/json"));
    mockHttpGet.mockResolvedValueOnce(makeGetSuccess(FULL_SPEC));

    const result2 = await checkOpenAPI("example.com");
    expect(result2.hasGlobalSecurity).toBe(true);
  });
});
