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
  /** Full parsed spec object when JSON spec found. For Bridge 4/5 consumption. */
  parsedSpec: unknown | null;
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

function validVersion(specType: string, version: unknown): version is string {
  if (specType === "swagger") return version === "2.0";
  return typeof version === "string" && /^3\.\d+\.\d+(?:-[\w.-]+)?$/.test(version);
}

/** Parse a JSON spec once for detection and the downstream schema checks. */
function extractJsonInfo(body: string): (OpenApiInfo & { parsedSpec: unknown }) | null {
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const specType = "openapi" in parsed ? "openapi" : "swagger";
    const version = parsed[specType];
    if (!validVersion(specType, version)) return null;
    if (parsed.paths !== undefined && (!parsed.paths || typeof parsed.paths !== "object" || Array.isArray(parsed.paths))) return null;
    const endpointCount = Object.keys(parsed.paths ?? {}).filter(path => path.startsWith("/")).length;

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

    return { version, specType, endpointCount, hasWebhooks, hasCallbacks, parsedSpec: parsed };
  } catch {
    return null;
  }
}

/** Extract version, spec type, and endpoint count from YAML via regex */
function extractYamlInfo(body: string): OpenApiInfo | null {
  const versionMatch = body.match(
    /^(openapi|swagger):[ \t]*["']?([\w.-]+)["']?[ \t]*(?:#.*)?\r?$/m,
  );
  if (!versionMatch || !validVersion(versionMatch[1], versionMatch[2])) return null;

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

function detectSpec(response: HttpSuccess, path: string): OpenApiResult | null {
  const ct = mediaType(response.headers);
  if (HTML_TYPES.has(ct)) return null;
  const json = response.body.trimStart().startsWith("{");
  const info = json ? extractJsonInfo(response.body) : YAML_TYPES.has(ct) ? extractYamlInfo(response.body) : null;
  if (!info) return null;
  const { version, specType, endpointCount, hasWebhooks, hasCallbacks } = info;
  return {
    check: {
      id: "openapi_spec", label: "OpenAPI Spec", status: json ? "pass" : "partial",
      detail: json ? `OpenAPI ${version} found with ${endpointCount} endpoints` : `OpenAPI ${version} found (YAML format)`,
      data: { version, specType, endpointCount, path },
    },
    detected: true, hasWebhooks, hasCallbacks,
    parsedSpec: "parsedSpec" in info ? info.parsedSpec : null,
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

const SCRIPT_URL_PATTERNS = [/<script[^<>]+src=["']([^"']*swagger[^"']*\.js)["']/gi];
const MAX_CANDIDATES = 3;

/** Keep only same-origin candidates that might actually be fetched. */
function collectCandidates(
  body: string, pageUrl: string, patterns: RegExp[], candidates: Set<string>, excluded?: Set<string>,
): void {
  if (candidates.size >= MAX_CANDIDATES) return;
  const origin = new URL(pageUrl).origin;
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      const url = URL.parse(match[1], pageUrl);
      if (url?.origin !== origin || url.username || url.password || excluded?.has(url.href)) continue;
      candidates.add(url.href);
      if (candidates.size >= MAX_CANDIDATES) return;
    }
  }
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
// APIs.guru Registry Lookup
// ---------------------------------------------------------------------------

/**
 * Look up the domain in the APIs.guru public registry.
 *
 * Uses the lightweight provider endpoint (~550 bytes compressed).
 * Returns the swaggerUrl for the preferred API version, or null if not found.
 *
 * This catches companies like Stripe that publish their OpenAPI spec on GitHub
 * rather than self-hosting it at a standard path on their own domain.
 */
async function lookupApisGuru(
  domain: string,
  timeout?: number,
): Promise<{ specUrl: string | null; budgetDenied: boolean }> {
  const result = await httpGet(`https://api.apis.guru/v2/${domain}.json`, {
    timeout,
    headers: { Accept: "application/json" },
  });
  if (!result.ok) {
    return { specUrl: null, budgetDenied: result.error.kind === "request_budget_exhausted" };
  }

  try {
    const parsed = JSON.parse(result.body);
    const apis = parsed?.apis;
    if (!apis || typeof apis !== "object") return { specUrl: null, budgetDenied: false };

    // Take the first API entry (most providers have exactly one)
    const firstApi = Object.values(apis)[0] as Record<string, unknown> | null;
    if (!firstApi) return { specUrl: null, budgetDenied: false };

    return {
      specUrl:
        (firstApi.swaggerUrl as string | undefined) ??
        (firstApi.swaggerYamlUrl as string | undefined) ??
        null,
      budgetDenied: false,
    };
  } catch {
    return { specUrl: null, budgetDenied: false };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe 24 common OpenAPI / Swagger spec and doc-UI paths in parallel, then try
 * extracting spec URLs from HTML doc pages, and finally detect protected specs.
 *
 * Optionally accepts sitemap-discovered API URLs as additional candidates
 * to probe in Phase 3b (secondary validation).
 *
 * Returns a Check with id "openapi_spec" and a boolean indicating whether
 * any valid spec was detected (for ctx.shared.openApiDetected).
 */
export async function checkOpenApi(
  baseUrl: string,
  timeout?: number,
  sitemapCandidateUrls: string[] = [],
): Promise<OpenApiResult> {
  const id = "openapi_spec";
  const label = "OpenAPI Spec";

  // Phase 1: Fire all 24 probes in parallel (17 spec paths + 7 doc UI paths)
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

  // Track budget denials across EVERY fetch wave (primary probes, script
  // fetches, secondary candidates, registry lookup) — a denied probe is not
  // evidence the spec is absent.
  let budgetDenied = responses.some((r) => !r.ok && r.error.kind === "request_budget_exhausted");

  // Phase 2: Check spec-path responses for direct spec hits
  for (let i = 0; i < specPathResponses.length; i++) {
    const response = specPathResponses[i];
    if (!response.ok) continue;
    const result = detectSpec(response, SPEC_PATHS[i]);
    if (result) return result;
  }

  // Phase 3: Check doc-UI-path responses for HTML with extractable spec URLs
  const origin = new URL(baseUrl).origin;
  const allProbedUrls = new Set(ALL_PATHS.map((p) => new URL(p, baseUrl).href));
  const specCandidates = new Set<string>();
  const scriptCandidates = new Set<string>();

  for (let i = 0; i < docUiResponses.length; i++) {
    const response = docUiResponses[i];
    if (!response.ok) continue;

    const ct = mediaType(response.headers);
    if (!HTML_TYPES.has(ct)) continue;

    const pageUrl = new URL(DOC_UI_PATHS[i], baseUrl).href;

    // Extract spec URLs directly from HTML
    collectCandidates(response.body, pageUrl, SPEC_URL_PATTERNS, specCandidates, allProbedUrls);
    if (!specCandidates.size) collectCandidates(response.body, pageUrl, SCRIPT_URL_PATTERNS, scriptCandidates);
  }

  // Phase 3a: Fetch external Swagger UI config scripts and extract spec URLs from them
  if (!specCandidates.size && scriptCandidates.size) {
    const scriptUrls = [...scriptCandidates];
    const scriptResponses = await Promise.all(
      scriptUrls.map((url) =>
        httpGet(url, {
          timeout,
          headers: { Accept: "*/*" },
        }),
      ),
    );
    budgetDenied ||= scriptResponses.some((r) => !r.ok && r.error.kind === "request_budget_exhausted");

    for (let i = 0; i < scriptResponses.length; i++) {
      const response = scriptResponses[i];
      if (!response.ok) continue;

      collectCandidates(response.body, scriptUrls[i], SPEC_URL_PATTERNS, specCandidates, allProbedUrls);
    }
  }

  for (const candidate of sitemapCandidateUrls) {
    if (specCandidates.size >= MAX_CANDIDATES) break;
    const url = URL.parse(candidate);
    if (url?.origin === origin && !url.username && !url.password && !allProbedUrls.has(url.href)) specCandidates.add(url.href);
  }

  // Phase 3b: Fetch candidate spec URLs and validate
  if (specCandidates.size) {
    const specCandidateUrls = [...specCandidates];
    const secondaryResponses = await Promise.all(
      specCandidateUrls.map((url) =>
        httpGet(url, {
          timeout,
          headers: { Accept: "application/json, application/yaml, */*" },
        }),
      ),
    );
    budgetDenied ||= secondaryResponses.some((r) => !r.ok && r.error.kind === "request_budget_exhausted");

    for (let i = 0; i < secondaryResponses.length; i++) {
      const response = secondaryResponses[i];
      if (!response.ok) continue;
      const result = detectSpec(response, new URL(specCandidateUrls[i]).pathname);
      if (result) return result;
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
        parsedSpec: null,
      };
    }
  }

  // Phase 5: APIs.guru public registry lookup
  // Catches companies like Stripe that publish specs on GitHub rather than
  // self-hosting at a standard path on their own domain.
  const domain = new URL(baseUrl).hostname;
  const registry = await lookupApisGuru(domain, timeout);
  budgetDenied ||= registry.budgetDenied;
  if (registry.specUrl) {
    return {
      check: {
        id,
        label,
        status: "partial",
        detail: "OpenAPI spec found via APIs.guru registry (not self-hosted on domain)",
        data: { specUrl: registry.specUrl, registry: "apis.guru" },
        why: "The spec exists but isn't directly discoverable from your domain — AI agents navigating your site won't find it without going through an external registry.",
      },
      detected: true,
      hasWebhooks: false,
      hasCallbacks: false,
      parsedSpec: null,
    };
  }

  // Phase 6: Budget starvation is not evidence of absence — probes that
  // never ran cannot prove the spec is missing.
  if (budgetDenied) {
    return {
      check: {
        id,
        label,
        status: "error",
        detail: "OpenAPI discovery incomplete: scan request budget exhausted",
      },
      detected: false,
      hasWebhooks: false,
      hasCallbacks: false,
      parsedSpec: null,
    };
  }

  // Phase 7: No valid spec found at any path
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
    parsedSpec: null,
  };
}
