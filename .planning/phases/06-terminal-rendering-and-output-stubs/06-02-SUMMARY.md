---
phase: 06-terminal-rendering-and-output-stubs
plan: 02
subsystem: rendering
tags: [formatBridge, formatScanOutput, scan-orchestrator, ora, spinner, abort-handling, verbose-mode]

# Dependency graph
requires:
  - phase: 06-terminal-rendering-and-output-stubs
    plan: 01
    provides: Color utilities (green/yellow/red/cyan/dim/bold), progressBar, statusSymbol, Bridge 4-5 stubs
  - phase: 03-bridge-1-reachability-check
    provides: runReachabilityBridge orchestrator
  - phase: 04-bridge-2-standards-discovery
    provides: runStandardsBridge orchestrator
  - phase: 05-bridge-3-separation-and-scoring
    provides: runSeparationBridge orchestrator
provides:
  - formatBridge() for rendering scored, detection, and stub bridge lines
  - formatVerboseChecks() for per-check detail lines with status symbols
  - formatScanOutput() for complete terminal output assembly (header, bridges, score, timing)
  - scan() orchestrator that runs all bridges with ora spinner and abort handling
affects: [07-cli-entry-point, json-output-mode]

# Tech tracking
tech-stack:
  added: []
  patterns: [scan-orchestrator-with-spinner, bridge-type-aware-formatting, abort-skip-pattern]

key-files:
  created:
    - src/render/format-bridge.ts
    - src/render/format-verbose.ts
    - src/render/format-scan.ts
    - src/render/__tests__/format-bridge.test.ts
    - src/render/__tests__/format-verbose.test.ts
    - src/render/__tests__/format-scan.test.ts
    - src/core/scan.ts
    - src/core/__tests__/scan.test.ts
  modified:
    - src/render/index.ts
    - src/core/index.ts

key-decisions:
  - "normalizeUrl returns { href, domain, baseUrl } -- scan.ts destructures these directly, no separate extractDomain call needed"
  - "Abort case creates placeholder bridge2 (score=0) and bridge3 (score=null) rather than omitting them, preserving the 5-tuple invariant"
  - "Overall score thresholds: >=80 pass, >=40 partial, <40 fail -- matches bridge-level scoring thresholds"

patterns-established:
  - "Bridge-type-aware formatting: scored bridges get progress bar, detection gets signal count, stubs get dim label"
  - "Scan orchestrator abort-skip: Bridge 1 abort causes Bridges 2-3 to be skipped with placeholder results"
  - "UTC timestamp formatting: explicit getUTC* methods, never toLocaleString or locale-dependent formatting"

requirements-completed: [TERM-01, TERM-03, TERM-04, TERM-06, TERM-07]

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 6 Plan 02: Scan Output Formatters and Orchestrator Summary

**Bridge-type-aware terminal output with scored/detection/stub formatting, verbose mode, and scan orchestrator with ora spinner and abort handling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T05:57:02Z
- **Completed:** 2026-03-19T05:59:36Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Three format modules render all 5 bridge types: scored bridges with progress bars, detection bridges with signal counts, stub bridges with dim "not evaluated" labels
- Verbose mode renders per-check detail lines with colored status symbols (checkmark/warning/x) and optional detail text
- Full scan output assembly with header (domain), UTC timestamp, all 5 bridges, overall score colored by label, and total time
- Scan orchestrator runs Bridges 1-3 sequentially with ora spinner text updates, creates Bridge 4-5 stubs, handles Bridge 1 abort by skipping Bridges 2-3
- Overall score averaging excludes null scores (Bridge 3 detection and Bridge 4-5 stubs)
- 27 new tests all passing across 4 test files, typecheck clean

## Task Commits

Each task was committed atomically (TDD flow):

1. **Task 1: Bridge formatting, verbose mode, and full scan output**
   - `38d3a6e` (test) - Failing tests for format-bridge, format-verbose, format-scan
   - `9a8066c` (feat) - Implement format-bridge, format-verbose, format-scan, update barrel
2. **Task 2: Scan orchestrator with spinner and unit tests**
   - `af1aeb2` (test) - Failing tests for scan orchestrator
   - `b499ca2` (feat) - Implement scan orchestrator with spinner and abort handling

_Note: TDD tasks have RED (test) and GREEN (feat) commits._

## Files Created/Modified
- `src/render/format-bridge.ts` - Bridge result formatting: scored (progress bar + score), detection (signal count), stub (dim label)
- `src/render/format-verbose.ts` - Per-check detail rendering with status symbols and optional detail text
- `src/render/format-scan.ts` - Full scan output assembly: header, timestamp, bridges, overall score, total time
- `src/render/__tests__/format-bridge.test.ts` - 5 tests for scored, detection, and stub bridge formatting
- `src/render/__tests__/format-verbose.test.ts` - 7 tests for check symbols, details, and multi-line indentation
- `src/render/__tests__/format-scan.test.ts` - 8 tests for header, timestamp, timing, score, verbose mode
- `src/core/scan.ts` - Scan orchestrator: sequential bridges, spinner, abort handling, overall score calculation
- `src/core/__tests__/scan.test.ts` - 7 tests for normal flow, abort, score averaging, spinner lifecycle, error handling
- `src/render/index.ts` - Updated barrel with formatBridge, formatVerboseChecks, formatScanOutput exports
- `src/core/index.ts` - Updated barrel with scan export

## Decisions Made
- `normalizeUrl` returns `{ href, domain, baseUrl }` directly -- the scan orchestrator destructures `domain` and `baseUrl` from it rather than calling a separate `extractDomain`. This was a deviation from the plan which incorrectly referenced `normalized.url` (the property is `href`).
- Abort case creates placeholder `bridge2` (score=0, scoreLabel="fail") and `bridge3` (score=null, scoreLabel=null) rather than omitting them. This preserves the 5-tuple `bridges` invariant in `ScanResult`.
- Overall score thresholds (>=80 pass, >=40 partial, <40 fail) match the per-bridge scoring thresholds used in Bridges 1 and 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed normalizeUrl return property name**
- **Found during:** Task 2 (Scan orchestrator, GREEN phase)
- **Issue:** Plan's scan.ts code referenced `normalized.url` but `normalizeUrl()` returns `{ ok, href, domain, baseUrl }` -- there is no `.url` property.
- **Fix:** Used destructuring `{ domain, baseUrl } = normalized` to access the correct properties directly.
- **Files modified:** `src/core/scan.ts`
- **Verification:** All 7 scan tests pass, typecheck clean.
- **Committed in:** `b499ca2`

---

**Total deviations:** 1 auto-fixed (1 bug in plan's code template)
**Impact on plan:** Necessary fix for correctness. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All rendering and scan orchestration complete for Phase 7 (CLI entry point)
- `scan()` function ready to be wired to commander CLI
- `formatScanOutput()` ready to render scan results to terminal
- Verbose mode (`--verbose` flag) formatting ready
- Phase 6 fully complete (2 of 2 plans done)

## Self-Check: PASSED

All 10 files verified present. All 4 commits verified in git history.

---
*Phase: 06-terminal-rendering-and-output-stubs*
*Completed: 2026-03-19*
