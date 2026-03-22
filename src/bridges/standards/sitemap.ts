import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

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

/** Standard sitemap paths to probe */
const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml"] as const;

/** Max body size for sitemap responses (1MB) */
const MAX_BODY_BYTES = 1_048_576;

/** Max URLs to extract from a single sitemap */
const MAX_URLS_PER_SITEMAP = 1000;

/** Max child sitemaps to follow from a sitemap index */
const MAX_CHILD_SITEMAPS = 3;

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
  const regex = /<loc>\s*(.*?)\s*<\/loc>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null && urls.length < limit) {
    const url = match[1].trim();
    if (url) urls.push(url);
  }
  return urls;
}

/** Check if XML content is a sitemap index */
function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
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
  for (const url of robotsSitemapUrls) {
    try {
      const parsed = new URL(url);
      if (parsed.origin === new URL(baseUrl).origin) {
        probeUrls.add(parsed.href);
      }
    } catch {
      // Skip invalid URLs
    }
  }

  // Probe all sitemap URLs in parallel
  const responses = await Promise.all(
    [...probeUrls].map((url) =>
      httpGet(url, {
        timeout,
        maxBodyBytes: MAX_BODY_BYTES,
        headers: { Accept: "application/xml, text/xml, */*" },
      }),
    ),
  );

  const probeUrlArray = [...probeUrls];
  let allUrls: string[] = [];
  const sitemapPaths: string[] = [];

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    if (!response.ok) continue;

    // Verify it looks like XML
    if (!/<[^>]+>/.test(response.body)) continue;

    const probePath = new URL(probeUrlArray[i]).pathname;
    sitemapPaths.push(probePath);

    if (isSitemapIndex(response.body)) {
      // Sitemap index — follow child sitemaps
      const childUrls = filterSameOrigin(
        extractLocs(response.body, MAX_CHILD_SITEMAPS),
        baseUrl,
      );

      if (childUrls.length > 0) {
        const childResponses = await Promise.all(
          childUrls.map((url) =>
            httpGet(url, {
              timeout,
              maxBodyBytes: MAX_BODY_BYTES,
              headers: { Accept: "application/xml, text/xml, */*" },
            }),
          ),
        );

        for (const childResponse of childResponses) {
          if (!childResponse.ok) continue;
          const childLocs = extractLocs(
            childResponse.body,
            MAX_URLS_PER_SITEMAP,
          );
          allUrls.push(...childLocs);
        }
      }
    } else {
      // Regular sitemap
      const locs = extractLocs(response.body, MAX_URLS_PER_SITEMAP);
      allUrls.push(...locs);
    }
  }

  // Deduplicate and filter to same-origin
  allUrls = [...new Set(filterSameOrigin(allUrls, baseUrl))];

  const apiRelevantUrls = filterApiRelevantUrls(allUrls);

  if (sitemapPaths.length === 0) {
    return {
      check: { id, label, status: "fail", detail: "No XML sitemap found" },
      urls: [],
      apiRelevantUrls: [],
    };
  }

  if (allUrls.length === 0) {
    return {
      check: {
        id,
        label,
        status: "partial",
        detail: `Sitemap found at ${sitemapPaths.join(", ")} but contains no URLs`,
      },
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
      detail: `Sitemap found with ${allUrls.length} URLs${apiNote}`,
      data: { totalUrls: allUrls.length, apiRelevantUrls, sitemapPaths },
    },
    urls: allUrls,
    apiRelevantUrls,
  };
}
