# Domain Pitfalls

**Domain:** URL scanning CLI tool for machine legibility assessment
**Researched:** 2026-03-17
**Confidence:** MEDIUM-HIGH (training data + codebase analysis; web search unavailable for verification)

## Critical Pitfalls

Mistakes that cause rewrites, broken trust, or fundamentally wrong results.

---

### Pitfall 1: robots.txt Parsing Does Not Follow RFC 9309

**What goes wrong:** Custom robots.txt parsers diverge from the RFC 9309 standard (published 2022, replacing the informal 1994 spec). Key edge cases that trip up naive parsers:

- **BOM (Byte Order Mark):** UTF-8 BOM (`\xEF\xBB\xBF`) at file start breaks `line.startsWith("User-agent:")`. Real-world robots.txt files from CMS platforms (WordPress, Wix) sometimes include a BOM.
- **Carriage returns:** `\r\n` vs `\n` line endings. Splitting on `\n` alone leaves `\r` attached to values (e.g., agent name becomes `"GPTBot\r"`), breaking case-insensitive matching.
- **Group boundaries:** Per RFC 9309, a group ends when a new `User-agent:` line appears after directives. An empty line does NOT end a group -- but many parsers treat blank lines as group separators. This is the most common parsing bug.
- **Multiple User-agent lines:** Consecutive `User-agent:` lines before any directive all belong to the same group. The current codebase has a known bug here (see CONCERNS.md: "only the second agent is retained").
- **Allow/Disallow precedence:** Per RFC 9309, the most specific path wins (longest match), NOT the first-declared rule. Most naive parsers use first-match or last-match instead.
- **`Disallow:` with empty value:** An empty `Disallow:` means "allow everything" per the spec, NOT "disallow nothing." This is unintuitive and commonly implemented incorrectly.
- **Case sensitivity:** Directives (`User-agent`, `Disallow`, `Allow`) are case-INsensitive, but path values are case-sensitive. Many parsers lowercase everything.
- **BOM + encoding:** RFC 9309 mandates UTF-8, but real-world files appear in Latin-1, Windows-1252, or with mixed encoding. Treating non-UTF-8 as UTF-8 can produce garbled agent names.
- **Inline comments:** `Disallow: /private # secret stuff` -- the `# secret stuff` is a comment, not part of the path. Many parsers include it.

**Why it happens:** robots.txt looks deceptively simple. Developers write a parser in 50 lines, test against 3 files, and ship it. The RFC is 20 pages of edge cases.

**Consequences:** Wrong AI crawler policy detection -- the single most user-verifiable check. If users compare milieu's output to their own robots.txt reading and find discrepancies, the tool loses all credibility.

**Prevention:**
1. Strip BOM and normalize `\r\n` to `\n` as the first step in parsing.
2. Handle inline comments by stripping `#` and everything after from directive values.
3. Implement group boundaries per RFC 9309 (not blank-line based).
4. Implement longest-path-match for Allow/Disallow precedence.
5. Build a test suite of 20+ edge-case robots.txt files (Google publishes a reference parser test suite).
6. Consider using Google's `robots-parser` npm package as a reference implementation for validation, even if not used directly (3-dep constraint).

**Detection:** Unit test failures against RFC 9309 test vectors. User bug reports saying "your tool says X is blocked but my robots.txt allows it."

**Phase:** Bridge 1 (Reachability) -- must be bulletproof from day one.

---

### Pitfall 2: Bot Protection False Positives Destroy Result Accuracy

**What goes wrong:** The tool reports "blocked by bot protection" when content is actually accessible, or reports content as real when it is actually a Cloudflare/WAF challenge page.

Specific failure modes:
- **False positive on 403:** Not all 403s are WAFs. Many sites return 403 for paths that genuinely don't exist or require auth. The current code treats ALL 403 responses on HTML as bot protection, which is wrong.
- **Soft blocks:** Some WAFs serve a 200 status with a JavaScript challenge page. If the body is >10KB (current threshold), the detection skips it entirely. Real challenge pages from Akamai and Imperva can exceed 10KB.
- **CAPTCHA walls on non-homepage paths:** Site serves homepage fine but blocks `/robots.txt`, `/openapi.json`, or `/.well-known/` paths. The tool sees homepage as accessible but specific checks silently fail.
- **Rate limiting across checks:** Sequential requests to the same domain within milliseconds trigger rate limiters. The tool makes 10-20+ requests per scan, which looks like a bot to many WAFs.
- **Cloudflare Turnstile/managed challenge:** Newer Cloudflare challenge variants use different DOM markers than the signatures in the current code. These evolve monthly.

**Why it happens:** Bot protection is an arms race. Static signature lists go stale. Thresholds that work today break tomorrow.

**Consequences:** Users scanning their own site get told "blocked" when they know the content exists. Or worse, the tool reports "no robots.txt found" when it was actually blocked -- a false negative that misleads the user about their site's AI readiness.

**Prevention:**
1. Never treat HTTP 403 alone as "bot protection." Check body content signatures AND status code together.
2. Remove the 10KB size threshold for challenge detection, or make it much larger (50KB). Instead, check for the ABSENCE of meaningful content (no `<main>`, no `<article>`, minimal text nodes).
3. Add explicit request delays between checks to the same domain (100-200ms between requests).
4. Make bot protection detection return a confidence level, not a boolean. "LIKELY_BLOCKED" vs "CONFIRMED_BLOCKED" vs "POSSIBLY_BLOCKED."
5. Add a `--user-agent` flag so users can override the default UA if their own WAF is blocking the tool.
6. Detect the specific protection vendor when possible (Cloudflare, Akamai, Imperva) and report it in output.

**Detection:** Test against sites known to use Cloudflare, Akamai, and Datadome. If >30% of scans show "blocked," the detection is likely wrong.

**Phase:** Bridge 1 (Reachability) -- HTTP handling foundation.

---

### Pitfall 3: JSON Output API Contract Breaks Downstream Consumers

**What goes wrong:** The `ScanResult` JSON schema changes between versions, breaking CI/CD integrations, dashboards, and programmatic consumers who depend on stable field names, types, and structure.

Common ways this breaks:
- **Renaming fields:** `aiCrawlerDirectives` becomes `crawlerPolicies` -- seems like a cleanup, breaks every consumer.
- **Changing types:** A field that was `boolean` becomes `boolean | null` or `string`. TypeScript users catch this; jq scripts and Python consumers do not.
- **Removing fields:** Dropping a field that "nobody uses" breaks the one integration that does.
- **Adding required fields:** New checks that add top-level fields are fine, but adding required fields to existing objects is breaking.
- **Nested structure changes:** Moving `score` from `bridges.reachability.score` to `bridges[0].score` is a complete rewrite for consumers.
- **Null vs undefined vs missing:** JSON has no `undefined`. If TypeScript types say `field?: string` but JSON output sometimes includes the key as `null` and sometimes omits it, consumers must handle both.

**Why it happens:** The CLI is the primary user-facing output, so developers optimize for terminal display and treat JSON as an afterthought. Schema evolves organically as features are added.

**Consequences:** Loss of trust from the developer audience most likely to advocate for the tool (CI/CD integrators, DevOps engineers). Once they build around the JSON schema and it breaks, they switch tools.

**Prevention:**
1. Define a TypeScript `ScanResult` interface on day one and treat it as a public API. Export it from the package.
2. Write the interface FIRST, then implement checks to produce it. Not the other way around.
3. Version the JSON output with a top-level `version` field (e.g., `"version": "1.0"`).
4. Use `null` for "checked but not found" and omit keys for "not checked." Document this convention.
5. Add a snapshot test that serializes a full `ScanResult` to JSON and diffs against a committed fixture. Any schema change must update the fixture explicitly.
6. Follow semver strictly: any field removal or type change is a major version bump.

**Detection:** Snapshot test failures on CI. If you are tempted to update the snapshot "because the output changed," that is the warning sign.

**Phase:** Foundation/Phase 1 -- define schema before implementing any bridge.

---

### Pitfall 4: OpenAPI Spec Detection Has High False Positive Rate

**What goes wrong:** The tool reports "OpenAPI spec found" when it finds a JSON/YAML file at a well-known path that is not actually an OpenAPI spec, or misses specs served at non-standard paths.

Specific failure modes:
- **Non-OpenAPI JSON at `/openapi.json`:** Some sites serve error pages, redirects, or unrelated JSON at this path. A 200 response with JSON content is not proof of an OpenAPI spec.
- **YAML parsing hazard:** OpenAPI specs can be YAML. Parsing YAML safely without a dependency is extremely difficult -- YAML has features like anchors, aliases, and type coercion that can cause security issues or crashes.
- **Version detection:** OpenAPI 2.0 (Swagger) uses `"swagger": "2.0"`, OpenAPI 3.0+ uses `"openapi": "3.0.x"`. Missing this distinction means reporting "found" for a 10-year-old Swagger 2.0 spec that is probably unmaintained.
- **Spec behind authentication:** Many API docs require auth. Getting a 401/403 at `/openapi.json` does not mean "no spec" -- it means "spec exists but is protected."
- **HTML documentation pages at spec paths:** `/docs`, `/api-docs`, `/swagger` often serve HTML documentation pages, not the JSON/YAML spec itself. Reporting these as "OpenAPI found" is misleading.
- **Redirect to docs UI:** `/openapi.json` redirects to `/docs` which is a Swagger UI page, not the spec itself.

**Why it happens:** OpenAPI detection requires content validation, not just path probing. Nine probe paths (per PROJECT.md) multiplied by ambiguous responses equals high false positive surface area.

**Consequences:** "Your site has an OpenAPI spec" when it does not is embarrassing and undermines the tool's authority. Developers who publish APIs know whether they have a spec.

**Prevention:**
1. After fetching a candidate path, validate the response is valid JSON and contains either `"openapi":` or `"swagger":` as a top-level key. This alone eliminates 90% of false positives.
2. Check `Content-Type` header: must be `application/json`, `application/yaml`, `text/yaml`, or `application/vnd.oai.openapi+json`. HTML responses at spec paths are documentation pages, not specs.
3. For paths that return HTML (Swagger UI, Redoc), report as "API documentation found" separately from "OpenAPI spec found." These are different signals.
4. Do NOT attempt to parse YAML without a library. If content is YAML, detect it by checking for `openapi:` or `swagger:` as a line prefix, but do not fully parse.
5. Report the OpenAPI version detected (`2.0`, `3.0`, `3.1`) -- this is useful signal for consumers.
6. Treat 401/403 at spec paths as "possibly exists but requires auth" rather than "not found."

**Detection:** Test against 20+ known API sites (Stripe, GitHub, Twilio) and 20+ known non-API sites (blogs, landing pages). False positive rate should be <5%.

**Phase:** Bridge 2 (Standards) -- OpenAPI discovery implementation.

---

### Pitfall 5: `fetchUrl` Returns Null for All Errors, Losing Diagnostic Information

**What goes wrong:** The current `fetchUrl` function returns `null` for DNS failure, SSRF block, timeout, connection refused, TLS error, and protocol error -- all indistinguishable at the call site. The rebuild must not repeat this.

Specific problems:
- **DNS failure vs. timeout:** A DNS failure means the domain does not exist. A timeout means the domain exists but is slow. These require completely different handling (abort scan vs. retry).
- **SSRF block vs. 404:** The tool blocks internal IPs (correctly) but returns the same `null` as a genuine 404. The caller cannot tell if the URL was unsafe or simply not found.
- **TLS certificate errors:** `fetch()` in Node 18+ rejects invalid/expired certificates. For a scanning tool, this is valuable signal about the domain's health, not just an error to swallow.
- **Connection refused:** Means something is listening on DNS but nothing on port 443/80. Different from DNS failure or timeout.

**Why it happens:** Returning `null` is the path of least resistance. Discriminated unions require more thought upfront but pay off in every consumer.

**Consequences:** The tool cannot give users meaningful error messages. "Scan failed" is unhelpful. "DNS resolution failed for example.com" is actionable. Also prevents smart retry logic (retry on timeout, do not retry on DNS failure).

**Prevention:**
1. Define a result type like `{ ok: true, data: FetchResult } | { ok: false, error: 'dns' | 'timeout' | 'ssrf_blocked' | 'tls_error' | 'connection_refused' | 'too_many_redirects' | 'http_error', status?: number, message: string }`.
2. Implement this in the HTTP layer from day one. Retrofitting discriminated unions is painful.
3. Map Node.js error codes to the enum: `ENOTFOUND` = dns, `ECONNREFUSED` = connection_refused, `CERT_*` = tls_error, `AbortError` = timeout.
4. Surface the error type in both terminal output and JSON output.

**Detection:** If any check has a `catch(err) { return someDefault }` pattern, the error context is being lost.

**Phase:** Foundation/Phase 1 -- HTTP utility layer.

---

## Moderate Pitfalls

### Pitfall 6: JSON-LD Parsing Treats Invalid Markup as Absent

**What goes wrong:** Sites with malformed JSON-LD (missing commas, trailing commas, unquoted keys, HTML entities inside JSON) get reported as "no structured data" when they actually have it -- just broken.

Real-world JSON-LD problems:
- WordPress plugins that inject `<script type="application/ld+json">` with unescaped HTML entities (`&amp;` instead of `&`).
- Multiple JSON-LD blocks on one page, some valid and some invalid.
- JSON-LD containing JavaScript-style comments (`//` or `/* */`), which are invalid JSON.
- Nested `@graph` structures that are syntactically valid but semantically nonsensical.

**Prevention:**
1. Use a lenient JSON parser or pre-process common errors (strip trailing commas, unescape HTML entities) before `JSON.parse`.
2. Report both valid and invalid JSON-LD block counts: "Found 3 JSON-LD blocks (2 valid, 1 malformed)."
3. Never silently swallow parse errors. Capture and report them.
4. Extract Schema.org `@type` values even from partially parseable blocks.

**Phase:** Bridge 2 (Standards) -- JSON-LD/Schema.org detection.

---

### Pitfall 7: Terminal Output Rendering Breaks on Windows and Non-256-Color Terminals

**What goes wrong:** CLI output that looks beautiful on macOS iTerm2 breaks on Windows Terminal, VS Code integrated terminal, CI/CD logs, or piped output.

Specific failure modes:
- **Unicode characters:** Progress bar characters (``, ``, ``) not available in Windows cmd.exe default code page.
- **ANSI color codes in piped output:** `milieu scan example.com | tee log.txt` writes ANSI escape sequences to the file, making it unreadable.
- **Spinner animation in non-TTY:** ora spinner writes `\r` to move cursor, which shows as literal text in CI logs.
- **Wide characters:** CJK domain names or emoji in output cause column alignment to break.
- **NO_COLOR and FORCE_COLOR:** The `NO_COLOR` environment variable (https://no-color.org/) is a community standard. chalk v5 respects it, but custom color logic might not.

**Prevention:**
1. Use `process.stdout.isTTY` to disable spinner, progress bars, and animations when output is piped or in CI.
2. chalk v5 already respects `NO_COLOR`, `FORCE_COLOR`, and `--no-color`. Do not override this behavior.
3. Use ASCII fallbacks for progress bars when `isTTY` is false or when terminal does not support Unicode.
4. Test output rendering in: macOS Terminal.app, iTerm2, VS Code terminal, Windows Terminal, GitHub Actions CI logs.
5. Always support `--json` as a first-class output mode that produces zero non-JSON output to stdout. Logs/progress go to stderr.

**Phase:** Rendering/output layer -- likely Phase 2 or whenever terminal output is built.

---

### Pitfall 8: npm Package Publishing Missteps

**What goes wrong:** First publish of `milieu-cli` has packaging issues that create a bad first impression.

Specific failure modes:
- **Missing `files` field in package.json:** Without it, npm publishes the entire repo including `.planning/`, test fixtures, `.git/`, etc. Package balloons to 10MB+.
- **Wrong `bin` path:** `"bin": { "milieu": "./dist/index.js" }` but `dist/index.js` lacks the shebang `#!/usr/bin/env node`. Works on macOS, fails on some Linux.
- **Missing `type: "module"` for ESM:** Required for ESM packages. Without it, `.js` files are treated as CommonJS.
- **`exports` field incorrect:** Modern Node.js resolution uses `exports` over `main`. If `exports` map is wrong, `import { scan } from "milieu-cli"` fails even though `main` points to the right file.
- **Name squatting check:** The name `milieu-cli` may already be taken on npm. Check BEFORE building anything.
- **Prepublish script not building:** If `prepublishOnly` does not run `npm run build`, the published package may contain stale `dist/` output.
- **`engines` field mismatch:** Declaring `"node": ">=18"` but using `fetch()` which requires Node 18.0+ (but some Node 18 early versions have broken fetch). Should be `"node": ">=18.13.0"` or later.

**Prevention:**
1. Add `"files": ["dist", "README.md", "LICENSE"]` to package.json.
2. Add shebang `#!/usr/bin/env node` to the entry point and ensure tsup preserves it (use `banner` option).
3. Add `"exports"` field with proper subpath exports for both types and runtime.
4. Run `npm pack --dry-run` and inspect the file list before every publish.
5. Add `"prepublishOnly": "npm run build && npm run typecheck"`.
6. Check `npm view milieu-cli` early to verify name availability.
7. Use `np` or a similar publish helper to avoid common mistakes.

**Phase:** Pre-publish checklist, likely final phase.

---

### Pitfall 9: Concurrent Requests Within a Bridge Overwhelm Target Servers

**What goes wrong:** Bridge 2 probes 9 OpenAPI paths + llms.txt + llms-full.txt + MCP endpoint + well-known URIs concurrently. That is 15+ simultaneous requests to the same origin, which triggers rate limiting, WAF blocks, or server overload.

**Prevention:**
1. Implement a per-domain concurrency limiter (max 3-4 concurrent requests to same origin).
2. Add 50-100ms delay between request batches to the same domain.
3. Use a shared request cache/dedup layer so the same URL is never fetched twice across bridges.
4. If a 429 is received, pause ALL pending requests to that domain, not just the one that got rate-limited.

**Detection:** Scan results that show "blocked" for later checks but "success" for earlier ones within the same bridge.

**Phase:** HTTP utility layer (Phase 1), but enforce during Bridge 2 implementation.

---

### Pitfall 10: llms.txt and MCP Endpoint Standards Are Unstable

**What goes wrong:** The llms.txt proposal and MCP (Model Context Protocol) server discovery are both new, evolving standards. Building detection logic against today's draft means the checks may be wrong within months.

Specific risks:
- **llms.txt:** The spec (from Jina AI) may change path conventions, required fields, or format. There is no RFC -- it is a community proposal.
- **MCP endpoints:** MCP server discovery (via `/.well-known/mcp` or similar) is not yet standardized. Anthropic's MCP spec evolves rapidly. Checking for a specific path today may be wrong next quarter.
- **False positives on llms.txt:** Some sites have `/llms.txt` that contains unrelated content (not following the llms.txt proposal format).

**Prevention:**
1. Validate llms.txt content structure, not just path existence. At minimum, check for expected format markers.
2. For MCP, check the latest Anthropic MCP spec before implementation. Do not rely on training data.
3. Design these checks to be easily updatable -- isolate path lists, format validators, and version expectations into configuration rather than hardcoding.
4. Add a `specVersion` or `detectedFormat` field to results so consumers know what standard was matched.
5. Document in code comments which spec version/date each check targets.

**Detection:** If the check passes for sites that obviously do not implement the standard, the detection is too permissive.

**Phase:** Bridge 2 (Standards) -- needs research spike before implementation.

---

### Pitfall 11: URL Normalization Edge Cases Cause Duplicate or Missed Scans

**What goes wrong:** Input URL normalization is subtler than `trim().toLowerCase().stripProtocol()`.

Specific edge cases:
- **Trailing slash matters:** `example.com/api` and `example.com/api/` may serve different content. Stripping trailing slashes can miss this.
- **Punycode/IDN domains:** `münchen.de` must be converted to `xn--mnchen-3ya.de` for DNS resolution but displayed as the unicode form to users.
- **Port numbers:** `example.com:443` is the same as `example.com` for HTTPS but different for HTTP.
- **URL fragments:** `example.com/page#section` -- the fragment is never sent to the server, so it should always be stripped.
- **Query parameters:** `example.com/?utm_source=foo` -- should these be stripped? For a domain scanner, probably yes, but this is a judgment call.
- **Mixed case paths:** `example.com/API/v1` vs `example.com/api/v1` -- paths ARE case-sensitive on most servers.
- **Double encoding:** `example.com/%2Frobots.txt` is not the same as `example.com/robots.txt`.

**Prevention:**
1. Use Node's `URL` constructor for parsing -- it handles most normalization.
2. Preserve path case (do not lowercase paths, only hostname).
3. Strip fragments always. Strip query parameters for the base scan target, preserve for specific check paths.
4. Handle IDN domains with `url.hostname` (which returns punycode) vs display with the original input.
5. Build a test matrix of 15+ URL variations and expected normalized forms.

**Phase:** Foundation/Phase 1 -- URL handling utilities.

---

## Minor Pitfalls

### Pitfall 12: Schema.org Type Detection Without Vocabulary Awareness

**What goes wrong:** Detecting `@type` in JSON-LD without understanding the Schema.org vocabulary leads to reporting meaningless types. A page with `@type: "WebPage"` has schema markup technically, but this tells the user nothing useful. A page with `@type: "Product"` with price, availability, and reviews is meaningfully marked up.

**Prevention:**
1. Categorize detected Schema.org types into tiers: high-value (`Product`, `Article`, `Organization`, `FAQPage`, `HowTo`), standard (`WebPage`, `WebSite`, `BreadcrumbList`), and custom/unknown.
2. Report the most specific type found, not just "JSON-LD present."
3. Do not attempt to validate schema completeness -- that is out of scope and fragile.

**Phase:** Bridge 2 (Standards) -- Schema.org/JSON-LD reporting.

---

### Pitfall 13: Shebang and ESM Interop for `npx` Execution

**What goes wrong:** `npx milieu-cli scan example.com` fails on first run because of ESM/CommonJS interop issues or missing shebang.

Specific issues:
- Node.js ESM requires `--experimental-vm-modules` for some test frameworks but NOT for regular execution. However, some older Node 18 versions have ESM quirks.
- `#!/usr/bin/env node` must be the FIRST line. tsup's `banner` option can place it correctly, but if the build output wraps in an IIFE or adds `"use strict"`, the shebang may not be first.
- `npx` caches packages. During development, `npx milieu-cli@latest` may use a cached broken version.

**Prevention:**
1. Test `npx` execution specifically in CI (not just `node dist/index.js`).
2. Verify shebang is first byte of output file after build: `head -c 20 dist/index.js`.
3. Test on Node 18.x AND Node 20.x AND Node 22.x in CI matrix.

**Phase:** Build/publish phase.

---

### Pitfall 14: SSRF Protection Bypass via DNS Rebinding

**What goes wrong:** SSRF checks validate the hostname at URL construction time, but DNS can resolve differently at fetch time. An attacker could craft a domain that resolves to a public IP on first lookup (passing validation) and a private IP on second lookup (during fetch). This is DNS rebinding.

**Prevention:**
1. For a scanning tool where the user provides the URL, this is lower risk than in a server-side context. The user is attacking their own machine.
2. Document that SSRF protection is best-effort and designed to prevent accidental scanning of internal resources, not adversarial attacks.
3. Consider using `dns.resolve` to pre-resolve and pin the IP, then validate the resolved IP, then use it for the request. This closes the rebinding window.
4. The current IPv4-mapped IPv6 gap (`::ffff:127.0.0.1`) noted in CONCERNS.md should be fixed.

**Phase:** HTTP utility layer (Phase 1).

---

### Pitfall 15: Test Fixtures Become Stale and Misleading

**What goes wrong:** Integration tests use recorded HTTP fixtures (as specified in PROJECT.md). Over time, real websites change their robots.txt, structured data, and API documentation. Tests pass against stale fixtures while the code fails against real sites.

**Prevention:**
1. Date-stamp every fixture file. Include a comment with the source URL and recording date.
2. Have a separate CI job (weekly, not on every PR) that runs against a curated list of live URLs and compares results to fixture-based expectations. Failures are informational, not blocking.
3. Fixtures should test parsing edge cases (malformed robots.txt, challenge pages, various JSON-LD formats), not "does stripe.com still have an OpenAPI spec."
4. Separate "unit test fixtures" (synthetic edge cases, stable forever) from "integration test fixtures" (real-world snapshots, expire).

**Phase:** Testing infrastructure -- build alongside each bridge.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| HTTP utility layer | Pitfall 5 (null returns), Pitfall 14 (SSRF bypass), Pitfall 9 (concurrent requests) | Design discriminated union result type first; implement concurrency limiter early |
| Bridge 1 (Reachability) | Pitfall 1 (robots.txt parsing), Pitfall 2 (bot protection false positives) | RFC 9309 test suite; graduated bot detection confidence |
| Bridge 2 (Standards) | Pitfall 4 (OpenAPI false positives), Pitfall 6 (JSON-LD parsing), Pitfall 10 (unstable specs) | Content validation not just path probing; research llms.txt and MCP specs fresh |
| Bridge 3 (Separation) | Low pitfall risk -- detection-only, no scoring | Main risk is scope creep into evaluation |
| JSON output schema | Pitfall 3 (API contract breaks) | Define ScanResult interface before implementation; snapshot tests |
| Terminal rendering | Pitfall 7 (cross-platform rendering) | TTY detection, ASCII fallbacks, NO_COLOR support |
| npm publishing | Pitfall 8 (packaging missteps), Pitfall 13 (ESM/shebang) | `npm pack --dry-run`, CI matrix across Node versions |
| URL handling | Pitfall 11 (normalization edge cases) | Use URL constructor, test matrix of edge cases |
| Testing | Pitfall 15 (stale fixtures) | Separate synthetic edge cases from real-world snapshots |

## Sources

- RFC 9309: Robots Exclusion Protocol (https://www.rfc-editor.org/rfc/rfc9309) -- HIGH confidence for robots.txt parsing rules
- Google robots.txt parser reference implementation (https://github.com/google/robotstxt) -- HIGH confidence for edge case behavior
- no-color.org convention (https://no-color.org/) -- HIGH confidence for terminal output standards
- Existing codebase analysis (`src/checks/robots.ts`, `src/checks/fetch-utils.ts`) -- HIGH confidence for current implementation gaps
- `.planning/codebase/CONCERNS.md` -- HIGH confidence for known issues
- OpenAPI Specification 3.1 (https://spec.openapis.org/oas/v3.1.0) -- HIGH confidence for spec detection rules
- npm packaging best practices -- MEDIUM confidence (training data, not verified against latest npm docs)
- MCP protocol and llms.txt spec details -- LOW confidence (rapidly evolving, training data may be stale)
