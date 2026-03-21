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

function make401(): HttpFailure {
  return {
    ok: false,
    error: {
      kind: "http_error",
      message: "HTTP 401 Unauthorized",
      statusCode: 401,
      url: "https://example.com",
    },
  };
}

function make403(): HttpFailure {
  return {
    ok: false,
    error: {
      kind: "http_error",
      message: "HTTP 403 Forbidden",
      statusCode: 403,
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

  it('returns fail with "No OpenAPI spec found" when all paths return 404', async () => {
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

  it("probes exactly 24 paths", async () => {
    mockHttpGet.mockResolvedValue(make404());

    await checkOpenApi("https://example.com");

    // httpGet should be called exactly 24 times (17 spec + 7 doc UI)
    expect(mockHttpGet).toHaveBeenCalledTimes(24);
  });

  it("fires all 24 requests in parallel via Promise.all", async () => {
    const callOrder: string[] = [];
    let resolveCount = 0;

    mockHttpGet.mockImplementation(async (url: string) => {
      callOrder.push(url);
      resolveCount++;
      // All should be called before any resolves (parallel)
      return make404();
    });

    await checkOpenApi("https://example.com");

    // All 24 calls were initiated
    expect(callOrder).toHaveLength(24);
    expect(resolveCount).toBe(24);
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

  it("returns partial for Swagger 2.0 YAML spec", async () => {
    const yamlBody = `swagger: "2.0"
info:
  title: Test
paths:
  /users:
    get:
      summary: List`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/api-docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/yaml" },
          body: yamlBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toMatchObject({
      specType: "swagger",
      version: "2.0",
    });
    expect(result.detected).toBe(true);
  });

  it("returns fail for non-JSON non-YAML response body", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/plain" },
          body: "This is not a spec",
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  it("returns fail for JSON that starts with { but is not valid JSON", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/plain" },
          body: "{ invalid json :::",
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  it("handles empty paths object in JSON spec", async () => {
    const body = makeOpenApiJson("3.0.0", {});

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
    expect(result.check.data).toMatchObject({ endpointCount: 0 });
  });

  it("returns correct endpointCount from YAML spec", async () => {
    const yamlBody = `openapi: "3.0.0"
info:
  title: Test
paths:
  /users:
    get:
      summary: List users
  /items:
    get:
      summary: List items
  /orders:
    post:
      summary: Create order`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/api-docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/yaml" },
          body: yamlBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toMatchObject({ endpointCount: 3 });
  });

  it("handles application/vnd.oai.openapi Content-Type as YAML", async () => {
    const yamlBody = `openapi: "3.1.0"
info:
  title: Test
paths:
  /data:
    get:
      summary: Get data`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/vnd.oai.openapi" },
          body: yamlBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toMatchObject({
      specType: "openapi",
      version: "3.1.0",
    });
    expect(result.detected).toBe(true);
  });

  it("uses first valid spec found in path order", async () => {
    const body = makeOpenApiJson("3.0.0", { "/test": {} });

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body,
        });
      }
      if (url.endsWith("/swagger.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body: makeSwaggerJson("2.0", { "/alt": {} }),
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.data).toMatchObject({ path: "/openapi.json" });
  });

  it("handles application/x-yaml Content-Type as YAML", async () => {
    const yamlBody = `openapi: "3.0.1"
info:
  title: Test
paths:
  /health:
    get:
      summary: Health check`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/api-docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/x-yaml" },
          body: yamlBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toMatchObject({
      specType: "openapi",
      version: "3.0.1",
    });
    expect(result.detected).toBe(true);
  });

  // --- 401/403 Detection Tests ---

  it("returns partial with protected:true for 401 on spec path", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return make401();
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.detected).toBe(true);
    expect(result.check.data).toMatchObject({
      protected: true,
      path: "/openapi.json",
    });
    expect(result.check.detail).toContain("authentication");
  });

  it("returns partial with protected:true for 403 on spec path", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/swagger.json")) {
        return make403();
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.detected).toBe(true);
    expect(result.check.data).toMatchObject({
      protected: true,
      path: "/swagger.json",
    });
  });

  it("direct spec hit wins over 401 on another path", async () => {
    const body = makeOpenApiJson("3.0.0", { "/test": {} });

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return make401();
      }
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
    expect(result.check.data).toMatchObject({ path: "/swagger.json" });
    expect(result.check.data).not.toHaveProperty("protected");
  });

  it("401 on doc UI path (/docs) is NOT reported as protected", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) {
        return {
          ok: false,
          error: {
            kind: "http_error" as const,
            message: "HTTP 401 Unauthorized",
            statusCode: 401,
            url,
          },
        };
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  it("bot-protected 403 (Cloudflare) is NOT reported as protected", async () => {
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.json")) {
        return {
          ok: false,
          error: {
            kind: "bot_protected" as const,
            message: "Bot protection detected",
            statusCode: 403,
            url,
          },
        };
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  // --- HTML Spec Extraction Tests ---

  it("extracts spec URL from Swagger UI HTML and returns pass", async () => {
    const swaggerHtml = `<!DOCTYPE html>
<html><head><title>Swagger UI</title></head>
<body>
<script>
SwaggerUIBundle({ url: "/v1/api-spec.json", dom_id: "#swagger-ui" })
</script>
</body></html>`;

    const specBody = makeOpenApiJson("3.1.0", { "/users": {}, "/items": {} });

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html" },
          body: swaggerHtml,
        });
      }
      if (url.endsWith("/v1/api-spec.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body: specBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.detected).toBe(true);
    expect(result.check.data).toMatchObject({
      version: "3.1.0",
      endpointCount: 2,
      path: "/v1/api-spec.json",
    });
  });

  it("extracts spec URL from ReDoc HTML with spec-url attribute", async () => {
    const redocHtml = `<!DOCTYPE html>
<html><body>
<redoc spec-url="/api/v2/openapi.yaml"></redoc>
</body></html>`;

    const yamlBody = `openapi: "3.0.2"
info:
  title: Test
paths:
  /data:
    get:
      summary: Get data`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/redoc")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html" },
          body: redocHtml,
        });
      }
      if (url.endsWith("/api/v2/openapi.yaml")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/yaml" },
          body: yamlBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.detected).toBe(true);
    expect(result.check.data).toMatchObject({
      version: "3.0.2",
      path: "/api/v2/openapi.yaml",
    });
  });

  it("HTML with no extractable URL continues to Phase 4/5", async () => {
    const plainHtml = `<!DOCTYPE html>
<html><body><h1>API Documentation</h1><p>No spec here</p></body></html>`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html" },
          body: plainHtml,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
  });

  it("extracted URL matching already-probed path is skipped (no duplicate fetch)", async () => {
    // Swagger UI HTML that references /openapi.json (already in SPEC_PATHS)
    const swaggerHtml = `<!DOCTYPE html>
<script>SwaggerUIBundle({ url: "/openapi.json" })</script>`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html" },
          body: swaggerHtml,
        });
      }
      return make404();
    });

    await checkOpenApi("https://example.com");

    // Should only have the initial 24 calls, no secondary fetch for /openapi.json
    expect(mockHttpGet).toHaveBeenCalledTimes(24);
  });

  it("cross-origin extracted URL is rejected, not fetched", async () => {
    const swaggerHtml = `<!DOCTYPE html>
<script>SwaggerUIBundle({ url: "https://other-host.com/openapi.json" })</script>`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html" },
          body: swaggerHtml,
        });
      }
      return make404();
    });

    await checkOpenApi("https://example.com");

    // No secondary fetch -- only the 24 primary probes
    expect(mockHttpGet).toHaveBeenCalledTimes(24);
  });

  it("max 3 secondary fetches enforced", async () => {
    const swaggerHtml = `<!DOCTYPE html>
<script>
SwaggerUIBundle({ url: "/custom1/spec.json" })
swaggerUrl: "/custom2/spec.json"
"/custom3/openapi.json"
"/custom4/swagger.yaml"
"/custom5/openapi.yaml"
</script>`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html" },
          body: swaggerHtml,
        });
      }
      return make404();
    });

    await checkOpenApi("https://example.com");

    // 24 primary + 3 secondary (capped)
    expect(mockHttpGet).toHaveBeenCalledTimes(27);
  });

  // --- Path Expansion Tests ---

  it("finds YAML spec at /openapi.yaml", async () => {
    const yamlBody = `openapi: "3.0.0"
info:
  title: YAML Test
paths:
  /test:
    get:
      summary: Test`;

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/openapi.yaml")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/yaml" },
          body: yamlBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.data).toMatchObject({
      version: "3.0.0",
      path: "/openapi.yaml",
    });
    expect(result.detected).toBe(true);
  });

  it("fetches external swagger config script and extracts spec URL", async () => {
    // HTML references an external swagger-initializer.js (no inline spec URL)
    const swaggerHtml = `<!DOCTYPE html>
<html><body>
<script src="./swagger-ui-bundle.js"></script>
<script src="./swagger-initializer.js"></script>
</body></html>`;

    // The JS file contains the spec URL
    const initializerJs = `window.onload = function() {
  SwaggerUIBundle({ url: "/v2/custom-spec.json", dom_id: "#swagger-ui" })
}`;

    const specBody = makeOpenApiJson("3.0.0", { "/pets": {} });

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html" },
          body: swaggerHtml,
        });
      }
      if (url.endsWith("/swagger-initializer.js")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/javascript" },
          body: initializerJs,
        });
      }
      if (url.endsWith("/v2/custom-spec.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body: specBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.detected).toBe(true);
    expect(result.check.data).toMatchObject({
      version: "3.0.0",
      path: "/v2/custom-spec.json",
    });
  });

  it("extracts full URL from external script (e.g. petstore pattern)", async () => {
    const swaggerHtml = `<!DOCTYPE html>
<html><body>
<script src="./swagger-initializer.js"></script>
</body></html>`;

    // Petstore-style: full URL in a variable
    const initializerJs = `const defaultUrl = "https://example.com/v2/swagger.json";
SwaggerUIBundle({ url: defaultUrl })`;

    const specBody = makeSwaggerJson("2.0", { "/pets": {}, "/users": {} });

    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) {
        return makeSuccess({
          url,
          headers: { "content-type": "text/html" },
          body: swaggerHtml,
        });
      }
      if (url.endsWith("/swagger-initializer.js")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/javascript" },
          body: initializerJs,
        });
      }
      if (url.endsWith("/v2/swagger.json")) {
        return makeSuccess({
          url,
          headers: { "content-type": "application/json" },
          body: specBody,
        });
      }
      return make404();
    });

    const result = await checkOpenApi("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.detected).toBe(true);
    expect(result.check.data).toMatchObject({
      specType: "swagger",
      version: "2.0",
    });
  });

  it("sends correct Accept headers for spec vs doc UI paths", async () => {
    mockHttpGet.mockResolvedValue(make404());

    await checkOpenApi("https://example.com");

    for (const call of mockHttpGet.mock.calls) {
      const url = call[0] as string;
      const opts = call[1] as { headers?: Record<string, string> };
      const path = new URL(url).pathname;

      const docUiPaths = ["/", "/swagger-ui.html", "/swagger-ui/", "/docs", "/redoc", "/api/docs", "/documentation"];
      if (docUiPaths.includes(path)) {
        expect(opts.headers?.Accept).toBe("text/html, */*");
      } else {
        expect(opts.headers?.Accept).toBe("application/json, application/yaml, */*");
      }
    }
  });

  // --- Webhook/Callback extraction ---

  it("returns hasWebhooks true for OpenAPI 3.1 spec with top-level webhooks", async () => {
    const spec = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Test" },
      paths: {},
      webhooks: {
        orderStatusChanged: {
          post: { summary: "Order status update" },
        },
      },
    });
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess({ body: spec }));
    const result = await checkOpenApi("https://example.com");
    expect(result.hasWebhooks).toBe(true);
    expect(result.hasCallbacks).toBe(false);
  });

  it("returns hasWebhooks false when webhooks key is empty object", async () => {
    const spec = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Test" },
      paths: {},
      webhooks: {},
    });
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess({ body: spec }));
    const result = await checkOpenApi("https://example.com");
    expect(result.hasWebhooks).toBe(false);
  });

  it("returns hasWebhooks false for OpenAPI 3.0 spec without webhooks key", async () => {
    const spec = makeOpenApiJson("3.0.3", { "/users": { get: {} } });
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess({ body: spec }));
    const result = await checkOpenApi("https://example.com");
    expect(result.hasWebhooks).toBe(false);
  });

  it("returns hasCallbacks true when any operation has callbacks", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Test" },
      paths: {
        "/subscribe": {
          post: {
            summary: "Subscribe",
            callbacks: {
              onEvent: {
                "{$request.body#/callbackUrl}": {
                  post: { summary: "Event notification" },
                },
              },
            },
          },
        },
      },
    });
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess({ body: spec }));
    const result = await checkOpenApi("https://example.com");
    expect(result.hasCallbacks).toBe(true);
  });

  it("returns hasCallbacks false when no operations have callbacks", async () => {
    const spec = makeOpenApiJson("3.0.3", {
      "/users": { get: { summary: "List" } },
    });
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess({ body: spec }));
    const result = await checkOpenApi("https://example.com");
    expect(result.hasCallbacks).toBe(false);
  });

  it("returns both hasWebhooks and hasCallbacks true when spec has both", async () => {
    const spec = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Test" },
      paths: {
        "/subscribe": {
          post: {
            callbacks: { onEvent: {} },
          },
        },
      },
      webhooks: {
        newOrder: { post: { summary: "New order" } },
      },
    });
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess({ body: spec }));
    const result = await checkOpenApi("https://example.com");
    expect(result.hasWebhooks).toBe(true);
    expect(result.hasCallbacks).toBe(true);
  });

  it("detects webhooks in YAML spec via top-level webhooks key", async () => {
    const yaml = `openapi: "3.1.0"
info:
  title: Test
paths:
  /users:
    get:
      summary: List
webhooks:
  newOrder:
    post:
      summary: New order`;
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess({
        body: yaml,
        headers: { "content-type": "application/yaml" },
      }),
    );
    const result = await checkOpenApi("https://example.com");
    expect(result.hasWebhooks).toBe(true);
  });

  it("detects callbacks in YAML spec via indented callbacks key", async () => {
    const yaml = `openapi: "3.0.3"
info:
  title: Test
paths:
  /subscribe:
    post:
      summary: Subscribe
      callbacks:
        onEvent:
          '{$request.body#/callbackUrl}':
            post:
              summary: Event`;
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess({
        body: yaml,
        headers: { "content-type": "application/yaml" },
      }),
    );
    const result = await checkOpenApi("https://example.com");
    expect(result.hasCallbacks).toBe(true);
  });

  it("returns hasWebhooks false and hasCallbacks false for protected spec", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(make401());
    const result = await checkOpenApi("https://example.com");
    expect(result.hasWebhooks).toBe(false);
    expect(result.hasCallbacks).toBe(false);
  });

  it("returns hasWebhooks false and hasCallbacks false when no spec found", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkOpenApi("https://example.com");
    expect(result.hasWebhooks).toBe(false);
    expect(result.hasCallbacks).toBe(false);
  });
});
