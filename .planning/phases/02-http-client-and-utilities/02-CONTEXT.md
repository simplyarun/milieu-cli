# Phase 2: HTTP Client and Utilities - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**Source:** User-provided implementation spec (conversation)

<domain>
## Phase Boundary

This phase builds the HTTP foundation that every subsequent phase depends on. The HTTP client is the single most critical piece of shared infrastructure in the CLI. Zero new runtime dependencies — Node.js 18+ native fetch (undici-backed), `dns.promises`, `AbortSignal.timeout()`.

Delivers:
- URL normalization utilities (`src/utils/url.ts`)
- SSRF protection with DNS pre-flight (`src/utils/ssrf.ts`)
- HTTP client wrapper with discriminated union errors (`src/utils/http-client.ts`)
- Barrel export (`src/utils/index.ts`)
- Unit tests for all pure functions (URL normalization, SSRF IP checks)

</domain>

<decisions>
## Implementation Decisions

### Implementation Order (Locked)
- Build in sequence: URL normalization → SSRF protection → HTTP client → Barrel export
- Each step depends on the previous

### URL Normalization (Locked)
- `normalizeUrl(input: string): string` — prepend `https://` if no protocol, strip trailing slashes, validate format
- `extractDomain(url: string): string` — return the hostname from a normalized URL
- `resolveRedirectUrl(locationHeader: string, currentUrl: string): string` — resolve relative/absolute/protocol-relative Location headers against current URL
- Edge cases: missing protocol, trailing slashes, query strings preserved, ports preserved, IDN domains, protocol-relative redirects, relative path redirects, empty/malformed Location header returns error (don't throw)

### SSRF Protection (Locked)
- `isPrivateIp(ip: string): boolean` — check against all private/reserved ranges
- `validateDns(hostname: string, cache: DnsCache): Promise<SsrfResult>` — resolve hostname via `dns.promises.lookup()`, check resolved IP against private ranges
- Blocked ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 100.64.0.0/10, 0.0.0.0/8, ::1, fe80::/10, fc00::/7
- IPv4-mapped IPv6 (`::ffff:x.x.x.x`) MUST be converted to IPv4 equivalent and checked against IPv4 private ranges
- DNS cache: `Map<string, string>` (hostname → resolved IP), scan-scoped, no TTL needed
- DNS timeout budget: 3 seconds max, separate from fetch timeout. Fetch gets `userTimeout - dnsElapsed`

### HTTP Client (Locked)
- Primary function: `httpGet(url: string, options: HttpGetOptions): Promise<HttpResponse>` — NEVER throws
- `HttpGetOptions`: method (GET|HEAD), timeout (default 10000ms), maxRedirects (default 5), maxBodyBytes (default 5MB), dnsCache (scan-scoped)
- Use `redirect: 'manual'` on native fetch — non-negotiable for SSRF re-validation at each hop and redirect chain tracking
- Add code comment at `redirect: 'manual'` line explaining SSRF implication
- At each redirect hop: resolve Location header, re-validate SSRF, add to chain, check count
- Retry: single retry on timeout or 5xx only, 2-second delay between attempts. No retry on 4xx, DNS failure, SSL error, SSRF block, connection refused
- Bot protection detection (minimal): 403 + cf-ray header or server:cloudflare → bot_protected; 429 → bot_protected; 503 + challenge indicators → bot_protected
- Body size limit: if Content-Length exceeds 5MB skip body read, return success with empty body. If no Content-Length, read up to 5MB then stop
- Default body decoding UTF-8, handle charset parameter in Content-Type
- User-Agent: `milieu-cli/<version>` on every request, set at client level

### Phase 1 Type Verification (Locked)
- MUST verify `HttpSuccess` includes `headers: Headers` and `redirectChain: string[]` before writing any Phase 2 code
- If missing, fix Phase 1 types first
- Bridge 1 needs X-Robots-Tag from headers, Bridge 2 needs Content-Type, Bridge 3 needs X-API-Version and X-RateLimit-*
- `body_too_large` is a new HttpErrorKind variant needed

### Testing (Locked — In This Phase, NOT Phase 9)
- Unit tests for ALL pure functions in this phase
- URL normalization: stripe.com → https://stripe.com, trailing slashes, query strings, ports, empty string → error, not-a-url → error
- Redirect resolution: relative paths, protocol-relative, absolute, empty → error
- SSRF: every blocked range including all ::ffff: mapped variants, plus allowed public IPs
- Tests are fast, require no mocking for pure functions

### Claude's Discretion
- Internal function decomposition within http-client.ts (e.g., fetchWithRedirects helper)
- Error classification implementation details (switch vs if/else for cause.code matching)
- Test file organization (co-located __tests__ vs separate test directory)
- Whether to use vitest or Node test runner
- Barrel export organization details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Type System
- `src/core/types.ts` — HttpResponse, HttpSuccess, HttpFailure, HttpErrorKind definitions (Phase 1 output)

### Research
- `.planning/phases/02-http-client-and-utilities/02-RESEARCH.md` — Detailed technical research including error cause codes, patterns, pitfalls

### Project
- `.planning/PROJECT.md` — Project constraints (zero-dep philosophy, 3 runtime deps max)
- `.planning/REQUIREMENTS.md` — FOUND-03, FOUND-04, FOUND-05, FOUND-06 requirement details

</canonical_refs>

<specifics>
## Specific Ideas

- Native fetch error classification verified on Node.js v25.8.1: `cause.code === "ENOTFOUND"` (dns), `DOMException.name === "TimeoutError"` (timeout), ECONNREFUSED, CERT_HAS_EXPIRED, etc.
- Concurrent DNS resolution is acceptable; corrupted cache state is not. Pattern: check cache → if miss, resolve → write to cache. Second write wins.
- Response body: use `response.text()` but abort if exceeds threshold
- `new URL(location, currentUrl).href` for relative redirect resolution

</specifics>

<deferred>
## Deferred Ideas

- Integration tests with recorded HTTP fixtures (Phase 9)
- POST/PUT/DELETE methods
- Cookie handling or session management
- Response caching beyond DNS
- Connection pooling configuration
- Streaming responses
- Comprehensive WAF fingerprinting

</deferred>

---

*Phase: 02-http-client-and-utilities*
*Context gathered: 2026-03-18 via user implementation spec*
