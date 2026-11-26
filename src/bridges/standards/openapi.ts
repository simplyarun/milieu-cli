import { load as loadYaml, CORE_SCHEMA } from "js-yaml";
import type { Check, HttpResponse, HttpSuccess } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";
import { collectOperations, type ParsedOpenApiSpec } from "../schema/oas-types.js";

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
  /** Full parsed spec object when a JSON or YAML spec was read. For Bridge 4/5 consumption. */
  parsedSpec: unknown | null;
  /** Query-free URLs actually visited on the way to the parsed document. */
  verifiedDocumentUrls?: string[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function partialBody(response: HttpSuccess): boolean {
  return response.bodyIncomplete === true || response.status === 206 || response.headers["content-range"] !== undefined;
}

/** Count shared subtrees on every visit to bound the cost of downstream checks. */
function parseYamlSpec(body: string): unknown {
  const maxDepth = 100;
  const spec = loadYaml(body, { schema: CORE_SCHEMA, maxDepth, maxAliases: 64 });
  if (!body.includes("*")) return spec;
  let remainingNodes = 100_000;
  function withinLimits(value: unknown, depth: number): boolean {
    if (--remainingNodes < 0 || depth > maxDepth) return false;
    if (value === null || typeof value !== "object") return true;
    const container = value as Record<string, unknown>;
    for (const key in container) {
      if (!withinLimits(container[key], depth + 1)) return false;
    }
    return true;
  }
  return withinLimits(spec, 0) ? spec : null;
}

function detectSpec(response: HttpSuccess, path: string): OpenApiResult | null {
  const ct = mediaType(response.headers);
  if (partialBody(response) || HTML_TYPES.has(ct)) return null;
  const yaml = YAML_TYPES.has(ct) || ct.endsWith("+yaml") || /\.ya?ml$/i.test(path);
  if (!yaml && !response.body.trimStart().startsWith("{")) return null;
  let spec: unknown;
  try {
    // The HTTP client caps response size before either parser runs.
    spec = yaml ? parseYamlSpec(response.body) : JSON.parse(response.body);
  } catch {
    return null;
  }

  if (!isRecord(spec)) return null;
  const specType = "openapi" in spec ? "openapi" : "swagger";
  const version = spec[specType];
  if (!validVersion(specType, version)) return null;
  if (spec.paths !== undefined && !isRecord(spec.paths)) return null;

  const document = new URL(response.url);
  const chain = [...response.redirects, response.url].map(raw => new URL(raw));
  const safeIdentity = (u: URL) => ["https:", "http:"].includes(u.protocol) && !u.username && !u.password && !u.search;
  const verifiedDocumentUrls = (chain.every(safeIdentity) ? chain : [document].filter(safeIdentity))
    .map(u => u.origin + u.pathname);
  const paths = spec.paths ?? {};
  const endpointCount = Object.keys(paths).filter(path => path.startsWith("/")).length;
  const hasWebhooks = isRecord(spec.webhooks) && Object.keys(spec.webhooks).length > 0;
  const hasCallbacks = specType === "openapi" && collectOperations(spec as ParsedOpenApiSpec).some(([, , op]) =>
    "callbacks" in op && isRecord(op.callbacks) && Object.keys(op.callbacks).length > 0);

  return {
    check: {
      id: "openapi_spec", label: "OpenAPI Spec", status: "pass",
      detail: `OpenAPI ${version} found with ${endpointCount} endpoints`,
      data: {
        version, specType, endpointCount, path,
        documentUrl: document.origin + document.pathname,
        ...(document.search ? { documentHasQuery: true } : {}),
      },
    },
    detected: true, hasWebhooks, hasCallbacks, parsedSpec: spec, verifiedDocumentUrls,
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
      if (url?.origin !== origin || url.username || url.password) continue;
      url.hash = "";
      if (excluded?.has(url.href)) continue;
      candidates.add(url.href);
      if (candidates.size >= MAX_CANDIDATES) return;
    }
  }
}

/** Read only machine-description targets from an RFC 9727 JSON Linkset. */
function catalogCandidates(response: HttpSuccess, excluded: Set<string>): string[] {
  if (mediaType(response.headers) !== "application/linkset+json") return [];
  let catalog: unknown;
  try {
    catalog = JSON.parse(response.body);
  } catch {
    return [];
  }
  if (!isRecord(catalog) || !Array.isArray(catalog.linkset)) return [];

  const catalogUrl = new URL(response.url);
  const candidates = new Set<string>();
  for (const context of catalog.linkset) {
    if (!isRecord(context) || !Array.isArray(context["service-desc"])) continue;
    for (const link of context["service-desc"]) {
      if (!isRecord(link) || typeof link.href !== "string" || !link.href.trim()) continue;
      if (link.type !== undefined) {
        if (typeof link.type !== "string") continue;
        const type = link.type.split(";")[0].trim().toLowerCase();
        if (type !== "application/json" && !YAML_TYPES.has(type) && !/\+(json|yaml)$/.test(type)) continue;
      }
      const url = URL.parse(link.href, response.url);
      if (!url || url.protocol !== catalogUrl.protocol || url.origin !== catalogUrl.origin || url.username || url.password) continue;
      url.hash = "";
      if (excluded.has(url.href)) continue;
      candidates.add(url.href);
      if (candidates.size >= MAX_CANDIDATES) return [...candidates];
    }
  }
  return [...candidates];
}

async function probeSpecCandidates(get: typeof httpGet, urls: string[], timeout?: number, catalogUrl?: string) {
  const responses = await Promise.all(urls.map(url =>
    get(url, {
      timeout,
      ...(catalogUrl ? { maxRedirects: 0 } : {}),
      headers: { Accept: "application/json, application/yaml, */*" },
    }),
  ));
  for (const [i, response] of responses.entries()) {
    if (!response.ok) continue;
    const spec = detectSpec(response, new URL(urls[i]).pathname);
    if (spec) {
      if (catalogUrl) {
        const catalog = new URL(catalogUrl);
        const published = new URL(urls[i]);
        const target = published.origin + published.pathname;
        const safe = !catalog.search && !catalog.username && !catalog.password &&
          !published.search && !published.username && !published.password && spec.verifiedDocumentUrls?.includes(target);
        spec.check.data = { ...spec.check.data, source: "api-catalog",
          ...(safe ? { catalogRoute: { source: catalog.origin + catalog.pathname, target } } : {}) };
      }
      return spec;
    }
  }
  return null;
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
  get: typeof httpGet,
  domain: string,
  timeout?: number,
): Promise<string | null> {
  const result = await get(`https://api.apis.guru/v2/${domain}.json`, {
    timeout,
    headers: { Accept: "application/json" },
  });
  if (!result.ok || partialBody(result)) return null;

  try {
    const parsed = JSON.parse(result.body);
    const apis = parsed?.apis;
    if (!apis || typeof apis !== "object") return null;

    // Take the first API entry (most providers have exactly one)
    const firstApi = Object.values(apis)[0] as Record<string, unknown> | null;
    if (!firstApi) return null;

    const specUrl = firstApi.swaggerUrl ?? firstApi.swaggerYamlUrl;
    return typeof specUrl === "string" ? specUrl : null;
  } catch {
    return null;
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

  // Every discovery wave contributes to coverage. A timeout, blocked fetch,
  // server failure or truncated body cannot establish a missing contract.
  let budgetDenied = false;
  let unavailable = false;
  const get: typeof httpGet = async (url, options) => {
    const response = await httpGet(url, options);
    if (response.ok) unavailable ||= partialBody(response);
    else if (response.error.kind === "request_budget_exhausted") budgetDenied = true;
    else {
      const status = response.error.statusCode;
      unavailable ||= response.error.kind !== "http_error" || !status ||
        status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
    }
    return response;
  };

  // Phase 1: Fire all 24 probes in parallel (17 spec paths + 7 doc UI paths)
  const responses = await Promise.all([
    ...SPEC_PATHS.map((path) =>
      get(new URL(path, baseUrl).href, {
        timeout,
        headers: { Accept: "application/json, application/yaml, */*" },
      }),
    ),
    ...DOC_UI_PATHS.map((path) =>
      get(new URL(path, baseUrl).href, {
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
        get(url, {
          timeout,
          headers: { Accept: "*/*" },
        }),
      ),
    );

    for (let i = 0; i < scriptResponses.length; i++) {
      const response = scriptResponses[i];
      if (!response.ok) continue;

      collectCandidates(response.body, scriptUrls[i], SPEC_URL_PATTERNS, specCandidates, allProbedUrls);
    }
  }

  for (const candidate of sitemapCandidateUrls) {
    if (specCandidates.size >= MAX_CANDIDATES) break;
    const url = URL.parse(candidate);
    if (url?.origin !== origin || url.username || url.password) continue;
    url.hash = "";
    if (!allProbedUrls.has(url.href)) specCandidates.add(url.href);
  }

  // Phase 3b: Fetch candidate spec URLs and validate
  const secondary = await probeSpecCandidates(get, [...specCandidates], timeout);
  if (secondary) return secondary;

  // A catalog is a pointer, so only a validated document can earn credit.
  const catalogUrl = new URL("/.well-known/api-catalog", origin).href;
  const catalog = await get(catalogUrl, {
    timeout, maxRedirects: 0, headers: { Accept: "application/linkset+json" },
  });
  if (catalog.ok) {
    const excluded = new Set([...allProbedUrls, ...scriptCandidates, ...specCandidates, catalogUrl]);
    const discovered = await probeSpecCandidates(get, catalogCandidates(catalog, excluded), timeout, catalog.url);
    if (discovered) return discovered;
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
  const specUrl = await lookupApisGuru(get, domain, timeout);
  if (specUrl) {
    return {
      check: {
        id,
        label,
        status: "partial",
        detail: "OpenAPI spec found via APIs.guru registry (not self-hosted on domain)",
        data: { specUrl, registry: "apis.guru" },
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
  if (budgetDenied || unavailable) {
    return {
      check: {
        id,
        label,
        status: "error",
        detail: budgetDenied ? "OpenAPI discovery incomplete: scan request budget exhausted"
          : "OpenAPI discovery incomplete: one or more sources could not be fully read",
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
