import type { Check, ContentSource } from "../../core/types.js";

/** API-related response headers that indicate an API backend */
const API_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-request-id",
  "x-api-key",
  "x-api-version",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
];

/**
 * Scan for <a> tags with hrefs containing API-related paths.
 * Matches /api/ followed by a slash, dot, or word boundary.
 * Does NOT match /developer/ (that belongs to the developer-docs check).
 */
function scanApiLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /<a\s[^>]*href=["']([^"']*\/api(?:\/|\.|\b)[^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (!links.includes(href)) links.push(href);
  }
  return links;
}

/**
 * Scan for Markdown links containing API-related paths.
 * Matches [text](url) where url contains /api/ followed by a slash, dot, or word boundary.
 */
function scanApiLinksMarkdown(text: string): string[] {
  const links: string[] = [];
  const regex = /\[[^\]]*\]\(([^)]*\/api(?:\/|\.|\b)[^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const href = match[1];
    if (!links.includes(href)) links.push(href);
  }
  return links;
}

/**
 * Detect API presence via multiple signals across content sources.
 *
 * Four signal sources:
 * 1. OpenAPI spec detected by Bridge 2 (boolean from ctx.shared.openApiDetected)
 * 2. API-related response headers (X-RateLimit-*, X-Request-Id, etc.)
 * 3. HTML links containing /api/ paths (scanned from all content sources)
 * 4. Markdown links containing /api/ paths (scanned from all content sources)
 *
 * Pure function -- no HTTP calls.
 */
export function checkApiPresence(
  openApiDetected: boolean,
  sources: ContentSource[],
  headers: Record<string, string>,
): Check {
  const id = "api_presence";
  const label = "API Presence";

  const signals: string[] = [];

  // Signal 1: OpenAPI spec detected by Bridge 2
  if (openApiDetected) signals.push("OpenAPI spec");

  // Signal 2: API-related response headers
  const apiHeaders = API_HEADERS.filter((h) => headers[h] !== undefined);
  if (apiHeaders.length > 0)
    signals.push(`API headers (${apiHeaders.join(", ")})`);

  // Signal 3 & 4: HTML and Markdown links to API-related paths
  const apiLinks: string[] = [];
  for (const { content } of sources) {
    for (const link of scanApiLinks(content)) {
      if (!apiLinks.includes(link)) apiLinks.push(link);
    }
    for (const link of scanApiLinksMarkdown(content)) {
      if (!apiLinks.includes(link)) apiLinks.push(link);
    }
  }
  if (apiLinks.length > 0) signals.push("API links found");

  if (signals.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No API presence signals detected",
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `API presence detected: ${signals.join(", ")}`,
    data: { signals, apiLinks, apiHeaders },
  };
}
