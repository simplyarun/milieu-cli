import type { Check, HttpSuccess } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenApiResult {
  check: Check;
  detected: boolean;
}

interface OpenApiInfo {
  version: string;
  specType: "openapi" | "swagger";
  endpointCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 9 common paths where OpenAPI / Swagger specs are served */
const OPENAPI_PATHS = [
  "/openapi.json",
  "/swagger.json",
  "/api-docs",
  "/v3/api-docs",
  "/v2/api-docs",
  "/swagger/v1/swagger.json",
  "/api/openapi.json",
  "/api/swagger.json",
  "/.well-known/openapi.json",
] as const;

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
    return { version, specType, endpointCount };
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
  return {
    version: versionMatch[2],
    specType: versionMatch[1] as "openapi" | "swagger",
    endpointCount: pathMatches?.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe 9 common OpenAPI / Swagger spec paths in parallel.
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

  // Fire all 9 probes in parallel
  const responses = await Promise.all(
    OPENAPI_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, {
        timeout,
        headers: { Accept: "application/json, text/plain, */*" },
      }),
    ),
  );

  // Find first valid hit
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    if (!response.ok) continue;
    if (!isOpenApiResponse(response)) continue;

    const path = OPENAPI_PATHS[i];

    // Determine if we can extract structured info (JSON) or fall back to regex (YAML)
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
        };
      }
    }

    // YAML or unparseable JSON -- extract via regex
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
      };
    }
  }

  // No valid spec found at any path
  return {
    check: {
      id,
      label,
      status: "fail",
      detail: "No OpenAPI spec found",
    },
    detected: false,
  };
}
