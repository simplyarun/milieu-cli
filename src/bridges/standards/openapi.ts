import type { Check, HttpResponse, HttpSuccess } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenApiResult {
  check: Check;
  detected: boolean;
  /** OpenAPI 3.1+ top-level `webhooks` key found */
  hasWebhooks: boolean;
  /** OpenAPI 3.0+ `callbacks` found in any operation */
  hasCallbacks: boolean;
}

interface OpenApiInfo {
  version: string;
  specType: "openapi" | "swagger";
  endpointCount: number;
  hasWebhooks: boolean;
  hasCallbacks: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Spec paths -- expect raw JSON/YAML */
const SPEC_PATHS = [
  "/openapi.json",
  "/swagger.json",
  "/api-docs",
  "/v3/api-docs",
  "/v2/api-docs",
  "/swagger/v1/swagger.json",
  "/api/openapi.json",
  "/api/swagger.json",
  "/.well-known/openapi.json",
  "/openapi.yaml",
  "/api/v1/openapi.json",
  "/api/v1/swagger.json",
  "/v3/api-docs.yaml",
  "/v2/swagger.json",
  "/api/v2/openapi.json",
  "/api/v3/openapi.json",
  "/spec.json",
] as const;

/** Doc UI paths -- expect HTML with embedded spec URL */
const DOC_UI_PATHS = [
  "/",
  "/swagger-ui.html",
  "/swagger-ui/",
  "/docs",
  "/redoc",
  "/api/docs",
  "/documentation",
] as const;

/** All paths combined */
const ALL_PATHS = [...SPEC_PATHS, ...DOC_UI_PATHS];

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);

const JSON_TYPES = new Set([
  "application/json",
  "application/vnd.oai.openapi+json",
]);

const YAML_TYPES = new Set([
  "application/yaml",
  "text/yaml",
  "application/x-yaml",
  "application/vnd.oai.openapi",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the media type portion of a Content-Type header (before ;) */
function mediaType(headers: Record<string, string>): string {
  return (headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Validate that an HTTP response contains a genuine OpenAPI / Swagger spec.
 * Returns true only when the body is confirmed to contain spec content.
 */
function isOpenApiResponse(response: HttpSuccess): boolean {
  const ct = mediaType(response.headers);

  // Reject HTML responses (Swagger UI pages)
  if (HTML_TYPES.has(ct)) return false;

  // JSON content types -- parse and check for top-level key
  if (JSON_TYPES.has(ct)) {
    return jsonHasSpecKey(response.body);
  }

  // YAML content types -- regex check
  if (YAML_TYPES.has(ct)) {
    return /^(openapi|swagger):/m.test(response.body);
  }

  // Unknown Content-Type -- try JSON.parse fallback if body looks like JSON
  if (response.body.trimStart().startsWith("{")) {
    return jsonHasSpecKey(response.body);
  }

  return false;
}

/** Parse JSON and check for top-level "openapi" or "swagger" key */
function jsonHasSpecKey(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    return "openapi" in parsed || "swagger" in parsed;
  } catch {
    return false;
  }
}

/** Determine whether the response is JSON (parseable) or YAML */
function isJsonParseable(body: string): boolean {
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

/** Extract version, spec type, and endpoint count from a JSON body */
function extractJsonInfo(body: string): OpenApiInfo | null {
  try {
    const parsed = JSON.parse(body);
    const specType: "openapi" | "swagger" | null =
      "openapi" in parsed
        ? "openapi"
        : "swagger" in parsed
          ? "swagger"
          : null;
    if (!specType) return null;

    const version = String(parsed[specType]);
    const endpointCount = parsed.paths
      ? Object.keys(parsed.paths).length
      : 0;

    // OpenAPI 3.1+ top-level webhooks
    const hasWebhooks =
      parsed.webhooks != null &&
      typeof parsed.webhooks === "object" &&
      Object.keys(parsed.webhooks).length > 0;

    // OpenAPI 3.0+ callbacks in any operation
    let hasCallbacks = false;
    if (parsed.paths && typeof parsed.paths === "object") {
      for (const pathItem of Object.values(parsed.paths)) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const op of Object.values(pathItem as Record<string, unknown>)) {
          if (op && typeof op === "object" && "callbacks" in op) {
            hasCallbacks = true;
            break;
          }
        }
        if (hasCallbacks) break;
      }
    }

    return { version, specType, endpointCount, hasWebhooks, hasCallbacks };
  } catch {
    return null;
  }
}

/** Extract version, spec type, and endpoint count from YAML via regex */
function extractYamlInfo(body: string): OpenApiInfo | null {
  const versionMatch = body.match(
    /^(openapi|swagger):\s*["']?(\d+\.\d+(?:\.\d+)?)/m,
  );
  if (!versionMatch) return null;

  // Count paths in YAML (lines that start with / at indent level 2)
  const pathMatches = body.match(/^ {2}\/\S+:/gm);

  // Top-level webhooks key (OpenAPI 3.1+)
  const hasWebhooks = /^webhooks:/m.test(body);

  // Callbacks nested under operations (indented 6+ spaces)
  const hasCallbacks = /^ {6,}callbacks:/m.test(body);

  return {
    version: versionMatch[2],
    specType: versionMatch[1] as "openapi" | "swagger",
    endpointCount: pathMatches?.length ?? 0,
    hasWebhooks,
    hasCallbacks,
  };
}

/** Patterns that extract spec URLs from HTML or JS content */
const SPEC_URL_PATTERNS = [
  // 1. Swagger UI initializer: SwaggerUIBundle({ url: "/openapi.json" })
  /SwaggerUI(?:Bundle|Standalone)?\s*\(\s*\{[^}]*url\s*:\s*["']([^"']+)["']/g,
  // 2. Swagger UI configUrl: SwaggerUIBundle({ configUrl: "/swagger-config" })
  /SwaggerUI(?:Bundle|Standalone)?\s*\(\s*\{[^}]*configUrl\s*:\s*["']([^"']+)["']/g,
  // 3. Swagger UI swaggerUrl (older): swaggerUrl: "/api/swagger.json"
  /swaggerUrl\s*:\s*["']([^"']+)["']/g,
  // 4. ReDoc spec-url attribute: <redoc spec-url="/api/openapi.json">
  /(?:spec-url|data-spec-url)\s*=\s*["']([^"']+)["']/g,
  // 5. Generic spec path (relative): "/some-path/openapi.json"
  /["'](\/[^"']*(?:openapi|swagger)\.(?:json|yaml))["']/g,
  // 6. Generic spec URL (absolute): "https://host/path/openapi.json"
  /["'](https?:\/\/[^"']*(?:openapi|swagger)\.(?:json|yaml))["']/g,
  // 7. fetch() call to JSON/YAML (Flasgger pattern): fetch("/spec.json")
  /fetch\(\s*["']([^"']+\.(?:json|yaml))["']\s*\)/g,
  // 8. Unquoted spec URLs in JS (template literals, config strings)
  /(https?:\/\/[^\s,`"'<>]+(?:openapi|swagger)\.(?:json|yaml))/g,
];

/**
 * Extract spec URLs from text content (HTML or JS).
 * Returns deduplicated, same-origin, absolute URLs.
 */
function extractSpecUrls(body: string, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  const seen = new Set<string>();
  const results: string[] = [];

  for (const pattern of SPEC_URL_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const raw = match[1];
      if (!raw) continue;

      let absolute: string;
      try {
        absolute = new URL(raw, pageUrl).href;
      } catch {
        continue;
      }

      try {
        if (new URL(absolute).origin !== origin) continue;
      } catch {
        continue;
      }

      if (!seen.has(absolute)) {
        seen.add(absolute);
        results.push(absolute);
      }
    }
  }

  return results;
}

/**
 * Extract Swagger UI config script URLs from HTML.
 * Returns URLs of JS files that likely contain spec URL configuration.
 */
function extractSwaggerScriptUrls(html: string, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  // Match <script src="...swagger...js"> or <script src="...swagger...js">
  const pattern = /<script[^>]+src=["']([^"']*swagger[^"']*\.js)["']/gi;
  const results: string[] = [];

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;

    try {
      const absolute = new URL(raw, pageUrl).href;
      if (new URL(absolute).origin !== origin) continue;
      results.push(absolute);
    } catch {
      continue;
    }
  }

  return results;
}

/** Returns true if response is a 401/403 HTTP error (not bot-protected) */
function isProtectedResponse(response: HttpResponse): boolean {
  if (response.ok) return false;
  const { error } = response;
  return (
    error.kind === "http_error" &&
    error.statusCode !== undefined &&
    (error.statusCode === 401 || error.statusCode === 403)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe 19 common OpenAPI / Swagger spec paths in parallel, then try
 * extracting spec URLs from HTML doc pages, and finally detect protected specs.
 *
 * Returns a Check with id "openapi_spec" and a boolean indicating whether
 * any valid spec was detected (for ctx.shared.openApiDetected).
 */
export async function checkOpenApi(
  baseUrl: string,
  timeout?: number,
): Promise<OpenApiResult> {
  const id = "openapi_spec";
  const label = "OpenAPI Spec";

  // Phase 1: Fire all 19 probes in parallel
  const responses = await Promise.all([
    ...SPEC_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, {
        timeout,
        headers: { Accept: "application/json, application/yaml, */*" },
      }),
    ),
    ...DOC_UI_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, {
        timeout,
        headers: { Accept: "text/html, */*" },
      }),
    ),
  ]);

  const specPathResponses = responses.slice(0, SPEC_PATHS.length);
  const docUiResponses = responses.slice(SPEC_PATHS.length);

  // Phase 2: Check spec-path responses for direct spec hits
  for (let i = 0; i < specPathResponses.length; i++) {
    const response = specPathResponses[i];
    if (!response.ok) continue;
    if (!isOpenApiResponse(response)) continue;

    const path = SPEC_PATHS[i];

    if (isJsonParseable(response.body)) {
      const info = extractJsonInfo(response.body);
      if (info) {
        return {
          check: {
            id,
            label,
            status: "pass",
            detail: `OpenAPI ${info.version} found with ${info.endpointCount} endpoints`,
            data: {
              version: info.version,
              specType: info.specType,
              endpointCount: info.endpointCount,
              path,
            },
          },
          detected: true,
          hasWebhooks: info.hasWebhooks,
          hasCallbacks: info.hasCallbacks,
        };
      }
    }

    const yamlInfo = extractYamlInfo(response.body);
    if (yamlInfo) {
      return {
        check: {
          id,
          label,
          status: "partial",
          detail: `OpenAPI ${yamlInfo.version} found (YAML format)`,
          data: {
            version: yamlInfo.version,
            specType: yamlInfo.specType,
            endpointCount: yamlInfo.endpointCount,
            path,
          },
        },
        detected: true,
        hasWebhooks: yamlInfo.hasWebhooks,
        hasCallbacks: yamlInfo.hasCallbacks,
      };
    }
  }

  // Phase 3: Check doc-UI-path responses for HTML with extractable spec URLs
  const allProbedUrls = new Set(ALL_PATHS.map((p) => new URL(p, baseUrl).href));
  const specCandidateUrls: string[] = [];
  const scriptUrls: string[] = [];

  for (let i = 0; i < docUiResponses.length; i++) {
    const response = docUiResponses[i];
    if (!response.ok) continue;

    const ct = mediaType(response.headers);
    if (!HTML_TYPES.has(ct)) continue;

    const pageUrl = new URL(DOC_UI_PATHS[i], baseUrl).href;

    // Extract spec URLs directly from HTML
    const extracted = extractSpecUrls(response.body, pageUrl);
    for (const url of extracted) {
      if (!allProbedUrls.has(url) && !specCandidateUrls.includes(url)) {
        specCandidateUrls.push(url);
      }
    }

    // Extract Swagger UI config script URLs for secondary fetching
    if (specCandidateUrls.length === 0) {
      const scripts = extractSwaggerScriptUrls(response.body, pageUrl);
      for (const url of scripts) {
        if (!scriptUrls.includes(url)) {
          scriptUrls.push(url);
        }
      }
    }
  }

  // Phase 3a: Fetch external Swagger UI config scripts and extract spec URLs from them
  if (specCandidateUrls.length === 0 && scriptUrls.length > 0) {
    const scriptResponses = await Promise.all(
      scriptUrls.slice(0, 3).map((url) =>
        httpGet(url, {
          timeout,
          headers: { Accept: "*/*" },
        }),
      ),
    );

    for (let i = 0; i < scriptResponses.length; i++) {
      const response = scriptResponses[i];
      if (!response.ok) continue;

      const scriptUrl = scriptUrls[i];
      const extracted = extractSpecUrls(response.body, scriptUrl);
      for (const url of extracted) {
        if (!allProbedUrls.has(url) && !specCandidateUrls.includes(url)) {
          specCandidateUrls.push(url);
        }
      }
    }
  }

  // Phase 3b: Fetch candidate spec URLs and validate
  if (specCandidateUrls.length > 0) {
    const secondaryResponses = await Promise.all(
      specCandidateUrls.slice(0, 3).map((url) =>
        httpGet(url, {
          timeout,
          headers: { Accept: "application/json, application/yaml, */*" },
        }),
      ),
    );

    for (let i = 0; i < secondaryResponses.length; i++) {
      const response = secondaryResponses[i];
      if (!response.ok) continue;
      if (!isOpenApiResponse(response)) continue;

      const path = new URL(specCandidateUrls[i]).pathname;

      if (isJsonParseable(response.body)) {
        const info = extractJsonInfo(response.body);
        if (info) {
          return {
            check: {
              id,
              label,
              status: "pass",
              detail: `OpenAPI ${info.version} found with ${info.endpointCount} endpoints`,
              data: {
                version: info.version,
                specType: info.specType,
                endpointCount: info.endpointCount,
                path,
              },
            },
            detected: true,
            hasWebhooks: info.hasWebhooks,
            hasCallbacks: info.hasCallbacks,
          };
        }
      }

      const yamlInfo = extractYamlInfo(response.body);
      if (yamlInfo) {
        return {
          check: {
            id,
            label,
            status: "partial",
            detail: `OpenAPI ${yamlInfo.version} found (YAML format)`,
            data: {
              version: yamlInfo.version,
              specType: yamlInfo.specType,
              endpointCount: yamlInfo.endpointCount,
              path,
            },
          },
          detected: true,
          hasWebhooks: yamlInfo.hasWebhooks,
          hasCallbacks: yamlInfo.hasCallbacks,
        };
      }
    }
  }

  // Phase 4: Check spec-path responses for 401/403 (not bot_protected)
  for (let i = 0; i < specPathResponses.length; i++) {
    const response = specPathResponses[i];
    if (isProtectedResponse(response)) {
      return {
        check: {
          id,
          label,
          status: "partial",
          detail: "OpenAPI spec appears to exist but requires authentication",
          data: { protected: true, path: SPEC_PATHS[i] },
        },
        detected: true,
        hasWebhooks: false,
        hasCallbacks: false,
      };
    }
  }

  // Phase 5: No valid spec found at any path
  return {
    check: {
      id,
      label,
      status: "fail",
      detail: "No OpenAPI spec found",
    },
    detected: false,
    hasWebhooks: false,
    hasCallbacks: false,
  };
}
