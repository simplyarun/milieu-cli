# Roadmap: Milieu CLI

## Overview

Ground-up rebuild of the milieu content score tool into `milieu-cli`, organized around the 5 Bridges of Machine Legibility framework. The build follows a strict bottom-up order: types and utilities first, then bridge checks one at a time, then scoring, rendering, CLI integration, and finally packaging. Each phase delivers a verifiable layer that the next phase builds on. Bridge 2 (Standards) requires a research spike before implementation due to evolving llms.txt and MCP specs.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Project Scaffold and Types** - Gut existing code, establish new project structure, define all shared types (completed 2026-03-18)
- [ ] **Phase 2: HTTP Client and Utilities** - Build HTTP client with discriminated errors, URL normalization, SSRF protection
- [ ] **Phase 3: Bridge 1 (Reachability)** - HTTPS, HTTP status, robots.txt with RFC 9309 parser, AI crawler policies, meta/header robots
- [ ] **Phase 4: Bridge 2 (Standards)** - OpenAPI discovery, llms.txt, MCP endpoint, JSON-LD, Schema.org, well-known URIs (research spike first)
- [ ] **Phase 5: Bridge 3 (Separation) and Scoring** - API/docs/SDK/webhook detection inventory, scoring engine for Bridges 1-2
- [ ] **Phase 6: Terminal Rendering and Output Stubs** - Progress bars, color-coded output, verbose mode, spinner, Bridges 4-5 stubs
- [ ] **Phase 7: CLI Integration and JSON Output** - Commander setup, all CLI flags, JSON output as versioned public API
- [ ] **Phase 8: Programmatic API** - Library export with typed scan() function and full type exports
- [ ] **Phase 9: Testing** - Unit tests for core parsers, integration tests with recorded HTTP fixtures
- [ ] **Phase 10: Packaging and Publishing** - npm publish config, ESM packaging, shebang, dependency audit

## Phase Details

### Phase 1: Project Scaffold and Types
**Goal**: Clean slate with the complete type system defined -- every subsequent phase implements against these types
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-02
**Success Criteria** (what must be TRUE):
  1. Existing source code is removed and replaced with new directory structure (`src/bridges/`, `src/core/`, `src/render/`, `src/utils/`, `src/cli/`)
  2. All shared type definitions (CheckStatus, Check, BridgeResult, ScanResult, ScanContext) compile and are importable
  3. `npm run build` produces ESM output with .d.ts declarations
  4. A minimal smoke test confirms types are usable (import and instantiate)
**Plans:** 2/2 plans complete

Plans:
- [ ] 01-01-PLAN.md -- Gut existing code, rewrite configs, create directory scaffold with barrel exports
- [ ] 01-02-PLAN.md -- Define complete type system (CheckStatus, Check, BridgeResult, ScanResult, ScanContext, HttpResponse), build and smoke test

### Phase 2: HTTP Client and Utilities
**Goal**: All network and URL handling is production-ready before any bridge check is written
**Depends on**: Phase 1
**Requirements**: FOUND-03, FOUND-04, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):
  1. HTTP client returns discriminated union errors (dns, timeout, ssrf_blocked, http_error, bot_protected) -- never null or thrown exceptions
  2. URL normalization correctly handles missing protocol, trailing slashes, and domain extraction
  3. SSRF protection blocks RFC-1918 private ranges, IPv6 loopback, and IPv4-mapped IPv6 addresses
  4. HTTP requests respect configurable timeout (default 10s), retry once on 5xx/timeout, and follow up to 5 redirects
**Plans:** 1/2 plans executed

Plans:
- [ ] 02-01-PLAN.md -- Vitest setup, URL normalization with tests, SSRF protection with tests
- [ ] 02-02-PLAN.md -- HTTP client with discriminated errors, retry, redirect tracking, barrel export

### Phase 3: Bridge 1 (Reachability)
**Goal**: Users can scan a URL and see a complete reachability assessment -- the first real output of the tool
**Depends on**: Phase 2
**Requirements**: REACH-01, REACH-02, REACH-03, REACH-04, REACH-05, REACH-06, REACH-07, REACH-08, REACH-09
**Success Criteria** (what must be TRUE):
  1. User can see HTTPS availability, HTTP status with redirect tracking, and robots.txt presence/parseability for any target URL
  2. User can see per-AI-crawler policy (allowed/partial/blocked) for GPTBot, ClaudeBot, CCBot, Googlebot, Bingbot, PerplexityBot
  3. robots.txt parser handles RFC 9309 edge cases: BOM stripping, CRLF line endings, group boundaries, Allow/Disallow precedence, wildcard rules, empty Disallow semantics
  4. User can see meta robots tags and X-Robots-Tag header directives
  5. Bridge 1 score is calculated as passed_checks / total_checks * 100, and scan aborts with clear error if target is completely unreachable
**Plans:** 3 plans

Plans:
- [ ] 03-01-PLAN.md -- RFC 9309 robots.txt parser, matchesPath, and AI crawler policy evaluator with unit tests
- [ ] 03-02-PLAN.md -- Meta robots tag and X-Robots-Tag header check functions with unit tests
- [ ] 03-03-PLAN.md -- Check functions (HTTPS, HTTP status, robots.txt fetch), Bridge 1 orchestrator with scoring and abort, barrel export

### Phase 4: Bridge 2 (Standards)
**Goal**: Users can see what machine-readable standards a domain supports -- the core differentiator of the tool
**Depends on**: Phase 3
**Requirements**: STND-01, STND-02, STND-03, STND-04, STND-05, STND-06, STND-07, STND-08, STND-09
**Success Criteria** (what must be TRUE):
  1. User can see whether an OpenAPI spec exists (9 paths probed), with version and endpoint count, and false positives are filtered (Content-Type validation, openapi/swagger key check)
  2. User can see llms.txt and llms-full.txt presence with size and first-line preview
  3. User can see MCP endpoint status at /.well-known/mcp.json and well-known URI presence (security.txt, ai-plugin.json)
  4. User can see JSON-LD structured data blocks with detected schema types, and Schema.org markup (Microdata or JSON-LD vocabulary)
  5. Bridge 2 score is calculated as passed_checks / total_checks * 100 with pass/partial/fail status
**Plans:** 3 plans

Plans:
- [ ] 04-01-PLAN.md -- Bridge 1 ctx.shared modification, OpenAPI 9-path probe with Content-Type validation and tests
- [ ] 04-02-PLAN.md -- llms-txt, MCP, well-known, JSON-LD, Schema.org check modules with tests
- [ ] 04-03-PLAN.md -- Bridge 2 orchestrator with scoring, barrel export

### Phase 5: Bridge 3 (Separation) and Scoring
**Goal**: Users can see a detection inventory of separation signals, and all bridge scores are finalized
**Depends on**: Phase 4
**Requirements**: SEP-01, SEP-02, SEP-03, SEP-04, SEP-05
**Success Criteria** (what must be TRUE):
  1. User can see whether API presence, developer documentation, SDK/package references, and webhook support signals are detected
  2. Bridge 3 reuses Bridge 2 data (OpenAPI result) rather than re-fetching
  3. Bridge 3 outputs a detection inventory (detected/not_detected) with no numeric score
  4. Scanner orchestrates bridges sequentially (1 then 2 then 3) with concurrent checks within each bridge
**Plans:** 2 plans

Plans:
- [ ] 05-01-PLAN.md -- 4 check modules (API presence, developer docs, SDK references, webhook support) with tests
- [ ] 05-02-PLAN.md -- Bridge 3 orchestrator with detection inventory (score: null), barrel export

### Phase 6: Terminal Rendering and Output Stubs
**Goal**: Users see polished, color-coded terminal output for all 5 bridges when running a scan
**Depends on**: Phase 5
**Requirements**: STUB-01, STUB-02, STUB-03, TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06, TERM-07
**Success Criteria** (what must be TRUE):
  1. Default output shows all 5 bridges: progress bars (12-char) for Bridges 1-2, detection line for Bridge 3, dim labels for Bridges 4-5
  2. Colors follow the spec: pass (>=80) green, partial (40-79) yellow, fail (<40) red, detected cyan, not evaluated dim/gray
  3. Verbose mode (--verbose) shows individual check details with status indicators per check
  4. Bridges 4-5 appear with "not_evaluated" status and neutral messaging -- no hints about future features
  5. Spinner shows progress during scan, NO_COLOR is respected, scan timestamp and per-bridge timing are shown
**Plans:** 2 plans

Plans:
- [ ] 06-01-PLAN.md -- Bridge 4-5 stubs, color utility with NO_COLOR, progress bar, status symbols
- [ ] 06-02-PLAN.md -- Bridge formatting, verbose mode, full scan output, scan orchestrator with spinner

### Phase 7: CLI Integration and JSON Output
**Goal**: Users can run `milieu scan <url>` with all flags and get either terminal or JSON output
**Depends on**: Phase 6
**Requirements**: JSON-01, JSON-02, JSON-03, JSON-04, CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06
**Success Criteria** (what must be TRUE):
  1. `milieu scan <url>` works as primary command via commander with --help and --version
  2. --json outputs complete ScanResult, --json --pretty outputs formatted JSON, schema includes version field
  3. --timeout configures per-request timeout, --threshold N exits non-zero if score < N, --quiet suppresses terminal output
  4. Invalid URL produces helpful error message and exit code 1
  5. JSON output schema is treated as versioned public API surface
**Plans:** 2/2 plans executed

Plans:
- [x] 07-01-PLAN.md -- Version module (single source of truth), ScanOptions.silent, scan.ts refactor, install commander
- [x] 07-02-PLAN.md -- Commander CLI entry point with all flags, JSON/pretty/quiet output, error handling, tests

### Phase 8: Programmatic API
**Goal**: TypeScript consumers can import and use the scanner as a library
**Depends on**: Phase 7
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. `import { scan } from "milieu-cli"` returns a typed ScanResult
  2. scan() accepts an options object (timeout, verbose) matching CLI flag behavior
  3. All types (CheckStatus, Check, BridgeResult, ScanResult) are exported for TypeScript consumers
**Plans:** 1 plan

Plans:
- [ ] 08-01-PLAN.md -- Verify package entry point exports, add programmatic API contract integration tests

### Phase 9: Testing
**Goal**: Core parsing logic and scan behavior are verified by automated tests that run without network access
**Depends on**: Phase 8
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. robots.txt parser has 20+ unit tests covering RFC 9309 edge cases
  2. OpenAPI detection, JSON-LD parsing, and URL normalization each have dedicated unit test suites
  3. Integration tests use recorded HTTP fixtures -- no live URLs are called in CI
  4. All tests pass in CI with `npm test`
**Plans:** 2 plans

Plans:
- [ ] 09-01-PLAN.md -- Expand unit tests for robots.txt RFC 9309 edge cases, OpenAPI detection, and JSON-LD parsing
- [ ] 09-02-PLAN.md -- Integration tests with recorded HTTP fixtures, CI readiness verification

### Phase 10: Packaging and Publishing
**Goal**: Tool is published to npm and works via npx with zero friction
**Depends on**: Phase 9
**Requirements**: FOUND-01, PKG-01, PKG-02, PKG-03, PKG-04, PKG-05
**Success Criteria** (what must be TRUE):
  1. `npx milieu-cli scan <url>` works for first-time users
  2. Package is ESM-only with .d.ts type declarations included
  3. Exactly 3 runtime dependencies: commander, chalk, ora
  4. package.json exports field, files whitelist, and shebang are correctly configured
  5. `npm pack --dry-run` shows only intended files
**Plans:** 2/2 plans complete

Plans:
- [x] 10-01-PLAN.md -- Clean build pipeline (tsconfig.build.json excluding tests, updated scripts, prepublishOnly), packaging verification tests
- [x] 10-02-PLAN.md -- Package metadata (keywords, repository, bin alias), README rewrite for 5-bridge architecture, npx tarball smoke test

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Scaffold and Types | 2/2 | Complete   | 2026-03-18 |
| 2. HTTP Client and Utilities | 1/2 | In Progress|  |
| 3. Bridge 1 (Reachability) | 0/3 | Not started | - |
| 4. Bridge 2 (Standards) | 3/3 | Complete | 2026-03-19 |
| 5. Bridge 3 (Separation) and Scoring | 0/2 | Not started | - |
| 6. Terminal Rendering and Output Stubs | 0/2 | Not started | - |
| 7. CLI Integration and JSON Output | 1/2 | In Progress|  |
| 8. Programmatic API | 0/1 | Not started | - |
| 9. Testing | 0/2 | Not started | - |
| 10. Packaging and Publishing | 2/2 | Complete | 2026-03-20 |
