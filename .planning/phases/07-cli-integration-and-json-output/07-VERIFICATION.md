---
phase: 07-cli-integration-and-json-output
verified: 2026-03-19T19:58:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 7: CLI Integration and JSON Output Verification Report

**Phase Goal:** Users can run `milieu scan <url>` with all flags and get either terminal or JSON output
**Verified:** 2026-03-19T19:58:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                 | Status     | Evidence                                                                               |
|----|-----------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------|
| 1  | getVersion() returns the version string from package.json             | VERIFIED   | src/core/version.ts uses createRequire; 3 version tests pass                           |
| 2  | scan() suppresses the ora spinner when options.silent is true         | VERIFIED   | src/core/scan.ts:39-40 — isSilent extracted, passed to ora; 2 isSilent tests pass      |
| 3  | ScanResult.version matches package.json version (single source)       | VERIFIED   | scan.ts:104 uses getVersion(); no hardcoded VERSION constant present                   |
| 4  | User can run `milieu scan <url>` and see terminal output              | VERIFIED   | CLI test 1 (CLI-01) passes; formatScanOutput called in non-json/non-quiet path         |
| 5  | User can run `milieu scan <url> --json` and get valid JSON on stdout  | VERIFIED   | CLI test 4 (JSON-01) passes; JSON.stringify(result) written to process.stdout.write    |
| 6  | User can run `milieu scan <url> --json --pretty` and get formatted JSON | VERIFIED | CLI test 5 (JSON-02) passes; JSON.stringify(result, null, 2) in pretty path            |
| 7  | User can set --timeout to configure per-request timeout               | VERIFIED   | CLI test 6 (CLI-02) passes; opts.timeout parsed and forwarded to scan()                |
| 8  | User can set --threshold N and get exit code 1 if score < N           | VERIFIED   | CLI tests 7+8 (CLI-03) pass; process.exitCode = 1 when overallScore < threshold        |
| 9  | User can use --quiet to suppress all terminal output                  | VERIFIED   | CLI test 9 (CLI-04) passes; formatScanOutput not called; silent: true passed to scan   |
| 10 | milieu --version prints the version                                   | VERIFIED   | CLI test 2 (CLI-05) passes; .version(getVersion()) wired in buildProgram()             |
| 11 | milieu --help prints help text                                        | VERIFIED   | .description() and .argument("<url>") set — commander generates help automatically    |
| 12 | Invalid URL produces error message and exit code 1                    | VERIFIED   | CLI tests 3+11 (CLI-06) pass; stderr path and JSON error path both tested              |

**Score:** 12/12 truths verified

---

## Required Artifacts

### Plan 07-01 Artifacts

| Artifact                                    | Expected                                      | Status     | Details                                              |
|---------------------------------------------|-----------------------------------------------|------------|------------------------------------------------------|
| `src/core/version.ts`                       | getVersion() via createRequire                | VERIFIED   | 8 lines; createRequire + package.json + export       |
| `src/core/types.ts`                         | ScanOptions with silent?: boolean             | VERIFIED   | Line 69: `silent?: boolean` present                  |
| `src/core/scan.ts`                          | Uses getVersion() and passes isSilent to ora  | VERIFIED   | Line 16: import getVersion; line 39-40: isSilent     |
| `src/core/__tests__/version.test.ts`        | 3 tests for getVersion()                      | VERIFIED   | 3 tests: semver pattern, pkg match, stability        |
| `src/core/__tests__/scan.test.ts`           | isSilent tests added                          | VERIFIED   | Lines 226-248: 2 isSilent tests added                |
| `src/core/index.ts`                         | Barrel exports getVersion                     | VERIFIED   | Line 4: export { getVersion } from "./version.js"    |

### Plan 07-02 Artifacts

| Artifact                              | Expected                                         | Status     | Details                                              |
|---------------------------------------|--------------------------------------------------|------------|------------------------------------------------------|
| `src/cli/index.ts`                    | Commander CLI entry point with all flags (60+L)  | VERIFIED   | 81 lines; shebang, all 6 flags, buildProgram export  |
| `src/cli/__tests__/cli.test.ts`       | Tests for all CLI flags and output modes (80+L)  | VERIFIED   | 263 lines; 11 tests covering all behaviors           |

---

## Key Link Verification

### Plan 07-01 Key Links

| From                    | To                  | Via                  | Status     | Details                                               |
|-------------------------|---------------------|----------------------|------------|-------------------------------------------------------|
| `src/core/version.ts`   | `package.json`      | createRequire        | VERIFIED   | Line 3-4: createRequire(import.meta.url); require("../../package.json") |
| `src/core/scan.ts`      | `src/core/version.ts` | import getVersion  | VERIFIED   | Line 16: import { getVersion } from "./version.js"    |
| `src/core/scan.ts`      | `ora`               | isSilent option      | VERIFIED   | Line 39: isSilent = options.silent ?? false; line 40: ora({ isSilent }) |

### Plan 07-02 Key Links

| From                  | To                         | Via                   | Status     | Details                                               |
|-----------------------|----------------------------|-----------------------|------------|-------------------------------------------------------|
| `src/cli/index.ts`    | `src/core/scan.js`         | import scan           | VERIFIED   | Line 3: import { scan } from "../core/scan.js"        |
| `src/cli/index.ts`    | `src/core/version.js`      | import getVersion     | VERIFIED   | Line 4: import { getVersion } from "../core/version.js" |
| `src/cli/index.ts`    | `src/render/format-scan.js`| import formatScanOutput | VERIFIED | Line 5: import { formatScanOutput } from "../render/format-scan.js" |
| `src/cli/index.ts`    | `commander`                | import Command        | VERIFIED   | Line 2: import { Command } from "commander"           |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                            | Status    | Evidence                                                   |
|-------------|-------------|--------------------------------------------------------|-----------|------------------------------------------------------------|
| JSON-01     | 07-02       | --json flag outputs complete ScanResult object         | SATISFIED | CLI test 4: JSON.parse(stdout) contains overallScore/version |
| JSON-02     | 07-02       | --json --pretty outputs formatted JSON                 | SATISFIED | CLI test 5: stdout contains "  " and "\n" indentation      |
| JSON-03     | 07-01       | JSON schema includes version field for API stability   | SATISFIED | ScanResult.version set via getVersion(); scan.ts:104       |
| JSON-04     | 07-01       | JSON output is public contract — versioned API surface | SATISFIED | ScanResult type in types.ts has JSDoc: "JSON output public API contract" |
| CLI-01      | 07-02       | milieu scan <url> as primary command via commander     | SATISFIED | src/cli/index.ts:16 — .command("scan").argument("<url>")   |
| CLI-02      | 07-02       | --timeout flag configures per-request timeout          | SATISFIED | CLI test 6: --timeout 5000 passes timeout:5000 to scan()   |
| CLI-03      | 07-02       | --threshold N exits non-zero if overall score < N      | SATISFIED | CLI tests 7+8: exitCode=1 when score<threshold; no exit when score>=threshold |
| CLI-04      | 07-02       | --quiet suppresses terminal output                     | SATISFIED | CLI test 9: formatScanOutput not called; silent:true passed |
| CLI-05      | 07-02       | --version prints version, --help prints help           | SATISFIED | CLI test 2: stdout contains "0.1.0"; .version(getVersion()) |
| CLI-06      | 07-02       | Invalid URL produces helpful error and exit code 1     | SATISFIED | CLI tests 3+11: stderr error text; JSON error object; exitCode=1 |

**No orphaned requirements.** All 10 IDs declared in plan frontmatter (JSON-03/04 in 07-01; JSON-01/02/CLI-01 through CLI-06 in 07-02) are accounted for. REQUIREMENTS.md traceability table marks all 10 as Phase 7 / Complete.

---

## Anti-Patterns Found

No anti-patterns detected in phase 07 files.

Checked `src/cli/index.ts` and `src/core/version.ts` for:
- TODO/FIXME/HACK/PLACEHOLDER comments — none
- `return null` / `return {}` / `return []` stubs — none
- Console.log-only implementations — none
- Hardcoded version string (`const VERSION`) in scan.ts — none (removed in this phase)

---

## Test Execution Results

| Test File                                     | Tests | Status     |
|-----------------------------------------------|-------|------------|
| `src/core/__tests__/version.test.ts`          | 3     | All passed |
| `src/core/__tests__/scan.test.ts`             | 9     | All passed |
| `src/cli/__tests__/cli.test.ts`               | 11    | All passed |
| Full suite (27 test files)                    | 356   | All passed |

TypeScript typecheck (`npx tsc --noEmit`): clean, no errors.

---

## Human Verification Required

No items require human verification. All behaviors verified programmatically:
- CLI parsing and flag forwarding verified via unit tests with mocked scan()
- JSON output format verified by parsing stdout in tests
- Exit code behavior verified by asserting process.exitCode
- Spinner suppression verified by asserting ora called with isSilent matching options.silent

The only naturally human-verified item — "does the spinner look right in a terminal" — is not a goal of this phase (TERM-04 was completed in Phase 6; this phase only adds isSilent suppression which is tested).

---

## Summary

Phase 7 goal is fully achieved. All 12 observable truths hold. All 8 required artifacts exist, are substantive (not stubs), and are correctly wired. All 7 key links verified in the actual source. All 10 required requirement IDs satisfied with test evidence. The full 356-test suite passes with a clean typecheck.

The single notable deviation from the original plan — using `vi.hoisted()` instead of top-level const declarations for mock variables — was a necessary fix for vitest hoisting semantics and is correctly documented in 07-02-SUMMARY.md. It does not affect goal achievement.

---

_Verified: 2026-03-19T19:58:00Z_
_Verifier: Claude (gsd-verifier)_
