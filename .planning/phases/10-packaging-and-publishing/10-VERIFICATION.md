---
phase: 10-packaging-and-publishing
verified: 2026-03-20T00:00:00Z
status: human_needed
score: 5/6 must-haves verified
gaps:
human_verification:
  - test: "Run npm publish (requires npm login and human approval)"
    expected: "Package appears at https://www.npmjs.com/package/milieu-cli and `npx milieu-cli scan example.com` works from a fresh directory"
    why_human: "Requires npm credentials and live publish. Automated checks verify the package is ready but cannot execute the actual publish."
  - test: "README license field says MIT but package.json says Apache-2.0"
    expected: "Both should agree. Decide which license is authoritative and update README.md line 118 to match package.json (Apache-2.0), or update package.json to MIT."
    why_human: "License conflict is a factual inconsistency in published materials. A human must decide the intended license."
  - test: "Verify tarball milieu-cli-0.1.0.tgz left in project root"
    expected: "The smoke-test tarball should be deleted before publish to keep the repo clean: `rm milieu-cli-0.1.0.tgz`"
    why_human: "Non-blocking but a cleanup item — the tgz is committed-adjacent and should not pollute the working directory before publish."
---

# Phase 10: Packaging and Publishing Verification Report

**Phase Goal:** Tool is published to npm and works via npx with zero friction
**Verified:** 2026-03-20
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Build compiles only production code, no test files in dist | VERIFIED | `dist/` Glob shows zero `__tests__` directories and zero `.test.*` files. `tsconfig.build.json` excludes `src/**/__tests__/**`, `*.test.ts`, `*.spec.ts`. |
| 2 | Shebang is present in dist/cli/index.js | VERIFIED | `dist/cli/index.js` line 1: `#!/usr/bin/env node` — confirmed by direct Read. |
| 3 | prepublishOnly script ensures clean build before any publish | VERIFIED | `package.json` has `"prepublishOnly": "npm run build"` and `"prepack": "npm run build"`. Build script is `rm -rf dist && tsc -p tsconfig.build.json`. |
| 4 | npx milieu-cli scan works for first-time users | HUMAN NEEDED | `milieu-cli-0.1.0.tgz` tarball was verified locally during plan execution. Package structure is correct: `bin.milieu-cli` points to `dist/cli/index.js` which starts with shebang. Cannot verify live npx without actual npm publish. |
| 5 | Package metadata is complete for npmjs.com listing | VERIFIED | `keywords` (19 terms), `repository`, `homepage`, `bugs`, `author` all present in `package.json`. |
| 6 | README describes the current 5-bridge architecture and correct CLI syntax | VERIFIED | README references `npx milieu-cli scan stripe.com` as primary command, shows 5-bridge table with Bridge 1-3 details, includes programmatic API section. One issue: README line 118 says "MIT" but `package.json` says "Apache-2.0". |
| 7 | Exactly 3 runtime dependencies with no additions | VERIFIED | `package.json` dependencies: `chalk`, `commander`, `ora` — exactly 3. Confirmed by direct read and cross-referenced against packaging.test.ts assertion. |
| 8 | PKG-01: Published to npm as milieu-cli | HUMAN NEEDED | Package is publish-ready but not yet published. `npm view milieu-cli` was returning 404 at research time (name available). Requires human to run `npm publish`. |

**Score:** 6/8 truths verified (2 human-gated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `tsconfig.build.json` | Build config excluding test files | VERIFIED | Exists. Extends `./tsconfig.json`. Excludes `src/**/__tests__/**`, `src/**/*.test.ts`, `src/**/*.spec.ts`. |
| `package.json` | Updated build script using tsconfig.build.json with clean step | VERIFIED | `build` script: `rm -rf dist && tsc -p tsconfig.build.json`. Contains `prepublishOnly`, `prepack`, `milieu-cli` bin alias, 19 keywords, repository, homepage, bugs, author. |
| `src/core/__tests__/packaging.test.ts` | Automated verification of packaging invariants (40+ lines) | VERIFIED | 87 lines. 8 tests: runtime dep count, ESM-only, exports field, files whitelist, bin entry, shebang, prepublishOnly, no test files in dist. Uses `createRequire` pattern. |
| `README.md` | Accurate package documentation for npmjs.com | VERIFIED with note | Contains `npx milieu-cli scan`, 5-bridge architecture table, programmatic API. License section says "MIT" — conflicts with `package.json` "Apache-2.0". |
| `dist/cli/index.js` | CLI entry point with shebang | VERIFIED | Exists. Line 1: `#!/usr/bin/env node`. |
| `dist/index.js` | Package entry point (programmatic API) | VERIFIED | Exists. Re-exports `./core/index.js`. |
| `dist/index.d.ts` | TypeScript declarations for programmatic API | VERIFIED | Exists. Re-exports `./core/index.js`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json scripts.build` | `tsconfig.build.json` | `tsc -p tsconfig.build.json` | WIRED | `build` script contains exact string `tsc -p tsconfig.build.json`. |
| `package.json scripts.prepublishOnly` | `package.json scripts.build` | `npm run build` lifecycle hook | WIRED | `"prepublishOnly": "npm run build"` confirmed. |
| `package.json bin.milieu-cli` | `dist/cli/index.js` | bin alias for npx resolution | WIRED | `"milieu-cli": "./dist/cli/index.js"` confirmed. File exists with shebang. |
| `README.md` | `package.json name` | `npx milieu-cli` command matches package name | WIRED | README shows `npx milieu-cli scan stripe.com`. Package name is `milieu-cli`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| FOUND-01 | 10-02-PLAN | Tool is published as `milieu-cli` npm package with `milieu scan <url>` as primary command | HUMAN NEEDED | Package name `milieu-cli`, bin `milieu` → `dist/cli/index.js`, README shows `milieu scan` as primary. Requires live npm publish to be fully satisfied. |
| PKG-01 | 10-02-PLAN | Published to npm as `milieu-cli` | HUMAN NEEDED | Package is publish-ready. Name was available at research time. Requires `npm publish` with credentials. |
| PKG-02 | 10-01-PLAN | ESM-only package with .d.ts type declarations | SATISFIED | `"type": "module"` in package.json. `dist/index.d.ts` and `dist/index.d.ts.map` exist. `exports["."].types` points to `./dist/index.d.ts`. |
| PKG-03 | 10-02-PLAN | 3 runtime dependencies only: commander, chalk, ora | SATISFIED | `package.json` dependencies has exactly `chalk`, `commander`, `ora`. packaging.test.ts asserts `["chalk", "commander", "ora"]` sorted. |
| PKG-04 | 10-01-PLAN | Shebang in entry point for npx execution | SATISFIED | `dist/cli/index.js` line 1: `#!/usr/bin/env node`. packaging.test.ts asserts this. |
| PKG-05 | 10-01-PLAN | package.json exports field and files whitelist correctly configured | SATISFIED | `exports["."]` has `types` and `import` conditions. `files: ["dist"]`. `dist/` contains zero test artifacts (verified by Glob). |

All 6 requirement IDs from PLAN frontmatter are accounted for. No orphaned requirements for Phase 10 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `README.md` | 118 | License says "MIT" but `package.json` says "Apache-2.0" | Warning | License mismatch between README and package.json. npmjs.com shows the package.json value (Apache-2.0) but README footer contradicts it. Confusing to users; should be corrected before publish. |
| `milieu-cli-0.1.0.tgz` | — | Tarball left in project root after smoke test | Info | The smoke-test tarball from plan 10-02 Task 2 was not cleaned up. Not in `.gitignore`, may be committed accidentally. Should be deleted. |

### Human Verification Required

#### 1. npm publish

**Test:** With npm credentials active, run `npm publish` from the project root. Then from a clean temporary directory, run `npx milieu-cli scan https://example.com`.
**Expected:** Package appears on npmjs.com at https://www.npmjs.com/package/milieu-cli. The npx command installs the package and produces bridge output for example.com.
**Why human:** Requires npm login credentials and intentional publishing decision. Automated checks have verified the package is structurally ready — this is the human approval gate documented in plan 10-02 Task 3.

#### 2. License inconsistency

**Test:** Check README.md line 118 ("MIT") against `package.json` line 32 ("Apache-2.0").
**Expected:** Both files should declare the same license.
**Why human:** Only a human can decide which license is the intended one for the project. The fix is a one-line change in README.md to say "Apache-2.0" (matching package.json) or vice versa.

#### 3. Tarball cleanup

**Test:** Confirm `milieu-cli-0.1.0.tgz` is not tracked in git and delete it before publishing.
**Expected:** No `.tgz` file in project root.
**Why human:** Non-blocking but the file was left from smoke testing and should be cleaned up. Check with `git status` — if untracked, just `rm milieu-cli-0.1.0.tgz`.

### Gaps Summary

No blocking gaps. All automated verifications pass:

- tsconfig.build.json excludes test files from compilation — confirmed.
- dist/ contains zero `__tests__` directories and zero `.test.*` files — confirmed by Glob.
- dist/cli/index.js has shebang on line 1 — confirmed by direct Read.
- package.json has prepublishOnly, prepack, correct build script, milieu-cli bin alias, metadata fields — all confirmed.
- README documents current 5-bridge architecture and `npx milieu-cli scan` syntax — confirmed.
- packaging.test.ts exists with 8 substantive test assertions — confirmed.
- Exactly 3 runtime dependencies — confirmed.

Two items are human-gated by design: PKG-01 (npm publish requires credentials) and FOUND-01 (fully satisfied only after publish). One warning item exists: README license says "MIT" but package.json says "Apache-2.0" — should be corrected before publishing.

---

_Verified: 2026-03-20_
_Verifier: Claude (gsd-verifier)_
