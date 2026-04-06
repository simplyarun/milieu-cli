import { httpGet } from "../../utils/http-client.js";
import {
  PRIMARY_PATHS,
  SUBDOMAIN_PREFIXES,
  DEFAULTS,
  JSON_CONTENT_TYPES,
  YAML_CONTENT_TYPES,
} from "./constants.js";
import { parseSpec } from "./parse.js";
import type { OpenAPIResult, OpenAPICheckOptions } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mediaType(headers: Record<string, string>): string {
  return (headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
}

function isSpecContentType(ct: string): boolean {
  return JSON_CONTENT_TYPES.has(ct) || YAML_CONTENT_TYPES.has(ct);
}

/**
 * Build a successful OpenAPIResult from a parsed spec.
 */
function buildResult(
  url: string,
  parsed: NonNullable<ReturnType<typeof parseSpec>>,
  durationMs: number,
  error: string | null = null,
): OpenAPIResult {
  return {
    exists: true,
    url,
    version: parsed.version,
    endpointCount: parsed.endpointCount,
    operationCount: parsed.operationCount,
    hasDescriptions: parsed.hasDescriptions,
    descriptionCoverage: parsed.descriptionCoverage,
    hasAuthSchemes: parsed.hasAuthSchemes,
    authSchemeTypes: parsed.authSchemeTypes,
    authSchemeNames: parsed.authSchemeNames,
    hasGlobalSecurity: parsed.hasGlobalSecurity,
    governanceReady: parsed.governanceReady,
    durationMs,
    error,
    spec: parsed.spec,
  };
}

function emptyResult(
  durationMs: number,
  error: string | null = null,
): OpenAPIResult {
  return {
    exists: false,
    url: null,
    version: null,
    endpointCount: 0,
    operationCount: 0,
    hasDescriptions: false,
    descriptionCoverage: 0,
    hasAuthSchemes: false,
    authSchemeTypes: [],
    authSchemeNames: [],
    hasGlobalSecurity: false,
    governanceReady: false,
    durationMs,
    error,
    spec: null,
  };
}

// ---------------------------------------------------------------------------
// Single path probe (HEAD then GET)
// ---------------------------------------------------------------------------

/**
 * Probe a single URL for an OpenAPI spec.
 * HEAD first. If 200 with JSON/YAML content-type, follow with GET.
 * HEAD returns 405 → fall back to GET directly.
 * HEAD returns anything else → return null (skip).
 */
async function probePath(
  url: string,
  opts: Required<OpenAPICheckOptions>,
  signal: AbortSignal,
): Promise<{ url: string; body: string } | null> {
  if (signal.aborted) return null;

  // HEAD request
  const headResult = await httpGet(url, {
    method: "HEAD",
    timeout: opts.timeoutMs,
    maxRedirects: opts.maxRedirects,
    headers: {
      "User-Agent": opts.userAgent,
      Accept: "application/json, application/yaml, */*",
    },
  });

  if (signal.aborted) return null;

  let shouldGet = false;

  if (headResult.ok) {
    const ct = mediaType(headResult.headers);
    if (headResult.status === 200 && isSpecContentType(ct)) {
      shouldGet = true;
    } else if (headResult.status === 200) {
      // 200 but unknown content type — try GET anyway (some servers don't set CT on HEAD)
      shouldGet = true;
    }
  } else if (
    headResult.error.kind === "http_error" &&
    headResult.error.statusCode === 405
  ) {
    // Method not allowed — fall back to GET
    shouldGet = true;
  } else {
    // 404, DNS failure, timeout, etc. — skip
    return null;
  }

  if (!shouldGet) return null;
  if (signal.aborted) return null;

  // GET request
  const getResult = await httpGet(url, {
    method: "GET",
    timeout: opts.timeoutMs,
    maxRedirects: opts.maxRedirects,
    maxBodyBytes: opts.maxSpecBytes,
    headers: {
      "User-Agent": opts.userAgent,
      Accept: "application/json, application/yaml, */*",
    },
  });

  if (!getResult.ok) return null;

  return { url: getResult.url, body: getResult.body };
}

// ---------------------------------------------------------------------------
// Primary domain probing (sequential)
// ---------------------------------------------------------------------------

export async function probePrimaryDomain(
  domain: string,
  opts: Required<OpenAPICheckOptions>,
  signal: AbortSignal,
): Promise<OpenAPIResult | null> {
  const start = performance.now();

  for (const path of PRIMARY_PATHS) {
    if (signal.aborted) break;

    const url = `https://${domain}${path}`;
    const hit = await probePath(url, opts, signal);
    if (!hit) continue;

    // Validate: parseable AND has openapi/swagger key
    const parsed = parseSpec(hit.body);
    if (!parsed) continue;

    const truncated = hit.body.length >= opts.maxSpecBytes;
    const error = truncated
      ? `Spec truncated at ${opts.maxSpecBytes} bytes; results may be partial`
      : null;

    return buildResult(
      hit.url,
      parsed,
      Math.round(performance.now() - start),
      error,
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Subdomain probing (parallel across subdomains, sequential within)
// ---------------------------------------------------------------------------

async function probeSubdomain(
  subdomain: string,
  domain: string,
  opts: Required<OpenAPICheckOptions>,
  signal: AbortSignal,
): Promise<OpenAPIResult | null> {
  const start = performance.now();
  const host = `${subdomain}.${domain}`;

  for (const path of PRIMARY_PATHS) {
    if (signal.aborted) break;

    const url = `https://${host}${path}`;
    const hit = await probePath(url, opts, signal);
    if (!hit) continue;

    const parsed = parseSpec(hit.body);
    if (!parsed) continue;

    const truncated = hit.body.length >= opts.maxSpecBytes;
    const error = truncated
      ? `Spec truncated at ${opts.maxSpecBytes} bytes; results may be partial`
      : null;

    return buildResult(
      hit.url,
      parsed,
      Math.round(performance.now() - start),
      error,
    );
  }

  return null;
}

export async function probeSubdomains(
  domain: string,
  opts: Required<OpenAPICheckOptions>,
  signal: AbortSignal,
): Promise<OpenAPIResult | null> {
  // Run all subdomains in parallel (max 4 concurrent)
  const results = await Promise.all(
    SUBDOMAIN_PREFIXES.map((prefix) =>
      probeSubdomain(prefix, domain, opts, signal),
    ),
  );

  // Return first non-null result
  return results.find((r) => r !== null) ?? null;
}

export { emptyResult, buildResult };
