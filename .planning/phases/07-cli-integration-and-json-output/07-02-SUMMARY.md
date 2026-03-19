---
phase: 07-cli-integration-and-json-output
plan: 02
subsystem: cli
tags: [commander, cli, json-output, flags, exit-codes]

# Dependency graph
requires:
  - phase: 07-cli-integration-and-json-output
    provides: getVersion(), ScanOptions.silent, commander dependency
  - phase: 06-render-layer-and-scan-orchestrator
    provides: formatScanOutput(), scan() orchestrator
provides:
  - Fully functional CLI entry point with scan command and all flags
  - JSON output mode (compact and pretty) for piped consumers
  - Threshold-based exit codes for CI/CD integration
  - Quiet mode suppressing all terminal output
  - buildProgram() exported for testing
affects: [08-packaging-and-distribution]

# Tech tracking
tech-stack:
  added: []
  patterns: [buildProgram with exitOverride for testable CLI, vi.hoisted for mock hoisting]

key-files:
  created: [src/cli/__tests__/cli.test.ts]
  modified: [src/cli/index.ts]

key-decisions:
  - "buildProgram() pattern for testable CLI -- exports function returning commander program, tests call exitOverride()"
  - "vi.hoisted() for mock variable hoisting -- avoids ReferenceError in vi.mock factories"
  - "process.stdout.write for JSON output instead of console.log -- avoids console interception"
  - "process.exitCode instead of process.exit() -- allows stdout to flush before exit"

patterns-established:
  - "CLI testing: buildProgram().exitOverride() + spyOn process.stdout/stderr.write + controlled mockScan"
  - "JSON error output: error JSON object to stdout (not stderr) so pipe consumers always get parseable output"
  - "isDirectRun guard: prevents parseAsync from running during test imports"

requirements-completed: [JSON-01, JSON-02, CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06]

# Metrics
duration: 4min
completed: 2026-03-19
---

# Phase 7 Plan 2: CLI Entry Point Summary

**Commander CLI with scan command, 6 flags (json/pretty/timeout/threshold/verbose/quiet), JSON output modes, and 11 tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T23:33:05Z
- **Completed:** 2026-03-19T23:36:49Z
- **Tasks:** 1 (TDD with 2 commits)
- **Files modified:** 2

## Accomplishments
- Built complete CLI entry point wiring commander.js with scan command and all 6 flags
- JSON and pretty-print output modes via process.stdout.write for clean pipe consumption
- Threshold-based exit codes (exitCode = 1 when score < N) for CI/CD gating
- Quiet mode suppresses formatScanOutput and passes silent: true to scan()
- JSON mode error handling outputs structured JSON error to stdout (not text to stderr)
- 11 comprehensive tests covering all flags, output modes, and error paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Build CLI entry point with commander and all flags** (TDD)
   - `3df1687` (test: add failing CLI tests for all 11 behaviors -- TDD RED)
   - `163c600` (feat: implement CLI entry point with commander and all flags -- TDD GREEN)

_Note: Task 1 used TDD with RED/GREEN commits_

## Files Created/Modified
- `src/cli/index.ts` - Complete CLI entry point with buildProgram(), scan command, all flags, JSON output, error handling
- `src/cli/__tests__/cli.test.ts` - 11 tests covering all CLI behaviors with vi.hoisted mock pattern

## Decisions Made
- Used buildProgram() pattern for testable CLI -- exports function returning configured commander program
- Used vi.hoisted() for mock variable declarations -- fixes vi.mock factory hoisting issue in vitest
- Used process.stdout.write for JSON output (not console.log) -- avoids any console interception
- Used process.exitCode instead of process.exit() -- allows stdout to flush before process termination
- isDirectRun guard checks argv[1] path suffix to prevent parseAsync during test imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vi.mock hoisting with vi.hoisted()**
- **Found during:** Task 1 (TDD GREEN)
- **Issue:** Plan used const mockScan above vi.mock factory, but vitest hoists vi.mock factories above all variable declarations causing ReferenceError
- **Fix:** Used vi.hoisted() to declare mock functions that are available within hoisted vi.mock factories
- **Files modified:** src/cli/__tests__/cli.test.ts
- **Verification:** All 11 tests pass
- **Committed in:** 163c600

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for vitest mock hoisting semantics. No scope creep.

## Issues Encountered
None beyond the mock hoisting fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI fully wired: `npx tsx src/cli/index.ts scan <url>` works end-to-end
- JSON output ready for consumers: `--json` and `--json --pretty` modes
- All 356 tests passing (27 test files), typecheck clean
- Ready for Phase 8: packaging and distribution (npm bin, npx support)

## Self-Check: PASSED

All 2 source files verified on disk (src/cli/index.ts, src/cli/__tests__/cli.test.ts). Both commit hashes verified in git log (3df1687, 163c600).

---
*Phase: 07-cli-integration-and-json-output*
*Completed: 2026-03-19*
