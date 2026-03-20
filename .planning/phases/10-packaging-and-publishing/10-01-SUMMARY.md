---
phase: 10-packaging-and-publishing
plan: 01
subsystem: packaging
tags: [tsconfig, npm-pack, build-pipeline, esm, shebang, vitest]

# Dependency graph
requires:
  - phase: 01-project-scaffold-and-types
    provides: Base tsconfig.json with compilerOptions
  - phase: 09-testing
    provides: Test files in __tests__ directories that must be excluded from dist
provides:
  - tsconfig.build.json excluding test files from compilation
  - Clean build pipeline (rm -rf dist + tsc -p tsconfig.build.json)
  - prepublishOnly and prepack lifecycle hooks
  - Automated packaging invariant tests (8 assertions)
affects: [10-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [tsconfig-extends-for-build, lifecycle-hooks-for-publish-safety]

key-files:
  created:
    - tsconfig.build.json
    - src/core/__tests__/packaging.test.ts
  modified:
    - package.json

key-decisions:
  - "tsconfig.build.json extends base tsconfig.json -- single source of truth for compilerOptions"
  - "Build script uses rm -rf dist before tsc to ensure clean output"
  - "Both prepublishOnly and prepack hooks added for double safety"

patterns-established:
  - "tsconfig.build.json pattern: extend base, override only exclude -- all future build config changes go through this file"
  - "Packaging tests as regression guardrails: structural invariants verified in CI alongside unit tests"

requirements-completed: [PKG-02, PKG-04, PKG-05]

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 10 Plan 01: Build Pipeline Summary

**Clean build pipeline via tsconfig.build.json excluding test files from dist, with prepublishOnly hooks and 8 automated packaging invariant tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T20:18:00Z
- **Completed:** 2026-03-20T20:20:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created tsconfig.build.json that extends base config but excludes __tests__, *.test.ts, and *.spec.ts from compilation
- Updated build script to clean dist and use build-specific tsconfig, eliminating test file leakage into npm package
- Added prepublishOnly and prepack lifecycle hooks ensuring clean build before any publish or pack operation
- Built 8 automated packaging tests covering: runtime deps count, ESM-only, exports field, files whitelist, bin entry, shebang, prepublishOnly script, and no test files in dist

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tsconfig.build.json and update package.json scripts** - `8245d8d` (feat)
2. **Task 2: Add packaging verification tests** - `db62199` (test)

## Files Created/Modified
- `tsconfig.build.json` - Build config extending base tsconfig with test file exclusions
- `package.json` - Updated build/prepublishOnly/prepack scripts to use tsconfig.build.json
- `src/core/__tests__/packaging.test.ts` - 8 packaging invariant tests using createRequire pattern

## Decisions Made
- tsconfig.build.json extends base tsconfig.json so compilerOptions remain in one place
- Build script uses `rm -rf dist` before compilation to ensure no stale test files remain from previous builds
- Both prepublishOnly and prepack hooks added (redundant by design -- safety net for both `npm publish` and `npm pack`)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Build pipeline is clean: `npm pack --dry-run` shows zero __tests__ entries
- All 416 tests pass including new packaging tests (no regressions)
- Ready for 10-02: package metadata, README, and npx smoke test

## Self-Check: PASSED

- [x] tsconfig.build.json exists
- [x] src/core/__tests__/packaging.test.ts exists
- [x] package.json exists
- [x] Commit 8245d8d exists
- [x] Commit db62199 exists

---
*Phase: 10-packaging-and-publishing*
*Completed: 2026-03-20*
