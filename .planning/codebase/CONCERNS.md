# Codebase Concerns

**Analysis Date:** 2026-03-17

## Architecture Limitations

**Single-Page Scoring Bias:**
- Issue: All checks operate exclusively on the homepage (`/`) only. Schema markup, semantic HTML, freshness signals, and other content quality metrics are assessed on a single page rather than across the site
- Files: `src/checks/schema-markup.ts`, `src/checks/http-health.ts`
- Impact: Misleading scores for sites where homepage lacks schema/metadata but internal pages are well-structured. A product-heavy site with schema only on product pages will score low despite good AI-agent readiness on actual content
- Fix approach: Extend checks to probe `/docs`, `/guides`, or `/blog` pages; or accept and document this as a known limitation more prominently in README

**Homepage-Only Content Analysis:**
- Issue: HTTP health check (visible text, JS-free content, TTFB) runs only on homepage
- Files: `src/checks/http-health.ts` line 56-112
- Impact: Site with server-rendered homepage but JS-heavy product pages will appear to have better JS-free content than reality
- Fix approach: Sample multiple representative pages (docs, blog, product) and average, or explicitly target non-homepage content

## Error Handling Gaps

**Silent Failure on Bot Protection:**
- Issue: When bot protection (WAF, Cloudflare, etc) blocks requests, checks return partial/empty results without clear signal that content was genuinely unavailable vs. blocked
- Files: `src/checks/fetch-utils.ts` line 123-148 (detectBotProtection), all check files
- Impact: False negatives in scoring — blocked sites appear to have no schema/robots/llms.txt when they may exist but are protected
- Fix approach: Add explicit "BLOCKED" status distinct from "NOT_FOUND" in result types; consider optional retry with rotating User-Agents or explicit flag to user

**Incomplete JSON-LD Parse Errors Silently Ignored:**
- Issue: Malformed JSON-LD blocks caught in try-catch but silently skipped
- Files: `src/checks/schema-markup.ts` line 377-386
- Impact: Site with 50% malformed JSON-LD may appear to have schema markup when only valid blocks are counted
- Fix approach: Log/warn about parse failures; return metadata about quality of structured data (e.g., percentage valid vs. invalid blocks)

**Missing Result Validation:**
- Issue: `fetchUrl()` returns `null` on all errors, making it impossible to distinguish timeout from SSRF block from 404 at call site
- Files: `src/checks/fetch-utils.ts` line 162-287
- Impact: Caller can't determine root cause; appropriate retry logic isn't possible
- Fix approach: Return discriminated union or more detailed error type

## Performance & Scaling Concerns

**Unbounded Sitemap Index Sampling:**
- Issue: Sitemap index processing fetches child sitemaps sequentially via `Promise.allSettled`, but no timeout per child fetch
- Files: `src/checks/sitemap.ts` line 88-126
- Impact: Very large sitemap indices (1000+ children) could be slow; timeout applies to each child but no aggregate timeout
- Fix approach: Add max concurrent fetches limit, or aggregate timeout for entire index processing

**Regex Performance on Large HTML:**
- Issue: Schema markup check runs 11+ regex iterations over full HTML body for various pattern matches
- Files: `src/checks/schema-markup.ts` line 99-227 (semantic HTML analysis alone has 5+ passes)
- Impact: 5-10 MB homepage HTML could cause noticeable lag
- Fix approach: Single-pass parsing with regex accumulation or HTML parsing library

**No Request Deduplication:**
- Issue: Main flow makes parallel requests but same paths called by different checks could duplicate work
- Files: `src/index.ts` line 126-144
- Impact: If sitemap check calls robots.txt and schema check needs robots directives, they're fetched twice
- Fix approach: Implement request cache at fetch layer

## Test Coverage Gaps

**No Test Suite:**
- Issue: Zero tests present; tool is untested beyond manual CLI runs
- Files: No `*.test.ts` or `*.spec.ts` files
- Impact: Regressions possible on any future change; edge cases (unicode domains, special redirects, rate limiting) unvalidated
- Priority: High
- Fix approach: Add unit tests for regex patterns, robots.txt parsing logic, and fetch retry logic; integration tests for major checks against known test sites

**Untested Edge Cases:**
- What: Handling of internationalized domain names (IDN), emoji domains, sub-subdomains
- Files: `src/checks/fetch-utils.ts` line 54-89 (isSafeHost), `src/checks/subdomains.ts`
- Risk: May fail silently or produce incorrect subdomain lists for non-ASCII domains
- Priority: Medium

**No Validation of Sitemap Extrapolation:**
- Issue: Sitemap index child sampling extrapolates total count from partial sample with hardcoded 5-child limit
- Files: `src/checks/sitemap.ts` line 116-120
- Impact: Large indices (100+ children) entryCount is estimate, accuracy unknown
- Fix approach: Add tests comparing extrapolation accuracy against known large sitemaps

## Security Considerations

**SSRF Mitigation Coverage:**
- Issue: SSRF checks block RFC-1918 ranges and IPv6, but don't block IPv4-mapped IPv6 (::ffff:127.0.0.1)
- Files: `src/checks/fetch-utils.ts` line 54-89
- Risk: Potential bypass allowing requests to localhost via IPv6 mapping
- Current mitigation: Blocks most common patterns
- Recommendations: Add test for IPv4-mapped IPv6 addresses; consider blocking all private ranges including link-local (169.254.0.0/16)

**Malicious Redirect Chains:**
- Issue: Redirect limit is 5 hops, but fast 30x redirects could still time out the overall request
- Files: `src/checks/fetch-utils.ts` line 198-223
- Risk: Minimal — timeout is 5s per fetch
- Recommendations: Document or add per-request redirect time budget

**User-Agent Fingerprinting Risk:**
- Issue: Static User-Agent string identifies CLI specifically
- Files: `src/checks/fetch-utils.ts` line 1
- Impact: Sites could block/throttle the specific tool
- Fix approach: Randomize or vary User-Agent, or make configurable

## Known Behavioral Issues

**Robots.txt Parsing Ambiguity:**
- Issue: Multi-agent blocks handling is loose; if two `User-Agent:` lines appear before any directive, only the second agent is retained in current logic
- Files: `src/checks/robots.ts` line 42-99
- Impact: Site with `User-Agent: Googlebot` + `User-Agent: GoogleBot-Image` + `Disallow: /` may not correctly parse both agents in the block
- Fix approach: Refactor block parsing to handle multi-agent headers properly; add unit tests with edge case robots.txt files

**Subdomain Probing Scalability:**
- Issue: llms.txt check probes 3 paths × (1 base + 4 doc subdomains) = 12 requests for a domain
- Files: `src/checks/llms-txt.ts` line 59-68
- Impact: Not a blocker but slower than optimal; if domain itself is slow, 12 parallel requests could overwhelm
- Fix approach: Add concurrency limit (max 6 concurrent requests per domain)

**Missing Timeout for HTTP Enforcement Check:**
- Issue: checkHttpsEnforcement uses inline fetch with its own timer, not wrapped in main timeout
- Files: `src/checks/http-health.ts` line 7-31
- Impact: Timer is cleared but if request hangs before timeout, main Promise.all could wait indefinitely
- Fix approach: Use shared timeout via AbortSignal across all checks

**OG Tag Parsing Fragility:**
- Issue: `analyzeOgCompleteness` regex requires exact `property=` or `name=` attribute order; doesn't handle property/name reversed or with extra whitespace variations
- Files: `src/checks/schema-markup.ts` line 63-76
- Impact: Some valid OG meta tags may not be detected if attributes are in non-standard order
- Fix approach: Use more flexible regex or HTML parser

## Scoring Limitations

**Weighted Scoring Inflexibility:**
- Issue: Schema Markup worth 10pts, llms.txt 10pts, robots 6pts, sitemap 2pts, HTTP 2pts — weights hardcoded and non-adjustable
- Files: `src/scoring.ts` line 27-52
- Impact: Users can't customize scoring for their use case (e.g., E-commerce site cares less about llms.txt, more about product schema)
- Fix approach: Accept optional weights config file or CLI flag

**No Signal Weighting Within Checks:**
- Issue: All signals within schema markup pass/fail as binary; no distinction between "has basic schema" vs. "has rich, complete schema"
- Files: `src/scoring.ts` line 54-120
- Impact: Site with minimal schema markup gets same points as comprehensive schema
- Fix approach: Add scoring granularity within each check

**Freshness Thresholds Arbitrary:**
- Issue: Content defined as "fresh" if <90 days, "aging" 90-365 days, "stale" >365 days
- Files: `src/checks/schema-markup.ts` line 238-241
- Impact: No domain-specific context (news site needs fresher content than documentation)
- Fix approach: Document thresholds clearly; consider parameterizing

## Data Quality Concerns

**No Caching Between Checks:**
- Issue: If homepage is fetched for HTTP health, it's re-fetched for schema markup analysis
- Files: `src/index.ts` line 126-144 (checks run in parallel, each does own fetch)
- Impact: Wasted bandwidth and slower execution; not critical but inelegant
- Fix approach: Refactor to fetch homepage once, pass result to multiple analysis functions

**Sampling Bias in Sitemap Entry Count:**
- Issue: For very large sitemap indices, only first 5 child sitemaps sampled — may not represent full site
- Files: `src/checks/sitemap.ts` line 99-125
- Impact: Extrapolated count could be off by 20-40% if first 5 child sitemaps aren't representative
- Fix approach: Randomize sample selection, or document sampling method in JSON output

## Dependency & Build Concerns

**No Runtime Dependency Vulnerabilities Check:**
- Issue: No security scanning in CI; package-lock.json exists but no lock verification
- Files: `package.json`, `package-lock.json`
- Impact: Transitive dependency vulnerabilities not caught
- Fix approach: Add `npm audit` to build, consider using `packageManager` field to enforce npm 10+

**Outdated Development Dependencies:**
- Issue: Dependencies pinned but not always at latest (e.g., @types/node 25.5.0 is not latest 25.x)
- Files: `package.json` line 14-19
- Impact: Minor; TypeScript types may be slightly stale
- Fix approach: Run `npm update` and test

**Build Output Not Git-Ignored:**
- Issue: `dist/` directory committed to repo (as per bin entry in package.json requiring dist/index.js)
- Files: `dist/` directory
- Impact: Large commit diffs when dist changes; harder to review changes
- Fix approach: Move dist to `.gitignore` and build as pre-publish step in CI

## Documentation Gaps

**Known Limitation Under-emphasized:**
- Issue: README mentions "results may not make sense because they are more apt on other pages" but doesn't list which checks are affected
- Files: `README.md` line 5
- Impact: Users may misinterpret schema/semantic HTML scores as representative of whole site
- Fix approach: Add section explaining "Limitations: All checks run on homepage only" with list of affected checks

**No Examples of Low-Scoring Sites:**
- Issue: README shows good example (Stripe at 70), but no counter-example of a broken site
- Files: `README.md`
- Impact: Users may not understand what a 20/100 site looks like
- Fix approach: Add second example showing a site with poor structure/schema

**Missing Troubleshooting Guide:**
- Issue: No guidance for common failures (blocked by WAF, domain doesn't exist, site is offline)
- Impact: Users see "pass: false" in JSON output but no explanation of why
- Fix approach: Add FAQ section in README

## Potential Runtime Hazards

**Buffer.byteLength in http-health Check:**
- Issue: Uses Node.js `Buffer` API which requires import
- Files: `src/checks/http-health.ts` line 83
- Impact: Would fail in browser context (but tool is CLI-only so low risk)
- Fix approach: Add check or comment noting Node.js-only requirement

**Unbounded Memory for Large HTML Files:**
- Issue: Full HTML body loaded into memory; no size limit or streaming
- Files: `src/checks/fetch-utils.ts` line 262 (response.text())
- Impact: 100MB home page would load entirely into memory
- Fix approach: Set MAX_RESPONSE_SIZE (e.g., 10MB) and truncate response.body

**Regex DoS Risk:**
- Issue: Some regexes iterate or match complex patterns; DoS risk low but possible on pathological input
- Files: `src/checks/schema-markup.ts` line 63-76 (OG tag regex), line 99 (heading hierarchy)
- Impact: Malicious HTML with deeply nested tags could cause regex backtracking
- Fix approach: Add regex timeouts or use HTML parser instead

## Process Issues

**No Version Pinning Strategy:**
- Issue: package.json uses `^` caret ranges (e.g., `^25.5.0`) allowing minor/patch updates
- Files: `package.json`
- Impact: Builds not reproducible without lock file (but lock file IS committed, so OK)
- Fix approach: Consider stricter versioning for production, though current approach is reasonable for CLI

**Missing CHANGELOG:**
- Issue: Repo has releases (0.1.0) but no CHANGELOG
- Impact: Hard to track what changed between versions
- Fix approach: Add CHANGELOG.md documenting breaking changes and features per release
