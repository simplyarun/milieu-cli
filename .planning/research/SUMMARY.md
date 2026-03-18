# Research Summary

**Project:** milieu-content-score-cli (milieu-cli)
**Synthesized:** 2026-03-17
**Research files:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

Milieu-cli is a domain-scanning CLI tool that measures AI readiness across a 5-Bridge framework: Reachability, Standards, Separation, Explainability, and Integration. The tool checks machine-readable signals (robots.txt AI crawler policies, OpenAPI presence, llms.txt, JSON-LD/Schema.org, well-known URIs) rather than visual content, making it fundamentally different from Lighthouse-style performance auditors. There are no direct competitors as dedicated CLI tools in this specific AI-readiness space as of early 2026, giving milieu-cli genuine first-mover advantage if built well.

The recommended approach mirrors Lighthouse's proven Gather-Audit-Report pipeline (here: Fetch-Check-Score-Render), strictly maintained across separate layers. A hard constraint of 3 runtime dependencies (commander, chalk, ora) is both a technical constraint and a strategic trust signal -- the tool scans for security-adjacent machine legibility signals, and a bloated `node_modules` undermines developer credibility. Node built-ins (fetch, AbortController, URL) and hand-rolled parsers cover everything else. The v0.1 codebase already proves this approach works; the rebuild refines rather than replaces it.

The key risks are correctness of the robots.txt parser (RFC 9309 has 8+ edge cases the current implementation misses), false positives in bot protection detection and OpenAPI spec discovery, and JSON output schema stability. The v0.1 codebase has a monolithic entry point and null-return HTTP error handling -- both architectural debts that must be repaid at the start of the rebuild, not retrofitted. If the schema, HTTP discriminated error union, and ScanContext pattern are defined before writing a single bridge check, the rest follows naturally.

---

## Key Findings

### From STACK.md

| Technology | Rationale |
|------------|-----------|
| **commander ^13.x** | Industry-standard CLI framework; handles all flag/arg parsing; lighter than yargs |
| **chalk ^5.x** | ESM-native color output; zero deps; ora depends on it so it is "free" |
| **ora ^8.x** | ESM-native spinner; essential UX for 3-10 second scans |
| **Node built-in fetch** | Eliminates axios/got/node-fetch as dep #4; v0.1 proves it is sufficient |
| **tsup ^8.x** (dev) | esbuild-powered bundler; already used in v0.1; generates ESM + .d.ts |
| **vitest ^3.x** (dev) | ESM-TypeScript native test runner; zero config vs. Jest's nightmare |
| **nock ^14.x** (dev) | HTTP fixture recording for CI; verify nock + native fetch compatibility |

**Critical version note:** Nock compatibility with Node 18+ native fetch (undici-backed) must be verified before committing to the test stack. Fallback: dependency-inject a mock `HttpClient` via `ScanContext`.

**ESM-only, Node >=18 minimum.** Consider bumping to `>=20` during rebuild since Node 18 reached EOL April 2025 and Node 20 is current LTS.

### From FEATURES.md

**Table stakes (must ship):**
- JSON output with versioned schema (`--json`)
- Non-zero exit code on error/unreachable
- Colored terminal output with `NO_COLOR` support
- Progress spinner
- `--help` / `--version` (free via commander)
- Programmatic API (`import { scan } from "milieu-cli"`)
- URL validation and normalization
- `--timeout` configuration
- `--quiet` / `--silent` mode for CI
- `--verbose` mode for per-check detail

**Differentiators (the moat):**
- 5 Bridges framework with progressive disclosure (Bridges 1-2 scored, Bridge 3 detected, Bridges 4-5 visible stubs)
- Per-AI-crawler robots.txt policy breakdown (GPTBot, ClaudeBot, etc.)
- Score threshold flag (`--threshold N`) for CI gating
- OpenAPI / MCP endpoint discovery (novel in this category)
- llms.txt structural validation (not just presence)
- Zero-dependency philosophy as a trust signal
- Deterministic results (no LLMs in pipeline)

**Defer to v2+:**
- HTML report output
- Multi-page crawling
- Config file (`.milieurc`)
- Plugin system
- Authentication support
- JUnit/TAP output
- Watch mode
- Remediation advice

**Implementation order:** Bridge 1 (Reachability) → Bridge 2 (Standards) → Scoring + terminal output → JSON output → Bridge 3 (Separation) → `--threshold` flag → Programmatic API → Bridges 4-5 stubs → `--quiet` mode polish.

### From ARCHITECTURE.md

**Primary pattern:** Fetch-Check-Score-Render (Lighthouse's Gather-Audit-Report adapted for CLI). The scanner orchestrates bridges sequentially (1 → 2 → 3 because Bridge 3 reads Bridge 2 data); within each bridge, checks run concurrently via `Promise.all`.

**Key components:**

| Component | Path | Responsibility |
|-----------|------|---------------|
| CLI Entry | `src/cli/index.ts` | Parse args, invoke scanner, select renderer -- nothing else |
| Public API | `src/index.ts` | Re-export `scan()` and types |
| Scanner | `src/core/scanner.ts` | Orchestrate bridges, manage HTTP client lifecycle, abort on unreachable |
| Bridge 1 | `src/bridges/reachability.ts` | HTTPS, HTTP status, robots.txt, AI crawler policies, meta robots |
| Bridge 2 | `src/bridges/standards.ts` | OpenAPI, llms.txt, MCP, JSON-LD, Schema.org, well-known URIs |
| Bridge 3 | `src/bridges/separation.ts` | API/docs/SDK/webhook detection (reuses Bridge 2 data) |
| Scorer | `src/core/scorer.ts` | Pure function: `BridgeResult[] → ScanResult` |
| HTTP Client | `src/utils/http.ts` | Fetch wrapper with SSRF protection, timeouts, discriminated error results |
| Types | `src/types.ts` | All shared interfaces -- define first, implement against |

**Build order (bottom-up):**
```
Layer 0: types.ts
Layer 1: utils/url.ts, utils/parse.ts
Layer 2: utils/http.ts
Layer 3: bridges/* (1 → 2 → 3)
Layer 4: core/scorer.ts
Layer 5: core/scanner.ts
Layer 6: render/terminal.ts, render/json.ts
Layer 7: cli/index.ts
Layer 8: src/index.ts (public API)
```

**Anti-patterns to avoid (all present in v0.1):**
1. Check functions that embed scoring logic
2. Monolithic entry point mixing CLI, scan, and render
3. Global mutable HTTP state (module-level config)
4. Domain string as primary identifier (normalize to full URL early)
5. Implicit check registration (keep explicit static imports)

### From PITFALLS.md

**Top 5 pitfalls with prevention:**

| # | Pitfall | Prevention |
|---|---------|------------|
| 1 | **robots.txt RFC 9309 non-compliance** (BOM stripping, CRLF, group boundaries, Allow/Disallow precedence, empty Disallow semantics) | Build 20+ edge-case unit tests against RFC 9309 test vectors before shipping Bridge 1 |
| 2 | **Bot protection false positives** (WAF challenge pages reported as content; real blocks missed) | Combine status + body signatures for detection; add confidence level ("LIKELY_BLOCKED" not boolean); add 100-200ms inter-request delays |
| 3 | **JSON output schema instability** (field renames/removals breaking CI consumers) | Define `ScanResult` interface first; add snapshot test; version JSON output with top-level `"version"` field; semver discipline |
| 4 | **OpenAPI detection false positives** (non-spec JSON at known paths; HTML docs reported as specs) | Validate response contains `"openapi":` or `"swagger":` key + correct `Content-Type`; distinguish spec from docs UI |
| 5 | **`fetchUrl` returns null for all errors** (DNS vs. timeout vs. SSRF block indistinguishable) | Implement discriminated union result type from day one: `{ ok: true, data } \| { ok: false, error: 'dns' \| 'timeout' \| 'ssrf_blocked' \| ... }` |

**Additional moderate pitfalls to track:**
- Pitfall 6: JSON-LD parsing silently discards malformed markup (report invalid block count)
- Pitfall 7: Terminal output breaks on Windows/CI non-TTY (use `process.stdout.isTTY`; chalk handles NO_COLOR)
- Pitfall 8: npm packaging missteps on first publish (npm pack --dry-run; files field; exports field; shebang)
- Pitfall 9: Concurrent Bridge 2 requests (15+ to same origin) triggering WAF rate limits (per-domain concurrency limiter, max 3-4)
- Pitfall 10: llms.txt and MCP specs are unstable (isolate path lists and format validators into config; research fresh before implementation)

---

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1: Foundation**
Rationale: The entire codebase depends on shared types, HTTP client, and URL utilities. These must be defined first -- retrofitting the discriminated error union or `ScanContext` pattern later is painful. The schema must also be designed before any bridge is implemented.

Delivers: `types.ts` with full `ScanResult` interface, `HttpClient` class with discriminated error results, URL normalization, robots.txt parser with RFC 9309 compliance, JSON schema snapshot test.

Features from FEATURES.md: URL validation/normalization, `--timeout` flag (wired at this layer).

Pitfalls to avoid: Pitfall 3 (define schema first), Pitfall 5 (null-return HTTP), Pitfall 11 (URL normalization edge cases), Pitfall 14 (SSRF bypass via IPv4-mapped IPv6).

Research flag: Standard patterns -- no research spike needed. RFC 9309 is the reference document.

---

**Phase 2: Bridge 1 (Reachability) + Working CLI Shell**
Rationale: Bridge 1 is the abort gate -- if the target is unreachable, the scan stops. Implementing it first forces the abort-on-failure flow to be designed early. Wrapping it in a working CLI shell (commander + ora + chalk) delivers a testable end-to-end product after Phase 2 even if it only checks one bridge.

Delivers: `milieu scan <url>` command that checks HTTPS, HTTP status, robots.txt with per-AI-crawler policy breakdown, meta robots, X-Robots-Tag. Terminal output with spinner. JSON output with versioned schema. `--verbose` flag.

Features from FEATURES.md: Colored terminal output, progress spinner, `--help`/`--version`, verbose mode, JSON output, non-zero exit code on scan failure.

Pitfalls to avoid: Pitfall 1 (robots.txt RFC 9309), Pitfall 2 (bot protection false positives), Pitfall 7 (TTY detection for non-TTY environments).

Research flag: Bridge 1 checks (HTTPS redirect detection, meta robots tag formats) are well-documented patterns -- no research spike needed. robots.txt parsing should be validated against Google's reference test vectors.

---

**Phase 3: Bridge 2 (Standards)**
Rationale: This is the core differentiator. OpenAPI/MCP/llms.txt discovery is the reason milieu-cli exists. Bridge 2 is independent of Bridge 3 but provides data Bridge 3 reuses, so it comes before Bridge 3.

Delivers: OpenAPI spec discovery (9 paths + content validation), llms.txt presence + structural validation, llms-full.txt detection, MCP endpoint detection, JSON-LD/Schema.org detection and type categorization, well-known URI scanning.

Features from FEATURES.md: OpenAPI/MCP endpoint discovery (differentiator), llms.txt validation (differentiator), well-known URI scanning (differentiator), JSON-LD/Schema.org detection.

Pitfalls to avoid: Pitfall 4 (OpenAPI false positives), Pitfall 6 (JSON-LD malformed markup), Pitfall 9 (concurrent request rate limiting), Pitfall 10 (unstable llms.txt/MCP specs).

Research flag: **NEEDS `/gsd:research-phase` spike for Bridge 2.** The llms.txt spec and MCP discovery paths evolve rapidly -- training data may already be stale. Verify current spec before implementation.

---

**Phase 4: Bridge 3 (Separation) + Scoring + CI Features**
Rationale: Bridge 3 reuses Bridge 2 data (API presence already detected). Scoring can be built any time after types are defined (it's a pure function), but is best finalized here once all scored bridges (1-2) are complete. CI features (`--threshold`, `--quiet`) are low-complexity additions that complete the CI adoption story.

Delivers: Bridge 3 detection (API presence, developer docs, SDK references, webhook signals). Final scoring weights and overall score calculation. `--threshold N` flag for CI gating. `--quiet` mode. Bridges 4-5 as output stubs (no logic).

Features from FEATURES.md: Score threshold flag (differentiator), Bridge 3 detection inventory, `--quiet`/`--silent` mode, Bridge 4-5 stubs, scan timing in output.

Pitfalls to avoid: Pitfall 3 (any scoring weight changes that affect JSON schema), Bridge 3 scope creep into evaluation.

Research flag: Standard patterns -- no research spike needed.

---

**Phase 5: Programmatic API + npm Publishing**
Rationale: The programmatic API requires a stable `ScanResult` type (established in Phase 1, validated across phases 2-4). Publishing is last because it requires the full feature set and correct packaging.

Delivers: `import { scan } from "milieu-cli"` with typed return. `package.json` exports field, `files` whitelist, shebang, `prepublishOnly` build gate, `npm pack --dry-run` verification. Node version matrix CI.

Features from FEATURES.md: Programmatic API (table stakes).

Pitfalls to avoid: Pitfall 8 (npm packaging missteps), Pitfall 13 (shebang + ESM npx execution), Pitfall 15 (stale test fixtures).

Research flag: Standard patterns -- no research spike needed. Follow npm packaging checklist from PITFALLS.md Pitfall 8.

---

### Research Flags Summary

| Phase | Research Needed? | Reason |
|-------|-----------------|--------|
| Phase 1: Foundation | No | Well-documented patterns |
| Phase 2: Bridge 1 + CLI Shell | No | robots.txt has RFC 9309; patterns are stable |
| Phase 3: Bridge 2 (Standards) | **YES -- research spike** | llms.txt spec and MCP discovery paths are evolving; training data may be stale |
| Phase 4: Bridge 3 + Scoring + CI | No | Detection-only bridge; scoring is pure function |
| Phase 5: API + Publishing | No | Standard npm packaging patterns |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Core runtime deps are stable. nock + native fetch compatibility is the one unverified risk. Versions need `npm view` confirmation before starting. |
| Features | HIGH | Established CLI tools (Lighthouse, pa11y) are well-documented references. AI readiness feature set comes from current codebase + PROJECT.md -- both directly inspected. |
| Architecture | HIGH | Fetch-Check-Score-Render pattern is directly derived from Lighthouse's Gather-Audit-Report (well-documented). Build order is derived from component dependencies, which are explicit in research. |
| Pitfalls | HIGH | robots.txt pitfalls reference RFC 9309 directly. OpenAPI pitfalls are verifiable against known API sites. npm packaging pitfalls are well-established. llms.txt/MCP confidence is LOW within this category. |

**Overall confidence: HIGH** for Phases 1-2 and 4-5. **MEDIUM** for Phase 3 pending fresh spec research.

### Gaps to Address

1. **nock + native fetch compatibility:** Must verify before committing to the test stack. If incompatible, fall back to mock `HttpClient` via `ScanContext` dependency injection.
2. **llms.txt spec currency:** Research the current llms.txt specification format and accepted paths immediately before Phase 3 implementation.
3. **MCP discovery path:** Verify the current Anthropic MCP spec for server discovery well-known paths immediately before Phase 3 implementation.
4. **npm package name availability:** Run `npm view milieu-cli` before any work begins to confirm the name is not squatted.
5. **Node version target:** Confirm whether to target `>=18.13.0` or bump to `>=20` given Node 18 EOL.
6. **commander / vitest / nock exact versions:** Run `npm view <pkg> version` for all deps before scaffolding package.json.

---

## Sources (Aggregated)

**HIGH confidence:**
- Existing codebase (`src/`) and `.planning/codebase/CONCERNS.md` -- direct inspection
- PROJECT.md constraints -- direct inspection
- RFC 9309 Robots Exclusion Protocol (https://www.rfc-editor.org/rfc/rfc9309)
- Google robots.txt reference implementation (https://github.com/google/robotstxt)
- no-color.org terminal convention (https://no-color.org/)
- Lighthouse, pa11y, webhint, sitespeed.io documentation -- stable, well-documented tools
- OpenAPI Specification 3.1 (https://spec.openapis.org/oas/v3.1.0)
- Node.js built-in fetch, AbortController, URL APIs (stable in Node 18+)
- HTTP fixture testing patterns (nock, msw) -- established practice

**MEDIUM confidence:**
- npm package versions (training data cutoff applies; verify with `npm view`)
- Lighthouse/webhint architecture details (well-known patterns, not verified against current docs)
- AI readiness CLI tool competitive landscape (no direct competitors confirmed, but landscape observation)

**LOW confidence:**
- llms.txt specification (nascent community proposal, evolving)
- MCP endpoint discovery paths (rapidly evolving Anthropic spec)
