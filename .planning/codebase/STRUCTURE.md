# Codebase Structure

**Analysis Date:** 2026-03-17

## Directory Layout

```
milieu-content-score-cli/
├── .git/                   # Git history
├── .gitignore              # Exclude node_modules, dist, .env files
├── .planning/
│   └── codebase/          # Planning documents (this file, others)
├── dist/                  # Built output (generated)
│   ├── index.js           # Compiled CLI
│   └── index.d.ts         # TypeScript declarations
├── node_modules/          # Dependencies (npm install)
├── src/                   # Source code
│   ├── checks/            # Five content check modules
│   ├── index.ts           # CLI entry point
│   ├── scoring.ts         # Score calculation logic
│   └── types.ts           # Shared TypeScript interfaces
├── package.json           # Project metadata, scripts, dependencies
├── package-lock.json      # Locked dependency versions
├── tsconfig.json          # TypeScript configuration
├── LICENSE                # Apache-2.0 license
└── README.md              # User documentation
```

## Directory Purposes

**src/:**
- Purpose: All TypeScript source code
- Contains: CLI, checks, scoring, utilities, type definitions
- Key files: `index.ts` (entry), `scoring.ts` (scoring logic), `types.ts` (shared types)

**src/checks/:**
- Purpose: Independent content analysis modules
- Contains: Five check implementations + shared fetch utilities
- Key files: `robots.ts`, `schema-markup.ts`, `llms-txt.ts`, `sitemap.ts`, `http-health.ts`, `fetch-utils.ts`, `subdomains.ts`

**dist/:**
- Purpose: Compiled JavaScript output for distribution
- Contains: ESM format, source maps, TypeScript declarations
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**.planning/codebase/:**
- Purpose: Static analysis documents for GSD system
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md (as written)
- Generated: No (manually created by GSD system)
- Committed: Yes

## Key File Locations

**Entry Points:**
- `src/index.ts`: CLI executable with shebang, orchestrates check waves, handles output formatting
- `dist/index.js`: Built CLI entry point (referenced in package.json `bin` field)

**Configuration:**
- `package.json`: npm scripts, dependencies, bin definition
- `tsconfig.json`: TypeScript compiler options (ES2022, ESNext, strict mode)
- `.gitignore`: Excludes node_modules, dist, .env files

**Core Logic:**
- `src/checks/robots.ts`: Parse robots.txt, detect AI crawler directives (177 lines)
- `src/checks/schema-markup.ts`: Analyze HTML structured data, OG tags, semantic elements (474 lines)
- `src/checks/llms-txt.ts`: Probe llms.txt variants, analyze content structure (136 lines)
- `src/checks/sitemap.ts`: Parse XML sitemaps, count entries, detect AI-relevant URLs (243 lines)
- `src/checks/http-health.ts`: Check HTTPS, JS-free content, response metrics (114 lines)
- `src/checks/fetch-utils.ts`: HTTP transport, SSRF protection, retry logic, bot detection (320 lines)
- `src/scoring.ts`: Aggregate results into 0-100 score with per-check signals (220 lines)
- `src/types.ts`: Shared TypeScript interfaces for all checks and scoring (100 lines)

**Testing:**
- No test files in repository (testing not implemented)

## Naming Conventions

**Files:**
- kebab-case: `fetch-utils.ts`, `schema-markup.ts`, `http-health.ts`, `llms-txt.ts`
- camelCase imports: Each module exports named functions (e.g., `checkRobots`, `fetchUrl`)
- Configuration: `tsconfig.json`, `package.json`, `.gitignore`

**Directories:**
- kebab-case: `src/checks/`
- simple names: `src/`, `dist/`, `.planning/`

**Functions:**
- camelCase: `checkRobots()`, `fetchUrl()`, `calculateContentScore()`, `parseRobotsTxt()`
- verb-first pattern: check*, parse*, fetch*, calculate*, analyze*, extract*

**Variables:**
- camelCase: `domain`, `results`, `signal`, `contentScore`
- CONSTANT_CASE for module-level constants: `USER_AGENT`, `DEFAULT_TIMEOUT`, `AI_CRAWLERS`, `ACTION_TYPES`
- Prefix patterns: `has*` for booleans (e.g., `hasRobotsTxt`, `hasSchemaMarkup`), `*Count` for numbers (e.g., `entryCount`)

**Types:**
- PascalCase for interfaces: `RobotsCheckResult`, `ContentCheckResults`, `FetchResult`
- Suffix `Result` for check output types
- Suffix `Score` for scoring types

## Where to Add New Code

**New Check:**
1. Create `src/checks/[check-name].ts` (kebab-case filename)
2. Export async function `check[CheckName](domain: string): Promise<[CheckName]CheckResult>`
3. Define interface `[CheckName]CheckResult extends BaseCheckResult` in `src/types.ts`
4. Add import and Promise.all() call in `src/index.ts` (line 125-136 for Wave 1, or lines 131-136 for Wave 2)
5. Add scoring function `score[CheckName](results: ContentCheckResults): CheckScore` in `src/scoring.ts`
6. Add check to `checks` object in return statement (line 50 of scoring.ts)
7. Add signal labels to `SIGNAL_LABELS` object in `src/index.ts` (lines 23-54)
8. Add check label to `CHECK_LABELS` object in `src/index.ts` (lines 56-62)
9. Add check to `checkOrder` array in `src/index.ts` (line 69)

**New Utility Function:**
- For HTTP-related utilities: Add to `src/checks/fetch-utils.ts`
- For domain-specific helpers: Create new file in `src/checks/` (e.g., `src/checks/domain-utils.ts`)
- For scoring-related utilities: Add helper function to `src/scoring.ts`

**Configuration Changes:**
- TypeScript: Update `tsconfig.json`
- Build: Modify scripts in `package.json` or adjust tsup command
- Dependencies: Add to `package.json` (npm i package), then import in relevant modules

## Special Directories

**dist/:**
- Purpose: Compiled ESM JavaScript and TypeScript declarations for npm publication
- Generated: Yes (npm run build)
- Committed: No (.gitignore excludes)
- Lifecycle: Deleted and rebuilt on each `npm run build`

**node_modules/:**
- Purpose: Installed npm dependencies
- Generated: Yes (npm install / npm ci)
- Committed: No (.gitignore excludes)
- Lifecycle: Created by package manager, should not be manually edited

**.git/:**
- Purpose: Git repository history and metadata
- Generated: Yes (git init)
- Committed: Yes (standard git internals)
- Lifecycle: Managed entirely by git commands

**.planning/codebase/:**
- Purpose: GSD system planning documents for code generation orchestration
- Generated: Manually (by GSD mapper agents)
- Committed: Yes (part of GSD workflow)
- Lifecycle: Created once, updated during analysis runs

---

*Structure analysis: 2026-03-17*
