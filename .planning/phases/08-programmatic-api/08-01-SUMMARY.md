---
phase: 08-programmatic-api
plan: 01
subsystem: api
tags: [esm, barrel-exports, vitest, tdd, type-exports]

# Dependency graph
requires:
  - phase: 01-project-skeleton
    provides: "Package entry point structure, tsconfig, package.json exports field"
  - phase: 07-cli-entry-point
    provides: "scan function, getVersion, all bridge runners wired"
provides:
  - "Verified public API: import { scan } from 'milieu-cli' resolves to async function"
  - "All public types (CheckStatus, Check, BridgeResult, ScanResult, ScanOptions) importable"
  - "12 integration tests proving API-01, API-02, API-03 contract"
affects: [09-json-output, 10-integration-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: ["vi.hoisted() for mock variables in vi.mock factories", "barrel re-export for public API surface"]

key-files:
  created: ["src/core/__tests__/api-contract.test.ts"]
  modified: ["src/core/index.ts"]

key-decisions:
  - "vi.hoisted() required for mock variables used in vi.mock factories (vitest hoists vi.mock calls)"
  - "Core barrel wildcard re-export propagates both value and type exports correctly"

patterns-established:
  - "Contract tests verify API shape via runtime assertions + compile-time type annotations"
  - "Mock bridge runners via vi.hoisted() + vi.mock for scan integration tests"

requirements-completed: [API-01, API-02, API-03]

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 8 Plan 1: Programmatic API Summary

**Verified barrel exports and added 12 contract tests proving scan(), getVersion(), and all public types are importable from milieu-cli**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T17:20:23Z
- **Completed:** 2026-03-20T17:23:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Verified and rebuilt dist exports: scan (function) and getVersion (function) confirmed via node import
- Added 12 integration tests covering API-01 (ScanResult shape), API-02 (options passthrough), API-03 (type exports)
- All 368 tests pass across 28 test files, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify and fix package entry point exports** - `060a97a` (feat)
2. **Task 2: Add programmatic API contract integration tests** - `28377fe` (test)

## Files Created/Modified
- `src/core/index.ts` - Updated barrel comment to reflect Phase 8 programmatic API contract
- `src/core/__tests__/api-contract.test.ts` - 12 integration tests proving API contract (exports, return shape, options, types)

## Decisions Made
- Used vi.hoisted() for mock variable hoisting in vi.mock factories -- required because vitest hoists vi.mock calls above variable declarations (same pattern as Phase 07)
- Core barrel wildcard re-export (`export * from`) correctly propagates both value exports (scan, getVersion) and type exports (all interfaces/types) -- no changes needed to src/index.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial test run hit "Cannot access before initialization" due to vi.mock hoisting. Fixed by using vi.hoisted() for mock variables (known vitest pattern, project convention from Phase 07).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Programmatic API surface fully tested and verified
- Ready for Phase 9 (JSON output) and Phase 10 (integration testing) which consume this API

## Self-Check: PASSED

- FOUND: src/core/__tests__/api-contract.test.ts
- FOUND: .planning/phases/08-programmatic-api/08-01-SUMMARY.md
- FOUND: commit 060a97a
- FOUND: commit 28377fe

---
*Phase: 08-programmatic-api*
*Completed: 2026-03-20*
