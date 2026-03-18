# Technology Stack

**Project:** milieu-cli
**Researched:** 2026-03-17

## Design Constraint

The PROJECT.md mandates a **maximum of 3 runtime dependencies**: `commander`, `chalk`, `ora`. Everything else must be either a Node built-in, a dev dependency, or hand-rolled. This constraint is strategic -- a tiny dependency tree builds developer trust for a security-adjacent scanning tool. The stack below respects this constraint throughout.

## Recommended Stack

### Core Runtime (3 dependencies -- the hard limit)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **commander** | ^13.x | CLI framework: commands, flags, help | Industry standard for Node CLIs. TypeScript-native. Handles `milieu scan <url>`, `--json`, `--verbose`, `--timeout`. Lighter than yargs, more capable than hand-rolled arg parsing (which the current v0.1 does). | MEDIUM -- v12 confirmed in training data, v13 likely current; verify with `npm view` |
| **chalk** | ^5.x | Terminal color output | ESM-native since v5. Zero deps itself. Required for color-coded pass/fail status, bridge headers, score highlighting. | MEDIUM -- v5.3+ is the ESM line; verify exact latest |
| **ora** | ^8.x | Terminal spinner | Shows progress during HTTP scanning. ESM-native. Pairs with chalk for consistent styling. Essential for UX -- scans take 3-10 seconds and silence feels broken. | MEDIUM -- v8.x is ESM line; verify exact latest |

### Node Built-ins (zero cost, zero deps)

| API | Node Version | Purpose | Why This Over a Library |
|-----|-------------|---------|------------------------|
| **fetch** (undici-backed) | 18+ (stable 21+) | All HTTP requests | Eliminates need for axios/got/node-fetch. The existing v0.1 already uses it successfully with AbortController, manual redirect handling, and SSRF protection. No reason to add a dep. |
| **URL / URLSearchParams** | 18+ | URL parsing, normalization | Built-in, spec-compliant. Already used in v0.1 fetch-utils.ts. |
| **AbortController / AbortSignal** | 18+ | Request timeouts | Already used in v0.1. `AbortSignal.timeout(ms)` available in Node 18+ for cleaner timeout handling. |
| **crypto** | 18+ | Not needed now | Available if content hashing is ever needed for caching. |
| **dns/promises** | 18+ | DNS resolution checks | Could be used for Reachability bridge DNS validation, but current approach of just fetching is simpler and sufficient. |
| **node:test** | 18+ (stable 20+) | Alternative test runner | Available but Vitest is significantly better for this project (see Testing below). |

### HTML / Structured Data Parsing (zero runtime deps -- use regex)

| Approach | Purpose | Why |
|----------|---------|-----|
| **Regex-based extraction** | JSON-LD, meta tags, `<link>` tags, heading structure | The existing codebase already does this well. For the specific extraction tasks this tool needs (JSON-LD script blocks, meta tag values, link rel attributes), regex is sufficient and avoids a ~2MB cheerio/htmlparser2 dependency. The tool does NOT need DOM traversal or CSS selectors -- it extracts specific, well-defined patterns from HTML. |
| **JSON.parse** (built-in) | Parse JSON-LD blocks after regex extraction | Already used in v0.1. JSON-LD is just JSON inside `<script type="application/ld+json">` tags. Extract with regex, parse with JSON.parse. |

**Why NOT cheerio/htmlparser2:** The tool extracts ~15 specific patterns from HTML (JSON-LD blocks, meta og:* tags, link rel=canonical, heading hierarchy, img alt attributes, microdata itemtype). Regex handles all of these. Adding a DOM parser adds 1-2MB to install size, breaks the 3-dep constraint, and provides capabilities (CSS selectors, DOM manipulation) the tool never needs. The v0.1 regex approach works -- the rebuild should refine it, not replace it.

### robots.txt Parsing (zero runtime deps -- hand-rolled)

| Approach | Purpose | Why |
|----------|---------|-----|
| **Custom parser** | Parse robots.txt directives, detect AI crawler policies | The existing v0.1 parser works. robots.txt is a simple line-based format (RFC 9309). A custom parser is ~100 lines and handles exactly the use case: "which AI crawlers are allowed/blocked?" Libraries like `robots-parser` or `robots-txt-parse` add a dependency for marginal benefit. The custom parser can also extract API-relevant paths from Disallow/Allow directives (Bridge 2 reuse). |

**Why NOT robots-parser:** It would be runtime dep #4. The format is simple enough that a custom parser is lower risk than a dependency, especially since the tool needs non-standard analysis (AI crawler policy detection, path extraction for Bridge 2/3 reuse).

### OpenAPI Validation (zero runtime deps -- presence detection only)

| Approach | Purpose | Why |
|----------|---------|-----|
| **HTTP HEAD/GET to known paths** | Detect OpenAPI/Swagger spec presence | Bridge 2 checks 9 known paths (`/openapi.json`, `/swagger.json`, `/api-docs`, `/.well-known/openapi.yaml`, etc.) for HTTP 200 + correct content-type. This is presence detection, not schema validation. No need for swagger-parser or openapi-validator. |
| **JSON.parse** (built-in) | Validate response is parseable JSON/YAML | If the spec file returns 200, confirm it parses. For YAML specs, a simple check for `openapi:` or `swagger:` at the top of the file is sufficient for presence detection without a YAML parser. |

**Why NOT @apidevtools/swagger-parser:** Bridge 2 detects whether an OpenAPI spec *exists*, not whether it is *valid*. Full validation is Bridge 4/5 territory (out of scope, proprietary). A HEAD request + content-type check is sufficient.

### Build Tooling (dev dependencies)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **tsup** | ^8.x | Bundle TypeScript to ESM | Already used in v0.1. Fast (esbuild-powered), handles ESM output, generates `.d.ts` for the programmatic API. Single config file. | HIGH -- v8 is current stable line |
| **tsx** | ^4.x | Dev-time TypeScript execution | Already used in v0.1. Run `tsx src/index.ts` during development without a build step. Fast, supports ESM. | HIGH -- v4 is current stable line |
| **typescript** | ^5.7+ | Type checking | Already used in v0.1 (^5.9). Provides `tsc --noEmit` for CI type checking. The programmatic API (`import { scan } from "milieu-cli"`) needs accurate `.d.ts` output. | MEDIUM -- v5.7+ confirmed; verify if 5.8 or 5.9 is latest stable |

### Testing (dev dependencies)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **vitest** | ^3.x | Test runner | Fast, TypeScript-native, ESM-native, same config ecosystem as tsup (both Vite-based). Built-in mocking, assertion library, coverage. Significantly better DX than Jest for ESM TypeScript projects (no transform config). | MEDIUM -- v3.x likely current; verify exact version |
| **nock** | ^14.x | HTTP fixture recording/playback | Intercepts Node's HTTP layer to replay recorded responses. Perfect for testing HTTP-heavy scanning logic without hitting live URLs. The PROJECT.md explicitly requires "recorded HTTP fixtures, no live URLs in CI." nock is the standard for this in Node. | MEDIUM -- v14.x supports ESM and fetch; verify compatibility with Node 18 built-in fetch |

**Why vitest over jest:** Jest requires extensive configuration for ESM TypeScript (transform config, moduleNameMapper, experimental VM modules flag). Vitest works out of the box with the existing tsconfig and ESM setup. Same assertion API developers know.

**Why nock over msw:** MSW (Mock Service Worker) is designed for browser-first mocking and requires more setup for pure Node CLI testing. nock directly intercepts HTTP at the Node level, which is simpler for a CLI tool that only runs in Node. However, note the caveat below about nock + native fetch.

**IMPORTANT caveat on nock + native fetch:** nock historically patches Node's `http`/`https` modules. Node 18+ built-in fetch uses undici internally, which may bypass nock's interception. Verify this works during Phase 1. If nock does not intercept native fetch, alternatives are:
1. Use `undici.MockAgent` directly (zero extra deps, but couples tests to undici internals)
2. Use msw v2 (heavier setup but intercepts at network level)
3. Wrap fetch in a thin abstraction that can be swapped in tests (dependency injection)

The existing v0.1 code already wraps fetch in `fetchUrl()` -- this makes dependency injection straightforward as a fallback strategy.

### Code Quality (dev dependencies)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **@types/node** | ^22.x+ | Node.js type definitions | Already used. Required for built-in fetch types, AbortController, etc. Match to target Node version. | HIGH |

**Why NOT eslint/prettier as dev deps:** Not listed in PROJECT.md requirements. Can be added later if desired, but the priority is shipping the rebuild. TypeScript strict mode + vitest provide sufficient quality gates for initial development.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CLI framework | commander | yargs | Heavier, more complex API. commander is lighter and sufficient for `scan <url>` + a few flags. |
| CLI framework | commander | citty/cleye | Newer, less ecosystem adoption. commander is battle-tested with 100M+ weekly downloads. |
| HTTP client | Node built-in fetch | got / axios / node-fetch | Each would be runtime dep #4. Built-in fetch is sufficient -- v0.1 proves this. |
| HTML parsing | Regex extraction | cheerio | Would be runtime dep #4. Overkill for extracting ~15 specific patterns. |
| HTML parsing | Regex extraction | linkedom / happy-dom | Same issue -- adds a dependency for capabilities the tool doesn't need. |
| Colors | chalk | picocolors | picocolors is smaller but chalk has better API for complex formatting (nested styles, template literals). ora already depends on chalk internally, so chalk is "free" in terms of dependency tree. |
| Spinner | ora | nanospinner | nanospinner is smaller but ora has better API (spinner.text updates, success/fail states) and is maintained by sindresorhus with consistent quality. |
| Testing | vitest | node:test | node:test is zero-dep but has weaker assertion library, no built-in mocking for ESM, and limited coverage support. vitest is worth the dev dependency. |
| Testing | vitest | jest | Jest + ESM + TypeScript is a configuration nightmare. Vitest works out of the box. |
| HTTP mocking | nock | msw | MSW is browser-first. nock is simpler for Node-only CLI tools. But verify nock + native fetch compatibility. |
| robots.txt | Custom parser | robots-parser | Would be runtime dep #4. Format is simple enough to parse in ~100 lines. |
| OpenAPI | Presence detection | swagger-parser | Only need to detect existence, not validate schema. HEAD request is sufficient. |
| YAML parsing | String check | js-yaml | Only need to detect `openapi:` or `swagger:` prefix, not parse full YAML. |

## Architecture-Relevant Stack Decisions

### ESM-Only
The project is ESM-only (`"type": "module"` in package.json). All 3 runtime deps (commander, chalk, ora) are ESM-compatible. tsup outputs ESM. This is the correct choice for 2025/2026 -- CJS is legacy.

### Node 18 Minimum
Node 18 provides: fetch, AbortController, structuredClone, URL, crypto.subtle. This is sufficient. Node 18 reaches EOL April 2025, but the `engines` field allows 18+ (users on 20/22 get the same behavior). Consider bumping to `>=20` during the rebuild since Node 20 is the current LTS.

### Programmatic API Surface
The programmatic API (`import { scan } from "milieu-cli"`) requires:
- tsup generating `.d.ts` files (already configured)
- A clean `ScanResult` type exported from the package
- No side effects on import (spinner/chalk output only in CLI entry point)

This means the architecture must separate the scan engine (pure logic, returns typed data) from the CLI renderer (chalk, ora, terminal output). The 3 runtime deps are CLI-only -- the programmatic API should work without them conceptually, though they will be in the dependency tree.

## Installation

```bash
# Runtime deps (the only 3)
npm install commander chalk ora

# Dev deps
npm install -D typescript tsup tsx vitest nock @types/node
```

## Version Verification Needed

The following versions are based on training data (cutoff ~mid 2025). Before starting development, verify with `npm view <pkg> version`:

| Package | Stated Version | Confidence | Notes |
|---------|---------------|------------|-------|
| commander | ^13.x | MEDIUM | v12.1 confirmed; v13 likely released |
| chalk | ^5.x | MEDIUM | v5.3+ confirmed ESM-only |
| ora | ^8.x | MEDIUM | v8 confirmed ESM-only |
| vitest | ^3.x | MEDIUM | v2.x confirmed; v3 likely released |
| nock | ^14.x | LOW | v13.x confirmed; verify v14 exists and supports native fetch |
| tsup | ^8.x | HIGH | v8 confirmed stable |
| tsx | ^4.x | HIGH | v4 confirmed stable |
| typescript | ^5.7+ | MEDIUM | v5.7 confirmed; may be 5.8 or 5.9 now |

## Sources

- Existing codebase analysis: `/Users/arun/Milieu-Dev/milieu-content-score-cli/src/` (v0.1 implementation patterns)
- PROJECT.md constraints: 3 runtime deps, Node 18+, ESM, zero-dep philosophy
- npm registry (versions need live verification -- training data cutoff applies)
- Node.js built-in API documentation (fetch, AbortController, URL -- stable in Node 18+)
