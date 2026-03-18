# Phase 3: Bridge 1 (Reachability) - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**Source:** User-provided implementation spec (conversation)

<domain>
## Phase Boundary

Bridge 1 answers: Can agents perceive the content at all? This is the gate — if the site is unreachable or blocks AI crawlers, nothing else matters. Bridge 1 runs first, and its result determines whether Bridges 2-3 execute at all.

Delivers:
- HTTPS availability check (HEAD request)
- HTTP status with redirect tracking
- robots.txt fetcher + RFC 9309 compliant parser (separate files)
- AI crawler policy evaluation for 6 crawlers
- Meta robots tags + X-Robots-Tag header parsing
- Bridge 1 scoring with partial (0.5) support
- Abort signal for unreachable targets
- Unit tests for all pure functions (parser, policy, meta robots)

File structure:
```
src/bridges/reachability/
  index.ts              # Orchestrator — runs all checks, returns BridgeResult
  https-check.ts        # REACH-01: HTTPS availability
  http-status.ts        # REACH-02: HTTP status + redirect tracking
  robots-txt.ts         # REACH-03: Fetch robots.txt, delegates to parser
  robots-parser.ts      # RFC 9309 parser (pure logic, no I/O)
  crawler-policy.ts     # REACH-04: Per-AI-crawler policy evaluation
  meta-robots.ts        # REACH-06, REACH-07: Meta tags + X-Robots-Tag headers
```

</domain>

<decisions>
## Implementation Decisions

### HTTP Request Strategy (Locked)
- Orchestrator makes exactly TWO HTTP requests: GET target URL + GET /robots.txt
- Pass response objects downstream to check functions — no redundant requests
- Check functions receive already-fetched responses, not URLs

### robots-parser.ts Separation (Locked)
- Parser is a separate file from robots-txt.ts (fetcher)
- Parser is pure logic, no I/O — trivially unit testable
- This is the most complex piece in Bridge 1. Keep it isolated.

### RFC 9309 Compliance (Locked)
- BOM stripping (UTF-8 BOM \xEF\xBB\xBF)
- CRLF / LF / CR line endings
- Group boundaries: new User-agent after a rule line starts new group; consecutive User-agent lines are same group
- Case-insensitive directive names, case-sensitive paths
- Empty Disallow: = allow all for that group
- Wildcard * in paths matches zero or more characters
- $ end anchor (Disallow: /api$ blocks /api but not /api/v1)
- Unknown directives: ignore (don't error)
- Sitemap: lines parsed and stored, not tied to any group
- Comments: strip everything after # on each line
- Rule precedence: longest matching pattern wins; if tied, Allow beats Disallow

### Parser Types (Locked)
```typescript
interface RobotsTxtResult {
  parseable: boolean;
  ruleCount: number;
  groups: RobotsGroup[];
  sitemaps: string[];
}

interface RobotsGroup {
  userAgents: string[];     // Lowercased for matching
  rules: RobotsRule[];      // In document order
}

interface RobotsRule {
  type: "allow" | "disallow";
  path: string;             // Raw path pattern (may include * and $)
}
```

### Path Matching Function (Locked)
- `matchesPath(pattern: string, path: string): boolean`
- Convert robots.txt pattern to regex: * → .*, $ at end → anchor, all other chars escaped
- Needed for both partial detection and rule precedence

### Crawler Policy Evaluation (Locked)
- 6 crawlers: GPTBot, ClaudeBot, CCBot, Googlebot, Bingbot, PerplexityBot
- For each crawler: find most specific matching group, fall back to * group, if no * group → allowed
- Evaluation: no rules or empty Disallow → pass; Disallow: / with no Allow → fail; any non-root Disallow → warn (partial); Disallow: / with Allow rules → warn (partial)
- If crawler not mentioned and * has Disallow: /, crawler inherits that block
- If crawler not mentioned and * has no rules or doesn't exist → allowed
- If robots.txt not found (404): all crawlers get status `skip` with detail "No robots.txt found"
- If robots.txt unparseable: all crawlers get status `skip`

### Meta Robots (Locked)
- Regex-based, NOT HTML parser — avoids cheerio/htmlparser2 dependency
- Scope regex to <head>...</head> only
- Handle both attribute orders: name then content, content then name
- Handle single/double quotes, whitespace variations, self-closing tags
- Check for robots, googlebot, bingbot names
- noindex → fail, nofollow → warn, absent → pass
- DO NOT use regex for Bridge 2 or 3 HTML scanning. Phase 4 decides HTML parser.

### X-Robots-Tag (Locked)
- Read from response.headers["x-robots-tag"]
- Not present → pass
- Contains noindex → fail
- Contains other directives (nofollow, noarchive) → warn

### Scoring (Locked)
- Score = (points / maxPoints) * 100
- Pass = 1 point, Warn/Partial = 0.5 points, Fail = 0 points
- Skip = EXCLUDED from both numerator AND denominator (not counted as zero)
- This is critical: no robots.txt shouldn't tank the score. "No policy" ≠ "bad policy"
- Example: no robots.txt → 3.5/4 = 87.5%, not 3.5/11 = 31.8%
- Bridge status: score >= 80 → pass, 40-79 → partial, < 40 → fail

### Abort Contract (Locked)
- Abort on: dns, connection_refused, ssl_error from REACH-01
- Do NOT abort on: bot_protected, timeout, http_error
- bot_protected: site exists, just rejected automated request. Report as finding, continue.
- timeout: HTTP client already retried once. Mark as fail but don't abort — try robots.txt independently.
- Abort signal via field on BridgeResult: `abort?: boolean; abortReason?: string;`
- Consistent with "never throws" philosophy from Phase 2

### HTTPS Check (Locked)
- HEAD request to https://<domain> (not GET — save bandwidth)
- Pass: any response received (even 4xx/5xx means HTTPS works)
- Fail: SSL error, connection refused, DNS failure, timeout

### HTTP Status Check (Locked)
- Takes already-fetched GET response (no HTTP call)
- Pass: 200, Warn: 301/302/307/308 (report redirect target), Fail: 4xx/5xx/timeout/error
- bot_protected → fail with detail about bot protection

### robots.txt Fetch (Locked)
- Fetches https://<domain>/robots.txt
- Pass: 200 + parseable
- Warn: 404 (no file = no restrictions but no explicit policy)
- Fail: 200 but unparseable (binary file, HTML error page)
- Detect unparseable: Content-Type not text/plain AND no recognizable directives
- Returns parsed RobotsTxtResult alongside Check for downstream use

### BridgeResult Extension (Locked)
- Add `abort?: boolean` and `abortReason?: string` to BridgeResult interface
- Scan orchestrator checks result.abort rather than try-catch

### Claude's Discretion
- Internal helper function organization within each check file
- Whether to create a shared constants file for crawler configs
- Test file organization (co-located __tests__ or separate)
- Whether matchesPath is in robots-parser.ts or a separate utility

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Type System
- `src/core/types.ts` — Check, BridgeResult, ScanContext, HttpResponse definitions

### Phase 2 Outputs
- `src/utils/http-client.ts` — httpGet function (the only HTTP caller)
- `src/utils/url.ts` — normalizeUrl, extractDomain
- `src/utils/ssrf.ts` — SSRF protection (used by httpGet internally)
- `src/utils/index.ts` — barrel exports

### Project
- `.planning/PROJECT.md` — Project constraints (zero-dep philosophy)
- `.planning/REQUIREMENTS.md` — REACH-01 through REACH-09 requirement details

### Research
- `.planning/phases/03-bridge-1-reachability/03-RESEARCH.md` — (will be created by researcher)

</canonical_refs>

<specifics>
## Specific Ideas

### Check Inventory (11 checks total)
| ID | Check | Source File |
|----|-------|-------------|
| REACH-01 | HTTPS available | https-check.ts |
| REACH-02 | HTTP status | http-status.ts |
| REACH-03 | robots.txt exists and parseable | robots-txt.ts |
| REACH-04a | GPTBot policy | crawler-policy.ts |
| REACH-04b | ClaudeBot policy | crawler-policy.ts |
| REACH-04c | CCBot policy | crawler-policy.ts |
| REACH-04d | Googlebot policy | crawler-policy.ts |
| REACH-04e | Bingbot policy | crawler-policy.ts |
| REACH-04f | PerplexityBot policy | crawler-policy.ts |
| REACH-05a | Meta robots tags | meta-robots.ts |
| REACH-05b | X-Robots-Tag header | meta-robots.ts |

### Example Score Calculations
- All pass: 11/11 = 100
- No robots.txt (404): REACH-01 pass(1), REACH-02 pass(1), REACH-03 warn(0.5), REACH-04a-f skip(excluded), REACH-05a pass(1), REACH-05b pass(1) → 3.5/4 = 87.5
- GPTBot+ClaudeBot blocked, rest pass: 9 pass(9) + 2 fail(0) = 9/11 = 82

### Crawler Config
```typescript
const AI_CRAWLERS = [
  { id: "gptbot", name: "GPTBot", userAgent: "gptbot" },
  { id: "claudebot", name: "ClaudeBot", userAgent: "claudebot" },
  { id: "ccbot", name: "CCBot", userAgent: "ccbot" },
  { id: "googlebot", name: "Googlebot", userAgent: "googlebot" },
  { id: "bingbot", name: "Bingbot", userAgent: "bingbot" },
  { id: "perplexitybot", name: "PerplexityBot", userAgent: "perplexitybot" },
];
```

</specifics>

<deferred>
## Deferred Ideas

- HTML parser for Bridge 2/3 (Phase 4 decision)
- Integration tests with recorded HTTP fixtures (Phase 9)
- Verbose mode terminal rendering (Phase 6)
- Sitemap validation or scoring
- Additional crawler detection beyond the 6 specified

</deferred>

---

*Phase: 03-bridge-1-reachability*
*Context gathered: 2026-03-18 via user implementation spec*
