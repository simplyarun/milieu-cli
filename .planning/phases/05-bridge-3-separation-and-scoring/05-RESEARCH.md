# Phase 5: Bridge 3 (Separation) and Scoring - Research

**Researched:** 2026-03-18
**Domain:** Separation signal detection (API presence, developer docs, SDK/package references, webhook support)
**Confidence:** HIGH

## Summary

Bridge 3 (Separation) detects signals indicating that a website offers machine-consumable interfaces separate from its human-facing pages. Unlike Bridges 1 and 2, Bridge 3 produces a **detection inventory** -- not a numeric score. Each of 4 checks outputs "detected" or "not_detected" status. This is a fundamental architectural difference: `BridgeResult.score` is `null`, `BridgeResult.scoreLabel` is `null`, and the bridge status is `"evaluated"` (it IS evaluated, just not scored).

The four checks are: (1) API presence -- reuses Bridge 2's `ctx.shared.openApiDetected` boolean, plus scans the page HTML for `/api/` links and API-related response headers; (2) Developer documentation -- probes 5 well-known paths (`/docs`, `/developers`, `/developer`, `/api/docs`, `/documentation`) and scans homepage links; (3) SDK/package references -- scans page HTML content for mentions of npm, PyPI, Maven, NuGet, Go, RubyGems registry URLs or keywords; (4) Webhook support -- scans page HTML for webhook-related keywords in links and content.

The main architectural pattern is identical to Bridges 1 and 2: a `runSeparationBridge(ctx)` function returns a `BridgeResult`. The key difference is the output shape -- no scoring function, `score: null`, `scoreLabel: null`. Bridge 3 reuses `ctx.shared.openApiDetected` (set by Bridge 2), `ctx.shared.pageBody` and `ctx.shared.pageHeaders` (set by Bridge 1). New HTTP requests are limited to the 5 developer docs path probes, which run in parallel.

**Primary recommendation:** Follow the established bridge pattern. Each check module exports a function returning `Check`. Use `CheckStatus` values as detection indicators: "pass" = detected, "fail" = not_detected. The bridge orchestrator collects checks, sets `score: null` and `scoreLabel: null`, and updates `bridges/index.ts` barrel to export `runSeparationBridge`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEP-01 | API presence: reuse Bridge 2 OpenAPI result, HTML link scanning for /api/ /developer/ paths, API-related response headers | `ctx.shared.openApiDetected` boolean from Bridge 2; regex scan of `ctx.shared.pageBody` for `<a>` tags with `/api/` or `/developer/` hrefs; check `ctx.shared.pageHeaders` for `X-RateLimit-*`, `X-Request-Id`, `X-API-Key` headers |
| SEP-02 | Developer documentation: probe /docs, /developers, /developer, /api/docs, /documentation + homepage link scanning | 5 HEAD requests in parallel; additionally scan `ctx.shared.pageBody` for `<a>` tags with these paths or "documentation"/"developer" link text |
| SEP-03 | SDK/package references: npm, PyPI, Maven, NuGet, Go, RubyGems mentions in page content | Regex scan of `ctx.shared.pageBody` for registry URL patterns (npmjs.com, pypi.org, pkg.go.dev, rubygems.org, search.maven.org, nuget.org) and install command patterns (`pip install`, `go get`, `gem install`, `dotnet add`, etc.) |
| SEP-04 | Webhook support mentioned in docs/HTML | Regex scan of `ctx.shared.pageBody` for "webhook" keyword in links, headings, and content; also check link hrefs containing "webhook" |
| SEP-05 | Bridge 3 outputs detection inventory with status "detected" or "not_evaluated" | `BridgeResult` with `score: null`, `scoreLabel: null`, `status: "evaluated"`; each `Check` uses `status: "pass"` for detected, `status: "fail"` for not_detected; inventory represented in `check.data` fields |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node built-in `fetch` | Node 18+ | HEAD requests for developer docs path probing | Zero-dep constraint; already used via httpGet wrapper |
| Built-in Regex | N/A | HTML scanning for links, SDK references, webhook keywords | Zero-dep constraint prevents HTML parser libraries; same pattern used in Bridge 1 (meta robots) and Bridge 2 (JSON-LD, Schema.org) |
| `ctx.shared` | N/A | Reuse Bridge 1 page body/headers and Bridge 2 OpenAPI result | Established pattern from Phase 3-4; avoids redundant HTTP requests |

### Supporting
No additional dependencies. All functionality uses built-in Node APIs, the existing `httpGet` utility, and data from `ctx.shared`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex for HTML link scanning | cheerio/htmlparser2 | Would violate zero-dep constraint; regex sufficient for `<a>` tag extraction (same approach as meta-robots) |
| HEAD for docs path probing | GET requests | HEAD is sufficient -- we only need to know if a path exists (2xx vs 4xx), not the content; saves bandwidth |
| Scanning only page body | Crawling linked pages | Out of scope per requirements; would massively increase scan time and complexity |

## Architecture Patterns

### Recommended Project Structure
```
src/bridges/separation/
  index.ts              # runSeparationBridge() -- main entry point
  api-presence.ts       # checkApiPresence() -- OpenAPI reuse + link scanning + headers
  developer-docs.ts     # checkDeveloperDocs() -- path probing + link scanning
  sdk-references.ts     # checkSdkReferences() -- content scanning for package registries
  webhook-support.ts    # checkWebhookSupport() -- content scanning for webhook mentions
  __tests__/
    api-presence.test.ts
    developer-docs.test.ts
    sdk-references.test.ts
    webhook-support.test.ts
    index.test.ts       # Bridge orchestrator tests
```

### Pattern 1: Bridge Entry Point (follow Bridges 1 and 2)
**What:** Single async function that runs all checks and returns BridgeResult with score: null
**When to use:** Bridge 3 specifically (detection-only bridge)
**Example:**
```typescript
export async function runSeparationBridge(
  ctx: ScanContext,
): Promise<BridgeResult> {
  const start = performance.now();

  const pageBody = (ctx.shared.pageBody as string) ?? "";
  const pageHeaders = (ctx.shared.pageHeaders as Record<string, string>) ?? {};
  const openApiDetected = (ctx.shared.openApiDetected as boolean) ?? false;

  // Developer docs probes require HTTP -- run in parallel with sync checks
  const devDocsPromise = checkDeveloperDocs(
    ctx.baseUrl,
    pageBody,
    ctx.options.timeout,
  );

  // Pure function checks (no HTTP) -- run synchronously
  const apiPresenceCheck = checkApiPresence(openApiDetected, pageBody, pageHeaders);
  const sdkRefsCheck = checkSdkReferences(pageBody);
  const webhookCheck = checkWebhookSupport(pageBody);

  // Await the async check
  const devDocsCheck = await devDocsPromise;

  const checks: Check[] = [
    apiPresenceCheck,
    devDocsCheck,
    sdkRefsCheck,
    webhookCheck,
  ];

  return {
    id: 3,
    name: "Separation",
    status: "evaluated",
    score: null,
    scoreLabel: null,
    checks,
    durationMs: Math.round(performance.now() - start),
  };
}
```

### Pattern 2: Detection Check (pure function, no HTTP)
**What:** Scan HTML content for signal presence, return Check with pass/fail
**When to use:** API presence (partial), SDK references, webhook support
**Example:**
```typescript
export function checkSdkReferences(html: string): Check {
  const id = "sdk_references";
  const label = "SDK/Package References";

  const detected: string[] = [];

  // Check for registry URL patterns
  if (/npmjs\.com\/package\//i.test(html)) detected.push("npm");
  if (/pypi\.org\/project\//i.test(html)) detected.push("PyPI");
  // ... more registries

  if (detected.length === 0) {
    return { id, label, status: "fail", detail: "No SDK/package references found" };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `SDK references detected: ${detected.join(", ")}`,
    data: { registries: detected },
  };
}
```

### Pattern 3: Detection Check (HTTP probe)
**What:** Probe known paths with HEAD requests to detect presence
**When to use:** Developer documentation check
**Example:**
```typescript
const DOC_PATHS = ["/docs", "/developers", "/developer", "/api/docs", "/documentation"];

export async function checkDeveloperDocs(
  baseUrl: string,
  html: string,
  timeout?: number,
): Promise<Check> {
  // Probe all 5 paths in parallel with HEAD requests
  const results = await Promise.all(
    DOC_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, { method: "HEAD", timeout }),
    ),
  );

  const reachablePaths = DOC_PATHS.filter((_, i) => results[i].ok);

  // Also scan homepage HTML for documentation links
  const linkedPaths = scanDocLinks(html);

  // Combine both signals (dedup)
  const allFound = [...new Set([...reachablePaths, ...linkedPaths])];

  if (allFound.length === 0) {
    return { id: "developer_docs", label: "Developer Documentation", status: "fail", detail: "No developer documentation found" };
  }

  return {
    id: "developer_docs",
    label: "Developer Documentation",
    status: "pass",
    detail: `Developer documentation detected: ${allFound.join(", ")}`,
    data: { paths: allFound },
  };
}
```

### Pattern 4: Shared Context Consumption (Bridge 3 reads, never writes)
**What:** Bridge 3 reads from ctx.shared but does not set any new shared data
**When to use:** Bridge 3 is the last real bridge (4-5 are stubs)
**Example:**
```typescript
// Bridge 3 reads these (set by Bridges 1 and 2):
const pageBody = (ctx.shared.pageBody as string) ?? "";
const pageHeaders = (ctx.shared.pageHeaders as Record<string, string>) ?? {};
const openApiDetected = (ctx.shared.openApiDetected as boolean) ?? false;

// Bridge 3 does NOT store anything in ctx.shared
// (Bridges 4-5 are stubs and will not consume data)
```

### Anti-Patterns to Avoid
- **Re-fetching the homepage:** `ctx.shared.pageBody` already has it from Bridge 1 -- do not GET the homepage again
- **Re-running OpenAPI probes:** `ctx.shared.openApiDetected` already has the answer from Bridge 2 -- do not re-probe the 9 OpenAPI paths
- **GET requests for docs path probing:** Use HEAD -- we only need to know if the path exists (2xx response), not the content
- **Scoring Bridge 3:** Requirements explicitly state detection inventory only -- no score calculation, no `scoreLabel`
- **Deep crawling linked pages:** The requirements specify scanning the homepage HTML only, not following links to sub-pages
- **Using "partial" status:** Bridge 3 checks are binary: detected (pass) or not detected (fail). There is no partial state for presence detection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP probing for doc paths | Custom fetch logic | `httpGet` with `method: "HEAD"` | Already handles timeouts, retries, SSRF, error classification |
| URL construction for probes | String concatenation | `new URL(path, baseUrl)` | Handles trailing slashes, protocol, encoding correctly |
| HTML link extraction | Full HTML parser | Regex for `<a href="...">` | Zero-dep constraint; sufficient for href attribute extraction |
| Parallel HTTP execution | Manual Promise chaining | `Promise.all()` | Cleaner error handling, standard pattern |

**Key insight:** Bridge 3 is fundamentally simpler than Bridges 1-2. Three of four checks are pure functions scanning `ctx.shared.pageBody` with regex. Only the developer docs check needs HTTP. The main complexity is correctly defining what signals indicate "detected" for each check.

## Common Pitfalls

### Pitfall 1: False Positive API Presence from Navigation Links
**What goes wrong:** Every site with a "Developers" link in the footer triggers API presence detection
**Why it happens:** Regex matches any `<a href>` containing `/developer/` or `/api/`, including marketing pages
**How to avoid:** Use multiple signal sources. API presence should require at least one of: (a) OpenAPI detected by Bridge 2, (b) API-related response headers (X-RateLimit-*, X-Request-Id), (c) links containing `/api/` paths. A single marketing "Developers" link is insufficient -- that falls under the dev docs check instead. Keep the `/api/` link scanning in the API presence check but keep `/developer/` scanning in the developer docs check. This avoids double-counting and keeps the separation clean -- API presence means "has a programmatic interface", developer docs means "has documentation for developers".
**Warning signs:** Sites like tech blogs triggering API presence from a "/developers" navigation link

### Pitfall 2: SDK Reference False Positives from Blog Content
**What goes wrong:** A blog post mentioning install commands for third-party packages triggers SDK detection
**Why it happens:** The page body includes third-party package references in educational content
**How to avoid:** Focus on specific registry URL patterns (npmjs.com/package/X, pypi.org/project/X) and install commands. Accept that some false positives are inevitable with regex-only scanning -- the detection inventory is meant to surface signals, not make definitive claims. The data field will include which registries were matched, giving downstream consumers context.
**Warning signs:** High detection rate on sites that are clearly not API providers

### Pitfall 3: HEAD Request Failures on Valid Paths
**What goes wrong:** A site returns 405 Method Not Allowed for HEAD requests, causing false negative on developer docs
**Why it happens:** Some servers or CDNs do not support HEAD method
**How to avoid:** Accept this as a known limitation. The link scanning from the homepage provides a secondary detection method. If a site has `/docs` but returns 405 for HEAD, the homepage likely has a link to `/docs` which the link scanner will find.
**Warning signs:** Sites known to have /docs returning 405 for HEAD

### Pitfall 4: Confusing SEP-05 Vocabulary with Check Types
**What goes wrong:** Using CheckStatus "error" or a custom value for not-detected signals
**Why it happens:** SEP-05 says status "detected" or "not_evaluated" in the inventory, but the Check type uses "pass"/"partial"/"fail"/"error"
**How to avoid:** Map the requirements vocabulary to the existing type system: "detected" = `Check.status: "pass"`, "not_detected" = `Check.status: "fail"`. The detection inventory is represented by the check results themselves -- each Check's status and data fields constitute the inventory entry. The term "not_evaluated" in SEP-05 refers to the bridge-level concept, not individual check status.
**Warning signs:** Attempting to add new CheckStatus values or creating parallel data structures

### Pitfall 5: Webhook Detection Overly Sensitive
**What goes wrong:** The word "webhook" appears in a generic article or unrelated context, triggering detection
**Why it happens:** Simple keyword matching does not understand context
**How to avoid:** Look for "webhook" specifically in: (a) link hrefs containing "webhook", (b) link text containing "webhook", (c) headings containing "webhook". Avoid matching the word in arbitrary paragraph text since that could be blog content. The requirement says "mentioned in docs/HTML" which implies intentional documentation, not incidental mentions.
**Warning signs:** News sites or blogs triggering webhook detection

### Pitfall 6: Bridge 3 Accidentally Returning a Score
**What goes wrong:** Following the Bridge 1/2 pattern too closely and including scoring logic
**Why it happens:** Copy-paste from Bridge 2 orchestrator
**How to avoid:** Bridge 3 must explicitly set `score: null` and `scoreLabel: null`. There is no `calculateScore` function. The type system already supports this (`BridgeResult.score` is `number | null`).
**Warning signs:** Non-null score in Bridge 3 output

## Code Examples

### API Presence Check (SEP-01)
```typescript
// Source: Requirements SEP-01 + established ctx.shared pattern

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
 * Returns matched paths (deduplicated).
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

export function checkApiPresence(
  openApiDetected: boolean,
  html: string,
  headers: Record<string, string>,
): Check {
  const id = "api_presence";
  const label = "API Presence";

  const signals: string[] = [];

  // Signal 1: OpenAPI spec detected by Bridge 2
  if (openApiDetected) signals.push("OpenAPI spec");

  // Signal 2: API-related response headers
  const apiHeaders = API_HEADERS.filter((h) => headers[h] !== undefined);
  if (apiHeaders.length > 0) signals.push(`API headers (${apiHeaders.join(", ")})`);

  // Signal 3: HTML links to API-related paths
  const apiLinks = scanApiLinks(html);
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
```

### Developer Documentation Check (SEP-02)
```typescript
// Source: Requirements SEP-02 + Pronovix URL pattern research

const DOC_PATHS = [
  "/docs",
  "/developers",
  "/developer",
  "/api/docs",
  "/documentation",
] as const;

/**
 * Scan homepage HTML for links pointing to documentation paths.
 */
function scanDocLinks(html: string): string[] {
  const found: string[] = [];
  for (const path of DOC_PATHS) {
    const escaped = path.replace(/\//g, "\\/");
    const regex = new RegExp(
      `<a\\s[^>]*href=["'][^"']*${escaped}[^"']*["']`,
      "gi",
    );
    if (regex.test(html)) {
      found.push(path);
    }
  }
  return found;
}

export async function checkDeveloperDocs(
  baseUrl: string,
  html: string,
  timeout?: number,
): Promise<Check> {
  const id = "developer_docs";
  const label = "Developer Documentation";

  // Probe all 5 paths in parallel with HEAD requests
  const results = await Promise.all(
    DOC_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, { method: "HEAD", timeout }),
    ),
  );

  const reachablePaths = DOC_PATHS.filter((_, i) => results[i].ok);

  // Also scan homepage links
  const linkedPaths = scanDocLinks(html);

  // Combine both signals (dedup)
  const allFound = [...new Set([...reachablePaths, ...linkedPaths])];

  if (allFound.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No developer documentation found",
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `Developer documentation detected: ${allFound.join(", ")}`,
    data: { paths: allFound },
  };
}
```

### SDK/Package References Check (SEP-03)
```typescript
// Source: Requirements SEP-03 + package registry URL patterns

interface RegistryPattern {
  name: string;
  urlPattern: RegExp;
  installPattern?: RegExp;
}

const REGISTRY_PATTERNS: RegistryPattern[] = [
  {
    name: "npm",
    urlPattern: /npmjs\.com\/package\//i,
    installPattern: /npm\s+install\s+\S/i,
  },
  {
    name: "PyPI",
    urlPattern: /pypi\.org\/project\//i,
    installPattern: /pip\s+install\s+\S/i,
  },
  {
    name: "Maven",
    urlPattern: /search\.maven\.org|mvnrepository\.com/i,
    installPattern: /<groupId>/i,
  },
  {
    name: "NuGet",
    urlPattern: /nuget\.org\/packages\//i,
    installPattern: /dotnet\s+add\s+package\s+\S/i,
  },
  {
    name: "Go",
    urlPattern: /pkg\.go\.dev\//i,
    installPattern: /go\s+get\s+\S/i,
  },
  {
    name: "RubyGems",
    urlPattern: /rubygems\.org\/gems\//i,
    installPattern: /gem\s+install\s+\S/i,
  },
];

export function checkSdkReferences(html: string): Check {
  const id = "sdk_references";
  const label = "SDK/Package References";

  const detected: string[] = [];

  for (const registry of REGISTRY_PATTERNS) {
    if (registry.urlPattern.test(html)) {
      if (!detected.includes(registry.name)) detected.push(registry.name);
    }
    if (registry.installPattern && registry.installPattern.test(html)) {
      if (!detected.includes(registry.name)) detected.push(registry.name);
    }
  }

  if (detected.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No SDK/package references found",
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `SDK references detected: ${detected.join(", ")}`,
    data: { registries: detected },
  };
}
```

### Webhook Support Check (SEP-04)
```typescript
// Source: Requirements SEP-04

export function checkWebhookSupport(html: string): Check {
  const id = "webhook_support";
  const label = "Webhook Support";

  const signals: string[] = [];

  // Check for links containing "webhook" in href
  if (/<a\s[^>]*href=["'][^"']*webhook[^"']*["']/gi.test(html)) {
    signals.push("webhook link");
  }

  // Check for "webhook" in link text
  if (/<a\s[^>]*>[^<]*webhook[^<]*<\/a>/gi.test(html)) {
    signals.push("webhook link text");
  }

  // Check for "webhook" in headings
  if (/<h[1-6][^>]*>[^<]*webhook[^<]*<\/h[1-6]>/gi.test(html)) {
    signals.push("webhook heading");
  }

  if (signals.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No webhook support signals detected",
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `Webhook support detected: ${signals.join(", ")}`,
    data: { signals },
  };
}
```

### Bridge 3 Barrel Export Update
```typescript
// src/bridges/index.ts -- add Bridge 3 export
export { runReachabilityBridge } from "./reachability/index.js";
export { runStandardsBridge } from "./standards/index.js";
export { runSeparationBridge } from "./separation/index.js";
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API detection via OpenAPI only | Multi-signal detection (OpenAPI + headers + links) | N/A (project-specific) | More comprehensive coverage; single signal is insufficient |
| Developer portals as subdomains | Both subdomains (docs.domain.com) and paths (/docs, /developers) | Ongoing | Must probe paths, not subdomains (scanning only the target domain) |
| Package manager detection via APIs | HTML content scanning for registry URLs | N/A (project-specific) | Works without network calls to registries; sufficient for presence detection |
| Webhook detection via API probing | HTML keyword scanning | N/A (project-specific) | Lightweight; detects documented webhooks, not undocumented ones |

**Note on scope:** Bridge 3 is intentionally limited to homepage-only scanning. Multi-page crawling is a v2 feature (SCAN-01, out of scope). The detection inventory is meant to surface presence signals, not exhaustively catalog API capabilities.

## HTTP Request Strategy

### Request Inventory
| Check | URL | Method | Notes |
|-------|-----|--------|-------|
| API Presence | (none -- reuses shared data) | None | Reads `ctx.shared.openApiDetected`, `ctx.shared.pageBody`, `ctx.shared.pageHeaders` |
| Developer Docs | 5 paths (`/docs`, `/developers`, `/developer`, `/api/docs`, `/documentation`) | HEAD | Parallel; any 2xx = detected |
| SDK References | (none -- scans page body) | None | Reads `ctx.shared.pageBody` |
| Webhook Support | (none -- scans page body) | None | Reads `ctx.shared.pageBody` |

**Total new HTTP requests:** Up to 5 (developer docs path probes only)
**Reused from Bridge 1:** `pageBody`, `pageHeaders`
**Reused from Bridge 2:** `openApiDetected`

### Parallelization Strategy
The 5 developer docs HEAD probes are the only HTTP requests and can run via `Promise.all()`. The other 3 checks are pure functions operating on `ctx.shared.pageBody`. The orchestrator fires the HEAD probes first (non-blocking), runs pure checks synchronously while waiting, then awaits the docs result. This matches the Bridge 2 pattern where async HTTP probes run alongside synchronous HTML checks.

## Check-to-Status Mapping

| Check | Pass (detected) | Fail (not_detected) |
|-------|-----------------|---------------------|
| API Presence | At least one signal: OpenAPI detected, API headers present, or API links found | No API signals |
| Developer Docs | At least one probe returns 2xx OR homepage has doc links | All 5 probes fail AND no doc links |
| SDK References | At least one registry URL or install command pattern found | No package registry references |
| Webhook Support | "webhook" found in link hrefs, link text, or headings | No webhook mentions |

**Important:** There is no "partial" status for Bridge 3 checks. Detection is binary.

## Open Questions

1. **API link scanning scope: `/api/` only or also `/developer/`?**
   - What we know: SEP-01 says "HTML link scanning for /api/ /developer/ paths"
   - What's unclear: Whether `/developer/` links should count as API presence or just developer docs
   - Recommendation: Include `/api/` paths in API presence check. Move `/developer/` scanning to the developer docs check. This avoids double-counting and keeps the separation clean -- API presence means "has a programmatic interface", developer docs means "has documentation for developers".

2. **HEAD request failure behavior for dev docs probes?**
   - What we know: Some servers return 405 for HEAD requests
   - What's unclear: Whether to fall back to GET on 405
   - Recommendation: Accept HEAD-only for simplicity. The homepage link scanning provides a secondary detection path. If a site returns 405 for HEAD on `/docs` but has a link to `/docs` in the homepage, the check still passes.

3. **SDK install command false positives in code examples?**
   - What we know: Blog posts and tutorials may contain install commands for third-party packages
   - What's unclear: How to distinguish the site's own SDKs from referenced third-party packages
   - Recommendation: Accept this limitation. The detection inventory surfaces signals, not certainties. Registry URL patterns (npmjs.com/package/X) are more reliable than install commands, but both contribute to detection. The data field will include which registries were matched, giving downstream consumers context.

4. **Should the overall scan still only average Bridges 1-2 for the overall score?**
   - What we know: `ScanResult.overallScore` is defined as "averaged from scored bridges only (1, 2)" in types.ts
   - What's unclear: Whether this needs modification now that Bridge 3 exists
   - Recommendation: No change needed. The type definition already accounts for this. Bridge 3 has `score: null`, so the scan orchestrator (future phase) will naturally skip it when computing the average.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 (already configured) |
| Config file | vitest.config.ts + package.json scripts |
| Quick run command | `npx vitest run src/bridges/separation --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEP-01 | API presence: OpenAPI reuse + link scanning + headers | unit | `npx vitest run src/bridges/separation/__tests__/api-presence.test.ts` | Wave 0 |
| SEP-02 | Developer docs: 5 path probes + link scanning | unit | `npx vitest run src/bridges/separation/__tests__/developer-docs.test.ts` | Wave 0 |
| SEP-03 | SDK references: 6 registry patterns | unit | `npx vitest run src/bridges/separation/__tests__/sdk-references.test.ts` | Wave 0 |
| SEP-04 | Webhook support: keyword scanning | unit | `npx vitest run src/bridges/separation/__tests__/webhook-support.test.ts` | Wave 0 |
| SEP-05 | Bridge 3 detection inventory: score null, 4 checks | unit | `npx vitest run src/bridges/separation/__tests__/index.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/bridges/separation --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green (all 224+ existing tests + new Bridge 3 tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/bridges/separation/__tests__/api-presence.test.ts` -- covers SEP-01
- [ ] `src/bridges/separation/__tests__/developer-docs.test.ts` -- covers SEP-02
- [ ] `src/bridges/separation/__tests__/sdk-references.test.ts` -- covers SEP-03
- [ ] `src/bridges/separation/__tests__/webhook-support.test.ts` -- covers SEP-04
- [ ] `src/bridges/separation/__tests__/index.test.ts` -- covers SEP-05 (bridge orchestrator)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/bridges/standards/index.ts` -- established bridge orchestrator pattern
- Existing codebase: `src/bridges/reachability/index.ts` -- established bridge orchestrator pattern
- Existing codebase: `src/core/types.ts` -- `BridgeResult.score` is `number | null`, supports detection-only bridge
- Existing codebase: `src/bridges/standards/index.ts` line 73 -- `ctx.shared.openApiDetected` already set by Bridge 2
- REQUIREMENTS.md SEP-01 through SEP-05 -- exact requirements for Bridge 3 checks
- [Pronovix API Developer Portal URL Patterns](https://pronovix.com/blog/api-documentation-and-developer-portals-common-url-patterns) -- validated the 5 documentation path choices

### Secondary (MEDIUM confidence)
- [IETF RateLimit Headers Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) -- standard API header names for API presence detection
- [SPDX Package URL Specification](https://spdx.github.io/spdx-spec/v3.0.1/annexes/pkg-url-specification/) -- package registry URL patterns (npm, PyPI, Maven, NuGet, Go, RubyGems)

### Tertiary (LOW confidence)
- None. All findings are grounded in existing codebase patterns and requirements.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero-dep constraint leaves no choices; reuses existing httpGet and regex patterns
- Architecture: HIGH -- follows established Bridge 1/2 pattern exactly, with well-defined null-score difference
- API presence check: HIGH -- `ctx.shared.openApiDetected` already exists; header/link scanning is straightforward regex
- Developer docs check: HIGH -- path list matches requirements verbatim; HEAD probe pattern reuses httpGet
- SDK references check: HIGH -- registry URL patterns are well-known and stable
- Webhook check: MEDIUM -- keyword-based detection has inherent false positive risk; acceptable for detection inventory
- Pitfalls: HIGH -- based on analysis of existing codebase patterns and known regex limitations

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (30 days -- all areas are stable; no evolving specs involved)
