---
phase: 04-bridge-2-standards
plan: 02
subsystem: bridges
tags: [llms-txt, mcp, json-ld, schema-org, security-txt, ai-plugin, well-known, vitest]

# Dependency graph
requires:
  - phase: 02-http-client-and-utilities
    provides: httpGet utility for HTTP probes
  - phase: 01-project-scaffolding
    provides: Check type definition
provides:
  - checkLlmsTxt and checkLlmsFullTxt for llms.txt detection
  - checkMcpEndpoint for MCP Server Card discovery
  - checkJsonLd for JSON-LD script block extraction
  - checkSchemaOrg for Schema.org vocabulary detection (JSON-LD + Microdata)
  - checkSecurityTxt and checkAiPlugin for well-known URI checks
affects: [04-bridge-2-standards-03-orchestrator, scoring, rendering]

# Tech tracking
tech-stack:
  added: []
  patterns: [regex-html-extraction, pure-function-check, http-probe-check]

key-files:
  created:
    - src/bridges/standards/llms-txt.ts
    - src/bridges/standards/mcp.ts
    - src/bridges/standards/json-ld.ts
    - src/bridges/standards/schema-org.ts
    - src/bridges/standards/well-known.ts
    - src/bridges/standards/__tests__/llms-txt.test.ts
    - src/bridges/standards/__tests__/mcp.test.ts
    - src/bridges/standards/__tests__/json-ld.test.ts
    - src/bridges/standards/__tests__/schema-org.test.ts
    - src/bridges/standards/__tests__/well-known.test.ts
  modified: []

key-decisions:
  - "Schema.org reuses JSON-LD Check result to avoid re-parsing HTML"
  - "JSON-LD and Schema.org are pure functions (no HTTP) taking HTML string input"
  - "MCP validation is lenient due to draft spec (SEP-1649) -- accepts Server Card, legacy, and primitives formats"

patterns-established:
  - "HTTP probe check: httpGet URL, validate response, return Check (used by llms-txt, mcp, well-known)"
  - "Pure HTML check: regex-based extraction from HTML string, return Check (used by json-ld, schema-org)"
  - "Cross-check data reuse: checkSchemaOrg takes checkJsonLd output to avoid redundant parsing"

requirements-completed: [STND-03, STND-04, STND-05, STND-06, STND-07, STND-08]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 4 Plan 2: Bridge 2 Check Modules Summary

**Five Bridge 2 check modules (llms-txt, MCP, JSON-LD, Schema.org, well-known URIs) with H1 validation, Server Card detection, regex HTML extraction, and Microdata scanning -- 53 tests passing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T01:04:42Z
- **Completed:** 2026-03-19T01:09:48Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- llms-txt module with H1 validation, byte size calculation, and firstLine extraction for both llms.txt and llms-full.txt
- MCP endpoint detection supporting Server Card (SEP-1649), legacy mcp_version, and MCP primitives formats
- JSON-LD extraction via regex with @type reporting, array handling, and invalid JSON resilience
- Schema.org detection combining JSON-LD @context vocabulary check and Microdata itemtype attribute scanning
- Well-known URI checks: security.txt with Contact field validation (RFC 9116) and ai-plugin.json with manifest field validation
- 53 tests across 5 test suites, all green with TDD workflow

## Task Commits

Each task was committed atomically:

1. **Task 1: llms-txt, MCP, and well-known check modules** - `519432a` (test: RED), `0b66ed4` (feat: GREEN)
2. **Task 2: JSON-LD and Schema.org check modules** - `49f01b4` (test: RED), `ed03fa8` (feat: GREEN)

_TDD tasks have two commits each (test then feat)_

## Files Created/Modified
- `src/bridges/standards/llms-txt.ts` - checkLlmsTxt (H1/size/firstLine) and checkLlmsFullTxt (size only)
- `src/bridges/standards/mcp.ts` - checkMcpEndpoint with Server Card, legacy, and primitives validation
- `src/bridges/standards/json-ld.ts` - checkJsonLd regex extraction with JsonLdBlock type export
- `src/bridges/standards/schema-org.ts` - checkSchemaOrg combining JSON-LD @context and Microdata itemtype
- `src/bridges/standards/well-known.ts` - checkSecurityTxt (RFC 9116) and checkAiPlugin (manifest fields)
- `src/bridges/standards/__tests__/llms-txt.test.ts` - 12 tests (8 llms-txt + 4 llms-full.txt)
- `src/bridges/standards/__tests__/mcp.test.ts` - 8 tests (Server Card, legacy, primitives, partial, fail)
- `src/bridges/standards/__tests__/json-ld.test.ts` - 11 tests (single/multi blocks, arrays, edge cases)
- `src/bridges/standards/__tests__/schema-org.test.ts` - 10 tests (JSON-LD, Microdata, both, dedup)
- `src/bridges/standards/__tests__/well-known.test.ts` - 12 tests (6 security.txt + 6 ai-plugin)

## Decisions Made
- Schema.org check takes JSON-LD Check result as parameter rather than re-parsing HTML -- avoids redundant work and maintains clean data flow
- JSON-LD and Schema.org are pure functions (no HTTP calls) -- they operate on HTML strings passed from the bridge orchestrator
- MCP validation is deliberately lenient: the spec is still in draft (SEP-1649, targeting June 2026), so we accept any of three recognized formats rather than enforcing strict schema
- TextEncoder.encode used for accurate byte-size calculation in llms-txt (handles multi-byte UTF-8 correctly)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect byte size in llms-txt test expectation**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Test expected "# My Site\n\nSome content here" to be 30 bytes; actual TextEncoder output is 28 bytes
- **Fix:** Corrected test expectation from 30 to 28
- **Files modified:** src/bridges/standards/__tests__/llms-txt.test.ts
- **Verification:** All 32 Task 1 tests pass after fix
- **Committed in:** 0b66ed4 (part of Task 1 feat commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test data)
**Impact on plan:** Trivial test data correction. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 individual check modules ready for Bridge 2 orchestrator (Plan 3)
- JSON-LD exports JsonLdBlock type for Schema.org reuse
- All checks follow consistent Check interface contract per UI-SPEC
- 68 total tests passing across all 6 Bridge 2 test suites (including OpenAPI from Plan 1)

## Self-Check: PASSED

- All 10 source/test files verified present on disk
- All 4 task commits verified in git log (519432a, 0b66ed4, 49f01b4, ed03fa8)
- SUMMARY.md created at expected path
- 68 tests passing across all Bridge 2 test suites
- TypeScript compiles cleanly (tsc --noEmit exits 0)

---
*Phase: 04-bridge-2-standards*
*Completed: 2026-03-19*
