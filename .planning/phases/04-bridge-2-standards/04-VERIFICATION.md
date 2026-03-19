---
phase: 04-bridge-2-standards
verified: 2026-03-18T18:42:00Z
status: passed
score: 18/18 must-haves verified
re_verification: false
---

# Phase 4: Bridge 2 Standards Verification Report

**Phase Goal:** Users can see what machine-readable standards a domain supports -- the core differentiator of the tool
**Verified:** 2026-03-18T18:42:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | OpenAPI spec detected at any of 9 common paths returns pass with version and endpoint count | VERIFIED | `OPENAPI_PATHS` array (9 entries), `Promise.all` parallel probe, `extractJsonInfo` returns version+endpointCount |
| 2  | HTML docs pages at OpenAPI paths are rejected (Content-Type validation) | VERIFIED | `HTML_TYPES = new Set(["text/html", "application/xhtml+xml"])` checked before any parsing |
| 3  | YAML OpenAPI responses return partial status with version extracted via regex | VERIFIED | `YAML_TYPES` set checked, `/^(openapi|swagger):/m` regex, `extractYamlInfo` returns partial |
| 4  | No spec at any path returns fail | VERIFIED | End of `checkOpenApi` returns `{ status: "fail", detail: "No OpenAPI spec found", detected: false }` |
| 5  | Bridge 1 stores page body in ctx.shared.pageBody for Bridge 2 consumption | VERIFIED | `reachability/index.ts:82` — `ctx.shared.pageBody = pageResponse.body` inside `if (pageResponse.ok)` block |
| 6  | llms.txt at domain root with H1 returns pass with size and first line | VERIFIED | `checkLlmsTxt` tests `/^#\s+\S/` on firstLine, returns pass with `{ sizeBytes, firstLine }` |
| 7  | llms-full.txt at domain root returns pass with size | VERIFIED | `checkLlmsFullTxt` returns pass with `{ sizeBytes }` — no H1 requirement |
| 8  | MCP endpoint at /.well-known/mcp.json with valid config returns pass | VERIFIED | Three pass branches: Server Card (serverInfo+transport), legacy (mcp_version/mcpServers), primitives (tools/resources/prompts) |
| 9  | JSON-LD script blocks extracted from HTML with @type reported | VERIFIED | Regex `/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi`, `"@type" in item` check, blocks returned in data |
| 10 | Schema.org detected via JSON-LD @context or Microdata itemtype | VERIFIED | `isSchemaOrgContext` checks for "schema.org" string in context; `itemtype=` regex scans Microdata |
| 11 | security.txt with Contact field returns pass | VERIFIED | `/^Contact:/mi` regex applied to response body |
| 12 | ai-plugin.json with required fields returns pass | VERIFIED | Checks `schema_version` (string), `name_for_human` (string), `api` (object) all present |
| 13 | Bridge 2 runs all 8 checks and returns BridgeResult with score 0-100 | VERIFIED | `runStandardsBridge` collects 8 checks; `calculateScore` returns `Math.round((points / maxPoints) * 100)` |
| 14 | Independent HTTP probes run in parallel via Promise.all | VERIFIED | `Promise.all([checkOpenApi, checkLlmsTxt, checkLlmsFullTxt, checkMcpEndpoint, checkSecurityTxt, checkAiPlugin])` — 6 probes |
| 15 | JSON-LD and Schema.org checks use ctx.shared.pageBody from Bridge 1 (no extra HTTP request) | VERIFIED | `const pageBody = (ctx.shared.pageBody as string) ?? ""` then `checkJsonLd(pageBody)` and `checkSchemaOrg(pageBody, jsonLdCheck)` |
| 16 | OpenAPI detection stored in ctx.shared.openApiDetected for Bridge 3 | VERIFIED | `ctx.shared.openApiDetected = openApiResult.detected` at line 73 of standards/index.ts |
| 17 | Scoring: pass=1, partial=0.5, fail=0, score = Math.round(points/maxPoints * 100) | VERIFIED | `calculateScore` function in standards/index.ts matches formula; scoreLabel thresholds: >=80 pass, >=40 partial, <40 fail |
| 18 | Bridge 2 exported from bridges barrel for scanner consumption | VERIFIED | `src/bridges/index.ts` exports both `runReachabilityBridge` and `runStandardsBridge` |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/bridges/standards/openapi.ts` | OpenAPI 9-path probe with validation | VERIFIED (substantive, wired) | 233 lines; exports `checkOpenApi`; imported by standards/index.ts |
| `src/bridges/standards/__tests__/openapi.test.ts` | Unit tests for OpenAPI detection | VERIFIED (substantive) | 15 test cases; all pass |
| `src/bridges/reachability/index.ts` | Bridge 1 storing pageBody in ctx.shared | VERIFIED (substantive, wired) | `ctx.shared.pageBody = pageResponse.body` at line 82; `ctx.shared.pageHeaders` at line 83 |
| `src/bridges/standards/llms-txt.ts` | llms.txt and llms-full.txt checks | VERIFIED (substantive, wired) | 76 lines; exports `checkLlmsTxt`, `checkLlmsFullTxt`; imported by standards/index.ts |
| `src/bridges/standards/mcp.ts` | MCP endpoint check | VERIFIED (substantive, wired) | 83 lines; exports `checkMcpEndpoint`; imported by standards/index.ts |
| `src/bridges/standards/json-ld.ts` | JSON-LD extraction from HTML | VERIFIED (substantive, wired) | 80 lines; exports `checkJsonLd`, `JsonLdBlock`; imported by standards/index.ts |
| `src/bridges/standards/schema-org.ts` | Schema.org detection via JSON-LD and Microdata | VERIFIED (substantive, wired) | 121 lines; exports `checkSchemaOrg`; imported by standards/index.ts |
| `src/bridges/standards/well-known.ts` | security.txt and ai-plugin.json checks | VERIFIED (substantive, wired) | 95 lines; exports `checkSecurityTxt`, `checkAiPlugin`; imported by standards/index.ts |
| `src/bridges/standards/__tests__/llms-txt.test.ts` | Unit tests for llms-txt checks | VERIFIED (substantive) | 12 test cases; all pass |
| `src/bridges/standards/__tests__/mcp.test.ts` | Unit tests for MCP check | VERIFIED (substantive) | 8 test cases; all pass |
| `src/bridges/standards/__tests__/json-ld.test.ts` | Unit tests for JSON-LD check | VERIFIED (substantive) | 11 test cases; all pass |
| `src/bridges/standards/__tests__/schema-org.test.ts` | Unit tests for Schema.org check | VERIFIED (substantive) | 10 test cases; all pass |
| `src/bridges/standards/__tests__/well-known.test.ts` | Unit tests for well-known checks | VERIFIED (substantive) | 12 test cases; all pass |
| `src/bridges/standards/index.ts` | runStandardsBridge orchestrator | VERIFIED (substantive, wired) | 99 lines; exports `runStandardsBridge`; imports all 6 check modules |
| `src/bridges/standards/__tests__/index.test.ts` | Bridge 2 orchestrator integration tests | VERIFIED (substantive) | 11 test cases; all scoring scenarios covered |
| `src/bridges/index.ts` | Updated barrel exporting both bridges | VERIFIED (substantive, wired) | Contains `export { runStandardsBridge } from "./standards/index.js"` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/bridges/standards/openapi.ts` | `src/utils/http-client.ts` | `httpGet` for parallel path probing | WIRED | `httpGet` imported and called in `Promise.all` with 9 paths |
| `src/bridges/standards/openapi.ts` | `src/core/types.ts` | `Check` and `HttpSuccess` types | WIRED | `import type { Check, HttpSuccess }` at line 1 |
| `src/bridges/standards/llms-txt.ts` | `src/utils/http-client.ts` | `httpGet` for /llms.txt and /llms-full.txt | WIRED | `httpGet` imported and called in both functions |
| `src/bridges/standards/schema-org.ts` | `src/bridges/standards/json-ld.ts` | Reuses `JsonLdBlock` type for Schema.org @context check | WIRED | `import type { JsonLdBlock } from "./json-ld.js"` and `jsonLdCheck.data.blocks` consumed |
| `src/bridges/standards/index.ts` | `src/bridges/standards/openapi.ts` | `checkOpenApi` import | WIRED | `import { checkOpenApi } from "./openapi.js"` and called in Promise.all |
| `src/bridges/standards/index.ts` | `src/bridges/standards/llms-txt.ts` | `checkLlmsTxt`, `checkLlmsFullTxt` imports | WIRED | Both functions imported and called in Promise.all |
| `src/bridges/standards/index.ts` | `src/bridges/standards/json-ld.ts` | `checkJsonLd` import | WIRED | Imported and called synchronously with `pageBody` |
| `src/bridges/standards/index.ts` | `src/bridges/standards/schema-org.ts` | `checkSchemaOrg` import | WIRED | Imported and called synchronously with `pageBody` and `jsonLdCheck` |
| `src/bridges/index.ts` | `src/bridges/standards/index.ts` | barrel re-export | WIRED | `export { runStandardsBridge } from "./standards/index.js"` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| STND-01 | 04-01 | OpenAPI spec exists (9 paths probed), version and endpoint count | SATISFIED | `OPENAPI_PATHS` (9 entries), `extractJsonInfo` returns version+endpointCount; 15 tests passing |
| STND-02 | 04-01 | OpenAPI response validates openapi/swagger key, correct Content-Type (not HTML) | SATISFIED | `HTML_TYPES` rejection, `"openapi" in parsed \|\| "swagger" in parsed` check; test "rejects HTML response...returns fail" passes |
| STND-03 | 04-02 | llms.txt exists at domain root (HTTP 200, non-empty, report size and first line) | SATISFIED | `checkLlmsTxt` returns size and firstLine in data; 12 tests covering H1/size/fail cases |
| STND-04 | 04-02 | llms-full.txt exists at domain root | SATISFIED | `checkLlmsFullTxt` returns sizeBytes; pass/fail cases tested |
| STND-05 | 04-02 | MCP endpoint exists at /.well-known/mcp.json (valid JSON with MCP config) | SATISFIED | `checkMcpEndpoint` with Server Card, legacy, primitives, partial, fail branches; 8 tests |
| STND-06 | 04-02 | JSON-LD structured data blocks with detected schema types | SATISFIED | `checkJsonLd` extracts `@type` from all `<script type="application/ld+json">` blocks; 11 tests |
| STND-07 | 04-02 | Schema.org markup (Microdata itemtype or JSON-LD with schema.org vocabulary) | SATISFIED | `checkSchemaOrg` checks both JSON-LD @context and Microdata itemtype=; 10 tests |
| STND-08 | 04-02 | Well-known URI presence (security.txt, ai-plugin.json) | SATISFIED | `checkSecurityTxt` (RFC 9116 Contact field) and `checkAiPlugin` (manifest fields); 12 tests |
| STND-09 | 04-03 | Bridge 2 score = (passed_checks / total_checks * 100) with pass/partial/fail status | SATISFIED | `calculateScore` in standards/index.ts; test cases for 8/8 pass=100, 4+4=50, 0=0, mixed=38 |

All 9 requirement IDs from plans 04-01, 04-02, 04-03 are accounted for. No orphaned requirements found in REQUIREMENTS.md for Phase 4.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No TODO/FIXME/placeholder/stub patterns found in any Phase 4 file |

Three `return null` occurrences in `openapi.ts` (lines 117, 125, 134) are legitimate early exits from helper functions (`extractJsonInfo`, `extractYamlInfo`) that signal "no spec info could be extracted" — not stubs.

### Human Verification Required

None. All behavioral contracts are testable programmatically and covered by the 79 Bridge 2 tests (224 total). The phase goal is a backend bridge that produces structured data; no visual or interactive behavior to verify.

### Summary

Phase 4 fully achieves its goal. All 9 requirement IDs are implemented, tested, and wired into the Bridge 2 orchestrator. Key evidence:

- **18/18 observable truths verified** against actual code (not summary claims)
- **79 Bridge 2 tests pass** (224 total across 13 files) — confirmed by running `npx vitest run`
- **TypeScript compiles cleanly** — `npx tsc --noEmit` exits 0
- **All 7 source files are substantive** (76-233 lines each, no stubs or placeholders)
- **All key links are wired** — every check module is imported and called in the orchestrator; Bridge 1 writes `pageBody`, Bridge 2 reads it, Bridge 2 writes `openApiDetected` for Bridge 3
- **Barrel export added** — `runStandardsBridge` exported from `src/bridges/index.ts` alongside `runReachabilityBridge`

---

_Verified: 2026-03-18T18:42:00Z_
_Verifier: Claude (gsd-verifier)_
