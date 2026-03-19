# Phase 4: Bridge 2 (Standards) - Research

**Researched:** 2026-03-18
**Domain:** Web standards discovery (OpenAPI, llms.txt, MCP, JSON-LD, Schema.org, well-known URIs)
**Confidence:** HIGH

## Summary

Bridge 2 evaluates a website's adoption of machine-legibility standards. It involves 7-8 distinct checks across 6 categories: OpenAPI spec discovery, llms.txt presence, MCP endpoint, JSON-LD structured data, Schema.org markup, and well-known URI presence (security.txt, ai-plugin.json). The bridge follows the same pattern as Bridge 1 (reachability) -- a `runStandardsBridge()` function that runs checks, collects results, and calculates a score.

The primary challenge is HTTP request volume. Bridge 2 needs up to 15+ HTTP requests (9 OpenAPI paths + llms.txt + llms-full.txt + mcp.json + security.txt + ai-plugin.json), but most will 404 quickly. JSON-LD and Schema.org extraction require the page HTML, which Bridge 1 already fetches. The key architectural decision is sharing the page body via `ctx.shared` to avoid a redundant GET request.

**Primary recommendation:** Follow Bridge 1's pattern exactly. Store Bridge 1's page HTML in `ctx.shared.pageBody` (requires a small Bridge 1 modification). Use regex for JSON-LD extraction (sufficient for `<script type="application/ld+json">` blocks). Parallelize independent HTTP probes within the bridge. Store OpenAPI detection result in `ctx.shared` for Bridge 3 reuse.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STND-01 | OpenAPI spec exists (9 paths probed), version and endpoint count | 9 common paths identified; version from `openapi`/`swagger` key; endpoint count from `paths` object |
| STND-02 | OpenAPI validates response (openapi/swagger key, correct Content-Type) | Content-Type must be JSON/YAML, not text/html; presence of top-level `openapi` or `swagger` key confirms real spec |
| STND-03 | llms.txt exists at domain root (HTTP 200, non-empty, size and first line) | llmstxt.org spec: Markdown format, H1 required, served at `/llms.txt` |
| STND-04 | llms-full.txt exists at domain root | Companion file at `/llms-full.txt`; same validation as llms.txt (HTTP 200, non-empty) |
| STND-05 | MCP endpoint at /.well-known/mcp.json (valid JSON with MCP config) | SEP-1649 spec: requires `serverInfo`, `transport`, `capabilities` fields; or legacy format with `mcp_version` and `endpoints` |
| STND-06 | JSON-LD structured data blocks with detected schema types | Extract `<script type="application/ld+json">` via regex; parse JSON; report `@type` values |
| STND-07 | Schema.org markup (Microdata or JSON-LD with schema.org vocabulary) | JSON-LD: check `@context` contains "schema.org"; Microdata: regex for `itemtype` attributes with schema.org URLs |
| STND-08 | Well-known URI presence (security.txt, ai-plugin.json) | security.txt at `/.well-known/security.txt` (RFC 9116); ai-plugin.json at `/.well-known/ai-plugin.json` |
| STND-09 | Bridge 2 score calculated as (passed/total * 100) | Same scoring as Bridge 1: pass=1, partial=0.5, fail=0 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node built-in `fetch` | Node 18+ | HTTP requests for probing endpoints | Zero-dep constraint; already used in http-client.ts |
| Built-in `JSON.parse` | N/A | Parse JSON responses (OpenAPI, MCP, ai-plugin, JSON-LD) | No external parser needed |
| Regex | N/A | Extract JSON-LD script tags, detect Microdata attributes | Zero-dep constraint prevents HTML parser libraries |

### Supporting
No additional dependencies. All functionality uses built-in Node APIs and the existing `httpGet` utility.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex for JSON-LD | cheerio/htmlparser2 | Would violate zero-dep constraint; regex is sufficient for script tag extraction since JSON-LD is always in well-defined `<script>` tags |
| Regex for Microdata | DOM parser | Same constraint; Microdata detection only needs attribute presence, not full DOM traversal |
| Sequential OpenAPI probes | Parallel probes | Parallel is better -- fail fast on all 9 paths simultaneously |

## Architecture Patterns

### Recommended Project Structure
```
src/bridges/standards/
  index.ts              # runStandardsBridge() -- main entry point
  openapi.ts            # checkOpenApi() -- 9-path probe + validation
  llms-txt.ts           # checkLlmsTxt(), checkLlmsFullTxt()
  mcp.ts                # checkMcpEndpoint()
  json-ld.ts            # checkJsonLd() -- extract from page HTML
  schema-org.ts         # checkSchemaOrg() -- JSON-LD + Microdata
  well-known.ts         # checkSecurityTxt(), checkAiPlugin()
  __tests__/
    openapi.test.ts
    llms-txt.test.ts
    mcp.test.ts
    json-ld.test.ts
    schema-org.test.ts
    well-known.test.ts
```

### Pattern 1: Bridge Entry Point (follow Bridge 1)
**What:** Single async function that runs all checks and returns BridgeResult
**When to use:** Every bridge
**Example:**
```typescript
export async function runStandardsBridge(ctx: ScanContext): Promise<BridgeResult> {
  const start = performance.now();

  // Get page HTML from shared context (set by Bridge 1)
  const pageBody = (ctx.shared.pageBody as string) ?? "";

  // Run independent HTTP probes in parallel
  const [openApiResult, llmsTxtCheck, llmsFullTxtCheck, mcpCheck, securityTxtCheck, aiPluginCheck] =
    await Promise.all([
      checkOpenApi(ctx.baseUrl, ctx.options.timeout),
      checkLlmsTxt(ctx.baseUrl, ctx.options.timeout),
      checkLlmsFullTxt(ctx.baseUrl, ctx.options.timeout),
      checkMcpEndpoint(ctx.baseUrl, ctx.options.timeout),
      checkSecurityTxt(ctx.baseUrl, ctx.options.timeout),
      checkAiPlugin(ctx.baseUrl, ctx.options.timeout),
    ]);

  // HTML-based checks (no HTTP needed)
  const jsonLdCheck = checkJsonLd(pageBody);
  const schemaOrgCheck = checkSchemaOrg(pageBody, jsonLdCheck);

  // Store OpenAPI result for Bridge 3 reuse
  ctx.shared.openApiDetected = openApiResult.detected;

  const checks = [
    openApiResult.check,
    llmsTxtCheck,
    llmsFullTxtCheck,
    mcpCheck,
    jsonLdCheck,
    schemaOrgCheck,
    securityTxtCheck,
    aiPluginCheck,
  ];

  const { score, scoreLabel } = calculateScore(checks);

  return {
    id: 2,
    name: "Standards",
    status: "evaluated",
    score,
    scoreLabel,
    checks,
    durationMs: Math.round(performance.now() - start),
  };
}
```

### Pattern 2: HTTP Probe Check
**What:** Probe a well-known path, validate response
**When to use:** OpenAPI, llms.txt, security.txt, etc.
**Example:**
```typescript
async function probeEndpoint(url: string, timeout?: number): Promise<HttpResponse> {
  return httpGet(url, {
    timeout,
    headers: { "Accept": "application/json, text/plain, */*" },
  });
}
```

### Pattern 3: Shared Context for Cross-Bridge Data
**What:** Bridge 1 stores page HTML in `ctx.shared`, Bridge 2 reads it
**When to use:** Avoiding redundant HTTP requests between bridges
**Example:**
```typescript
// In Bridge 1 (modification needed):
if (pageResponse.ok) {
  ctx.shared.pageBody = pageResponse.body;
  ctx.shared.pageHeaders = pageResponse.headers;
}

// In Bridge 2:
const pageBody = (ctx.shared.pageBody as string) ?? "";
```

### Anti-Patterns to Avoid
- **Re-fetching page HTML in Bridge 2:** Wasteful; use ctx.shared instead
- **Stopping on first OpenAPI path hit:** Check Content-Type and body before declaring success -- many paths return HTML docs pages
- **Deep JSON-LD parsing:** Only extract `@type` and `@context` -- don't validate full JSON-LD semantics
- **Treating all 404s as errors:** A 404 on `/swagger.json` is expected and normal -- it just means no OpenAPI spec at that path

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing | Custom JSON parser | `JSON.parse()` with try/catch | Built-in, handles all edge cases |
| URL construction | String concatenation for paths | `new URL(path, baseUrl)` | Handles trailing slashes, protocol, encoding |
| Parallel HTTP | Manual Promise chaining | `Promise.all()` | Cleaner, handles errors properly |
| Content-Type parsing | Regex on header string | Split on `;` and check first part | Handles charset parameters correctly |

**Key insight:** Bridge 2 is fundamentally about "probe URL, check response format" -- the httpGet utility already handles retries, timeouts, and error classification. Each check just needs to interpret the response.

## Common Pitfalls

### Pitfall 1: OpenAPI HTML Docs Pages
**What goes wrong:** `/swagger` or `/api-docs` returns an HTML Swagger UI page, not the JSON/YAML spec
**Why it happens:** Many frameworks serve the UI at the path, with the actual spec at a different URL
**How to avoid:** Always validate Content-Type header is `application/json`, `application/yaml`, `text/yaml`, or `application/vnd.oai.openapi+json` -- reject `text/html`. Also verify the parsed JSON contains a top-level `openapi` or `swagger` key.
**Warning signs:** Response body starts with `<!DOCTYPE` or `<html`

### Pitfall 2: JSON-LD Inside CDATA or Comments
**What goes wrong:** Regex picks up JSON-LD blocks inside HTML comments or CDATA sections
**Why it happens:** Naive regex doesn't account for comment boundaries
**How to avoid:** For this project, this is an acceptable edge case. Real-world JSON-LD is virtually never inside comments. The regex `<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>` is robust enough.
**Warning signs:** Extracted JSON fails to parse

### Pitfall 3: OpenAPI YAML Responses
**What goes wrong:** OpenAPI spec is served as YAML, which JSON.parse cannot handle
**Why it happens:** Many APIs serve specs as YAML by default
**How to avoid:** Since we have a zero-dep constraint (no YAML parser), check if the body starts with `{` (JSON) vs YAML indicators. For YAML responses, mark as `partial` (detected but can't fully parse). Extract version via regex: `/^openapi:\s*["']?(\d+\.\d+)/m` or `/^swagger:\s*["']?(\d+\.\d+)/m`.
**Warning signs:** Content-Type contains `yaml` but JSON.parse fails

### Pitfall 4: MCP Spec Immaturity
**What goes wrong:** Assuming a stable MCP discovery format
**Why it happens:** The MCP `.well-known/mcp.json` spec is still in draft (SEP-1649, targeting June 2026)
**How to avoid:** Be lenient in validation. Accept JSON with either the Server Card format (`serverInfo`, `transport`, `capabilities`) OR any JSON containing MCP-related keys (`mcp_version`, `mcpServers`, `tools`, `resources`). Mark confidence as MEDIUM.
**Warning signs:** Very few sites will have this endpoint in 2026

### Pitfall 5: Large OpenAPI Specs
**What goes wrong:** Downloading a 10MB OpenAPI spec just to count endpoints
**Why it happens:** Some specs are enormous
**How to avoid:** The httpGet maxBodyBytes (5MB) provides a natural limit. For endpoint count, just count keys in `paths` object after JSON.parse -- don't traverse deeply.

### Pitfall 6: Schema.org Microdata False Positives
**What goes wrong:** Detecting `itemtype` attributes that aren't Schema.org
**Why it happens:** Microdata can use any vocabulary, not just Schema.org
**How to avoid:** Only count `itemtype` attributes whose value contains `schema.org`
**Warning signs:** `itemtype` value is a non-schema.org URL

## Code Examples

### OpenAPI Discovery -- 9 Common Paths
```typescript
// Source: GitHub OAI/OpenAPI-Specification#864, common framework defaults
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
];

function isOpenApiResponse(response: HttpSuccess): boolean {
  const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();

  // Reject HTML responses (Swagger UI pages)
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    return false;
  }

  // Accept JSON content types
  const jsonTypes = [
    "application/json",
    "application/vnd.oai.openapi+json",
  ];
  if (jsonTypes.includes(contentType)) {
    try {
      const parsed = JSON.parse(response.body);
      return "openapi" in parsed || "swagger" in parsed;
    } catch {
      return false;
    }
  }

  // Accept YAML content types (can't fully parse, but can detect version)
  const yamlTypes = ["application/yaml", "text/yaml", "application/x-yaml", "application/vnd.oai.openapi"];
  if (yamlTypes.includes(contentType)) {
    return /^(openapi|swagger):/m.test(response.body);
  }

  // Unknown content type -- try JSON parse as fallback
  if (response.body.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(response.body);
      return "openapi" in parsed || "swagger" in parsed;
    } catch {
      return false;
    }
  }

  return false;
}
```

### OpenAPI Version and Endpoint Count Extraction
```typescript
interface OpenApiInfo {
  version: string;      // "3.1.0" or "2.0"
  specType: "openapi" | "swagger";
  endpointCount: number;
}

function extractOpenApiInfo(body: string): OpenApiInfo | null {
  // Try JSON first
  try {
    const parsed = JSON.parse(body);
    const specType = "openapi" in parsed ? "openapi" : "swagger" in parsed ? "swagger" : null;
    if (!specType) return null;

    const version = String(parsed[specType]);
    const endpointCount = parsed.paths ? Object.keys(parsed.paths).length : 0;
    return { version, specType, endpointCount };
  } catch {
    // Fall back to YAML regex extraction
    const versionMatch = body.match(/^(openapi|swagger):\s*["']?(\d+\.\d+(?:\.\d+)?)/m);
    if (!versionMatch) return null;

    // Count paths in YAML (lines that start with / at indent level 2)
    const pathMatches = body.match(/^  \/\S+:/gm);
    return {
      version: versionMatch[2],
      specType: versionMatch[1] as "openapi" | "swagger",
      endpointCount: pathMatches?.length ?? 0,
    };
  }
}
```

### llms.txt Validation
```typescript
// Source: https://llmstxt.org/ specification
function validateLlmsTxt(body: string): { valid: boolean; firstLine: string; sizeBytes: number } {
  const sizeBytes = new TextEncoder().encode(body).byteLength;
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return { valid: false, firstLine: "", sizeBytes: 0 };
  }

  const firstLine = trimmed.split("\n")[0].trim();

  // Per spec: must start with H1 (# Title) -- this is the only required element
  const hasH1 = /^#\s+\S/.test(firstLine);

  return { valid: hasH1, firstLine, sizeBytes };
}
```

### JSON-LD Extraction via Regex
```typescript
function extractJsonLdBlocks(html: string): Array<{ type: string | string[]; context: unknown }> {
  const results: Array<{ type: string | string[]; context: unknown }> = [];

  // Regex to match <script type="application/ld+json">...</script>
  // Using [\s\S]*? for non-greedy match across newlines
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);

      // Handle both single objects and arrays of objects
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object" && "@type" in item) {
          results.push({
            type: item["@type"],
            context: item["@context"] ?? null,
          });
        }
      }
    } catch {
      // Invalid JSON in script tag -- skip
    }
  }

  return results;
}
```

### Schema.org Detection (Microdata)
```typescript
function detectMicrodata(html: string): string[] {
  const types: string[] = [];

  // Match itemtype attributes containing schema.org URLs
  const regex = /itemtype=["'](https?:\/\/schema\.org\/[^"']+)["']/gi;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const typeUrl = match[1];
    const typeName = typeUrl.split("/").pop();
    if (typeName && !types.includes(typeName)) {
      types.push(typeName);
    }
  }

  return types;
}
```

### MCP Endpoint Validation
```typescript
// Source: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649
function isMcpConfig(body: string): { valid: boolean; detail: string } {
  try {
    const parsed = JSON.parse(body);

    // Server Card format (SEP-1649)
    if (parsed.serverInfo && parsed.transport) {
      const name = parsed.serverInfo.name ?? "unknown";
      return { valid: true, detail: `MCP Server Card: ${name}` };
    }

    // Legacy/alternative format with mcp_version
    if (parsed.mcp_version || parsed.mcpServers) {
      return { valid: true, detail: "MCP configuration detected" };
    }

    // Has tools/resources/prompts (MCP primitives)
    if (parsed.tools || parsed.resources || parsed.prompts) {
      return { valid: true, detail: "MCP primitives detected" };
    }

    return { valid: false, detail: "JSON found but no MCP fields" };
  } catch {
    return { valid: false, detail: "Invalid JSON" };
  }
}
```

### ai-plugin.json Validation
```typescript
// Source: OpenAI ChatGPT plugin manifest spec
function isAiPluginManifest(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    return (
      typeof parsed.schema_version === "string" &&
      typeof parsed.name_for_human === "string" &&
      typeof parsed.api === "object"
    );
  } catch {
    return false;
  }
}
```

### security.txt Validation
```typescript
// Source: RFC 9116
function isSecurityTxt(body: string): boolean {
  // Must contain at least a Contact field (RFC 9116 required)
  return /^Contact:/mi.test(body);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ChatGPT plugins (ai-plugin.json) | OpenAI deprecated plugins in favor of GPTs (2024) | 2024 | ai-plugin.json still exists on some sites but is legacy; check for presence only |
| Swagger 2.0 (`swagger` key) | OpenAPI 3.x (`openapi` key) | 2017 | Must detect both; many APIs still serve Swagger 2.0 |
| No MCP discovery | .well-known/mcp.json proposed | 2025-2026 | Very few sites have this; include as forward-looking check |
| No llms.txt | llms.txt gaining adoption (844K+ sites) | 2024-2025 | Significant adoption; worth checking |
| RDFa for structured data | JSON-LD dominant, Microdata declining | ~2020 | Focus on JSON-LD, check Microdata as secondary |

**Deprecated/outdated:**
- **ChatGPT plugins:** Officially sunset by OpenAI in early 2024 in favor of GPTs/Actions, but ai-plugin.json files still exist on many sites
- **Swagger 2.0 spec format:** Superseded by OpenAPI 3.x but still widely deployed

## HTTP Request Strategy

### Request Inventory
| Check | URL | Method | Notes |
|-------|-----|--------|-------|
| OpenAPI | 9 paths | GET | Parallel; take first valid hit |
| llms.txt | `/llms.txt` | GET | Need body content |
| llms-full.txt | `/llms-full.txt` | GET | Need body content |
| MCP | `/.well-known/mcp.json` | GET | Need body for validation |
| security.txt | `/.well-known/security.txt` | GET | Need body for Contact field |
| ai-plugin.json | `/.well-known/ai-plugin.json` | GET | Need body for validation |
| JSON-LD | (page HTML) | None | Reuse from ctx.shared.pageBody |
| Schema.org | (page HTML) | None | Reuse from ctx.shared.pageBody |

**Total new HTTP requests:** Up to 15 (9 OpenAPI + 6 others)
**Reused from Bridge 1:** Page HTML body

### Parallelization Strategy
All HTTP probes are independent and can run via `Promise.all()`. The 9 OpenAPI probes can fire all 9 simultaneously and take the first valid result. Most will 404 quickly. The httpGet utility already has timeouts and retries built in, minimizing wall-clock time.

For the non-OpenAPI checks, run all 6 in parallel alongside the OpenAPI batch. Total parallelism: all 15 requests fire at once.

### Bridge 1 Modification Required
Bridge 1 must store the page body in `ctx.shared` for Bridge 2 to reuse:
```typescript
// Add to Bridge 1 runReachabilityBridge() after page fetch:
if (pageResponse.ok) {
  ctx.shared.pageBody = pageResponse.body;
  ctx.shared.pageHeaders = pageResponse.headers;
}
```

## Check-to-Status Mapping

| Check | Pass | Partial | Fail |
|-------|------|---------|------|
| OpenAPI | Valid spec found (JSON parseable, has openapi/swagger key) | Spec found but YAML (can't fully parse) | Not found at any path |
| llms.txt | HTTP 200, non-empty, starts with H1 | HTTP 200 but missing H1 (non-standard format) | 404 or empty |
| llms-full.txt | HTTP 200, non-empty | -- | 404 or empty |
| MCP endpoint | Valid MCP JSON config | JSON found but unclear MCP structure | 404 or invalid |
| JSON-LD | 1+ valid JSON-LD blocks found | -- | No JSON-LD in page |
| Schema.org | Schema.org types detected (JSON-LD or Microdata) | -- | No Schema.org markup |
| security.txt | Valid with Contact field | Present but missing Contact | 404 or empty |
| ai-plugin.json | Valid manifest with required fields | JSON found but missing fields | 404 or invalid |

## Open Questions

1. **OpenAPI path count: exactly 9?**
   - What we know: REQUIREMENTS.md says "9 paths probed in order." The 9 paths listed in this research cover the most common framework defaults.
   - What's unclear: Whether these are the exact 9 intended or if the planner should adjust.
   - Recommendation: Use the 9 paths listed in Code Examples section. They cover Spring Boot, ASP.NET, general convention, and well-known URI patterns.

2. **Should llms-full.txt validation require H1?**
   - What we know: llms-full.txt is a comprehensive dump of all docs -- format may be less strict than llms.txt.
   - What's unclear: Whether the same H1 validation applies.
   - Recommendation: For llms-full.txt, just check HTTP 200 and non-empty. Don't require H1 format.

3. **Schema.org as separate check vs combined with JSON-LD?**
   - What we know: STND-06 is "JSON-LD blocks with schema types" and STND-07 is "Schema.org markup (Microdata or JSON-LD with schema.org vocabulary)."
   - What's unclear: Whether a site with JSON-LD that uses schema.org should pass both checks.
   - Recommendation: STND-06 checks for any JSON-LD presence (any vocabulary). STND-07 checks specifically for Schema.org vocabulary (via JSON-LD `@context` containing "schema.org" OR Microdata `itemtype` containing "schema.org"). A site with non-Schema.org JSON-LD passes STND-06 but fails STND-07.

4. **MCP endpoint path: mcp.json vs mcp/server-card.json?**
   - What we know: SEP-1649 proposes `/.well-known/mcp.json` and/or `/.well-known/mcp/server-card.json`. The spec is not finalized (targeting June 2026).
   - What's unclear: Which path will win.
   - Recommendation: Probe `/.well-known/mcp.json` as stated in requirements. This is the most commonly referenced path.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already configured) |
| Config file | package.json scripts section |
| Quick run command | `npx vitest run src/bridges/standards --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STND-01 | OpenAPI discovery across 9 paths | unit | `npx vitest run src/bridges/standards/__tests__/openapi.test.ts` | Wave 0 |
| STND-02 | OpenAPI Content-Type validation, reject HTML | unit | `npx vitest run src/bridges/standards/__tests__/openapi.test.ts` | Wave 0 |
| STND-03 | llms.txt presence and validation | unit | `npx vitest run src/bridges/standards/__tests__/llms-txt.test.ts` | Wave 0 |
| STND-04 | llms-full.txt presence | unit | `npx vitest run src/bridges/standards/__tests__/llms-txt.test.ts` | Wave 0 |
| STND-05 | MCP endpoint validation | unit | `npx vitest run src/bridges/standards/__tests__/mcp.test.ts` | Wave 0 |
| STND-06 | JSON-LD extraction from HTML | unit | `npx vitest run src/bridges/standards/__tests__/json-ld.test.ts` | Wave 0 |
| STND-07 | Schema.org detection | unit | `npx vitest run src/bridges/standards/__tests__/schema-org.test.ts` | Wave 0 |
| STND-08 | Well-known URI presence | unit | `npx vitest run src/bridges/standards/__tests__/well-known.test.ts` | Wave 0 |
| STND-09 | Bridge scoring | unit | `npx vitest run src/bridges/standards/__tests__/index.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/bridges/standards --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/bridges/standards/__tests__/openapi.test.ts` -- covers STND-01, STND-02
- [ ] `src/bridges/standards/__tests__/llms-txt.test.ts` -- covers STND-03, STND-04
- [ ] `src/bridges/standards/__tests__/mcp.test.ts` -- covers STND-05
- [ ] `src/bridges/standards/__tests__/json-ld.test.ts` -- covers STND-06
- [ ] `src/bridges/standards/__tests__/schema-org.test.ts` -- covers STND-07
- [ ] `src/bridges/standards/__tests__/well-known.test.ts` -- covers STND-08
- [ ] `src/bridges/standards/__tests__/index.test.ts` -- covers STND-09 (bridge scoring integration)

## Sources

### Primary (HIGH confidence)
- [llmstxt.org](https://llmstxt.org/) -- official llms.txt specification
- [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html) -- security.txt format specification
- [OpenAPI Specification Issue #864](https://github.com/OAI/OpenAPI-Specification/issues/864) -- OpenAPI auto-discovery discussion
- [SEP-1649](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649) -- MCP Server Cards proposal
- [OpenAI chatgpt-retrieval-plugin](https://github.com/openai/chatgpt-retrieval-plugin/blob/main/.well-known/ai-plugin.json) -- ai-plugin.json reference implementation

### Secondary (MEDIUM confidence)
- [Common API paths gist](https://gist.github.com/rodnt/250dd33af97d228cc94cd11504abef06) -- community-compiled OpenAPI/Swagger discovery paths
- [MCP transport future blog](https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/) -- MCP discovery roadmap
- [Ekamoira MCP guide](https://www.ekamoira.com/blog/mcp-server-discovery-implement-well-known-mcp-json-2026-guide) -- MCP .well-known implementation guide

### Tertiary (LOW confidence)
- MCP .well-known/mcp.json field structure -- spec is still in draft, may change before June 2026 finalization

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero-dep constraint leaves no choices to make; all built-in
- Architecture: HIGH -- follows established Bridge 1 pattern exactly
- OpenAPI discovery: HIGH -- well-documented paths, mature ecosystem
- llms.txt: HIGH -- spec is simple and well-documented at llmstxt.org
- MCP endpoint: MEDIUM -- spec is draft (SEP-1649), format may change
- JSON-LD extraction: HIGH -- regex pattern is well-established for script tag extraction
- Schema.org: HIGH -- JSON-LD @context check and Microdata itemtype regex are standard approaches
- Well-known URIs: HIGH -- security.txt is RFC 9116, ai-plugin.json is documented
- Pitfalls: HIGH -- based on real-world experience with OpenAPI discovery

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (30 days -- most areas are stable; MCP spec may evolve)
