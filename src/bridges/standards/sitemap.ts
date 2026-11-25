import { gunzipSync } from "node:zlib";
import type { Check } from "../../core/types.js";
import { httpGet, httpGetBytes } from "../../utils/http-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SitemapResult {
  check: Check;
  /** All discovered <loc> URLs from the sitemap */
  urls: string[];
  /** URLs matching API-relevant patterns (for OpenAPI candidate feeding) */
  apiRelevantUrls: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard sitemap paths to probe (includes .gz variants) */
const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap.xml.gz",
] as const;

/** Max body size for sitemap responses (1MB) */
const MAX_BODY_BYTES = 1_048_576;

/** Max decompressed size for .gz sitemaps (10MB) — bounds gzip-bomb expansion */
const MAX_DECOMPRESSED_BYTES = 10 * 1_048_576;

/** Max URLs to extract from a single sitemap */
const MAX_URLS_PER_SITEMAP = 1000;

/** Max child sitemaps to follow from a sitemap index */
const MAX_CHILD_SITEMAPS = 3;
const MAX_ROBOTS_SITEMAPS = 3;

/** Patterns that identify API-relevant URLs in sitemaps */
const API_URL_PATTERNS = [
  /\/openapi\.(?:json|yaml)$/i,
  /\/swagger\.(?:json|yaml)$/i,
  /\/api-docs(?:\/|$)/i,
  /\/graphql(?:\/|$)/i,
  /\/api\/v\d/i,
  /\/asyncapi\.(?:json|yaml)$/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract URLs from XML sitemap content via regex */
function extractLocs(xml: string, limit: number): string[] {
  const urls: string[] = [];
  const regex = /<loc>([^<]*)<\/loc>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null && urls.length < limit) {
    const url = match[1].trim().replace(/&amp;/g, "&");
    if (url) urls.push(url);
  }
  return urls;
}

function sitemapRoot(xml: string): string | undefined {
  // Skip XML declarations, stylesheet processing instructions and comments.
  const preamble = /\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->/y;
  let offset = 0;
  while (preamble.test(xml)) offset = preamble.lastIndex;
  const root = /<(urlset|sitemapindex)(?=[\s/>])/iy;
  root.lastIndex = offset;
  return root.exec(xml)?.[1].toLowerCase();
}

/** Filter URLs matching API-relevant patterns */
function filterApiRelevantUrls(urls: string[]): string[] {
  return urls.filter((url) =>
    API_URL_PATTERNS.some((pattern) => pattern.test(url)),
  );
}

/** Filter URLs to same origin only */
function filterSameOrigin(urls: string[], baseUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  return urls.filter((url) => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  });
}

/** Check if a URL points to a gzipped sitemap */
function isGzUrl(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith(".gz");
  } catch {
    return false;
  }
}

/**
 * Fetch a sitemap body, handling .gz decompression transparently.
 *
 * For .gz URLs: fetches raw bytes and decompresses with zlib.
 * For normal URLs: delegates to httpGet as before.
 */
async function fetchSitemapBody(
  url: string,
  timeout?: number,
): Promise<{ ok: true; body: string } | { ok: false; budgetExhausted?: boolean }> {
  if (!isGzUrl(url)) {
    const response = await httpGet(url, {
      timeout,
      maxBodyBytes: MAX_BODY_BYTES,
      headers: { Accept: "application/xml, text/xml, */*" },
    });
    if (!response.ok) return { ok: false, budgetExhausted: response.error.kind === "request_budget_exhausted" };
    return { ok: true, body: response.body };
  }

  // Binary responses use the same SSRF, redirect, timeout, and budget controls.
  try {
    const response = await httpGetBytes(url, {
      timeout,
      maxBodyBytes: MAX_BODY_BYTES,
      headers: { Accept: "application/xml, application/gzip, */*", "Accept-Encoding": "identity" },
    });
    if (!response.ok) return { ok: false, budgetExhausted: response.error.kind === "request_budget_exhausted" };

    // maxOutputLength makes zlib throw before allocating a decompression
    // bomb (a 1 MiB gzip body can otherwise expand ~1000x in memory).
    // Fetch already decodes HTTP Content-Encoding. A server may serve either a
    // gzip file or XML with that content encoding at the same .gz URL.
    if (response.headers["content-encoding"]?.toLowerCase().includes("gzip") &&
        !(response.body[0] === 0x1f && response.body[1] === 0x8b)) {
      return { ok: true, body: new TextDecoder().decode(response.body) };
    }
    const decompressed = gunzipSync(response.body, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
    return { ok: true, body: decompressed.toString("utf-8") };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe for XML sitemaps at standard paths and from robots.txt Sitemap directives.
 *
 * Detection strategy:
 * 1. Probe /sitemap.xml and /sitemap_index.xml
 * 2. Probe any sitemap URLs found in robots.txt (passed via robotsSitemapUrls)
 * 3. If a sitemap index is found, follow up to 3 child sitemaps
 * 4. Extract all URLs and filter API-relevant ones
 *
 * Returns discovered URLs for downstream use (OpenAPI candidate feeding).
 */
export async function checkSitemap(
  baseUrl: string,
  robotsSitemapUrls: string[],
  timeout?: number,
): Promise<SitemapResult> {
  const id = "sitemap";
  const label = "XML Sitemap";

  // Deduplicate probe URLs: standard paths + robots.txt sitemaps
  const probeUrls = new Set<string>();
  for (const path of SITEMAP_PATHS) {
    probeUrls.add(new URL(path, baseUrl).href);
  }
  const origin = new URL(baseUrl).origin;
  for (const url of robotsSitemapUrls) {
    try {
      const parsed = new URL(url);
      if (parsed.origin === origin) {
        probeUrls.add(parsed.href);
        if (probeUrls.size >= SITEMAP_PATHS.length + MAX_ROBOTS_SITEMAPS) break;
      }
    } catch {
      // Skip invalid URLs
    }
  }

  // Probe all sitemap URLs in parallel
  const probeUrlArray = [...probeUrls];
  const responses = await Promise.all(
    probeUrlArray.map((url) => fetchSitemapBody(url, timeout)),
  );

  let allUrls: string[] = [];
  const sitemapPaths: string[] = [];
  let isIndex = false;
  let childTotal = 0;
  let childFailed = 0;
  let hitUrlLimit = false;
  let budgetExhausted = false;

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    if (!response.ok) { budgetExhausted ||= response.budgetExhausted === true; continue; }

    const root = sitemapRoot(response.body);
    if (!root) continue;

    const probePath = new URL(probeUrlArray[i]).pathname;
    sitemapPaths.push(probePath);

    if (root === "sitemapindex") {
      isIndex = true;
      // Sitemap index — follow child sitemaps
      const childUrls = filterSameOrigin(
        extractLocs(response.body, MAX_CHILD_SITEMAPS),
        baseUrl,
      );

      childTotal += childUrls.length;

      if (childUrls.length > 0) {
        const childResponses = await Promise.all(
          childUrls.map((url) => fetchSitemapBody(url, timeout)),
        );

        for (const childResponse of childResponses) {
          if (!childResponse.ok) {
            budgetExhausted ||= childResponse.budgetExhausted === true;
            childFailed++;
            continue;
          }
          if (sitemapRoot(childResponse.body) !== "urlset") {
            childFailed++;
            continue;
          }
          const childLocs = extractLocs(
            childResponse.body,
            MAX_URLS_PER_SITEMAP,
          );
          if (childLocs.length >= MAX_URLS_PER_SITEMAP) hitUrlLimit = true;
          allUrls.push(...childLocs);
        }
      }
    } else {
      // Regular sitemap
      const locs = extractLocs(response.body, MAX_URLS_PER_SITEMAP);
      if (locs.length >= MAX_URLS_PER_SITEMAP) hitUrlLimit = true;
      allUrls.push(...locs);
    }
  }

  // Deduplicate and filter to same-origin
  allUrls = [...new Set(filterSameOrigin(allUrls, baseUrl))];

  const apiRelevantUrls = filterApiRelevantUrls(allUrls);

  if (sitemapPaths.length === 0) {
    return {
      check: { id, label, status: budgetExhausted ? "error" : "fail", detail: budgetExhausted ? "Sitemap probe skipped: scan request budget exhausted" : "No XML sitemap found" },
      urls: [],
      apiRelevantUrls: [],
    };
  }

  if (allUrls.length === 0) {
    let detail: string;
    if (isIndex && childTotal > 0 && childFailed > 0) {
      detail = `Sitemap index found at ${sitemapPaths.join(", ")} with ${childTotal} child sitemap(s), but ${childFailed === childTotal ? "all" : `${childFailed}/${childTotal}`} failed to fetch`;
    } else if (isIndex && childTotal === 0) {
      detail = `Sitemap index found at ${sitemapPaths.join(", ")} but references no child sitemaps`;
    } else {
      detail = `Sitemap found at ${sitemapPaths.join(", ")} but contains no URLs`;
    }
    return {
      check: { id, label, status: "partial", detail },
      urls: [],
      apiRelevantUrls: [],
    };
  }

  const apiNote =
    apiRelevantUrls.length > 0
      ? `, ${apiRelevantUrls.length} API-relevant`
      : "";

  return {
    check: {
      id,
      label,
      status: "pass",
      detail: `Sitemap found with ${allUrls.length}${hitUrlLimit ? "+" : ""} URLs${apiNote}`,
      data: { totalUrls: allUrls.length, apiRelevantUrls, sitemapPaths },
    },
    urls: allUrls,
    apiRelevantUrls,
  };
}
