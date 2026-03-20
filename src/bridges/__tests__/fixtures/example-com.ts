/**
 * Recorded HTTP response fixtures for integration tests.
 *
 * These fixtures provide realistic HTTP responses for a fictional domain
 * without making any network calls. The fixture responder function maps
 * URL patterns to HttpSuccess/HttpFailure responses.
 */

import type { HttpResponse, HttpSuccess, HttpFailure } from "../../../core/types.js";

// ---------------------------------------------------------------------------
// Fixture responder factory
// ---------------------------------------------------------------------------

export interface FixtureEntry {
  /** Match against the full URL */
  url: string;
  /** Optional: only match if request method is this. Default: match any method. */
  method?: "GET" | "HEAD";
  /** The response to return */
  response: HttpResponse;
}

/**
 * Create a fixture responder function that maps URL + method to recorded
 * HTTP responses. If no match is found, returns a 404 HttpFailure.
 */
export function createFixtureResponder(
  entries: FixtureEntry[],
): (url: string, options?: { method?: string }) => Promise<HttpResponse> {
  return async (
    url: string,
    options?: { method?: string },
  ): Promise<HttpResponse> => {
    const method = options?.method ?? "GET";

    // Try method-specific match first
    const specific = entries.find(
      (e) => e.url === url && e.method === method,
    );
    if (specific) return specific.response;

    // Fall back to method-agnostic match
    const generic = entries.find(
      (e) => e.url === url && e.method === undefined,
    );
    if (generic) return generic.response;

    // No match: 404
    return {
      ok: false,
      error: {
        kind: "http_error",
        message: "HTTP 404 Not Found",
        statusCode: 404,
        url,
      },
    } satisfies HttpFailure;
  };
}

// ---------------------------------------------------------------------------
// Helper to create HttpSuccess
// ---------------------------------------------------------------------------

function success(
  url: string,
  body: string,
  headers: Record<string, string> = {},
  status = 200,
): HttpSuccess {
  return {
    ok: true,
    url,
    status,
    headers,
    body,
    redirects: [],
    durationMs: 12,
  };
}

// ---------------------------------------------------------------------------
// Fixture A: "healthy-site" -- passes most checks
// ---------------------------------------------------------------------------

const HEALTHY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow">
  <title>Example Corp</title>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Organization","name":"Example Corp","url":"https://example.com"}
  </script>
</head>
<body>
  <h1>Welcome to Example Corp</h1>
  <p>We build great software.</p>
</body>
</html>`;

const HEALTHY_ROBOTS_TXT = `User-agent: *
Allow: /

User-agent: GPTBot
Disallow: /private/

Sitemap: https://example.com/sitemap.xml`;

const HEALTHY_OPENAPI_JSON = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Example API" },
  paths: { "/users": {}, "/items": {} },
});

const HEALTHY_SECURITY_TXT = `Contact: security@example.com
Expires: 2027-01-01T00:00:00.000Z`;

const HEALTHY_LLMS_TXT = `# Example Corp
> AI-friendly documentation index`;

export const healthySiteFixtures: FixtureEntry[] = [
  // HEAD https://example.com -> 200
  {
    url: "https://example.com",
    method: "HEAD",
    response: success("https://example.com", "", {
      "content-type": "text/html",
    }),
  },
  // GET https://example.com -> 200 with HTML
  {
    url: "https://example.com",
    method: "GET",
    response: success("https://example.com", HEALTHY_HTML, {
      "content-type": "text/html; charset=utf-8",
    }),
  },
  // GET robots.txt
  {
    url: "https://example.com/robots.txt",
    response: success("https://example.com/robots.txt", HEALTHY_ROBOTS_TXT, {
      "content-type": "text/plain",
    }),
  },
  // GET openapi.json
  {
    url: "https://example.com/openapi.json",
    response: success(
      "https://example.com/openapi.json",
      HEALTHY_OPENAPI_JSON,
      { "content-type": "application/json" },
    ),
  },
  // GET security.txt
  {
    url: "https://example.com/.well-known/security.txt",
    response: success(
      "https://example.com/.well-known/security.txt",
      HEALTHY_SECURITY_TXT,
      { "content-type": "text/plain" },
    ),
  },
  // GET llms.txt
  {
    url: "https://example.com/llms.txt",
    response: success("https://example.com/llms.txt", HEALTHY_LLMS_TXT, {
      "content-type": "text/plain",
    }),
  },
];

// ---------------------------------------------------------------------------
// Fixture B: "minimal-site" -- mostly fails
// ---------------------------------------------------------------------------

const MINIMAL_HTML = `<html><head><title>Minimal</title></head><body><p>Hello</p></body></html>`;

export const minimalSiteFixtures: FixtureEntry[] = [
  // HEAD https://minimal.example.com -> 200
  {
    url: "https://minimal.example.com",
    method: "HEAD",
    response: success("https://minimal.example.com", "", {
      "content-type": "text/html",
    }),
  },
  // GET https://minimal.example.com -> 200 with minimal HTML
  {
    url: "https://minimal.example.com",
    method: "GET",
    response: success("https://minimal.example.com", MINIMAL_HTML, {
      "content-type": "text/html",
    }),
  },
];

// Export fixture HTML/body for test assertions
export const FIXTURE_HEALTHY_HTML = HEALTHY_HTML;
export const FIXTURE_MINIMAL_HTML = MINIMAL_HTML;
export const FIXTURE_HEALTHY_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
};
export const FIXTURE_MINIMAL_HEADERS: Record<string, string> = {
  "content-type": "text/html",
};
