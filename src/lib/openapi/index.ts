import { DEFAULTS } from "./constants.js";
import { probePrimaryDomain, probeSubdomains, emptyResult } from "./probe.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenAPIResult {
  exists: boolean;
  url: string | null;
  version: "3.0" | "3.1" | "2.0" | null;
  endpointCount: number;
  operationCount: number;
  hasDescriptions: boolean;
  descriptionCoverage: number;
  hasAuthSchemes: boolean;
  authSchemeTypes: string[];
  authSchemeNames: string[];
  hasGlobalSecurity: boolean;
  governanceReady: boolean;
  durationMs: number;
  error: string | null;
  /** The raw parsed spec object, for use by Bridge 4/5. Not serialized to JSON output. */
  spec: unknown | null;
}

export interface OpenAPICheckOptions {
  /** Per-probe timeout. Default: 3000 */
  timeoutMs?: number;
  /** Total budget. Default: 15000 */
  totalTimeoutMs?: number;
  /** Max download size. Default: 2097152 (2MB) */
  maxSpecBytes?: number;
  /** Default: "milieu-cli/scanner" */
  userAgent?: string;
  /** Default: 2 */
  maxRedirects?: number;
}

// ---------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------

function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string") return false;
  const trimmed = domain.trim();
  if (trimmed.length === 0) return false;
  // Basic domain pattern check
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(
    trimmed,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover and parse an OpenAPI / Swagger spec for the given domain.
 *
 * Probes primary domain paths sequentially, then subdomain paths in parallel.
 * Stops at first valid spec found.
 *
 * **Never throws.** All failures map to return values.
 */
export async function checkOpenAPI(
  domain: string,
  options?: OpenAPICheckOptions,
): Promise<OpenAPIResult> {
  const start = performance.now();

  // Validate domain
  if (!isValidDomain(domain)) {
    return emptyResult(
      Math.round(performance.now() - start),
      `Invalid domain: ${domain}`,
    );
  }

  const opts = {
    timeoutMs: options?.timeoutMs ?? DEFAULTS.timeoutMs,
    totalTimeoutMs: options?.totalTimeoutMs ?? DEFAULTS.totalTimeoutMs,
    maxSpecBytes: options?.maxSpecBytes ?? DEFAULTS.maxSpecBytes,
    userAgent: options?.userAgent ?? DEFAULTS.userAgent,
    maxRedirects: options?.maxRedirects ?? DEFAULTS.maxRedirects,
  };

  // Total timeout via AbortController
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), opts.totalTimeoutMs);

  try {
    // Phase 1: Primary domain (sequential)
    const primaryResult = await probePrimaryDomain(
      domain,
      opts,
      controller.signal,
    );
    if (primaryResult) return primaryResult;

    if (controller.signal.aborted) {
      return emptyResult(
        Math.round(performance.now() - start),
        `All probes timed out within ${opts.totalTimeoutMs}ms`,
      );
    }

    // Phase 2: Subdomains (parallel)
    const subdomainResult = await probeSubdomains(
      domain,
      opts,
      controller.signal,
    );
    if (subdomainResult) return subdomainResult;

    if (controller.signal.aborted) {
      return emptyResult(
        Math.round(performance.now() - start),
        `All probes timed out within ${opts.totalTimeoutMs}ms`,
      );
    }

    // Nothing found
    return emptyResult(Math.round(performance.now() - start));
  } catch {
    // Defensive: catch unexpected errors
    return emptyResult(Math.round(performance.now() - start));
  } finally {
    clearTimeout(totalTimer);
  }
}
