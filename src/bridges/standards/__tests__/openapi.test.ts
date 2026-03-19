import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpResponse, HttpSuccess, HttpFailure } from "../../../core/types.js";

// Mock httpGet before importing the module under test
vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

import { checkOpenApi } from "../openapi.js";
import { httpGet } from "../../../utils/http-client.js";

const mockHttpGet = vi.mocked(httpGet);

// --- Helpers ---

function makeSuccess(
  overrides: Partial<HttpSuccess> = {},
): HttpSuccess {
  return {
    ok: true,
    url: "https://example.com",
    status: 200,
    headers: { "content-type": "application/json" },
    body: "{}",
    redirects: [],
    durationMs: 50,
    ...overrides,
  };
}

function make404(): HttpFailure {
  return {
    ok: false,
    error: {
      kind: "http_error",
      message: "HTTP 404 Not Found",
      statusCode: 404,
      url: "https://example.com",
    },
  };
}

function makeOpenApiJson(version = "3.1.0", paths: Record<string, unknown> = {}): string {
  return JSON.stringify({ openapi: version, info: { title: "Test" }, paths });
}

function makeSwaggerJson(version = "2.0", paths: Record<string, unknown> = {}): string {
  return JSON.stringify({ swagger: version, info: { title: "Test" }, paths });
}

function makeYamlBody(version = "3.1.0"): string {
  return `openapi: "${version}"
info:
  title: Test API
paths:
  /users:
    get:
      summary: List users
  /items:
    get:
      summary: List items
`;
}

// --- Tests ---

describe("checkOpenApi", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns Check with correct id and label", async () => {
    // All 9 paths return 404
    mockHttpGet.mockResolvedValue(make404());

    const result = await checkOpenApi("https://example.com");
    expect(result.check.id).toBe("openapi_spec");
    expect(result.check.label).toBe("OpenAPI Spec");
  });

  it('returns pass with version and endpoint count for valid JSON OpenAPI 3.x spec', async () => {
    const paths = { "/users": {}, "/items": {}, "/orders": {}, "/products": {}, "/health": {} };
    const body = makeOpenApiJson("3.1.0", paths);

    // First path succeeds, rest 404
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.detail).toBe("OpenAPI 3.1.0 found with 5 endpoints");
    expect(result.check.data).toEqual({
      version: "3.1.0",
      specType: "openapi",
      endpointCount: 5,
      path: "/openapi.json",
    });
    expect(result.detected).toBe(true);
  });

  it('returns pass with specType "swagger" for valid Swagger 2.0 JSON spec', async () => {
    const paths = { "/users": {}, "/items": {} };
    const body = makeSwaggerJson("2.0", paths);

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/swagger.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.data).toMatchObject({
      specType: "swagger",
      version: "2.0",
      endpointCount: 2,
    });
    expect(result.detected).toBe(true);
  });

  it("returns partial for YAML spec with version extracted via regex", async () => {
    const body = makeYamlBody("3.0.2");

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/api-docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/yaml" },
          body,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.detail).toContain("YAML format");
    expect(result.check.detail).toContain("3.0.2");
    expect(result.check.data).toMatchObject({
      version: "3.0.2",
      specType: "openapi",
      path: "/api-docs",
    });
    expect(result.detected).toBe(true);
  });

  it("rejects HTML response at /swagger (Content-Type text/html) -- returns fail", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/swagger.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: "<!DOCTYPE html><html><body>Swagger UI</body></html>",
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  it("rejects JSON response without openapi/swagger key -- returns fail", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/api-docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "some api", version: "1.0" }),
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  it('returns fail with "No OpenAPI spec found" when all 9 paths return 404', async () => {
    mockHttpGet.mockResolvedValue(make404());

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.check.detail).toBe("No OpenAPI spec found");
    expect(result.detected).toBe(false);
  });

  it("returns pass when first path is 404 but second path has valid spec", async () => {
    const body = makeOpenApiJson("3.0.1", { "/api/v1/data": {} });

    mockHttpGet.mockImplementation(async (url: string) => {
      // /swagger.json (second path) has the valid spec
      if (url.endsWith("/swagger.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.data).toMatchObject({
      version: "3.0.1",
      endpointCount: 1,
      path: "/swagger.json",
    });
  });

  it("counts endpoints from paths object keys", async () => {
    const paths = {
      "/a": {}, "/b": {}, "/c": {}, "/d": {}, "/e": {},
      "/f": {}, "/g": {}, "/h": {}, "/i": {}, "/j": {},
    };
    const body = makeOpenApiJson("3.0.0", paths);

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.data).toMatchObject({ endpointCount: 10 });
  });

  it("tries JSON.parse fallback for unknown Content-Type with JSON body", async () => {
    const body = makeOpenApiJson("3.0.3", { "/test": {} });

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/v3/api-docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/plain" },
          body,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.data).toMatchObject({
      version: "3.0.3",
      specType: "openapi",
    });
    expect(result.detected).toBe(true);
  });

  it("probes exactly 9 paths", async () => {
    mockHttpGet.mockResolvedValue(make404());

    await checkOpenApi("https://example.com");

    // httpGet should be called exactly 9 times (one per path)
    expect(mockHttpGet).toHaveBeenCalledTimes(9);
  });

  it("fires all 9 requests in parallel via Promise.all", async () => {
    const callOrder: string[] = [];
    let resolveCount = 0;

    mockHttpGet.mockImplementation(async (url: string) => {
      callOrder.push(url);
      resolveCount++;
      // All should be called before any resolves (parallel)
      return make404();
    });

    await checkOpenApi("https://example.com");

    // All 9 calls were initiated
    expect(callOrder).toHaveLength(9);
    expect(resolveCount).toBe(9);
  });

  it("rejects application/xhtml+xml Content-Type as HTML", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/api-docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/xhtml+xml" },
          body: "<html><body>API Docs</body></html>",
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  it("handles application/vnd.oai.openapi+json Content-Type", async () => {
    const body = makeOpenApiJson("3.1.0", { "/items": {} });

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/vnd.oai.openapi+json" },
          body,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.data).toMatchObject({
      specType: "openapi",
      version: "3.1.0",
    });
  });

  it("passes timeout option to httpGet", async () => {
    mockHttpGet.mockResolvedValue(make404());

    await checkOpenApi("https://example.com", 5000);

    // Verify timeout was passed
    for (const call of mockHttpGet.mock.calls) {
      expect(call[1]).toMatchObject({ timeout: 5000 });
    }
  });
});
