---
phase: 08-programmatic-api
verified: 2026-03-20T10:28:30Z
status: passed
score: 4/4 must-haves verified
---

# Phase 8: Programmatic API Verification Report

**Phase Goal:** TypeScript consumers can import and use the scanner as a library
**Verified:** 2026-03-20T10:28:30Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `import { scan } from 'milieu-cli'` resolves to a callable async function | VERIFIED | `node -e "import{scan}from'./dist/index.js';console.log(typeof scan)"` prints `function`; `dist/index.js` exports `scan` via wildcard re-export chain |
| 2 | `scan()` accepts an options object with timeout, verbose, and silent fields | VERIFIED | Tests in `api-contract.test.ts` pass options and assert `ctx.options.timeout`, `ctx.options.verbose`, `ctx.options.silent` are propagated; all 3 option tests pass |
| 3 | `scan()` returns a typed ScanResult with version, url, timestamp, durationMs, overallScore, overallScoreLabel, bridges | VERIFIED | 5 tests under "scan() return shape (API-01)" pass; each field present and typed correctly |
| 4 | CheckStatus, Check, BridgeResult, ScanResult, ScanOptions are importable as types | VERIFIED | Type-annotation test compiles and passes; `dist/core/types.d.ts` has 14 export statements; `npm run typecheck` exits 0 |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/index.ts` | Package entry point re-exporting scan function and all public types | VERIFIED | Line 4: `export * from "./core/index.js"` — matches required pattern `export.*from.*core/index` |
| `src/core/index.ts` | Core barrel exporting scan, getVersion, and all types | VERIFIED | Line 2: `export * from "./types.js"`, Line 3: `export { scan } from "./scan.js"`, Line 4: `export { getVersion } from "./version.js"` |
| `src/core/__tests__/api-contract.test.ts` | Integration tests verifying programmatic API contract (min 40 lines) | VERIFIED | 280 lines; 12 tests across 4 describe blocks; all 12 pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/index.ts` | `src/core/index.ts` | barrel re-export | WIRED | `export * from "./core/index.js"` at line 4 |
| `src/core/index.ts` | `src/core/scan.ts` | named export | WIRED | `export { scan } from "./scan.js"` at line 3 |
| `src/core/index.ts` | `src/core/types.ts` | wildcard re-export | WIRED | `export * from "./types.js"` at line 2 |
| `dist/index.js` | runtime | ESM import | WIRED | `Object.keys(dist/index.js)` = `['getVersion', 'scan']`; both are `function` type |
| `dist/index.d.ts` | `dist/core/types.d.ts` | type re-export | WIRED | `dist/core/types.d.ts` has 14 export declarations (CheckStatus, Check, BridgeId, BridgeName, BridgeStatus, BridgeResult, ScanOptions, ScanResult, HttpErrorKind, HttpError, HttpSuccess, HttpFailure, HttpResponse) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| API-01 | 08-01-PLAN.md | `import { scan } from "milieu-cli"` returns typed ScanResult | SATISFIED | dist exports `scan` as function; 5 runtime tests verify ScanResult shape; typecheck clean |
| API-02 | 08-01-PLAN.md | scan() accepts options object (timeout, verbose) | SATISFIED | 4 option tests pass — timeout, verbose, silent, and no-options all verified via ctx spy |
| API-03 | 08-01-PLAN.md | All types exported for TypeScript consumers | SATISFIED | Compile-time test uses CheckStatus, Check, BridgeResult, ScanResult, ScanOptions as type annotations; `npm run typecheck` exits 0; `dist/core/types.d.ts` has 14 exports |

No orphaned requirements: REQUIREMENTS.md maps API-01, API-02, API-03 to Phase 8 — all three are claimed in 08-01-PLAN.md `requirements` field and verified above.

---

### Anti-Patterns Found

None. Scanned `src/index.ts`, `src/core/index.ts`, and `src/core/__tests__/api-contract.test.ts` for TODO/FIXME/XXX/HACK/PLACEHOLDER, empty returns, and stub implementations — no issues found.

---

### Human Verification Required

None. All verification is fully automated:
- Runtime import check confirms `scan` and `getVersion` are callable functions
- 12 integration tests confirm full contract (shape, options, type annotations)
- TypeScript typecheck confirms compile-time correctness
- No UI, real-time behavior, or external service integration in scope for this phase

---

### Summary

Phase 8 goal is fully achieved. The programmatic API surface is correctly wired end-to-end:

- `src/index.ts` re-exports the core barrel via wildcard, and the dist build correctly exposes `scan` and `getVersion` as runtime functions
- `dist/index.d.ts` transitively re-exports all type declarations from `dist/core/types.d.ts` (14 exports), satisfying API-03
- `src/core/__tests__/api-contract.test.ts` (280 lines, 12 tests) proves the contract with no mocking gaps — options passthrough is verified by spying on bridge runner call arguments
- All three requirements (API-01, API-02, API-03) are satisfied with implementation evidence and passing tests
- `npm run typecheck` exits 0, no anti-patterns in modified files

---

_Verified: 2026-03-20T10:28:30Z_
_Verifier: Claude (gsd-verifier)_
