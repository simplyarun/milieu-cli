# Phase 10: Packaging and Publishing - Research

**Researched:** 2026-03-20
**Domain:** npm package publishing, ESM packaging, CLI distribution
**Confidence:** HIGH

## Summary

Phase 10 finalizes the milieu-cli package for npm publication. The codebase is already well-structured for packaging: `"type": "module"` is set, `exports` and `bin` fields exist in package.json, the shebang is present in the CLI entry point, and exactly 3 runtime dependencies (commander, chalk, ora) are declared. However, there are several critical issues that must be fixed before publishing.

The most significant problem is that `npm pack --dry-run` currently shows **275 files / 578 KB unpacked** because compiled test files (`__tests__/` directories containing `.test.js`, `.test.d.ts`, and their source maps) are included in the dist output. The `files` whitelist says `["dist"]` which includes everything under dist, including test artifacts. The build uses plain `tsc` which compiles all `.ts` files under `src/` including test files. Additionally, the README.md is stale and describes an earlier version of the tool with a different architecture.

**Primary recommendation:** Create a `tsconfig.build.json` that excludes test files from compilation, update the build script to use it, verify the `files` whitelist produces a clean package, update README to match current architecture, add `prepublishOnly` script, and add a `milieu-cli` bin alias for npx compatibility.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | Tool is published as `milieu-cli` npm package with `milieu scan <url>` as primary command | Package name already `milieu-cli`, bin key `milieu` already correct. Need npm publish execution and npx verification. |
| PKG-01 | Published to npm as `milieu-cli` | Package name set. `npm view milieu-cli` returns 404 -- name is available. Need `npm publish` and `prepublishOnly` build script. |
| PKG-02 | ESM-only package with .d.ts type declarations | Already `"type": "module"`, tsconfig has `"declaration": true`. Exports field has `"types"` condition. Already correct. |
| PKG-03 | 3 runtime dependencies only: commander, chalk, ora | Already exactly 3 dependencies. Need verification test that no new deps creep in. |
| PKG-04 | Shebang in entry point for npx execution | Shebang `#!/usr/bin/env node` already present in `src/cli/index.ts` and carries through to `dist/cli/index.js`. Already correct. |
| PKG-05 | package.json exports field and files whitelist correctly configured | Exports field exists but `files` whitelist includes test artifacts. Fix: tsconfig.build.json to exclude tests, or narrow files whitelist. |
</phase_requirements>

## Standard Stack

### Core (already in place)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | 14.0.3 | CLI framework | Already installed, latest stable |
| chalk | 5.6.2 | Terminal colors | Already installed, latest stable |
| ora | 9.3.0 | Spinner | Already installed, latest stable |

### Build tooling (already in place)
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| tsc | ^5.9 | TypeScript compiler | Decision [01-01]: build with tsc directly, no bundler |
| vitest | ^4.1.0 | Test framework | Dev dependency only |

### No new dependencies needed

This phase requires zero new dependencies. All work involves configuration changes to existing package.json, tsconfig, and file cleanup.

**Version verification (via `npm view`):**
- commander: 14.0.3 (current, matches)
- chalk: 5.6.2 (current, matches)
- ora: 9.3.0 (current, matches)

## Architecture Patterns

### Current Project Structure (relevant to packaging)
```
milieu-content-score-cli/
  package.json          # name, type, exports, bin, files, scripts
  tsconfig.json         # main config (includes tests)
  tsconfig.build.json   # NEW: build-only config (excludes tests)
  src/
    index.ts            # Package entry: re-exports core/
    cli/
      index.ts          # CLI entry with shebang
    core/               # Types, scan, version
    bridges/            # Bridge 1-5 implementations
    render/             # Terminal output formatters
    utils/              # HTTP client, URL, SSRF
  dist/                 # Compiled output (what gets published)
    index.js + .d.ts    # Package entry
    cli/index.js        # CLI entry (bin target)
    core/               # Types, scan, version
    bridges/            # Bridge implementations (NO __tests__)
    render/             # Formatters (NO __tests__)
    utils/              # Utilities (NO __tests__)
```

### Pattern 1: Separate Build tsconfig
**What:** A `tsconfig.build.json` that extends the main tsconfig but excludes test files from compilation
**When to use:** When test files are co-located with source (inside `src/`) and you want `tsc --noEmit` to typecheck everything but `tsc -p tsconfig.build.json` to emit only production code
**Example:**
```typescript
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "exclude": [
    "src/**/__tests__/**",
    "src/**/*.test.ts",
    "src/**/*.spec.ts"
  ]
}
```
Source: [TypeScript docs on exclude](https://www.typescriptlang.org/tsconfig/exclude.html), verified with [bobbyhadz guide](https://bobbyhadz.com/blog/typescript-exclude-test-files-from-compilation)

### Pattern 2: files Whitelist in package.json
**What:** The `"files"` array in package.json is a whitelist of files/directories to include in the published tarball
**When to use:** Always -- it is the recommended approach over `.npmignore`
**Key behavior:**
- package.json, LICENSE, README are ALWAYS included regardless of `files` setting
- The current `"files": ["dist"]` includes ALL of dist/ (including test artifacts)
- After fixing the build to exclude tests, `"files": ["dist"]` becomes correct
Source: [npm docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), [npm blog](https://blog.npmjs.org/post/165769683050/publishing-what-you-mean-to-publish.html)

### Pattern 3: prepublishOnly Script
**What:** A lifecycle script that runs automatically before `npm publish`
**When to use:** To ensure a clean build exists before publishing
**Example:**
```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "prepublishOnly": "npm run build"
  }
}
```
Source: [npm scripts docs](https://docs.npmjs.com/cli/v8/using-npm/scripts/)

### Pattern 4: npx Single-Bin Resolution
**What:** When a package has a single `bin` entry, `npx <package-name>` uses that entry regardless of the bin key name
**When to use:** Understanding why `npx milieu-cli scan <url>` works even though the bin key is `"milieu"` not `"milieu-cli"`
**Key behavior:**
- `npx milieu-cli scan <url>` -> installs milieu-cli -> finds single bin entry -> runs it with args `scan <url>`
- After `npm install -g milieu-cli` -> `milieu scan <url>` works (bin key becomes the command name)
- Adding a second bin alias `"milieu-cli": "./dist/cli/index.js"` provides belt-and-suspenders compatibility
Source: [npx docs](https://docs.npmjs.com/cli/v11/commands/npx/)

### Anti-Patterns to Avoid
- **Using .npmignore instead of files whitelist:** Blacklisting is error-prone; whitelist with `files` is the consensus best practice
- **Publishing without prepublishOnly:** Risk of publishing stale dist or forgetting to build
- **Including source maps in published package:** Adds unnecessary size; .js.map and .d.ts.map can be excluded unless consumers specifically need debugging into node_modules
- **Forgetting to clean dist before build:** Stale files from previous builds can pollute the package

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Excluding test files from dist | Custom post-build script to delete __tests__ | `tsconfig.build.json` with `exclude` | tsc natively supports this; post-build deletion is fragile |
| Pre-publish validation | Manual checklist | `prepublishOnly` script + `npm pack --dry-run` | Automated, can't forget |
| Package size verification | Manual file counting | `npm pack --dry-run` in CI/verification | Authoritative, matches what npm actually publishes |
| Bin executable permissions | Manual chmod | npm handles this via bin field | npm sets executable bit automatically on install |

**Key insight:** npm's built-in packaging machinery handles most of the complexity. The work is configuration, not code.

## Common Pitfalls

### Pitfall 1: Test Files Compiled to dist
**What goes wrong:** `tsc` compiles ALL `.ts` files under `src/` including `__tests__/` directories, producing test `.js`, `.d.ts`, and `.map` files in `dist/`. These get included in the npm tarball.
**Why it happens:** The tsconfig `include: ["src"]` matches test files; `files: ["dist"]` includes the entire directory.
**How to avoid:** Create `tsconfig.build.json` with `exclude: ["src/**/__tests__/**"]`. Update build script to `tsc -p tsconfig.build.json`.
**Warning signs:** `npm pack --dry-run` shows `__tests__` in file listing; file count > 100; package size > 200 KB.
**Current state:** 275 files / 578 KB unpacked. After fix: estimated ~80 files / ~120 KB.

### Pitfall 2: Stale dist Directory
**What goes wrong:** Files from previous builds remain in `dist/` even if their source was removed or renamed. `tsc` does not clean `outDir` before building.
**Why it happens:** tsc is incremental by nature -- it adds/updates files but never deletes.
**How to avoid:** Add `"clean": "rm -rf dist"` script and use `"build": "rm -rf dist && tsc -p tsconfig.build.json"` to ensure a clean slate. The `prepublishOnly` script runs this automatically before publish.
**Warning signs:** Files in dist that have no corresponding source file.

### Pitfall 3: createRequire Path Resolution After Publish
**What goes wrong:** `version.ts` uses `createRequire(import.meta.url)` with path `../../package.json` to read the version. If the file structure changes, this path breaks silently.
**Why it happens:** The relative path `../../package.json` from `dist/core/version.js` goes up to the package root. This works both locally and when installed in node_modules because npm always includes package.json.
**How to avoid:** Verify this works after `npm pack` by extracting the tarball and testing. Do NOT change the path -- it is correct.
**Warning signs:** `getVersion()` returns undefined or throws.
**Current state:** VERIFIED working. Path resolves correctly from `dist/core/version.js` to package root.

### Pitfall 4: README Not Matching Current Architecture
**What goes wrong:** npm uses README.md as the package page on npmjs.com. A stale README confuses users.
**Why it happens:** The current README describes the old scoring system (Schema Markup 6/10, llms.txt 5/10) and uses `npx milieu-content-score` not `npx milieu-cli`.
**How to avoid:** Update README to show the current 5-bridge architecture, correct CLI syntax, and current output format.
**Warning signs:** README references `milieu-content-score` instead of `milieu-cli`; shows point-based scoring instead of bridge progress bars.

### Pitfall 5: Missing package.json Metadata for npm
**What goes wrong:** Package appears unprofessional or undiscoverable on npmjs.com.
**Why it happens:** Missing `keywords`, `repository`, `homepage`, `author`, and `bugs` fields.
**How to avoid:** Add all metadata fields before publishing.
**Warning signs:** `npm pack --dry-run` or `npm publish --dry-run` warnings about missing fields.

### Pitfall 6: Source Maps Bloating Package Size
**What goes wrong:** `.js.map` and `.d.ts.map` files roughly double the package size for no benefit to most consumers.
**Why it happens:** tsconfig has `"sourceMap": true` and `"declarationMap": true`.
**How to avoid:** Either (a) disable source maps in `tsconfig.build.json` or (b) accept the size cost for debugging benefit. Declaration maps ARE useful for TypeScript consumers clicking through to source. Source maps (.js.map) are less useful.
**Recommendation:** Keep `declarationMap: true` (helps TS consumers), disable `sourceMap` in build config to save ~40% package size. Or keep both -- 120KB is still small.

## Code Examples

### tsconfig.build.json (NEW file to create)
```json
{
  "extends": "./tsconfig.json",
  "exclude": [
    "src/**/__tests__/**",
    "src/**/*.test.ts",
    "src/**/*.spec.ts"
  ]
}
```

### Updated package.json scripts
```json
{
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "dev": "tsx src/index.ts",
    "test": "vitest run --reporter=verbose",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build",
    "prepack": "npm run build"
  }
}
```

### Updated package.json bin (add milieu-cli alias)
```json
{
  "bin": {
    "milieu": "./dist/cli/index.js",
    "milieu-cli": "./dist/cli/index.js"
  }
}
```

### Updated package.json metadata fields
```json
{
  "keywords": [
    "ai",
    "ai-agents",
    "llm",
    "seo",
    "cli",
    "scanner",
    "robots-txt",
    "llms-txt",
    "openapi",
    "schema-org",
    "content-score",
    "web-standards"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/milieu-cli"
  },
  "homepage": "https://github.com/<owner>/milieu-cli#readme",
  "bugs": {
    "url": "https://github.com/<owner>/milieu-cli/issues"
  },
  "author": "<author>"
}
```

### Verification: npm pack --dry-run check
```bash
# After building with tsconfig.build.json, verify:
npm pack --dry-run 2>&1 | grep -c "__tests__"
# Expected: 0

npm pack --dry-run 2>&1 | grep "total files"
# Expected: ~80 files (not 275)

npm pack --dry-run 2>&1 | grep "package size"
# Expected: ~30-50 KB (not 103 KB)
```

### Verification: npx smoke test
```bash
# After npm pack, test locally:
npm pack
npx ./milieu-cli-0.1.0.tgz scan https://example.com
# Should produce bridge output
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.npmignore` blacklist | `package.json` `files` whitelist | Long-standing consensus | Whitelist is safer -- you can't accidentally include secrets or test data |
| `"main"` + `"types"` fields | `"exports"` with conditions map | Node.js 12+ (2019) | `exports` is the modern way; `main` kept for backwards compat |
| CJS + ESM dual publishing | ESM-only with `"type": "module"` | Node.js 18+ mainstream (2023+) | Simpler, no dual-package hazard. Node 22+ can `require()` ESM. |
| `prepublish` script | `prepublishOnly` script | npm 4+ (2017) | `prepublish` was confusing (ran on install too); `prepublishOnly` is publish-only |

**Deprecated/outdated:**
- `"main"` field alone: Use `"exports"` for modern resolution. Keep `"main"` as fallback.
- `.npmignore`: Use `"files"` whitelist instead.
- `prepublish`: Use `prepublishOnly` or `prepare`.

## Open Questions

1. **npm organization/scope**
   - What we know: Package name `milieu-cli` is available on npm (returns 404)
   - What's unclear: Whether to publish as `milieu-cli` or `@milieu/cli` (scoped)
   - Recommendation: Use `milieu-cli` (unscoped) as specified in FOUND-01. Simpler for `npx milieu-cli scan`.

2. **Source maps in published package**
   - What we know: Current tsconfig emits both `.js.map` and `.d.ts.map`
   - What's unclear: Whether to include source maps in the published package
   - Recommendation: Keep `.d.ts.map` (helps TypeScript consumers). Optionally drop `.js.map` in tsconfig.build.json to save ~30KB. Either way, total package stays under 100KB.

3. **Version number for first publish**
   - What we know: Currently `0.1.0`
   - What's unclear: Whether first npm publish should be `0.1.0` or `1.0.0`
   - Recommendation: Publish as `0.1.0` initially (signals pre-release). Bump to `1.0.0` when all v1 requirements are met (REACH-01 through REACH-09 are still pending).

4. **Repository URL**
   - What we know: The git remote and GitHub repo URL are needed for package.json metadata
   - What's unclear: Exact GitHub organization/user
   - Recommendation: Check `git remote -v` during implementation and use that URL

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | `milieu scan <url>` works via npx | smoke | `npm pack && npx ./milieu-cli-*.tgz scan https://example.com` | No -- Wave 0 (manual verification script) |
| PKG-01 | Published to npm as milieu-cli | manual-only | N/A (requires npm credentials + actual publish) | N/A |
| PKG-02 | ESM-only with .d.ts declarations | unit | `npx vitest run src/core/__tests__/api-contract.test.ts -x` (existing) + new packaging test | Partial -- api-contract.test.ts exists |
| PKG-03 | Exactly 3 runtime dependencies | unit | `node -e "const p=require('./package.json'); ..."` assertion | No -- Wave 0 |
| PKG-04 | Shebang in entry point | unit | `head -1 dist/cli/index.js` check in test | No -- Wave 0 |
| PKG-05 | exports field and files whitelist correct | unit | `npm pack --dry-run` output parsing | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite + `npm pack --dry-run` file count check
- **Phase gate:** Full suite green + `npm pack --dry-run` shows zero `__tests__` files + file count under 100

### Wave 0 Gaps
- [ ] `src/core/__tests__/packaging.test.ts` -- covers PKG-02 (ESM exports), PKG-03 (dep count), PKG-04 (shebang), PKG-05 (files whitelist)
- [ ] `tsconfig.build.json` -- must exist before build produces clean output
- [ ] Build script update in package.json -- prerequisite for all packaging tests

## Sources

### Primary (HIGH confidence)
- npm docs: [package.json files field](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) -- files whitelist behavior
- npm docs: [npx](https://docs.npmjs.com/cli/v11/commands/npx/) -- single-bin resolution rules
- npm docs: [scripts](https://docs.npmjs.com/cli/v8/using-npm/scripts/) -- prepublishOnly lifecycle
- TypeScript docs: [tsconfig exclude](https://www.typescriptlang.org/tsconfig/exclude.html) -- exclude behavior with include
- Direct verification: `npm pack --dry-run` output (275 files, 578KB, test files included)
- Direct verification: `createRequire` path resolution from dist/core/version.js to package.json
- Direct verification: Shebang present in compiled dist/cli/index.js
- Direct verification: `npm view milieu-cli` returns 404 (name available)

### Secondary (MEDIUM confidence)
- [2ality ESM package tutorial](https://2ality.com/2025/02/typescript-esm-packages.html) -- ESM publishing patterns (Feb 2025)
- [Sindre Sorhus Pure ESM guide](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c) -- ESM package conventions
- [npm blog: publishing what you mean](https://blog.npmjs.org/post/165769683050/publishing-what-you-mean-to-publish.html) -- files vs npmignore consensus
- [bobbyhadz: exclude test files](https://bobbyhadz.com/blog/typescript-exclude-test-files-from-compilation) -- tsconfig.build.json pattern

### Tertiary (LOW confidence)
- None -- all findings verified against primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, verified existing versions against npm registry
- Architecture: HIGH -- all patterns verified against official docs and empirically tested on this codebase
- Pitfalls: HIGH -- every pitfall identified by running actual npm commands on this project and observing the output

**Research date:** 2026-03-20
**Valid until:** 2026-06-20 (stable domain -- npm packaging conventions change slowly)
