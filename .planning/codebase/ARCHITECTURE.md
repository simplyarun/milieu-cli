# Architecture

**Analysis Date:** 2026-03-17

## Pattern Overview

**Overall:** Modular scoring system with parallel check execution and incremental scoring aggregation

**Key Characteristics:**
- Five independent content checks execute in two parallel waves for efficiency
- Each check returns structured data (pass/fail signals with supporting metadata)
- Scoring logic isolated from check logic, allowing independent test/maintenance
- CLI presentation layer decoupled from core analysis engine
- Strict security posture: SSRF protection, bot detection, timeout handling

## Layers

**Orchestration Layer:**
- Purpose: CLI entry point, argument parsing, result formatting for terminal and JSON output
- Location: `src/index.ts`
- Contains: Main async function, terminal rendering logic, signal label definitions
- Depends on: All five checks, scoring engine
- Used by: Process entry point

**Check Layer:**
- Purpose: Domain-specific content analysis (robots.txt, schema markup, llms.txt, sitemap, HTTP health)
- Location: `src/checks/`
- Contains: Five modules (`robots.ts`, `schema-markup.ts`, `llms-txt.ts`, `sitemap.ts`, `http-health.ts`)
- Depends on: Fetch utilities, domain utilities
- Used by: Orchestration layer

**Fetch/Transport Layer:**
- Purpose: Safe HTTP communication with resilience, security boundaries, bot detection
- Location: `src/checks/fetch-utils.ts`
- Contains: `fetchUrl()`, `fetchPath()`, URL validation, SSRF protection, retry logic, bot detection
- Depends on: Native fetch (Node 18+), native zlib (for sitemap decompression)
- Used by: All five checks, orchestration

**Utility Layer:**
- Purpose: Domain-specific helpers and data transformations
- Location: `src/checks/subdomains.ts`
- Contains: Subdomain extraction logic
- Depends on: None
- Used by: llms-txt check

**Scoring Layer:**
- Purpose: Aggregate individual check results into normalized 0-100 score
- Location: `src/scoring.ts`
- Contains: `calculateContentScore()`, per-check scoring functions
- Depends on: Type definitions
- Used by: Orchestration layer

**Type Layer:**
- Purpose: Shared TypeScript interfaces for check results and scoring
- Location: `src/types.ts`
- Contains: `ContentCheckResults`, all individual check result interfaces
- Depends on: None
- Used by: All other layers

## Data Flow

**Wave 1 (Parallel):**
1. `checkRobots(domain)` - Fetch, parse robots.txt, extract AI crawler directives
2. `checkLlmsTxt(domain)` - Probe /llms.txt, /llms-full.txt, /.well-known/llms.txt across subdomains

**Wave 2 (Parallel, after Wave 1):**
3. `checkSitemap(domain)` - Fetch from robots.txt reference or direct path, decompress .xml.gz, count entries
4. `checkSchemaMarkup(domain)` - Parse HTML for structured data, OG tags, semantic elements
5. `checkHttpHealth(domain)` - Check HTTPS enforcement, JS-free content, response metrics

**Aggregation:**
6. Collect all five results into `ContentCheckResults` object
7. Pass to `calculateContentScore()` which computes:
   - Raw score (0-30 points total)
   - Per-check breakdown with individual signals
   - Normalized 0-100 score

**Output:**
- JSON mode: `{ domain, contentScore, contentMax, rawScore, rawMax, checks }`
- Terminal mode: Formatted table with check labels, earned/max points, per-signal ✓/✗ indicators

**State Management:**
- Immutable throughout pipeline: Check functions return new objects, no shared mutable state
- Wave 1 results not stored; Wave 2 executes regardless of Wave 1 outcome
- Scoring functions pure: input results → output score, no side effects

## Key Abstractions

**FetchResult:**
- Purpose: Standardized HTTP response with security metadata
- Examples: `src/checks/fetch-utils.ts` lines 113-121
- Pattern: Separate body, status, bot protection flag, content type, extra headers

**ContentCheckResult (BaseCheckResult + specific subtypes):**
- Purpose: Unified interface for all check outputs
- Examples: `src/types.ts` lines 1-99
- Pattern: Base interface has `pass`, optional `blockedByBotProtection`, optional `error`; each check adds domain-specific fields

**CheckScore:**
- Purpose: Per-check scoring breakdown with earned/max points and signal map
- Examples: `src/scoring.ts` lines 6-10
- Pattern: `{ earned, max, signals: Record<string, boolean> }`

**Wave Execution:**
- Purpose: Two-phase parallel execution model
- Examples: `src/index.ts` lines 125-136
- Pattern: Promise.all() for independent checks, second Promise.all() after first completes

## Entry Points

**CLI:**
- Location: `src/index.ts` (shebang: `#!/usr/bin/env node`)
- Triggers: `milieu-content-score <url> [--json]`
- Responsibilities: Parse arguments, validate URL, orchestrate check waves, format output, handle errors

**Programmatic (Library):**
- Imported modules: All checks (`checkRobots`, `checkLlmsTxt`, etc.), scoring (`calculateContentScore`), types
- Usage: Import individual checks or use full pipeline
- Entry point: Any of the check functions or orchestration pattern in index.ts

## Error Handling

**Strategy:** Graceful degradation with per-check error tracking

**Patterns:**

1. **Network errors** (fetch-utils.ts lines 150-287):
   - SSRF protection: Pre-check hostname against blocklist (lines 54-89)
   - Timeout: AbortController with 5000ms default
   - Retryable errors: 429, 502, 503 with exponential backoff (lines 225-234)
   - Non-retryable: Return null and let check handle
   - Redirect validation: Each hop checked against SSRF blocklist (lines 198-223)

2. **Check-specific errors** (each check module):
   - Catch all errors in try/catch, return structured result with `error` field
   - Example: `robots.ts` lines 104-174
   - Example: `llms-txt.ts` lines 55-133

3. **Bot protection detection** (fetch-utils.ts lines 91-148):
   - Signature matching: Common WAF/bot protection strings
   - Content-type filtering: XML/JSON/text assumed real content (lines 131-136)
   - Cloudflare-specific: Dedicated signatures to avoid false positives (lines 105-111)
   - Size heuristic: Responses >10KB assumed legitimate even if they reference protective services (line 144)

4. **CLI-level errors** (index.ts lines 162-165):
   - Main function wrapped in `.catch()`, logs error message, exits with code 1
   - Usage errors: Exit code 1 with helpful message

## Cross-Cutting Concerns

**Logging:** None - by design. CLI writes only structured output (terminal or JSON). No debug/trace logging.

**Validation:**
- URL validation: `isUrl()` checks domain pattern (fetch-utils.ts lines 313-320)
- URL normalization: `normalizeUrl()` strips scheme, www, control chars (lines 304-311)
- Hostname validation: `isSafeHost()` comprehensive SSRF checks (lines 54-89)

**Authentication:** None required. All requests use standard User-Agent header.

---

*Architecture analysis: 2026-03-17*
