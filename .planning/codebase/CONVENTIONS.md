# Coding Conventions

**Analysis Date:** 2026-03-17

## Naming Patterns

**Files:**
- Lowercase with hyphens: `fetch-utils.ts`, `http-health.ts`, `schema-markup.ts`
- Descriptive names that match export purpose
- Check modules named as `[feature].ts` (e.g., `robots.ts`, `llms-txt.ts`, `sitemap.ts`)

**Functions:**
- camelCase for all function names: `checkRobots()`, `calculateContentScore()`, `extractVisibleText()`
- Async functions use `async` keyword: `async function checkHttpHealth()`
- Helper functions begin with descriptive verbs: `parseRobotsTxt()`, `extractTypes()`, `detectBotProtection()`
- Private/internal functions use same camelCase convention but often prefixed with `check`, `parse`, `extract`, `analyze`, or `detect`

**Variables:**
- camelCase for all variable names: `result`, `blockedByBotProtection`, `aiCrawlerDirectives`
- Constants in UPPER_SNAKE_CASE: `DEFAULT_TIMEOUT = 5000`, `MAX_REDIRECTS = 5`, `USER_AGENT = "..."`
- Descriptive boolean names prefixed with `has`, `is`, or `allows`: `hasRobotsTxt`, `isUrl()`, `allowsAllCrawlers`, `httpsEnforced`
- Set types use uppercase prefix for clarity: `DirectiveBlock`, `FetchResult`, `ContentCheckResults`

**Types:**
- PascalCase for all type/interface names: `RobotsCheckResult`, `FetchResult`, `HttpHealthCheckResult`
- Suffix `Result` for result/response types
- Suffix `Block` for parsed structural units
- Generic object types use `Record<string, Type>` for collections: `Record<string, string>`, `Record<string, boolean>`

## Code Style

**Formatting:**
- No dedicated formatter configured (no .prettierrc, eslint config, or biome config)
- Manual formatting follows consistent patterns:
  - 2-space indentation (TypeScript standard)
  - Line length appears to be ~100-120 characters based on source
  - No trailing commas in multi-line constructs except where naturally occurring
  - Semicolons used consistently at end of statements

**Linting:**
- No linter configured in production code (no ESLint, Biome, or equivalent)
- TypeScript compiler runs in strict mode with `--noEmit` via `npm run typecheck`
- tsconfig.json uses `"strict": true` enforcing:
  - Explicit types for all function parameters and returns
  - No implicit `any` types
  - Null/undefined checking required
  - No this binding ambiguity

**Type System:**
- Strict TypeScript with full type coverage
- Exported interfaces document public contracts: `export interface RobotsCheckResult extends BaseCheckResult`
- Union types for mutual exclusivity: `"fresh" | "aging" | "stale" | "unknown"`
- Optional properties marked with `?`: `blockedByBotProtection?: boolean`, `error?: string`
- Type imports use `type` keyword: `import type { ContentCheckResults } from "./types.js"`

## Import Organization

**Order:**
1. Native Node.js modules (none currently)
2. Third-party packages (none in core code)
3. Local relative imports from sibling or parent directories
4. Type-only imports clearly separated

**Example from `src/index.ts`:**
```typescript
import { normalizeUrl, isUrl } from "./checks/fetch-utils.js";
import { checkRobots } from "./checks/robots.js";
import { checkLlmsTxt } from "./checks/llms-txt.js";
import { checkSitemap } from "./checks/sitemap.js";
import { checkSchemaMarkup } from "./checks/schema-markup.js";
import { checkHttpHealth } from "./checks/http-health.js";
import { calculateContentScore, type ContentScoreResult } from "./scoring.js";
import type { ContentCheckResults } from "./types.js";
```

**Path Aliases:**
- No path aliases configured in tsconfig
- Uses relative paths with `.js` extensions (ESM compatibility)
- Imports always include `.js` extension: `from "./types.js"` not `from "./types"`

## Error Handling

**Patterns:**
- Explicit error catching in async functions: `try/catch` blocks wrap all async operations
- Error normalization in catch blocks: `err instanceof Error ? err.message : "Unknown error"`
- Functions return typed result objects with `error?: string` field rather than throwing
- Graceful degradation: network errors return `null` from `fetchUrl()`, callers handle null

**Example from `src/checks/robots.ts`:**
```typescript
export async function checkRobots(domain: string): Promise<RobotsCheckResult> {
  try {
    const result = await fetchPath(domain, "/robots.txt");
    if (!result || result.status !== 200 || !result.body) {
      return {
        pass: false,
        hasRobotsTxt: false,
        aiCrawlerDirectives: [],
        allowsAllCrawlers: false,
        blocksAllCrawlers: false,
        blockedByBotProtection: result?.blockedByBotProtection,
      };
    }
    // ... success path
  } catch (err) {
    return {
      pass: false,
      hasRobotsTxt: false,
      aiCrawlerDirectives: [],
      allowsAllCrawlers: false,
      blocksAllCrawlers: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
```

**No throwing:** Functions don't throw errors; they return typed objects with optional `error` field for reporting.

## Logging

**Framework:** Built-in `console` object only

**Patterns:**
- `console.log()` for normal output and UI rendering
- `console.error()` for error reporting
- Location: error output in `src/index.ts` main error handler
- No structured logging or log levels beyond basic console output

**Example from `src/index.ts`:**
```typescript
if (!isUrl(urlArg)) {
  console.error(`Error: "${urlArg}" doesn't look like a valid URL or domain.`);
  process.exit(1);
}
```

## Comments

**When to Comment:**
- Algorithm explanation for complex logic (e.g., parsing logic in `parseRobotsTxt()`)
- Security/safety considerations (e.g., "SSRF protection: block internal/private hosts")
- Non-obvious domain knowledge (e.g., Cloudflare challenge page detection)
- Spec references for parsing (e.g., robots.txt directive handling)

**JSDoc/TSDoc:**
- Minimal usage in codebase
- Function parameters typed in signature, not documented separately
- Used for internal helper functions with important domain logic
- Example from `src/checks/fetch-utils.ts`:
```typescript
/** Parse Retry-After header value to milliseconds. Returns null if missing or too large. */
function parseRetryAfter(response: Response): number | null {
  // ...
}
```

## Function Design

**Size:** Functions are concise and focused
- Single responsibility per function
- Most helper functions 10-50 lines
- Complex parsing/analysis functions 40-100 lines
- Main orchestration functions under 30 lines

**Parameters:**
- Explicit parameters, no excessive object parameters
- Options objects use destructuring with defaults: `options: { timeout = DEFAULT_TIMEOUT, method = "GET" } = {}`
- Type annotations for all parameters: `domain: string`, `results: ContentCheckResults`

**Return Values:**
- Always typed explicitly in signature
- Return typed result objects for check functions: `Promise<RobotsCheckResult>`
- Helper functions return minimal types: `string[]`, `number | null`, `boolean`
- Async functions wrap return in `Promise<Type>`

**Example from `src/checks/fetch-utils.ts`:**
```typescript
export async function fetchUrl(
  url: string,
  options: {
    timeout?: number;
    method?: "GET" | "HEAD" | "POST";
    body?: string;
    contentType?: string;
    maxAttempts?: number;
    _redirectsLeft?: number;
    preserveErrorBody?: boolean;
  } = {}
): Promise<FetchResult | null> {
  // ...
}
```

## Module Design

**Exports:**
- Named exports for all public functions: `export async function checkRobots()`
- Named exports for all public types: `export interface RobotsCheckResult`
- Export statement at function declaration, not barrel files

**Barrel Files:**
- None used in this project
- Each module self-contained and imported by name
- Direct path imports preferred

**Example structure:**
- `src/checks/fetch-utils.ts` exports `fetchUrl`, `fetchPath`, `normalizeUrl`, `isUrl`, `FetchResult`
- `src/checks/robots.ts` imports from fetch-utils and exports `checkRobots`, `RobotsCheckResult`
- `src/index.ts` imports all check functions and orchestrates main flow

## Async/Concurrency Patterns

**Promise Composition:**
- Parallel operations using `Promise.all()` for independent checks
- Sequential operations in waves: Wave 1 (robots + llms.txt), Wave 2 (sitemap, schema markup, http health)

**Example from `src/index.ts`:**
```typescript
// Wave 1: robots + llms.txt (parallel)
const [robotsResult, llmsTxtResult] = await Promise.all([
  checkRobots(domain),
  checkLlmsTxt(domain),
]);

// Wave 2: sitemap, schema markup, http health (parallel)
const [sitemapResult, schemaMarkupResult, httpHealthResult] = await Promise.all([
  checkSitemap(domain),
  checkSchemaMarkup(domain),
  checkHttpHealth(domain),
]);
```

**Retries and Backoff:**
- Exponential backoff with configurable attempt limits
- Special handling for rate limiting (429 status) with respect for Retry-After header
- Abort controllers with timeout enforcement for fetch operations

## Data Structure Patterns

**Collections:**
- Use `Set<T>` for deduplication: `const paths = new Set<string>()`
- Convert to array with spread operator: `[...paths].slice(0, MAX_DISCOVERED_PATHS)`
- Use `Record<string, Type>` for key-value pairs: `Record<string, boolean>` for signal collections

**Null/Optional Handling:**
- Use optional chaining: `check.signals[key]`, `r?.hasSchemaMarkup`
- Use nullish coalescing: `r?.ogCompletenessScore ?? 0`
- Optional properties in interfaces: `error?: string`, `discoveredPaths?: string[]`

---

*Convention analysis: 2026-03-17*
